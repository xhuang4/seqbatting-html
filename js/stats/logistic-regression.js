/**
 * logistic-regression.js — Logistic regression via IRLS
 *
 * Matches R's glm(family=binomial(link="logit")) output.
 * Depends on: SB.Matrix
 *
 * Namespace: SB.LogReg
 */
var SB = self.SB = self.SB || {};

(function() {
  'use strict';

  var Matrix = SB.Matrix;
  var MAX_ITER = 25;
  var TOL = 1e-8;

  function glm(y, X, options) {
    options = options || {};
    var maxIter = options.maxIter != null ? options.maxIter : MAX_ITER;
    var tol = options.tol != null ? options.tol : TOL;

    var n = X.length;
    if (n === 0 || !X[0]) {
      throw new Error('glm: empty design matrix (n=0)');
    }
    var p = X[0].length;

    if (y.length !== n) {
      throw new Error('glm: y length (' + y.length + ') != X rows (' + n + ')');
    }

    var beta = new Array(p).fill(0);
    var converged = false;
    var iter = 0;

    for (iter = 0; iter < maxIter; iter++) {
      var eta = Matrix.multiplyVec(X, beta);
      var pi = new Array(n);
      for (var i = 0; i < n; i++) {
        pi[i] = logistic(eta[i]);
      }

      var W = new Array(n);
      for (var i = 0; i < n; i++) {
        W[i] = pi[i] * (1 - pi[i]);
        if (W[i] < 1e-10) W[i] = 1e-10;
      }

      var z = new Array(n);
      for (var i = 0; i < n; i++) {
        z[i] = eta[i] + (y[i] - pi[i]) / W[i];
      }

      var XtWX = Matrix.create(p, p);
      var XtWz = new Array(p).fill(0);

      for (var j1 = 0; j1 < p; j1++) {
        for (var j2 = j1; j2 < p; j2++) {
          var sum = 0;
          for (var i = 0; i < n; i++) {
            sum += X[i][j1] * W[i] * X[i][j2];
          }
          XtWX[j1][j2] = sum;
          XtWX[j2][j1] = sum;
        }
        for (var i = 0; i < n; i++) {
          XtWz[j1] += X[i][j1] * W[i] * z[i];
        }
      }

      var XtWXinv = Matrix.inverse(XtWX);
      if (!XtWXinv) {
        throw new Error("glm: X'WX is singular — separation or collinearity in data");
      }

      var betaNew = Matrix.multiplyVec(XtWXinv, XtWz);

      var maxDelta = 0;
      for (var j = 0; j < p; j++) {
        maxDelta = Math.max(maxDelta, Math.abs(betaNew[j] - beta[j]));
      }

      beta = betaNew;

      if (maxDelta < tol) {
        converged = true;
        iter++;
        break;
      }
    }

    // Final fitted values
    var eta = Matrix.multiplyVec(X, beta);
    var fitted = new Array(n);
    for (var i = 0; i < n; i++) {
      fitted[i] = logistic(eta[i]);
    }

    // Fisher information matrix at convergence
    var W = new Array(n);
    for (var i = 0; i < n; i++) {
      W[i] = fitted[i] * (1 - fitted[i]);
      if (W[i] < 1e-10) W[i] = 1e-10;
    }

    var XtWX = Matrix.create(p, p);
    for (var j1 = 0; j1 < p; j1++) {
      for (var j2 = j1; j2 < p; j2++) {
        var sum = 0;
        for (var i = 0; i < n; i++) {
          sum += X[i][j1] * W[i] * X[i][j2];
        }
        XtWX[j1][j2] = sum;
        XtWX[j2][j1] = sum;
      }
    }

    var XtWXinv = Matrix.inverse(XtWX);

    var se = new Array(p);
    for (var j = 0; j < p; j++) {
      se[j] = XtWXinv ? Math.sqrt(Math.max(0, XtWXinv[j][j])) : NaN;
    }

    var zstat = new Array(p);
    var pvalue = new Array(p);
    for (var j = 0; j < p; j++) {
      zstat[j] = se[j] > 0 ? beta[j] / se[j] : 0;
      pvalue[j] = 2 * normalCdfUpper(Math.abs(zstat[j]));
    }

    var logLik = 0;
    for (var i = 0; i < n; i++) {
      var piVal = fitted[i];
      var piSafe = Math.max(1e-15, Math.min(1 - 1e-15, piVal));
      logLik += y[i] * Math.log(piSafe) + (1 - y[i]) * Math.log(1 - piSafe);
    }

    var coefficientTable = [];
    for (var j = 0; j < p; j++) {
      coefficientTable.push([beta[j], se[j], zstat[j], pvalue[j]]);
    }

    return {
      coefficients: beta,
      se: se,
      zstat: zstat,
      pvalue: pvalue,
      logLik: logLik,
      fitted: fitted,
      converged: converged,
      iterations: iter,
      coefficientTable: coefficientTable,
      summary: { coefficient: coefficientTable },
      n: n,
      p: p,
    };
  }

  function logistic(x) {
    if (x > 500) return 1;
    if (x < -500) return 0;
    return 1 / (1 + Math.exp(-x));
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

  // ============================================================
  // Export to namespace
  // ============================================================

  SB.LogReg = {
    glm: glm,
  };

})();
