/**
 * prefilter.js — Variable pre-filtering (univariate method only)
 *
 * Depends on: SB.LinReg, SB.LogReg, SB.Cox
 *
 * Namespace: SB.Prefilter
 */
var SB = self.SB = self.SB || {};

(function() {
  'use strict';

  function prefilterVariables(params) {
    var data = params.data;
    var yvar = params.yvar;
    var censorvar = params.censorvar;
    var trtvar = params.trtvar;
    var type = params.type;
    var xvars = params.xvars;
    var preFilter = params.preFilter;
    var filterMethod = params.filterMethod;
    var onProgress = params.onProgress;

    if (filterMethod !== 'univariate') {
      if (onProgress) onProgress('Pre-filter method "' + filterMethod + '" is not available in browser. Skipping.');
      return xvars;
    }

    var isPredictive = trtvar !== null && trtvar !== undefined;

    if (onProgress) onProgress('Pre-filtering: univariate screening of ' + xvars.length + ' variables...');

    var pvals = [];
    for (var vi = 0; vi < xvars.length; vi++) {
      var xvar = xvars[vi];
      var pval = null;
      try {
        if (isPredictive) {
          pval = univariatePvalPredictive(data, yvar, censorvar, trtvar, xvar, type);
        } else {
          pval = univariatePvalPrognostic(data, yvar, censorvar, xvar, type);
        }
      } catch (e) {
        pval = null;
      }
      pvals.push({ variable: xvar, pvalue: pval });
    }

    pvals.sort(function(a, b) { return (a.pvalue != null ? a.pvalue : 1) - (b.pvalue != null ? b.pvalue : 1); });

    var nKeep;
    if (preFilter === 'opt') {
      nKeep = pvals.filter(function(p) { return p.pvalue !== null && p.pvalue < 0.2; }).length;
      nKeep = Math.max(1, nKeep);
    } else {
      var maxN = parseInt(preFilter);
      if (!isNaN(maxN) && maxN > 0) {
        var optN = pvals.filter(function(p) { return p.pvalue !== null && p.pvalue < 0.2; }).length;
        nKeep = Math.max(1, Math.min(optN || xvars.length, maxN));
      } else {
        nKeep = xvars.length;
      }
    }

    var selected = pvals.slice(0, nKeep).map(function(p) { return p.variable; });

    if (onProgress) {
      onProgress('Pre-filter: selected ' + selected.length + ' of ' + xvars.length + ' variables');
      for (var i = 0; i < selected.length; i++) {
        var pv = pvals[i].pvalue;
        onProgress('  ' + (i + 1) + '. ' + selected[i] + ' (p=' + (pv !== null ? pv.toFixed(6) : 'NA') + ')');
      }
    }

    return selected;
  }

  function univariatePvalPredictive(data, yvar, censorvar, trtvar, xvar, type) {
    if (type === 's') {
      var time = data.map(function(r) { return r[yvar]; });
      var status = data.map(function(r) { return r[censorvar]; });
      var X = data.map(function(r) {
        var trt = r[trtvar] != null ? r[trtvar] : 0;
        var x = r[xvar] != null ? r[xvar] : 0;
        return [trt, x, trt * x];
      });
      var fit = SB.Cox.coxph(time, status, X);
      return fit.coefficientTable[2] ? (fit.coefficientTable[2][4] != null ? fit.coefficientTable[2][4] : null) : null;
    } else {
      var y = data.map(function(r) { return r[yvar]; });
      var X = data.map(function(r) {
        var trt = r[trtvar] != null ? r[trtvar] : 0;
        var x = r[xvar] != null ? r[xvar] : 0;
        return [1, trt, x, trt * x];
      });
      var fit = type === 'b' ? SB.LogReg.glm(y, X) : SB.LinReg.lm(y, X);
      return fit.coefficientTable[3] ? (fit.coefficientTable[3][3] != null ? fit.coefficientTable[3][3] : null) : null;
    }
  }

  function univariatePvalPrognostic(data, yvar, censorvar, xvar, type) {
    if (type === 's') {
      var time = data.map(function(r) { return r[yvar]; });
      var status = data.map(function(r) { return r[censorvar]; });
      var X = data.map(function(r) { return [r[xvar] != null ? r[xvar] : 0]; });
      var fit = SB.Cox.coxph(time, status, X);
      return fit.coefficientTable[0] ? (fit.coefficientTable[0][4] != null ? fit.coefficientTable[0][4] : null) : null;
    } else {
      var y = data.map(function(r) { return r[yvar]; });
      var X = data.map(function(r) { return [1, r[xvar] != null ? r[xvar] : 0]; });
      var fit = type === 'b' ? SB.LogReg.glm(y, X) : SB.LinReg.lm(y, X);
      return fit.coefficientTable[1] ? (fit.coefficientTable[1][3] != null ? fit.coefficientTable[1][3] : null) : null;
    }
  }

  // ============================================================
  // Export to namespace
  // ============================================================

  SB.Prefilter = {
    prefilterVariables: prefilterVariables,
  };

})();
