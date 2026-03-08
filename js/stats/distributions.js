/**
 * distributions.js — Statistical distribution functions
 *
 * Thin wrappers around jStat (loaded via CDN) with fallback approximations.
 *
 * Namespace: SB.Dist
 */
var SB = self.SB = self.SB || {};

(function() {
  'use strict';

  // ============================================================
  // Normal distribution
  // ============================================================

  /** CDF of standard normal: P(Z <= z). */
  function normalCdf(z) {
    if (typeof jStat !== 'undefined') {
      return jStat.normal.cdf(z, 0, 1);
    }
    return _normalCdfApprox(z);
  }

  /** PDF of standard normal. */
  function normalPdf(z) {
    if (typeof jStat !== 'undefined') {
      return jStat.normal.pdf(z, 0, 1);
    }
    return Math.exp(-0.5 * z * z) / Math.sqrt(2 * Math.PI);
  }

  /** Quantile (inverse CDF) of standard normal. */
  function normalQuantile(p) {
    if (typeof jStat !== 'undefined') {
      return jStat.normal.inv(p, 0, 1);
    }
    return _normalQuantileApprox(p);
  }

  /** Two-sided p-value from normal distribution: 2 * P(Z > |z|). */
  function pvalueNormal(z) {
    return 2 * (1 - normalCdf(Math.abs(z)));
  }

  // ============================================================
  // Student's t distribution
  // ============================================================

  /** CDF of t distribution: P(T <= t) with `df` degrees of freedom. */
  function tCdf(t, df) {
    if (typeof jStat !== 'undefined') {
      return jStat.studentt.cdf(t, df);
    }
    if (df > 200) return normalCdf(t);
    return normalCdf(t);
  }

  /** PDF of t distribution. */
  function tPdf(t, df) {
    if (typeof jStat !== 'undefined') {
      return jStat.studentt.pdf(t, df);
    }
    return normalPdf(t);
  }

  /** Two-sided p-value from t distribution: 2 * P(T > |t|) with `df` df. */
  function pvalueT(t, df) {
    return 2 * (1 - tCdf(Math.abs(t), df));
  }

  // ============================================================
  // Chi-squared distribution
  // ============================================================

  /** CDF of chi-squared distribution: P(X <= x) with `df` degrees of freedom. */
  function chiSquaredCdf(x, df) {
    if (x <= 0) return 0;
    if (!isFinite(x)) return 1;  // CDF(+Inf) = 1; matches R's pchisq(Inf, df) = 1
    if (typeof jStat !== 'undefined') {
      return jStat.chisquare.cdf(x, df);
    }
    var z = Math.pow(x / df, 1 / 3) - (1 - 2 / (9 * df));
    var se = Math.sqrt(2 / (9 * df));
    return normalCdf(z / se);
  }

  /** P-value from chi-squared test: P(X > x) with `df` df. */
  function pvalueChiSq(x, df) {
    if (x <= 0) return 1;
    return 1 - chiSquaredCdf(x, df);
  }

  // ============================================================
  // Fallback approximations (when jStat not loaded)
  // ============================================================

  function _normalCdfApprox(z) {
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
    return 0.5 * (1 + sign * y);
  }

  function _normalQuantileApprox(p) {
    if (p <= 0) return -Infinity;
    if (p >= 1) return Infinity;
    if (p === 0.5) return 0;

    var a = [
      -3.969683028665376e+01, 2.209460984245205e+02,
      -2.759285104469687e+02, 1.383577518672690e+02,
      -3.066479806614716e+01, 2.506628277459239e+00,
    ];
    var b = [
      -5.447609879822406e+01, 1.615858368580409e+02,
      -1.556989798598866e+02, 6.680131188771972e+01,
      -1.328068155288572e+01,
    ];
    var c = [
      -7.784894002430293e-03, -3.223964580411365e-01,
      -2.400758277161838e+00, -2.549732539343734e+00,
      4.374664141464968e+00,  2.938163982698783e+00,
    ];
    var d = [
      7.784695709041462e-03, 3.224671290700398e-01,
      2.445134137142996e+00, 3.754408661907416e+00,
    ];

    var pLow = 0.02425;
    var pHigh = 1 - pLow;
    var q, r;

    if (p < pLow) {
      q = Math.sqrt(-2 * Math.log(p));
      return (((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
             ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    } else if (p <= pHigh) {
      q = p - 0.5;
      r = q * q;
      return (((((a[0]*r+a[1])*r+a[2])*r+a[3])*r+a[4])*r+a[5])*q /
             (((((b[0]*r+b[1])*r+b[2])*r+b[3])*r+b[4])*r+1);
    } else {
      q = Math.sqrt(-2 * Math.log(1 - p));
      return -(((((c[0]*q+c[1])*q+c[2])*q+c[3])*q+c[4])*q+c[5]) /
              ((((d[0]*q+d[1])*q+d[2])*q+d[3])*q+1);
    }
  }

  // ============================================================
  // Export to namespace
  // ============================================================

  SB.Dist = {
    normalCdf: normalCdf,
    normalPdf: normalPdf,
    normalQuantile: normalQuantile,
    tCdf: tCdf,
    tPdf: tPdf,
    chiSquaredCdf: chiSquaredCdf,
    pvalueNormal: pvalueNormal,
    pvalueT: pvalueT,
    pvalueChiSq: pvalueChiSq,
  };

})();
