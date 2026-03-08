/**
 * worker.js — Web Worker for running Sequential BATTing analysis
 *
 * Uses importScripts() to load algorithm modules (IIFE pattern).
 * Communicates with the main thread via postMessage.
 */

// Load jStat first (needed by stats modules)
importScripts('https://cdn.jsdelivr.net/npm/jstat@1.9.6/dist/jstat.min.js');

// Load algorithm modules in dependency order
importScripts(
  // Stats (no inter-deps except matrix first)
  'stats/matrix.js',
  'stats/distributions.js',
  'stats/linear-regression.js',
  'stats/logistic-regression.js',
  'stats/cox-regression.js',
  'stats/survival.js',
  // Algorithm
  'algorithm/utils.js',
  'algorithm/prediction.js',
  'algorithm/batting.js',
  'algorithm/sequential-batting.js',
  'algorithm/evaluation.js',
  'algorithm/cross-validation.js',
  'algorithm/prefilter.js',
  'algorithm/data-gen.js'
);

// ============================================================
// Message handler
// ============================================================

self.onmessage = function(event) {
  var data = event.data;
  var type = data.type;
  var payload = data.payload;

  if (type === 'run') {
    try {
      runAnalysis(payload);
    } catch (err) {
      postProgress('ERROR: ' + err.message);
      self.postMessage({ type: 'error', message: err.message });
    }
  }
};

function postProgress(msg) {
  self.postMessage({ type: 'progress', message: msg });
}

// ============================================================
// Main analysis runner
// ============================================================

