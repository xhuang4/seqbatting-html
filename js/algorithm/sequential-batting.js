/**
 * sequential-batting.js — Sequential BATTing (seqlr.batting)
 *
 * Depends on: SB.Batting, SB.LinReg, SB.LogReg, SB.Cox, SB.Dist, SB.Prediction
 *
 * Namespace: SB.SeqBatting
 */
var SB = self.SB = self.SB || {};

(function() {
  'use strict';

  function seqlrBatting(params) {
    var data = params.data;
    var yvar = params.yvar;
    var censorvar = params.censorvar;
    var trtvar = params.trtvar;
    var type = params.type;
    var xvars = params.xvars;
    var nBoot = params.nBoot;
    var desRes = params.desRes;
    var minSigpPrcnt = params.minSigpPrcnt;
    var rng = params.rng;
    var onProgress = params.onProgress;

    var isPredictive = trtvar !== null && trtvar !== undefined;
    var n = data.length;
    if (n < 10) return null;  // too few samples for meaningful analysis

    var ll2beat = -Infinity;
    var dataId = new Array(n).fill(true);
    var continueLoop = true;
    var ruleString = [];
    var varNames = xvars.slice();

    while (continueLoop) {
      if (varNames.length === 0) {
        continueLoop = false;
        break;
      }

      if (onProgress) {
        onProgress('Sequential step ' + (ruleString.length + 1) + ': testing ' + varNames.length + ' variables...');
      }

      var results = [];
      for (var vi = 0; vi < varNames.length; vi++) {
        var xvar = varNames[vi];
        var result;
        if (isPredictive) {
          result = SB.Batting.battingPred(data, dataId, yvar, censorvar, trtvar, type, xvar, nBoot, desRes, minSigpPrcnt, rng);
        } else {
          result = SB.Batting.battingProg(data, dataId, yvar, censorvar, type, xvar, nBoot, desRes, minSigpPrcnt, rng);
        }
        results.push(result);
      }

      var bestIdx = -1;
      var bestPval = Infinity;
      for (var i = 0; i < results.length; i++) {
        var pval = results[i][3];
        if (pval !== null && !isNaN(pval) && pval < bestPval) {
          bestPval = pval;
          bestIdx = i;
        }
      }

      if (bestIdx === -1) {
        continueLoop = false;
        break;
      }

      var bestVar = results[bestIdx][0];
      var bestDir = results[bestIdx][1];
      var bestCutoff = results[bestIdx][2];

      // Skip if batting found a direction but no valid cutoff
      if (bestDir === null || bestCutoff === null || bestCutoff === undefined || isNaN(bestCutoff)) {
        continueLoop = false;
        break;
      }

      var ruleTemp = ruleString.concat([{
        variable: bestVar,
        direction: bestDir,
        threshold: bestCutoff,
        logLik: null,
      }]);

      var xvarsTemp = ruleTemp.map(function(r) { return r.variable; });
      var minLL = null;

      try {
        if (isPredictive) {
          minLL = fitFullModelPredictive(data, yvar, censorvar, trtvar, type, xvarsTemp);
        } else {
          minLL = fitFullModelPrognostic(data, yvar, censorvar, type, xvarsTemp);
        }
      } catch (e) {
        minLL = null;
      }

      var pvalChisq = 1;
      if (minLL !== null && !isNaN(minLL)) {
        var obsChisq = 2 * (minLL - ll2beat);
        if (obsChisq > 0) {
          var df = isPredictive ? 2 : 1;
          pvalChisq = SB.Dist.pvalueChiSq(obsChisq, df);
        }
      }

      var dataIdTemp = SB.Prediction.queryData(data, ruleTemp);
      var dataPrcnt = dataIdTemp.filter(Boolean).length / n;

      if (onProgress) {
        onProgress('  Best: ' + bestVar + ' ' + bestDir + ' ' + (bestCutoff != null ? bestCutoff.toFixed(4) : 'NA') +
          ', LRT p=' + pvalChisq.toFixed(4) + ', subgroup=' + (dataPrcnt * 100).toFixed(1) + '%');
      }

      if (pvalChisq <= 0.05 && dataPrcnt > minSigpPrcnt) {
        ruleTemp[ruleTemp.length - 1].logLik = minLL;
        ruleString = ruleTemp;
        varNames = varNames.filter(function(v) { return v !== bestVar; });
        ll2beat = minLL;
        dataId = SB.Prediction.queryData(data, ruleString);
        continueLoop = true;
      } else {
        continueLoop = false;
      }
    }

    if (ruleString.length === 0) return null;

    return ruleString.map(function(r) {
      return {
        variable: r.variable,
        direction: r.direction,
        threshold: (r.threshold != null && !isNaN(r.threshold)) ? parseFloat(r.threshold.toFixed(5)) : null,
        logLik: r.logLik,
      };
    });
  }

  // ============================================================
  // Full model fitting for LRT
  // ============================================================

  function fitFullModelPredictive(data, yvar, censorvar, trtvar, type, xvarsTemp) {
    var n = data.length;

    if (type === 's') {
      var X = [], time = [], status = [];
      for (var i = 0; i < n; i++) {
        var row = data[i];
        var trt = row[trtvar] != null ? row[trtvar] : 0;
        var xrow = [trt];
        for (var j = 0; j < xvarsTemp.length; j++) xrow.push(row[xvarsTemp[j]] != null ? row[xvarsTemp[j]] : 0);
        for (var j = 0; j < xvarsTemp.length; j++) xrow.push(trt * (row[xvarsTemp[j]] != null ? row[xvarsTemp[j]] : 0));
        X.push(xrow);
        time.push(row[yvar]);
        status.push(row[censorvar]);
      }
      var fit = SB.Cox.coxph(time, status, X);
      return fit.loglik[1];
    } else {
      var X = [], y = [];
      for (var i = 0; i < n; i++) {
        var row = data[i];
        var trt = row[trtvar] != null ? row[trtvar] : 0;
        var xrow = [1, trt];
        for (var j = 0; j < xvarsTemp.length; j++) xrow.push(row[xvarsTemp[j]] != null ? row[xvarsTemp[j]] : 0);
        for (var j = 0; j < xvarsTemp.length; j++) xrow.push(trt * (row[xvarsTemp[j]] != null ? row[xvarsTemp[j]] : 0));
        X.push(xrow);
        y.push(row[yvar]);
      }
      var fit = type === 'b' ? SB.LogReg.glm(y, X) : SB.LinReg.lm(y, X);
      return fit.logLik;
    }
  }

  function fitFullModelPrognostic(data, yvar, censorvar, type, xvarsTemp) {
    var n = data.length;

    if (type === 's') {
      var X = [], time = [], status = [];
      for (var i = 0; i < n; i++) {
        var row = data[i];
        var xrow = [];
        for (var j = 0; j < xvarsTemp.length; j++) xrow.push(row[xvarsTemp[j]] != null ? row[xvarsTemp[j]] : 0);
        X.push(xrow);
        time.push(row[yvar]);
        status.push(row[censorvar]);
      }
      var fit = SB.Cox.coxph(time, status, X);
      return fit.loglik[1];
    } else {
      var X = [], y = [];
      for (var i = 0; i < n; i++) {
        var row = data[i];
        var xrow = [1];
        for (var j = 0; j < xvarsTemp.length; j++) xrow.push(row[xvarsTemp[j]] != null ? row[xvarsTemp[j]] : 0);
        X.push(xrow);
        y.push(row[yvar]);
      }
      var fit = type === 'b' ? SB.LogReg.glm(y, X) : SB.LinReg.lm(y, X);
      return fit.logLik;
    }
  }

  // ============================================================
  // Export to namespace
  // ============================================================

  SB.SeqBatting = {
    seqlrBatting: seqlrBatting,
  };

})();
