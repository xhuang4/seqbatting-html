/**
 * evaluation.js — Result evaluation for train/test data
 *
 * Depends on: SB.LinReg, SB.LogReg, SB.Cox, SB.Survival
 *
 * Namespace: SB.Evaluation
 */
var SB = self.SB = self.SB || {};

(function() {
  'use strict';

  function evaluateIteration(data, predClass, yvar, censorvar, trtvar, type) {
    var isPredictive = trtvar !== null && trtvar !== undefined;
    if (isPredictive) {
      return evaluatePredictive(data, predClass, yvar, censorvar, trtvar, type);
    } else {
      return evaluatePrognostic(data, predClass, yvar, censorvar, type);
    }
  }

  function evaluatePredictive(data, predClass, yvar, censorvar, trtvar, type) {
    var pvals = {};
    var ratios = {};

    var posIdx = [], negIdx = [], trtIdx = [], ctrlIdx = [];
    var posTrtIdx = [], posCtrlIdx = [], negTrtIdx = [], negCtrlIdx = [];

    for (var i = 0; i < data.length; i++) {
      var isTrt = data[i][trtvar] === 1;
      var isPos = predClass[i];

      if (isPos) posIdx.push(i); else negIdx.push(i);
      if (isTrt) trtIdx.push(i); else ctrlIdx.push(i);
      if (isPos && isTrt) posTrtIdx.push(i);
      if (isPos && !isTrt) posCtrlIdx.push(i);
      if (!isPos && isTrt) negTrtIdx.push(i);
      if (!isPos && !isTrt) negCtrlIdx.push(i);
    }

    pvals.trtDiffPosGp = fitSubgroupPval(data, posIdx, yvar, censorvar, trtvar, type);
    pvals.trtDiffNegGp = fitSubgroupPval(data, negIdx, yvar, censorvar, trtvar, type);
    pvals.gpDiffTrtArm = fitGroupPval(data, trtIdx, predClass, yvar, censorvar, type);
    pvals.gpDiffCtrlArm = fitGroupPval(data, ctrlIdx, predClass, yvar, censorvar, type);
    pvals.interaction = fitInteractionPval(data, predClass, yvar, censorvar, trtvar, type);

    var diagIdx = posTrtIdx.concat(negCtrlIdx);
    pvals.trtPosCtrlNeg = fitSubgroupPval(data, diagIdx, yvar, censorvar, trtvar, type);

    if (type === 's') {
      ratios.hrPosGp = fitHR(data, posIdx, yvar, censorvar, trtvar);
      ratios.hrNegGp = fitHR(data, negIdx, yvar, censorvar, trtvar);
    } else if (type === 'b') {
      ratios.orPosGp = fitOR(data, posIdx, yvar, trtvar);
      ratios.orNegGp = fitOR(data, negIdx, yvar, trtvar);
    }

    return { pvals: pvals, ratios: ratios };
  }

  function evaluatePrognostic(data, predClass, yvar, censorvar, type) {
    var pvals = {};
    var ratios = {};

    try {
      if (type === 's') {
        var time = data.map(function(r) { return r[yvar]; });
        var status = data.map(function(r) { return r[censorvar]; });
        var X = predClass.map(function(v) { return [v ? 1 : 0]; });
        var fit = SB.Cox.coxph(time, status, X);
        pvals.pval = fit.coefficientTable[0] ? (fit.coefficientTable[0][4] != null ? fit.coefficientTable[0][4] : null) : null;
        ratios.hr = fit.expCoef ? (fit.expCoef[0] != null ? fit.expCoef[0] : null) : null;
      } else if (type === 'b') {
        var y = data.map(function(r) { return r[yvar]; });
        var X = predClass.map(function(v) { return [1, v ? 1 : 0]; });
        var fit = SB.LogReg.glm(y, X);
        pvals.pval = fit.coefficientTable[1] ? (fit.coefficientTable[1][3] != null ? fit.coefficientTable[1][3] : null) : null;
        ratios.or = Math.exp(fit.coefficients[1]);
      } else {
        var y = data.map(function(r) { return r[yvar]; });
        var X = predClass.map(function(v) { return [1, v ? 1 : 0]; });
        var fit = SB.LinReg.lm(y, X);
        pvals.pval = fit.coefficientTable[1] ? (fit.coefficientTable[1][3] != null ? fit.coefficientTable[1][3] : null) : null;
      }
    } catch (e) {
      pvals.pval = null;
    }

    return { pvals: pvals, ratios: ratios };
  }

  // ============================================================
  // findPredStats / findProgStats
  // ============================================================

  function findPredStats(data, predClass, yvar, censorvar, trtvar, type) {
    var groups = { sigPosTrt: [], sigPosCtrl: [], sigNegTrt: [], sigNegCtrl: [] };

    for (var i = 0; i < data.length; i++) {
      var isTrt = data[i][trtvar] === 1;
      var isPos = predClass[i];
      if (isPos && isTrt)   groups.sigPosTrt.push(data[i]);
      if (isPos && !isTrt)  groups.sigPosCtrl.push(data[i]);
      if (!isPos && isTrt)  groups.sigNegTrt.push(data[i]);
      if (!isPos && !isTrt) groups.sigNegCtrl.push(data[i]);
    }

    var result = {};
    var keys = Object.keys(groups);
    for (var k = 0; k < keys.length; k++) {
      result[keys[k]] = computeGroupStats(groups[keys[k]], yvar, censorvar, type);
    }
    return result;
  }

  function findProgStats(data, predClass, yvar, censorvar, type) {
    var sigPos = data.filter(function(_, i) { return predClass[i]; });
    var sigNeg = data.filter(function(_, i) { return !predClass[i]; });

    return {
      sigPos: computeGroupStats(sigPos, yvar, censorvar, type),
      sigNeg: computeGroupStats(sigNeg, yvar, censorvar, type),
    };
  }

  // ============================================================
  // Internal helpers
  // ============================================================

  function computeGroupStats(rows, yvar, censorvar, type) {
    var n = rows.length;
    if (n === 0) return { n: 0 };

    var vals = rows.map(function(r) { return r[yvar]; }).filter(function(v) { return v !== null && v !== undefined && !isNaN(v); });
    if (vals.length === 0) return { n: n };

    if (type === 'c') {
      var sum = 0;
      for (var i = 0; i < vals.length; i++) sum += vals[i];
      var mean = sum / vals.length;
      var sorted = vals.slice().sort(function(a, b) { return a - b; });
      var median = sorted.length % 2 === 0
        ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
        : sorted[Math.floor(sorted.length / 2)];
      var ssq = 0;
      for (var i = 0; i < vals.length; i++) ssq += (vals[i] - mean) * (vals[i] - mean);
      var sd = Math.sqrt(ssq / (vals.length - 1 || 1));
      return { n: n, median: median, mean: mean, sd: sd };
    }

    if (type === 's') {
      var time = rows.map(function(r) { return r[yvar]; });
      var status = rows.map(function(r) { return r[censorvar]; });
      var km = SB.Survival.kaplanMeier(time, status);
      var eventTimes = time.filter(function(t, i) { return status[i] === 1; });
      var tau = eventTimes.length > 0 ? Math.max.apply(null, eventTimes) : Math.max.apply(null, time);
      var rm = SB.Survival.restrictedMean(km, tau);
      var med = SB.Survival.medianSurvival(km);
      return { n: n, rmean: rm.rmean, seRmean: rm.se, medianSurv: med };
    }

    if (type === 'b') {
      var events = vals.filter(function(v) { return v === 1; }).length;
      var respRate = events / n;
      return { n: n, respRate: respRate };
    }

    return { n: n };
  }

  function fitSubgroupPval(data, indices, yvar, censorvar, trtvar, type) {
    if (indices.length < 4) return null;
    var subset = indices.map(function(i) { return data[i]; });
    try {
      if (type === 's') {
        var time = subset.map(function(r) { return r[yvar]; });
        var status = subset.map(function(r) { return r[censorvar]; });
        var X = subset.map(function(r) { return [r[trtvar] != null ? r[trtvar] : 0]; });
        var fit = SB.Cox.coxph(time, status, X);
        return fit.coefficientTable[0] ? (fit.coefficientTable[0][4] != null ? fit.coefficientTable[0][4] : null) : null;
      } else {
        var y = subset.map(function(r) { return r[yvar]; });
        var X = subset.map(function(r) { return [1, r[trtvar] != null ? r[trtvar] : 0]; });
        var fit = type === 'b' ? SB.LogReg.glm(y, X) : SB.LinReg.lm(y, X);
        return fit.coefficientTable[1] ? (fit.coefficientTable[1][3] != null ? fit.coefficientTable[1][3] : null) : null;
      }
    } catch (e) {
      return null;
    }
  }

  function fitGroupPval(data, indices, predClass, yvar, censorvar, type) {
    if (indices.length < 4) return null;
    var subset = indices.map(function(i) { return data[i]; });
    var pc = indices.map(function(i) { return predClass[i] ? 1 : 0; });
    try {
      if (type === 's') {
        var time = subset.map(function(r) { return r[yvar]; });
        var status = subset.map(function(r) { return r[censorvar]; });
        var X = pc.map(function(v) { return [v]; });
        var fit = SB.Cox.coxph(time, status, X);
        return fit.coefficientTable[0] ? (fit.coefficientTable[0][4] != null ? fit.coefficientTable[0][4] : null) : null;
      } else {
        var y = subset.map(function(r) { return r[yvar]; });
        var X = pc.map(function(v) { return [1, v]; });
        var fit = type === 'b' ? SB.LogReg.glm(y, X) : SB.LinReg.lm(y, X);
        return fit.coefficientTable[1] ? (fit.coefficientTable[1][3] != null ? fit.coefficientTable[1][3] : null) : null;
      }
    } catch (e) {
      return null;
    }
  }

  function fitInteractionPval(data, predClass, yvar, censorvar, trtvar, type) {
    try {
      if (type === 's') {
        var time = data.map(function(r) { return r[yvar]; });
        var status = data.map(function(r) { return r[censorvar]; });
        var X = data.map(function(r, i) {
          var trt = r[trtvar] != null ? r[trtvar] : 0;
          var pc = predClass[i] ? 1 : 0;
          return [trt, pc, trt * pc];
        });
        var fit = SB.Cox.coxph(time, status, X);
        return fit.coefficientTable[2] ? (fit.coefficientTable[2][4] != null ? fit.coefficientTable[2][4] : null) : null;
      } else {
        var y = data.map(function(r) { return r[yvar]; });
        var X = data.map(function(r, i) {
          var trt = r[trtvar] != null ? r[trtvar] : 0;
          var pc = predClass[i] ? 1 : 0;
          return [1, trt, pc, trt * pc];
        });
        var fit = type === 'b' ? SB.LogReg.glm(y, X) : SB.LinReg.lm(y, X);
        return fit.coefficientTable[3] ? (fit.coefficientTable[3][3] != null ? fit.coefficientTable[3][3] : null) : null;
      }
    } catch (e) {
      return null;
    }
  }

  function fitHR(data, indices, yvar, censorvar, trtvar) {
    if (indices.length < 4) return null;
    try {
      var subset = indices.map(function(i) { return data[i]; });
      var time = subset.map(function(r) { return r[yvar]; });
      var status = subset.map(function(r) { return r[censorvar]; });
      var X = subset.map(function(r) { return [r[trtvar] != null ? r[trtvar] : 0]; });
      var fit = SB.Cox.coxph(time, status, X);
      return fit.expCoef ? (fit.expCoef[0] != null ? fit.expCoef[0] : null) : null;
    } catch (e) {
      return null;
    }
  }

  function fitOR(data, indices, yvar, trtvar) {
    if (indices.length < 4) return null;
    try {
      var subset = indices.map(function(i) { return data[i]; });
      var y = subset.map(function(r) { return r[yvar]; });
      var X = subset.map(function(r) { return [1, r[trtvar] != null ? r[trtvar] : 0]; });
      var fit = SB.LogReg.glm(y, X);
      return Math.exp(fit.coefficients[1]);
    } catch (e) {
      return null;
    }
  }

  // ============================================================
  // Export to namespace
  // ============================================================

  SB.Evaluation = {
    evaluateIteration: evaluateIteration,
    findPredStats: findPredStats,
    findProgStats: findProgStats,
  };

})();
