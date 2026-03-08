/**
 * batting.js — Per-variable BATTing (Bootstrap Aggregated Threshold Tuning)
 *
 * Depends on: SB.LinReg, SB.LogReg, SB.Cox, SB.Utils
 *
 * Namespace: SB.Batting
 */
var SB = self.SB = self.SB || {};

(function() {
  'use strict';

  var lm = function(y, X) { return SB.LinReg.lm(y, X); };
  var glm = function(y, X) { return SB.LogReg.glm(y, X); };
  var coxph = function(time, status, X) { return SB.Cox.coxph(time, status, X); };
  var quantileType3 = function(sorted, p) { return SB.Utils.quantileType3(sorted, p); };

  // ============================================================
  // Scoring functions
  // ============================================================

  function scorePred(data, yvar, censorvar, xvar, trtvar, cutoff, type, dir, nsubj, minSigpPrcnt) {
    var id = data.map(function(row) {
      var val = row[xvar];
      if (val === null || val === undefined) return null;
      return dir === '>' ? (val > cutoff ? 1 : 0) : (val < cutoff ? 1 : 0);
    });

    var sigpCount = id.filter(function(v) { return v === 1; }).length;
    var sigpPrcnt = sigpCount / nsubj;
    var groups = new Set(id.filter(function(v) { return v !== null; }));
    if (sigpPrcnt <= minSigpPrcnt || groups.size < 2) return null;

    try {
      if (type === 's') {
        var n = data.length;
        var X = [], time = [], status = [];
        for (var i = 0; i < n; i++) {
          if (id[i] === null) continue;
          var trt = data[i][trtvar] != null ? data[i][trtvar] : 0;
          X.push([trt, id[i], trt * id[i]]);
          time.push(data[i][yvar]);
          status.push(data[i][censorvar]);
        }
        var fit = coxph(time, status, X);
        return fit.coefficientTable[2] ? (fit.coefficientTable[2][4] != null ? fit.coefficientTable[2][4] : null) : null;
      } else {
        var n = data.length;
        var X = [], y = [];
        for (var i = 0; i < n; i++) {
          if (id[i] === null) continue;
          var trt = data[i][trtvar] != null ? data[i][trtvar] : 0;
          X.push([1, trt, id[i], trt * id[i]]);
          y.push(data[i][yvar]);
        }
        var fit = type === 'b' ? glm(y, X) : lm(y, X);
        return fit.coefficientTable[3] ? (fit.coefficientTable[3][3] != null ? fit.coefficientTable[3][3] : null) : null;
      }
    } catch (e) {
      return null;
    }
  }

  function scoreProg(data, yvar, censorvar, xvar, cutoff, type, dir, nsubj, minSigpPrcnt) {
    var id = data.map(function(row) {
      var val = row[xvar];
      if (val === null || val === undefined) return null;
      return dir === '>' ? (val > cutoff ? 1 : 0) : (val < cutoff ? 1 : 0);
    });

    var sigpCount = id.filter(function(v) { return v === 1; }).length;
    var sigpPrcnt = sigpCount / nsubj;
    var groups = new Set(id.filter(function(v) { return v !== null; }));
    if (sigpPrcnt <= minSigpPrcnt || groups.size < 2) return null;

    try {
      if (type === 's') {
        var time = [], status = [], X = [];
        for (var i = 0; i < data.length; i++) {
          if (id[i] === null) continue;
          X.push([id[i]]);
          time.push(data[i][yvar]);
          status.push(data[i][censorvar]);
        }
        var fit = coxph(time, status, X);
        return fit.coefficientTable[0] ? (fit.coefficientTable[0][4] != null ? fit.coefficientTable[0][4] : null) : null;
      } else {
        var X = [], y = [];
        for (var i = 0; i < data.length; i++) {
          if (id[i] === null) continue;
          X.push([1, id[i]]);
          y.push(data[i][yvar]);
        }
        var fit = type === 'b' ? glm(y, X) : lm(y, X);
        return fit.coefficientTable[1] ? (fit.coefficientTable[1][3] != null ? fit.coefficientTable[1][3] : null) : null;
      }
    } catch (e) {
      return null;
    }
  }

  // ============================================================
  // Cutoff search
  // ============================================================

  function findCutoffPred(data, yvar, censorvar, xvar, trtvar, type, dir, nsubj, minSigpPrcnt) {
    if (!data || data.length === 0) return null;
    var values = data.map(function(r) { return r[xvar]; }).filter(function(v) { return v !== null && v !== undefined; });
    var sorted = Array.from(new Set(values)).sort(function(a, b) { return a - b; });
    if (sorted.length < 2) return null;

    var probs = [];
    for (var p = 0.05; p <= 0.95 + 1e-10; p += 0.05) probs.push(Math.min(p, 0.95));
    var cutVec = Array.from(new Set(probs.map(function(p) { return quantileType3(sorted, p); }))).sort(function(a, b) { return a - b; });

    var bestScore = Infinity;
    var bestCut = null;

    for (var ci = 0; ci < cutVec.length; ci++) {
      var cut = cutVec[ci];
      var score = scorePred(data, yvar, censorvar, xvar, trtvar, cut, type, dir, nsubj, minSigpPrcnt);
      if (score !== null && !isNaN(score) && score < bestScore) {
        bestScore = score;
        bestCut = cut;
      }
    }

    return bestCut;
  }

  function findCutoffProg(data, yvar, censorvar, xvar, type, dir, nsubj, minSigpPrcnt) {
    if (!data || data.length === 0) return null;
    var values = data.map(function(r) { return r[xvar]; }).filter(function(v) { return v !== null && v !== undefined; });
    var sorted = Array.from(new Set(values)).sort(function(a, b) { return a - b; });
    if (sorted.length < 2) return null;

    var probs = [];
    for (var p = 0.05; p <= 0.95 + 1e-10; p += 0.05) probs.push(Math.min(p, 0.95));
    var cutVec = Array.from(new Set(probs.map(function(p) { return quantileType3(sorted, p); }))).sort(function(a, b) { return a - b; });

    var bestScore = Infinity;
    var bestCut = null;

    for (var ci = 0; ci < cutVec.length; ci++) {
      var cut = cutVec[ci];
      var score = scoreProg(data, yvar, censorvar, xvar, cut, type, dir, nsubj, minSigpPrcnt);
      if (score !== null && !isNaN(score) && score < bestScore) {
        bestScore = score;
        bestCut = cut;
      }
    }

    return bestCut;
  }

  // ============================================================
  // Main BATTing functions
  // ============================================================

  function battingPred(dataset, ids, yvar, censorvar, trtvar, type, xvar, nBoot, desRes, minSigpPrcnt, rng) {
    if (!ids || ids.length === 0) return [xvar, null, null, null];
    var data = typeof ids[0] === 'boolean'
      ? dataset.filter(function(_, i) { return ids[i]; })
      : dataset.slice();
    var nsubj = data.length;
    if (nsubj < 4) return [xvar, null, null, null];

    var coefInter = null;
    try {
      if (type === 's') {
        var time = data.map(function(r) { return r[yvar]; });
        var status = data.map(function(r) { return r[censorvar]; });
        var X = data.map(function(r) {
          var trt = r[trtvar] != null ? r[trtvar] : 0;
          var xval = r[xvar] != null ? r[xvar] : 0;
          return [trt, xval, trt * xval];
        });
        var fit = coxph(time, status, X);
        coefInter = fit.coefficientTable[2] ? (fit.coefficientTable[2][0] != null ? fit.coefficientTable[2][0] : null) : null;
      } else {
        var y = data.map(function(r) { return r[yvar]; });
        var X = data.map(function(r) {
          var trt = r[trtvar] != null ? r[trtvar] : 0;
          var xval = r[xvar] != null ? r[xvar] : 0;
          return [1, trt, xval, trt * xval];
        });
        var fit = type === 'b' ? glm(y, X) : lm(y, X);
        coefInter = fit.coefficientTable[3] ? (fit.coefficientTable[3][0] != null ? fit.coefficientTable[3][0] : null) : null;
      }
    } catch (e) {
      return [xvar, null, null, null];
    }

    if (coefInter === null || isNaN(coefInter)) {
      return [xvar, null, null, null];
    }

    var dir;
    if (desRes === 'smaller') {
      if (type === 's') dir = coefInter >= 0 ? '>' : '<';
      else              dir = coefInter >= 0 ? '<' : '>';
    } else {
      if (type === 's') dir = coefInter >= 0 ? '<' : '>';
      else              dir = coefInter >= 0 ? '>' : '<';
    }

    var cutoffs = [];
    for (var b = 0; b < nBoot; b++) {
      var bootData = [];
      for (var i = 0; i < nsubj; i++) {
        bootData.push(data[Math.floor(rng() * nsubj)]);
      }
      var cut = findCutoffPred(bootData, yvar, censorvar, xvar, trtvar, type, dir, nsubj, minSigpPrcnt);
      if (cut !== null) cutoffs.push(cut);
    }

    if (cutoffs.length === 0) return [xvar, dir, null, null];

    cutoffs.sort(function(a, b) { return a - b; });
    var cutoffMed = cutoffs.length % 2 === 0
      ? (cutoffs[cutoffs.length / 2 - 1] + cutoffs[cutoffs.length / 2]) / 2
      : cutoffs[Math.floor(cutoffs.length / 2)];

    if (cutoffMed === null || isNaN(cutoffMed)) return [xvar, dir, null, null];

    var pval = scorePred(data, yvar, censorvar, xvar, trtvar, cutoffMed, type, dir, nsubj, minSigpPrcnt);

    return [xvar, dir, cutoffMed, pval, cutoffs];
  }

  function battingProg(dataset, ids, yvar, censorvar, type, xvar, nBoot, desRes, minSigpPrcnt, rng) {
    if (!ids || ids.length === 0) return [xvar, null, null, null];
    var data = typeof ids[0] === 'boolean'
      ? dataset.filter(function(_, i) { return ids[i]; })
      : dataset.slice();
    var nsubj = data.length;
    if (nsubj < 4) return [xvar, null, null, null];

    var coefMain = null;
    try {
      if (type === 's') {
        var time = data.map(function(r) { return r[yvar]; });
        var status = data.map(function(r) { return r[censorvar]; });
        var X = data.map(function(r) { return [r[xvar] != null ? r[xvar] : 0]; });
        var fit = coxph(time, status, X);
        coefMain = fit.coefficientTable[0] ? (fit.coefficientTable[0][0] != null ? fit.coefficientTable[0][0] : null) : null;
      } else {
        var y = data.map(function(r) { return r[yvar]; });
        var X = data.map(function(r) { return [1, r[xvar] != null ? r[xvar] : 0]; });
        var fit = type === 'b' ? glm(y, X) : lm(y, X);
        coefMain = fit.coefficientTable[1] ? (fit.coefficientTable[1][0] != null ? fit.coefficientTable[1][0] : null) : null;
      }
    } catch (e) {
      return [xvar, null, null, null];
    }

    if (coefMain === null || isNaN(coefMain)) {
      return [xvar, null, null, null];
    }

    var dir;
    if (desRes === 'smaller') {
      if (type === 's') dir = coefMain >= 0 ? '>' : '<';
      else              dir = coefMain >= 0 ? '<' : '>';
    } else {
      if (type === 's') dir = coefMain >= 0 ? '<' : '>';
      else              dir = coefMain >= 0 ? '>' : '<';
    }

    var cutoffs = [];
    for (var b = 0; b < nBoot; b++) {
      var bootData = [];
      for (var i = 0; i < nsubj; i++) {
        bootData.push(data[Math.floor(rng() * nsubj)]);
      }
      var cut = findCutoffProg(bootData, yvar, censorvar, xvar, type, dir, nsubj, minSigpPrcnt);
      if (cut !== null) cutoffs.push(cut);
    }

    if (cutoffs.length === 0) return [xvar, dir, null, null];

    cutoffs.sort(function(a, b) { return a - b; });
    var cutoffMed = cutoffs.length % 2 === 0
      ? (cutoffs[cutoffs.length / 2 - 1] + cutoffs[cutoffs.length / 2]) / 2
      : cutoffs[Math.floor(cutoffs.length / 2)];

    if (cutoffMed === null || isNaN(cutoffMed)) return [xvar, dir, null, null];

    var pval = scoreProg(data, yvar, censorvar, xvar, cutoffMed, type, dir, nsubj, minSigpPrcnt);

    return [xvar, dir, cutoffMed, pval, cutoffs];
  }

  // ============================================================
  // Export to namespace
  // ============================================================

  SB.Batting = {
    scorePred: scorePred,
    scoreProg: scoreProg,
    findCutoffPred: findCutoffPred,
    findCutoffProg: findCutoffProg,
    battingPred: battingPred,
    battingProg: battingProg,
  };

})();