function runAnalysis(params) {
  var data = params.data;
  var roles = params.roles;
  var config = params.config;
  var startTime = Date.now();

  postProgress('=== Sequential BATTing Analysis ===');
  postProgress('N=' + data.length + ', Predictors=' + roles.xvars.length + ', Type=' + roles.type);
  postProgress('Mode=' + (roles.trtvar ? 'Predictive' : 'Prognostic') + ', Scope=' + config.analysisScope);
  postProgress('Seed=' + config.randomSeed + ', n.boot=' + config.nBoot);
  postProgress('');

  var dataTrain = config.dataTrain || data;
  var dataTest = config.dataTest || null;

  var univResult = null;
  var multiResult = null;

  var analysisData = dataTrain;
  var trtvar = roles.trtvar || null;
  var censorvar = roles.censorvar || null;
  var isPredictive = trtvar !== null;

  // Univariate BATTing
  if (config.analysisScope === 'univariate' || config.analysisScope === 'both') {
    postProgress('--- Univariate BATTing ---');
    var univStart = Date.now();
    univResult = [];

    for (var vi = 0; vi < roles.xvars.length; vi++) {
      var xvar = roles.xvars[vi];
      var rng = SB.Utils.mulberry32(config.randomSeed);
      postProgress('  BATTing: ' + xvar + '...');

      var result;
      var ids = new Array(analysisData.length).fill(true);
      if (isPredictive) {
        result = SB.Batting.battingPred(analysisData, ids, roles.yvar, censorvar, trtvar,
          roles.type, xvar, config.nBoot, config.desRes, config.minSigpPrcnt, rng);
      } else {
        result = SB.Batting.battingProg(analysisData, ids, roles.yvar, censorvar,
          roles.type, xvar, config.nBoot, config.desRes, config.minSigpPrcnt, rng);
      }

      var varName = result[0], dir = result[1], cutoff = result[2], pval = result[3], bootCutoffs = result[4] || [];
      univResult.push({ variable: varName, direction: dir, threshold: cutoff, pvalue: pval, bootCutoffs: bootCutoffs });
      postProgress('    ' + varName + ': ' + (dir != null ? dir : 'NA') + ' ' +
        (cutoff != null ? cutoff.toFixed(4) : 'NA') + ', p=' + (pval != null ? pval.toFixed(6) : 'NA'));
    }

    // Evaluate univariate results
    for (var ri = 0; ri < univResult.length; ri++) {
      var rule = univResult[ri];
      if (rule.direction && rule.threshold !== null) {
        var predClass = analysisData.map(function(row) {
          var val = row[rule.variable];
          if (val === null || val === undefined) return false;
          return rule.direction === '>' ? val > rule.threshold : val < rule.threshold;
        });
        var nSigPos = predClass.filter(Boolean).length;
        var nSigNeg = analysisData.length - nSigPos;
        var sigpPrcnt = nSigPos / analysisData.length;
        rule.sigpPrcnt = sigpPrcnt;
        rule.nSigPos = nSigPos;
        rule.nSigNeg = nSigNeg;

        try {
          rule.evaluation = SB.Evaluation.evaluateIteration(analysisData, predClass, roles.yvar, censorvar, trtvar, roles.type);
        } catch (e) {
          rule.evaluation = null;
        }

        try {
          if (isPredictive) {
            rule.groupStats = SB.Evaluation.findPredStats(analysisData, predClass, roles.yvar, censorvar, trtvar, roles.type);
          } else {
            rule.groupStats = SB.Evaluation.findProgStats(analysisData, predClass, roles.yvar, censorvar, roles.type);
          }
        } catch (e) {
          rule.groupStats = null;
        }

        if (dataTest) {
          var testPredClass = dataTest.map(function(row) {
            var val = row[rule.variable];
            if (val === null || val === undefined) return false;
            return rule.direction === '>' ? val > rule.threshold : val < rule.threshold;
          });
          try {
            rule.testEvaluation = SB.Evaluation.evaluateIteration(dataTest, testPredClass, roles.yvar, censorvar, trtvar, roles.type);
          } catch (e) {
            rule.testEvaluation = null;
          }
          try {
            if (isPredictive) {
              rule.testGroupStats = SB.Evaluation.findPredStats(dataTest, testPredClass, roles.yvar, censorvar, trtvar, roles.type);
            } else {
              rule.testGroupStats = SB.Evaluation.findProgStats(dataTest, testPredClass, roles.yvar, censorvar, roles.type);
            }
          } catch (e) {
            rule.testGroupStats = null;
          }
        }
      }
    }

    // Univariate Cross-Validation
    if (config.enableCV) {
      postProgress('');
      postProgress('--- Univariate Cross-Validation ---');
      for (var ci = 0; ci < univResult.length; ci++) {
        var cvXvar = univResult[ci].variable;
        postProgress('  CV: ' + cvXvar + '...');
        try {
          univResult[ci].cvRes = SB.CV.kfoldCV({
            data: analysisData,
            yvar: roles.yvar, censorvar: censorvar, trtvar: trtvar,
            type: roles.type, xvars: [cvXvar],
            nBoot: config.nBoot, desRes: config.desRes, minSigpPrcnt: config.minSigpPrcnt,
            kFold: config.kFold, cvIter: config.cvIter, maxIter: config.maxIter,
            randomSeed: config.randomSeed,
            onProgress: postProgress,
          });
          if (univResult[ci].cvRes) {
            postProgress('    CV done: ' + univResult[ci].cvRes.nSuccess + '/' + univResult[ci].cvRes.nTotal + ' successful');
          } else {
            postProgress('    CV: no successful iterations');
          }
        } catch (e) {
          postProgress('    CV error: ' + e.message);
          univResult[ci].cvRes = null;
        }
      }
    }

    var univElapsed = ((Date.now() - univStart) / 1000).toFixed(1);
    postProgress('Univariate complete (' + univElapsed + 's)');
    postProgress('');
  }

  // Multivariate Sequential BATTing
  if (config.analysisScope === 'multivariate' || config.analysisScope === 'both') {
    postProgress('--- Multivariate Sequential BATTing ---');
    var multiStart = Date.now();

    var rng = SB.Utils.mulberry32(config.randomSeed);
    var rules = SB.SeqBatting.seqlrBatting({
      data: analysisData,
      yvar: roles.yvar,
      censorvar: censorvar,
      trtvar: trtvar,
      type: roles.type,
      xvars: roles.xvars,
      nBoot: config.nBoot,
      desRes: config.desRes,
      minSigpPrcnt: config.minSigpPrcnt,
      rng: rng,
      onProgress: postProgress,
    });

    if (rules) {
      postProgress('\nSignature found: ' + SB.Prediction.formatRules(rules));

      var predClass = SB.Prediction.predSeqlr(analysisData, rules);
      var sigpPrcnt = predClass.filter(Boolean).length / analysisData.length;

      var trainEval = null, trainStats = null;
      try {
        trainEval = SB.Evaluation.evaluateIteration(analysisData, predClass, roles.yvar, censorvar, trtvar, roles.type);
      } catch (e) { /* skip */ }

      try {
        if (isPredictive) {
          trainStats = SB.Evaluation.findPredStats(analysisData, predClass, roles.yvar, censorvar, trtvar, roles.type);
        } else {
          trainStats = SB.Evaluation.findProgStats(analysisData, predClass, roles.yvar, censorvar, roles.type);
        }
      } catch (e) { /* skip */ }

      var testEval = null, testStats = null;
      if (dataTest) {
        var testPred = SB.Prediction.predSeqlr(dataTest, rules);
        try {
          testEval = SB.Evaluation.evaluateIteration(dataTest, testPred, roles.yvar, censorvar, trtvar, roles.type);
        } catch (e) { /* skip */ }
        try {
          if (isPredictive) {
            testStats = SB.Evaluation.findPredStats(dataTest, testPred, roles.yvar, censorvar, trtvar, roles.type);
          } else {
            testStats = SB.Evaluation.findProgStats(dataTest, testPred, roles.yvar, censorvar, roles.type);
          }
        } catch (e) { /* skip */ }
      }

      multiResult = {
        rules: rules,
        sigpPrcnt: sigpPrcnt,
        trainEvaluation: trainEval,
        trainGroupStats: trainStats,
        testEvaluation: testEval,
        testGroupStats: testStats,
      };
    } else {
      postProgress('No significant multivariate signature found.');
      multiResult = { rules: null, sigpPrcnt: null };
    }

    // Multivariate Cross-Validation
    if (config.enableCV) {
      postProgress('\n--- Multivariate Cross-Validation ---');
      try {
        var cvRes = SB.CV.kfoldCV({
          data: analysisData,
          yvar: roles.yvar, censorvar: censorvar, trtvar: trtvar,
          type: roles.type, xvars: roles.xvars,
          nBoot: config.nBoot, desRes: config.desRes, minSigpPrcnt: config.minSigpPrcnt,
          kFold: config.kFold, cvIter: config.cvIter, maxIter: config.maxIter,
          randomSeed: config.randomSeed,
          onProgress: postProgress,
        });
        if (cvRes) {
          postProgress('CV done: ' + cvRes.nSuccess + '/' + cvRes.nTotal + ' successful iterations');
          multiResult.cvRes = cvRes;
        } else {
          postProgress('CV: no successful iterations');
          multiResult.cvRes = null;
        }
      } catch (e) {
        postProgress('CV error: ' + e.message);
        multiResult.cvRes = null;
      }
    }

    var multiElapsed = ((Date.now() - multiStart) / 1000).toFixed(1);
    postProgress('\nMultivariate complete (' + multiElapsed + 's)');
  }

  var totalElapsed = ((Date.now() - startTime) / 1000).toFixed(1);
  postProgress('\n=== Analysis complete (' + totalElapsed + 's) ===');

  self.postMessage({
    type: 'result',
    payload: {
      univariate: univResult,
      multivariate: multiResult,
      timing: {
        totalSeconds: parseFloat(totalElapsed),
        startTime: new Date(startTime).toISOString(),
      },
    },
  });
}
