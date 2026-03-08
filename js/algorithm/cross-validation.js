/**
 * cross-validation.js — K-fold cross-validation engine
 *
 * Depends on: SB.SeqBatting, SB.Prediction, SB.Evaluation, SB.Utils
 *
 * Namespace: SB.CV
 */
var SB = self.SB = self.SB || {};

(function() {
  'use strict';

  // ============================================================
  // Balanced (stratified) fold creation
  // ============================================================

  function balancedFolds(strata, kFold, rng) {
    if (!strata) {
      throw new Error('balancedFolds: strata is null — use simpleFolds for continuous endpoints');
    }
    var n = strata.length;

    if (strata.every(function(v) { return v === strata[0]; })) {
      return simpleFolds(n, kFold, rng);
    }

    var classes = {};
    for (var i = 0; i < n; i++) {
      var cls = String(strata[i] != null ? strata[i] : 'NA');
      if (!classes[cls]) classes[cls] = [];
      classes[cls].push(i);
    }

    var folds = [];
    for (var f = 0; f < kFold; f++) folds.push([]);
    var foldIdx = 0;

    var classKeys = Object.keys(classes);
    for (var ck = 0; ck < classKeys.length; ck++) {
      var indices = classes[classKeys[ck]];
      for (var i = indices.length - 1; i > 0; i--) {
        var j = Math.floor(rng() * (i + 1));
        var tmp = indices[i]; indices[i] = indices[j]; indices[j] = tmp;
      }
      for (var ii = 0; ii < indices.length; ii++) {
        folds[foldIdx % kFold].push(indices[ii]);
        foldIdx++;
      }
    }

    return folds;
  }

  function simpleFolds(n, kFold, rng) {
    var indices = [];
    for (var i = 0; i < n; i++) indices.push(i);
    for (var i = n - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = indices[i]; indices[i] = indices[j]; indices[j] = tmp;
    }
    var folds = [];
    for (var f = 0; f < kFold; f++) folds.push([]);
    for (var i = 0; i < indices.length; i++) {
      folds[i % kFold].push(indices[i]);
    }
    return folds;
  }

  // ============================================================
  // K-fold CV orchestrator
  // ============================================================

  function kfoldCV(params) {
    var data = params.data;
    var yvar = params.yvar;
    var censorvar = params.censorvar;
    var trtvar = params.trtvar;
    var type = params.type;
    var xvars = params.xvars;
    var nBoot = params.nBoot;
    var desRes = params.desRes;
    var minSigpPrcnt = params.minSigpPrcnt;
    var kFold = params.kFold;
    var cvIter = params.cvIter;
    var maxIter = params.maxIter;
    var randomSeed = params.randomSeed;
    var onProgress = params.onProgress;

    var isPredictive = trtvar !== null && trtvar !== undefined;
    var n = data.length;

    var strata;
    if (type === 'b') strata = data.map(function(r) { return r[yvar]; });
    else if (type === 's') strata = data.map(function(r) { return r[censorvar]; });
    else strata = null;  // continuous — no stratification needed, will use simpleFolds

    var rng = SB.Utils.mulberry32(randomSeed);

    var iterSuccessCount = 0;
    var iterCount = 0;
    var allPvals = [];
    var allRatios = [];
    var allGroupStats = [];
    var sigList = [];
    var predClassList = [];
    var errorLog = [];

    while (iterSuccessCount < cvIter) {
      iterCount++;
      if (iterCount > maxIter) {
        if (onProgress) onProgress('CV: reached max iterations (' + maxIter + '). Stopping.');
        break;
      }

      if (onProgress) {
        onProgress('CV iteration ' + iterCount + ' (' + iterSuccessCount + '/' + cvIter + ' successful)...');
      }

      var folds = strata !== null ? balancedFolds(strata, kFold, rng) : simpleFolds(n, kFold, rng);

      var iterFailed = false;
      var iterPredClass = new Array(n).fill(null);
      var iterFoldVec = new Array(n).fill(0);
      var iterSigs = [];

      for (var f = 0; f < kFold; f++) {
        var testIdxSet = {};
        for (var ti = 0; ti < folds[f].length; ti++) testIdxSet[folds[f][ti]] = true;
        var trainData = data.filter(function(_, i) { return !testIdxSet[i]; });
        var testData = folds[f].map(function(i) { return data[i]; });

        var foldRng = SB.Utils.mulberry32(randomSeed + iterCount * 1000 + f);
        var rules;
        try {
          if (trainData.length < 10) {
            throw new Error('Training fold too small (n=' + trainData.length + ')');
          }
          rules = SB.SeqBatting.seqlrBatting({
            data: trainData,
            yvar: yvar, censorvar: censorvar, trtvar: trtvar, type: type, xvars: xvars,
            nBoot: nBoot, desRes: desRes, minSigpPrcnt: minSigpPrcnt,
            rng: foldRng,
          });
        } catch (err) {
          var errDetail = err.message || String(err);
          if (err.stack) errDetail += ' | stack: ' + err.stack.split('\n').slice(0, 3).join(' > ');
          errorLog.push('Iter ' + iterCount + ', fold ' + (f + 1) + ': train error: ' + errDetail);
          iterFailed = true;
          break;
        }

        if (rules === null) {
          // No significant rules found in this fold — treat as failed fold
          errorLog.push('Iter ' + iterCount + ', fold ' + (f + 1) + ': no rules found');
          iterFailed = true;
          break;
        }

        iterSigs.push(rules);

        try {
          var pred = SB.Prediction.predSeqlr(testData, rules);
          for (var pi = 0; pi < folds[f].length; pi++) {
            iterPredClass[folds[f][pi]] = pred[pi];
            iterFoldVec[folds[f][pi]] = f + 1;
          }
        } catch (err) {
          var errDetail = err.message || String(err);
          if (err.stack) errDetail += ' | stack: ' + err.stack.split('\n').slice(0, 3).join(' > ');
          errorLog.push('Iter ' + iterCount + ', fold ' + (f + 1) + ': predict error: ' + errDetail);
          iterFailed = true;
          break;
        }
      }

      if (iterFailed) continue;

      iterSuccessCount++;
      sigList.push.apply(sigList, iterSigs);
      predClassList.push(iterPredClass);

      try {
        // Convert any remaining null predClass values to false (safety)
        for (var pc = 0; pc < iterPredClass.length; pc++) {
          if (iterPredClass[pc] === null || iterPredClass[pc] === undefined) {
            iterPredClass[pc] = false;
          }
        }

        var evalResult = SB.Evaluation.evaluateIteration(data, iterPredClass, yvar, censorvar, trtvar, type);
        allPvals.push(evalResult.pvals);
        allRatios.push(evalResult.ratios);

        if (isPredictive) {
          allGroupStats.push(SB.Evaluation.findPredStats(data, iterPredClass, yvar, censorvar, trtvar, type));
        } else {
          allGroupStats.push(SB.Evaluation.findProgStats(data, iterPredClass, yvar, censorvar, type));
        }
      } catch (err) {
        var errDetail = err.message || String(err);
        if (err.stack) errDetail += ' | stack: ' + err.stack.split('\n').slice(0, 3).join(' > ');
        errorLog.push('Iter ' + iterCount + ': eval error: ' + errDetail);
        allPvals.push({});
        allRatios.push({});
        allGroupStats.push({});
      }
    }

    // Report errors if any
    if (errorLog.length > 0 && onProgress) {
      onProgress('CV: ' + errorLog.length + ' errors logged. Last: ' + errorLog[errorLog.length - 1]);
    }

    if (iterSuccessCount === 0) {
      if (onProgress) onProgress('CV: 0 successful iterations out of ' + iterCount + '. Returning null.');
      return null;
    }

    var summary = summarizeCVStats(allPvals, allRatios, allGroupStats, isPredictive);

    return {
      rawStats: { pvals: allPvals, ratios: allRatios, groupStats: allGroupStats },
      sigList: sigList,
      predClasses: predClassList,
      errorLog: errorLog,
      summary: summary,
      nSuccess: iterSuccessCount,
      nTotal: iterCount,
    };
  }

  // ============================================================
  // summarizeCVStats
  // ============================================================

  function summarizeCVStats(allPvals, allRatios, allGroupStats, isPredictive) {
    if (allPvals.length === 0) return null;

    var keyPvals = allPvals.map(function(p) {
      if (isPredictive) return p.interaction != null ? p.interaction : null;
      return p.pval != null ? p.pval : null;
    }).filter(function(v) { return v !== null && !isNaN(v); });

    if (keyPvals.length === 0) return null;

    var sorted = keyPvals.slice().sort(function(a, b) { return a - b; });
    var medianPval = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];

    var minDist = Infinity;
    var medIdx = 0;
    for (var i = 0; i < allPvals.length; i++) {
      var val = isPredictive ? allPvals[i].interaction : allPvals[i].pval;
      if (val !== null && val !== undefined) {
        var dist = Math.abs(val - medianPval);
        if (dist < minDist) {
          minDist = dist;
          medIdx = i;
        }
      }
    }

    var summaryPvals = {};
    var keys = Object.keys(allPvals[medIdx]);
    for (var k = 0; k < keys.length; k++) summaryPvals[keys[k]] = allPvals[medIdx][keys[k]];

    var summaryRatios = {};
    var rkeys = Object.keys(allRatios[medIdx]);
    for (var k = 0; k < rkeys.length; k++) summaryRatios[rkeys[k]] = allRatios[medIdx][rkeys[k]];

    var summaryGroupStats = {};
    var gsRef = allGroupStats[medIdx] || {};
    var gsKeys = Object.keys(gsRef);
    for (var gk = 0; gk < gsKeys.length; gk++) {
      var groupName = gsKeys[gk];
      var refGroup = gsRef[groupName];
      if (!refGroup || typeof refGroup !== 'object') continue;
      summaryGroupStats[groupName] = {};
      var statKeys = Object.keys(refGroup);
      for (var sk = 0; sk < statKeys.length; sk++) {
        var statName = statKeys[sk];
        summaryGroupStats[groupName][statName] = refGroup[statName];
        // Compute MAD for numeric stats across iterations
        if (typeof refGroup[statName] === 'number') {
          var gsVals = allGroupStats.map(function(gs) {
            return gs && gs[groupName] ? gs[groupName][statName] : null;
          }).filter(function(v) { return v !== null && v !== undefined && !isNaN(v); });
          summaryGroupStats[groupName]['mad_' + statName] = computeMAD(gsVals);
        }
      }
    }

    var pkeys = Object.keys(summaryPvals);
    for (var k = 0; k < pkeys.length; k++) {
      var vals = allPvals.map(function(p) { return p[pkeys[k]]; }).filter(function(v) { return v !== null && v !== undefined && !isNaN(v); });
      summaryPvals['mad_' + pkeys[k]] = computeMAD(vals);
    }

    var rkeysList = Object.keys(summaryRatios);
    for (var k = 0; k < rkeysList.length; k++) {
      var vals = allRatios.map(function(r) { return r[rkeysList[k]]; }).filter(function(v) { return v !== null && v !== undefined && !isNaN(v); });
      summaryRatios['mad_' + rkeysList[k]] = computeMAD(vals);
    }

    return {
      pvals: summaryPvals,
      ratios: summaryRatios,
      groupStats: summaryGroupStats,
      medianIterationIndex: medIdx,
    };
  }

  /**
   * Compute MAD (median absolute deviation) with R-compatible constant.
   * R's mad() multiplies by 1.4826 for consistency with the normal distribution.
   */
  function computeMAD(values) {
    if (values.length === 0) return null;
    var MAD_CONSTANT = 1.4826;
    var sorted = values.slice().sort(function(a, b) { return a - b; });
    var med = sorted.length % 2 === 0
      ? (sorted[sorted.length / 2 - 1] + sorted[sorted.length / 2]) / 2
      : sorted[Math.floor(sorted.length / 2)];
    var deviations = values.map(function(v) { return Math.abs(v - med); });
    deviations.sort(function(a, b) { return a - b; });
    var rawMAD = deviations.length % 2 === 0
      ? (deviations[deviations.length / 2 - 1] + deviations[deviations.length / 2]) / 2
      : deviations[Math.floor(deviations.length / 2)];
    return rawMAD * MAD_CONSTANT;
  }

  // ============================================================
  // Export to namespace
  // ============================================================

  SB.CV = {
    balancedFolds: balancedFolds,
    kfoldCV: kfoldCV,
    summarizeCVStats: summarizeCVStats,
  };

})();
