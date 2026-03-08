/**
 * cox-regression.js — Cox Proportional Hazards regression
 *
 * Newton-Raphson optimization of the Breslow partial likelihood.
 * Depends on: SB.Matrix
 *
 * Namespace: SB.Cox
 */
var SB = self.SB = self.SB || {};

(function() {
  'use strict';

  var Matrix = SB.Matrix;
  var MAX_ITER = 25;
  var TOL = 1e-9;

  function coxph(time, status, X, options) {
    options = options || {};
    var maxIter = options.maxIter != null ? options.maxIter : MAX_ITER;
    var tol = options.tol != null ? options.tol : TOL;

    var n = X.length;
    if (n === 0 || !X[0]) {
      throw new Error('coxph: empty design matrix (n=0)');
    }
    var p = X[0].length;

    if (time.length !== n || status.length !== n) {
      throw new Error('coxph: dimension mismatch (n=' + n + ', time=' + time.length + ', status=' + status.length + ')');
    }

    // Sort by time (descending) for efficient risk set computation
    var indices = [];
    for (var i = 0; i < n; i++) indices.push(i);
    indices.sort(function(a, b) {
      if (time[a] !== time[b]) return time[b] - time[a];
      return status[b] - status[a];
    });

    var sortedTime = indices.map(function(i) { return time[i]; });
    var sortedStatus = indices.map(function(i) { return status[i]; });
    var sortedX = indices.map(function(i) { return X[i]; });

    var loglikNull = _partialLogLik(sortedTime, sortedStatus, sortedX, new Array(p).fill(0));

    var beta = new Array(p).fill(0);
    var converged = false;
    var iter = 0;

    for (iter = 0; iter < maxIter; iter++) {
      var scoreInfo = _scoreAndInfo(sortedTime, sortedStatus, sortedX, beta);
      var gradient = scoreInfo.gradient;
      var hessian = scoreInfo.hessian;

      var negHessian = hessian.map(function(row) { return row.map(function(v) { return -v; }); });
      var Hinv = Matrix.inverse(negHessian);
      if (!Hinv) {
        throw new Error('coxph: Hessian is singular — possible collinearity');
      }

      var delta = Matrix.multiplyVec(Hinv, gradient);

      var maxDelta = 0;
      var betaNew = new Array(p);
      for (var j = 0; j < p; j++) {
        betaNew[j] = beta[j] + delta[j];
        maxDelta = Math.max(maxDelta, Math.abs(delta[j]));
      }

      beta = betaNew;

      if (maxDelta < tol) {
        converged = true;
        iter++;
        break;
      }
    }

    var loglikModel = _partialLogLik(sortedTime, sortedStatus, sortedX, beta);

    var finalInfo = _scoreAndInfo(sortedTime, sortedStatus, sortedX, beta);
    var infoMatrix = finalInfo.hessian.map(function(row) { return row.map(function(v) { return -v; }); });
    var infoInv = Matrix.inverse(infoMatrix);

    var se = new Array(p);
    for (var j = 0; j < p; j++) {
      se[j] = infoInv ? Math.sqrt(Math.max(0, infoInv[j][j])) : NaN;
    }

    var expCoef = beta.map(function(b) { return Math.exp(b); });

    var zstat = new Array(p);
    var pvalue = new Array(p);
    for (var j = 0; j < p; j++) {
      zstat[j] = se[j] > 0 ? beta[j] / se[j] : 0;
      pvalue[j] = 2 * _normalCdfUpper(Math.abs(zstat[j]));
    }

    var coefficientTable = [];
    for (var j = 0; j < p; j++) {
      coefficientTable.push([beta[j], expCoef[j], se[j], zstat[j], pvalue[j]]);
    }

    var nevent = 0;
    for (var i = 0; i < status.length; i++) nevent += status[i];

    return {
      coefficients: beta,
      expCoef: expCoef,
      se: se,
      zstat: zstat,
      pvalue: pvalue,
      loglik: [loglikNull, loglikModel],
      converged: converged,
      iterations: iter,
      coefficientTable: coefficientTable,
      summary: { coefficient: coefficientTable },
      n: n,
      p: p,
      nevent: nevent,
    };
  }

  // ============================================================
  // Internal: Breslow partial log-likelihood and derivatives
  // ============================================================

  function _partialLogLik(time, status, X, beta) {
    var n = X.length;
    var p = beta.length;

    var expXb = new Array(n);
    for (var i = 0; i < n; i++) {
      var xb = 0;
      for (var j = 0; j < p; j++) {
        xb += X[i][j] * beta[j];
      }
      expXb[i] = Math.exp(xb);
    }

    var loglik = 0;
    var riskSum = 0;

    for (var i = 0; i < n; i++) {
      riskSum += expXb[i];

      if (status[i] === 1) {
        var xb = 0;
        for (var j = 0; j < p; j++) {
          xb += X[i][j] * beta[j];
        }
        loglik += xb - Math.log(riskSum);
      }
    }

    return loglik;
  }

  function _scoreAndInfo(time, status, X, beta) {
    var n = X.length;
    var p = beta.length;

    var expXb = new Array(n);
    for (var i = 0; i < n; i++) {
      var xb = 0;
      for (var j = 0; j < p; j++) {
        xb += X[i][j] * beta[j];
      }
      expXb[i] = Math.exp(xb);
    }

    var s0 = 0;
    var s1 = new Array(p).fill(0);
    var s2 = Matrix.zeros(p, p);

    var gradient = new Array(p).fill(0);
    var hessian = Matrix.zeros(p, p);

    for (var i = 0; i < n; i++) {
      var w = expXb[i];
      s0 += w;
      for (var j = 0; j < p; j++) {
        s1[j] += X[i][j] * w;
        for (var k = j; k < p; k++) {
          s2[j][k] += X[i][j] * X[i][k] * w;
          if (k !== j) s2[k][j] = s2[j][k];
        }
      }

      if (status[i] === 1 && s0 > 0) {
        for (var j = 0; j < p; j++) {
          gradient[j] += X[i][j] - s1[j] / s0;
        }

        for (var j = 0; j < p; j++) {
          for (var k = j; k < p; k++) {
            var h = -(s2[j][k] / s0 - (s1[j] * s1[k]) / (s0 * s0));
            hessian[j][k] += h;
            if (k !== j) hessian[k][j] += h;
          }
        }
      }
    }

    return { gradient: gradient, hessian: hessian };
  }

  function _normalCdfUpper(z) {
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
   * Build a covariate matrix for Cox PH from data (NO intercept).
   */
  function buildCoxMatrix(data, covariates) {
    var n = data.length;
    var p = covariates.length;
    var X = Matrix.create(n, p);
    for (var i = 0; i < n; i++) {
      for (var j = 0; j < p; j++) {
        var val = data[i][covariates[j]];
        X[i][j] = val != null ? val : 0;
      }
    }
    return X;
  }

  /**
   * Build a covariate matrix with treatment interaction terms for Cox PH.
   */
  function buildCoxInteractionMatrix(data, trtvar, xvars) {
    var n = data.length;
    var p = 1 + xvars.length + xvars.length;
    var names = [trtvar].concat(xvars).concat(xvars.map(function(x) { return trtvar + ':' + x; }));
    var X = Matrix.create(n, p);
    for (var i = 0; i < n; i++) {
      var trt = data[i][trtvar] != null ? data[i][trtvar] : 0;
      X[i][0] = trt;
      for (var j = 0; j < xvars.length; j++) {
        var xval = data[i][xvars[j]] != null ? data[i][xvars[j]] : 0;
        X[i][1 + j] = xval;
        X[i][1 + xvars.length + j] = trt * xval;
      }
    }
    return { X: X, names: names };
  }

  // ============================================================
  // Export to namespace
  // ============================================================

  SB.Cox = {
    coxph: coxph,
    buildCoxMatrix: buildCoxMatrix,
    buildCoxInteractionMatrix: buildCoxInteractionMatrix,
  };

})();
