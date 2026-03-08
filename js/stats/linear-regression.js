/**
 * linear-regression.js — Ordinary Least Squares (OLS) regression
 *
 * Matches R's lm() output.
 * Depends on: SB.Matrix
 *
 * Namespace: SB.LinReg
 */
var SB = self.SB = self.SB || {};

(function() {
  'use strict';

  var Matrix = SB.Matrix;

  /**
   * Fit an OLS linear regression model.
   */
  function lm(y, X) {
    var n = X.length;
    if (n === 0 || !X[0]) {
      throw new Error('lm: empty design matrix (n=0)');
    }
    var p = X[0].length;

    if (y.length !== n) {
      throw new Error('lm: y length (' + y.length + ') != X rows (' + n + ')');
    }

    var XtX = Matrix.crossProduct(X);
    var XtXinv = Matrix.inverse(XtX);
    if (!XtXinv) {
      throw new Error("lm: X'X is singular — perfect collinearity in design matrix");
    }
    var Xty = Matrix.crossProductVec(X, y);
    var beta = Matrix.multiplyVec(XtXinv, Xty);

    var fitted = Matrix.multiplyVec(X, beta);
    var residuals = new Array(n);
    var rss = 0;
    for (var i = 0; i < n; i++) {
      residuals[i] = y[i] - fitted[i];
      rss += residuals[i] * residuals[i];
    }

    var df = n - p;
    if (df <= 0) {
      throw new Error('lm: no residual degrees of freedom (n=' + n + ', p=' + p + ')');
    }

    var sigma = Math.sqrt(rss / df);

    var se = new Array(p);
    for (var j = 0; j < p; j++) {
      se[j] = sigma * Math.sqrt(XtXinv[j][j]);
    }

    var tstat = new Array(p);
    var pvalue = new Array(p);
    for (var j = 0; j < p; j++) {
      tstat[j] = se[j] > 0 ? beta[j] / se[j] : 0;
      pvalue[j] = 2 * tCdfUpper(Math.abs(tstat[j]), df);
    }

    var logLik = -0.5 * n * Math.log(2 * Math.PI) - 0.5 * n * Math.log(rss / n) - n / 2;

    var coefficientTable = [];
    for (var j = 0; j < p; j++) {
      coefficientTable.push([beta[j], se[j], tstat[j], pvalue[j]]);
    }

    return {
      coefficients: beta,
      se: se,
      tstat: tstat,
      pvalue: pvalue,
      logLik: logLik,
      sigma: sigma,
      df: df,
      rss: rss,
      fitted: fitted,
      residuals: residuals,
      coefficientTable: coefficientTable,
      summary: { coefficient: coefficientTable },
      n: n,
      p: p,
    };
  }

  function tCdfUpper(t, df) {
    if (typeof jStat !== 'undefined') {
      return 1 - jStat.studentt.cdf(t, df);
    }
    return normalCdfUpper(t);
  }

  function normalCdfUpper(z) {
    if (typeof jStat !== 'undefined') {
      return 1 - jStat.normal.cdf(z, 0, 1);
    }
    var a1 = 0.254829592;
    var a2 = -0.284496736;
    var a3 = 1.421413741;
    var a4 = -1.453152027;
    var a5 = 1.061405429;
    var p = 0.3275911;
    var sign = z < 0 ? -1 : 1;
    var x = Math.abs(z) / Math.SQRT2;
    var t = 1 / (1 + p * x);
    var y = 1 - (((((a5 * t + a4) * t) + a3) * t + a2) * t + a1) * t * Math.exp(-x * x);
    return 0.5 * (1 - sign * y);
  }

  /**
   * Build a design matrix from data for a simple formula.
   * Adds intercept column as column 0.
   */
  function buildDesignMatrix(data, predictors) {
    var n = data.length;
    var p = predictors.length + 1;
    var X = Matrix.create(n, p);
    for (var i = 0; i < n; i++) {
      X[i][0] = 1;
      for (var j = 0; j < predictors.length; j++) {
        var val = data[i][predictors[j]];
        X[i][j + 1] = val != null ? val : 0;
      }
    }
    return X;
  }

  /**
   * Build a design matrix with treatment interaction terms.
   */
  function buildInteractionMatrix(data, trtvar, xvars) {
    var n = data.length;
    var p = 1 + 1 + xvars.length + xvars.length;
    var names = ['(Intercept)', trtvar].concat(xvars).concat(xvars.map(function(x) { return trtvar + ':' + x; }));
    var X = Matrix.create(n, p);
    for (var i = 0; i < n; i++) {
      var trt = data[i][trtvar] != null ? data[i][trtvar] : 0;
      X[i][0] = 1;
      X[i][1] = trt;
      for (var j = 0; j < xvars.length; j++) {
        var xval = data[i][xvars[j]] != null ? data[i][xvars[j]] : 0;
        X[i][2 + j] = xval;
        X[i][2 + xvars.length + j] = trt * xval;
      }
    }
    return { X: X, names: names };
  }

  // ============================================================
  // Export to namespace
  // ============================================================

  SB.LinReg = {
    lm: lm,
    buildDesignMatrix: buildDesignMatrix,
    buildInteractionMatrix: buildInteractionMatrix,
  };

})();
