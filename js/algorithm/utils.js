/**
 * utils.js — Shared algorithm utilities
 *
 * Namespace: SB.Utils
 */
var SB = self.SB = self.SB || {};

(function() {
  'use strict';

  // ============================================================
  // Quantile (type=3 — nearest even order statistic, SAS default)
  // ============================================================

  function quantileType3(sorted, p) {
    var n = sorted.length;
    if (n === 0) return NaN;
    if (n === 1) return sorted[0];
    if (p <= 0) return sorted[0];
    if (p >= 1) return sorted[n - 1];

    var m = -0.5;
    var np = n * p + m;
    var j = Math.floor(np);
    var g = np - j;

    var gamma;
    if (Math.abs(g) < 1e-10) {
      gamma = (j % 2 === 0) ? 0 : 1;
    } else {
      gamma = 1;
    }

    var idx0 = Math.max(0, Math.min(n - 1, j - 1));
    var idx1 = Math.max(0, Math.min(n - 1, j));

    return (1 - gamma) * sorted[idx0] + gamma * sorted[idx1];
  }

  // ============================================================
  // Seeded PRNG — Mulberry32
  // ============================================================

  function mulberry32(seed) {
    var s = seed | 0;
    return function() {
      s = s + 0x6D2B79F5 | 0;
      var t = Math.imul(s ^ (s >>> 15), 1 | s);
      t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ============================================================
  // Median
  // ============================================================

  function median(arr) {
    var clean = arr.filter(function(v) { return v !== null && v !== undefined && !isNaN(v); });
    if (clean.length === 0) return null;
    clean.sort(function(a, b) { return a - b; });
    var mid = Math.floor(clean.length / 2);
    return clean.length % 2 === 0
      ? (clean[mid - 1] + clean[mid]) / 2
      : clean[mid];
  }

  // ============================================================
  // Export to namespace
  // ============================================================

  SB.Utils = {
    quantileType3: quantileType3,
    mulberry32: mulberry32,
    median: median,
  };

})();
