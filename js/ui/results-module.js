/**
 * results-module.js — Results display (univariate, multivariate, cross-validation)
 *
 * Depends on: window.App, Bootstrap, DataTables, Plotly.js
 */

(function() {
  'use strict';

  // ============================================================
  // Display-name mappings for p-value keys
  // ============================================================

  var PVAL_LABELS = {
    trtDiffPosGp: 'Trt Diff Pos Gp',
    trtDiffNegGp: 'Trt Diff Neg Gp',
    gpDiffTrtArm: 'Gp Diff Trt Arm',
    gpDiffCtrlArm: 'Gp Diff Ctrl Arm',
    interaction: 'Interaction',
    trtPosCtrlNeg: 'Trt Pos Gp by Ctrl Neg Gp',
    pval: 'Subgroup Effect',
  };

  var GROUP_LABELS = {
    sigPosTrt: 'Sig+ Trt', sigPosCtrl: 'Sig+ Ctrl',
    sigNegTrt: 'Sig- Trt', sigNegCtrl: 'Sig- Ctrl',
    sigPos: 'Sig+', sigNeg: 'Sig-',
  };

  // Store results globally for dynamic rendering
  var cachedResults = null;
  var cachedIsPredictive = false;
  var cachedRoles = null;

  // ============================================================
  // Main render entry
  // ============================================================

  function render() {
    var root = document.getElementById('results-module');
    if (!root) return;

    var results = App.state.results;
    if (!results || !results.success) {
      root.innerHTML = '<div class="placeholder-content"><i class="bi bi-bar-chart-line"></i><h5>No Results</h5><p class="text-muted">Run the analysis first.</p></div>';
      return;
    }

    var roles = App.state.roles;
    var isPredictive = roles && roles.trtvar !== null && roles.trtvar !== undefined;
    var hasUni = results.univariate !== null;
    var hasMulti = results.multivariate !== null;

    cachedResults = results;
    cachedIsPredictive = isPredictive;
    cachedRoles = roles;

    var html = '<div class="row mb-3"><div class="col-12"><div class="curation-step-complete"><i class="bi bi-check-circle me-1"></i>Analysis completed in ' + (results.timing ? results.timing.totalSeconds : '?') + 's' +
      (results.timing && results.timing.startTime ? ' (' + new Date(results.timing.startTime).toLocaleString() + ')' : '') + '</div></div></div>' +
      '<ul class="nav nav-tabs" id="resultsTabs" role="tablist">';

    if (hasUni) html += '<li class="nav-item"><button class="nav-link active" id="uni-tab" data-bs-toggle="tab" data-bs-target="#uniPanel" type="button">Univariate</button></li>';
    if (hasMulti) html += '<li class="nav-item"><button class="nav-link ' + (!hasUni ? 'active' : '') + '" id="multi-tab" data-bs-toggle="tab" data-bs-target="#multiPanel" type="button">Multivariate</button></li>';
    html += '</ul><div class="tab-content mt-3">';

    if (hasUni) html += '<div class="tab-pane fade show active" id="uniPanel">' + renderUnivariateSection(results.univariate, isPredictive, roles) + '</div>';
    if (hasMulti) html += '<div class="tab-pane fade ' + (!hasUni ? 'show active' : '') + '" id="multiPanel">' + renderMultivariateSection(results.multivariate, isPredictive, roles) + '</div>';
    html += '</div>';

    root.innerHTML = html;
    setTimeout(function() {
      initDataTables();
      initInteractionPlots(results, isPredictive, roles);
      wireTabPlotResize();
    }, 150);
  }

  // ============================================================
  // Univariate Section (with inner tabs)
  // ============================================================

  function renderUnivariateSection(univResults, isPredictive, roles) {
    if (!univResults || univResults.length === 0) return '<p class="text-muted">No univariate results.</p>';

    var hasCV = univResults.some(function(r) { return r.cvRes; });
    var hasTest = univResults.some(function(r) { return r.testEvaluation; });

    var html = '<ul class="nav nav-pills nav-fill mb-3" id="uniInnerTabs" role="tablist">' +
      '<li class="nav-item"><button class="nav-link active" data-bs-toggle="pill" data-bs-target="#uniSig" type="button">Signature Rules</button></li>' +
      '<li class="nav-item"><button class="nav-link" data-bs-toggle="pill" data-bs-target="#uniTrain" type="button">Training</button></li>';
    if (hasTest) html += '<li class="nav-item"><button class="nav-link" data-bs-toggle="pill" data-bs-target="#uniTest" type="button">Test Results</button></li>';
    if (hasCV) html += '<li class="nav-item"><button class="nav-link" data-bs-toggle="pill" data-bs-target="#uniCV" type="button">Cross-Validation</button></li>';
    html += '</ul><div class="tab-content">';

    // Signature Rules sub-tab
    html += '<div class="tab-pane fade show active" id="uniSig">' + renderUnivariateResults(univResults, isPredictive) + '</div>';

    // Training sub-tab (per-biomarker navigator)
    html += '<div class="tab-pane fade" id="uniTrain">' + renderUnivariateTraining(univResults, isPredictive, roles) + '</div>';

    // Test Results sub-tab
    if (hasTest) html += '<div class="tab-pane fade" id="uniTest">' + renderUnivariateTest(univResults, isPredictive, roles) + '</div>';

    // CV sub-tab
    if (hasCV) html += '<div class="tab-pane fade" id="uniCV">' + renderUnivariateCV(univResults, isPredictive, roles) + '</div>';

    html += '</div>';
    return html;
  }

  function renderUnivariateResults(univResults, isPredictive) {
    var sorted = univResults.slice().sort(function(a, b) { return (a.pvalue != null ? a.pvalue : 1) - (b.pvalue != null ? b.pvalue : 1); });

    var html = '<div class="card"><div class="card-header fw-semibold"><i class="bi bi-list-ol me-1"></i>Univariate BATTing Results</div><div class="card-body">' +
      '<p class="text-muted small mb-2">Each row is an independent single-biomarker BATTing rule. Threshold is the bootstrap median cutoff; p-value is from the interaction (predictive) or subgroup effect (prognostic) test.</p>' +
      '<table class="table table-sm table-striped compact" id="uniTable" style="width:100%"><thead><tr><th>#</th><th>Variable</th><th>Signature</th><th>P-value</th><th>N(sig+)</th><th>N(sig-)</th><th>Sig+ %</th>';
    if (isPredictive) html += '<th>Interaction P</th>';
    html += '</tr></thead><tbody>';

    sorted.forEach(function(r, i) {
      var pval = fmtPval(r.pvalue);
      var sigText = App.interpretRule(r.variable, r.direction, r.threshold);
      var sigp = r.sigpPrcnt !== null && r.sigpPrcnt !== undefined ? (r.sigpPrcnt * 100).toFixed(1) + '%' : 'NA';
      var nSigPos = r.nSigPos != null ? r.nSigPos : 'NA';
      var nSigNeg = r.nSigNeg != null ? r.nSigNeg : 'NA';
      var pClass = r.pvalue !== null && r.pvalue <= 0.05 ? 'text-success fw-bold' : '';
      var interP = isPredictive && r.evaluation && r.evaluation.pvals && r.evaluation.pvals.interaction != null
        ? fmtPval(r.evaluation.pvals.interaction) : 'NA';

      html += '<tr><td>' + (i + 1) + '</td><td><strong>' + r.variable + '</strong></td><td>' + sigText + '</td><td class="' + pClass + '">' + pval + '</td><td>' + nSigPos + '</td><td>' + nSigNeg + '</td><td>' + sigp + '</td>';
      if (isPredictive) html += '<td>' + interP + '</td>';
      html += '</tr>';
    });

    html += '</tbody></table></div></div>';
    return html;
  }

  function renderUnivariateTraining(univResults, isPredictive, roles) {
    var sorted = univResults.slice().sort(function(a, b) { return (a.pvalue != null ? a.pvalue : 1) - (b.pvalue != null ? b.pvalue : 1); });
    if (sorted.length === 0) return '<p class="text-muted">No training evaluation available.</p>';

    // Biomarker selector
    var html = '<div class="card mb-3"><div class="card-body">' +
      '<div class="mb-2"><label class="form-label fw-semibold">Select Biomarker:</label>' +
      '<select class="form-select" id="uniTrainBiomarkerSelect">';
    sorted.forEach(function(r, idx) {
      html += '<option value="' + r.variable + '"' + (idx === 0 ? ' selected' : '') + '>' + r.variable + ' (p=' + fmtPval(r.pvalue) + ')</option>';
    });
    html += '</select></div></div></div>';

    // Detail panel filled dynamically
    html += '<div id="uniTrainDetail"></div>';
    return html;
  }

  function renderUniTrainDetail(item, isPredictive, roles) {
    var el = document.getElementById('uniTrainDetail');
    if (!el) return;
    if (!item || (!item.evaluation && !item.groupStats)) {
      el.innerHTML = '<p class="text-muted">No training data for this biomarker.</p>';
      return;
    }

    var type = roles ? roles.type : 'c';
    var sigText = App.interpretRule(item.variable, item.direction, item.threshold);
    var html = '<div class="row mb-3"><div class="col-12"><h6>Training: <strong>' + sigText + '</strong></h6></div></div>';

    // Interaction plot
    if (isPredictive && item.groupStats) {
      html += '<div class="card mb-3"><div class="card-header fw-semibold"><i class="bi bi-graph-up me-1"></i>Interaction Plot (Training)</div><div class="card-body"><div id="uniTrainInterPlot" style="width:100%;height:400px;"></div></div></div>';
    }

    // Bootstrap cutoff distribution histogram
    if (item.bootCutoffs && item.bootCutoffs.length > 0) {
      html += '<div class="card mb-3"><div class="card-header fw-semibold"><i class="bi bi-bar-chart me-1"></i>Bootstrap Cutoff Distribution</div><div class="card-body"><div id="uniTrainHistPlot" style="width:100%;height:300px;"></div></div></div>';
    }

    // P-values
    if (item.evaluation) html += renderEvaluationPvals(item.evaluation, isPredictive, 'Training', 'uniTrainPvalsTable');

    // Group stats
    if (item.groupStats) html += renderGroupStats(item.groupStats, isPredictive, roles, 'Training Set', 'uniTrainGroupTable');

    el.innerHTML = html;

    // Render plots and DataTables after DOM is ready
    setTimeout(function() {
      if (isPredictive && item.groupStats) {
        plotInteraction('uniTrainInterPlot', item.groupStats, type);
      }
      if (item.bootCutoffs && item.bootCutoffs.length > 0) {
        plotHistogram('uniTrainHistPlot', item.bootCutoffs, item.threshold, item.variable);
      }
      initDynamicDataTable('#uniTrainPvalsTable');
      initDynamicDataTable('#uniTrainGroupTable');
    }, 50);
  }

  function renderUnivariateTest(univResults, isPredictive, roles) {
    var withTest = univResults.filter(function(r) { return r.testEvaluation; });
    if (withTest.length === 0) return '<p class="text-muted">No test set evaluation available.</p>';

    var sorted = withTest.slice().sort(function(a, b) { return (a.pvalue != null ? a.pvalue : 1) - (b.pvalue != null ? b.pvalue : 1); });

    // Biomarker selector
    var html = '<div class="card mb-3"><div class="card-body">' +
      '<div class="mb-2"><label class="form-label fw-semibold">Select Biomarker:</label>' +
      '<select class="form-select" id="uniTestBiomarkerSelect">';
    sorted.forEach(function(r, idx) {
      html += '<option value="' + r.variable + '"' + (idx === 0 ? ' selected' : '') + '>' + r.variable + ' (p=' + fmtPval(r.pvalue) + ')</option>';
    });
    html += '</select></div></div></div>';

    // Detail panel filled dynamically
    html += '<div id="uniTestDetail"></div>';
    return html;
  }

  function renderUniTestDetail(item, isPredictive, roles) {
    var el = document.getElementById('uniTestDetail');
    if (!el) return;
    if (!item || !item.testEvaluation) {
      el.innerHTML = '<p class="text-muted">No test data for this biomarker.</p>';
      return;
    }

    var type = roles ? roles.type : 'c';
    var sigTestText = App.interpretRule(item.variable, item.direction, item.threshold);
    var html = '<div class="row mb-3"><div class="col-12"><h6>Test: <strong>' + sigTestText + '</strong></h6></div></div>';

    // Interaction plot (test)
    if (isPredictive && item.testGroupStats) {
      html += '<div class="card mb-3"><div class="card-header fw-semibold"><i class="bi bi-graph-up me-1"></i>Interaction Plot (Test)</div><div class="card-body"><div id="uniTestInterPlot" style="width:100%;height:400px;"></div></div></div>';
    }

    // P-values
    html += renderEvaluationPvals(item.testEvaluation, isPredictive, 'Test', 'uniTestPvalsTable');

    // Group stats
    if (item.testGroupStats) html += renderGroupStats(item.testGroupStats, isPredictive, roles, 'Test Set', 'uniTestGroupTable');

    el.innerHTML = html;

    setTimeout(function() {
      if (isPredictive && item.testGroupStats) {
        plotInteraction('uniTestInterPlot', item.testGroupStats, type);
      }
      initDynamicDataTable('#uniTestPvalsTable');
      initDynamicDataTable('#uniTestGroupTable');
    }, 50);
  }

  function renderUnivariateCV(univResults, isPredictive, roles) {
    var withCV = univResults.filter(function(r) { return r.cvRes; });
    if (withCV.length === 0) return '<p class="text-muted">No cross-validation results.</p>';

    // CV Summary table (all biomarkers)
    var html = '<div class="card mb-3"><div class="card-header fw-semibold"><i class="bi bi-arrow-repeat me-1"></i>CV Summary (All Biomarkers)</div><div class="card-body">' +
      '<table class="table table-sm table-striped compact" id="uniCVSummary" style="width:100%"><thead><tr><th>Variable</th><th>Median P-value</th><th>MAD</th><th>Iterations</th></tr></thead><tbody>';

    var cvRows = withCV.map(function(r) {
      var cvPval = null, cvMAD = null;
      if (r.cvRes && r.cvRes.summary && r.cvRes.summary.pvals) {
        cvPval = isPredictive ? r.cvRes.summary.pvals.interaction : r.cvRes.summary.pvals.pval;
        cvMAD = isPredictive ? r.cvRes.summary.pvals.mad_interaction : r.cvRes.summary.pvals.mad_pval;
      }
      return { variable: r.variable, pval: cvPval, mad: cvMAD, nSuccess: r.cvRes.nSuccess, nTotal: r.cvRes.nTotal };
    }).sort(function(a, b) { return (a.pval != null ? a.pval : 1) - (b.pval != null ? b.pval : 1); });

    cvRows.forEach(function(row) {
      html += '<tr><td><strong>' + row.variable + '</strong></td><td>' + fmtSig(row.pval) + '</td><td>' + fmtSig(row.mad) + '</td><td>' + row.nSuccess + ' / ' + row.nTotal + '</td></tr>';
    });

    html += '</tbody></table></div></div>';

    // Per-biomarker detail: value boxes + interaction plot
    html += '<div class="card mb-3"><div class="card-header fw-semibold"><i class="bi bi-search me-1"></i>Per-Biomarker CV Detail</div><div class="card-body">' +
      '<div class="mb-3"><label class="form-label fw-semibold">Select Biomarker:</label>' +
      '<select class="form-select" id="uniCVBiomarkerSelect">';
    cvRows.forEach(function(row, idx) {
      html += '<option value="' + row.variable + '"' + (idx === 0 ? ' selected' : '') + '>' + row.variable + ' (p=' + fmtSig(row.pval) + ')</option>';
    });
    html += '</select></div>';

    // Detail panel — filled dynamically by JS
    html += '<div id="uniCVDetail"></div>';
    html += '</div></div>';

    return html;
  }

  // ============================================================
  // Multivariate Section (with inner tabs)
  // ============================================================

  function renderMultivariateSection(multiResult, isPredictive, roles) {
    if (!multiResult) return '<p class="text-muted">No multivariate results.</p>';

    var hasRules = multiResult.rules && multiResult.rules.length > 0;
    var hasTest = multiResult.testEvaluation != null || multiResult.testGroupStats != null;
    var hasCV = multiResult.cvRes != null;

    var html = '<ul class="nav nav-pills nav-fill mb-3" id="multiInnerTabs" role="tablist">' +
      '<li class="nav-item"><button class="nav-link active" data-bs-toggle="pill" data-bs-target="#multiSig" type="button">Signature</button></li>';
    if (hasRules) html += '<li class="nav-item"><button class="nav-link" data-bs-toggle="pill" data-bs-target="#multiTrain" type="button">Training</button></li>';
    if (hasTest) html += '<li class="nav-item"><button class="nav-link" data-bs-toggle="pill" data-bs-target="#multiTest" type="button">Test Results</button></li>';
    if (hasCV) html += '<li class="nav-item"><button class="nav-link" data-bs-toggle="pill" data-bs-target="#multiCV" type="button">Cross-Validation</button></li>';
    html += '</ul><div class="tab-content">';

    // Signature sub-tab
    html += '<div class="tab-pane fade show active" id="multiSig">' + renderMultivariateSignature(multiResult, isPredictive) + '</div>';

    // Training sub-tab
    if (hasRules) html += '<div class="tab-pane fade" id="multiTrain">' + renderMultivariateTraining(multiResult, isPredictive, roles) + '</div>';

    // Test Results sub-tab (separate from training)
    if (hasTest) html += '<div class="tab-pane fade" id="multiTest">' + renderMultivariateTest(multiResult, isPredictive, roles) + '</div>';

    // CV sub-tab
    if (hasCV) html += '<div class="tab-pane fade" id="multiCV">' + renderMultivariateCV(multiResult.cvRes, isPredictive, roles) + '</div>';

    html += '</div>';
    return html;
  }

  function renderMultivariateSignature(multiResult, isPredictive) {
    if (!multiResult.rules) return '<p class="text-muted">No significant multivariate signature found.</p>';

    var rules = multiResult.rules;
    var sigpPrcnt = multiResult.sigpPrcnt;
    var nTotal = 0;
    if (cachedResults && cachedResults.univariate && cachedResults.univariate.length > 0) {
      nTotal = (cachedResults.univariate[0].nSigPos || 0) + (cachedResults.univariate[0].nSigNeg || 0);
    }
    var nSigPos = sigpPrcnt != null && nTotal > 0 ? Math.round(sigpPrcnt * nTotal) : 'NA';
    var nSigNeg = sigpPrcnt != null && nTotal > 0 ? nTotal - nSigPos : 'NA';

    var html = '<div class="row"><div class="col-lg-7">';

    // Rules table card
    html += '<div class="card mb-3"><div class="card-header fw-semibold"><i class="bi bi-diagram-3 me-1"></i>Sequential BATTing Signature <span class="badge text-bg-success ms-2">' + rules.length + ' rule' + (rules.length > 1 ? 's' : '') + '</span></div><div class="card-body">' +
      '<div class="row value-box-row g-2 mb-3">' +
        '<div class="col-md-4"><div class="value-box value-box-info"><div class="vb-icon"><i class="bi bi-layers"></i></div><div class="vb-content"><div class="vb-title">Sequential Rules</div><div class="vb-value">' + rules.length + '</div></div></div></div>' +
        '<div class="col-md-4"><div class="value-box value-box-success"><div class="vb-icon"><i class="bi bi-check-circle"></i></div><div class="vb-content"><div class="vb-title">N(sig+)</div><div class="vb-value">' + nSigPos + '</div></div></div></div>' +
        '<div class="col-md-4"><div class="value-box value-box-secondary"><div class="vb-icon"><i class="bi bi-dash-circle"></i></div><div class="vb-content"><div class="vb-title">N(sig-)</div><div class="vb-value">' + nSigNeg + '</div></div></div></div>' +
      '</div>' +
      '<table class="table table-sm table-striped compact" id="multiRulesTable"><caption class="caption-top text-muted small">Sequential BATTing signature: a subject is sig+ if ALL rules are satisfied (AND-conjunction).</caption><thead><tr><th>Step</th><th>Variable</th><th>Signature</th><th>LogLik</th></tr></thead><tbody>';

    rules.forEach(function(r, i) {
      var multiSig = App.interpretRule(r.variable, r.direction, r.threshold);
      html += '<tr><td>' + (i + 1) + '</td><td><strong>' + r.variable + '</strong></td><td>' + multiSig + '</td><td>' + (r.logLik !== null ? r.logLik.toFixed(4) : 'NA') + '</td></tr>';
    });

    html += '</tbody></table></div></div>';
    html += '</div>';

    // Aggregate P-values card (right column)
    html += '<div class="col-lg-5">';
    if (multiResult.trainEvaluation) {
      html += renderEvaluationPvals(multiResult.trainEvaluation, isPredictive, 'Aggregate', 'multiSigPvalsTable');
    }
    html += '</div></div>';

    return html;
  }

  function renderMultivariateTraining(multiResult, isPredictive, roles) {
    var html = '';
    if (isPredictive && multiResult.trainGroupStats) {
      html += '<div class="card mb-3"><div class="card-header fw-semibold"><i class="bi bi-graph-up me-1"></i>Interaction Plot (Training)</div><div class="card-body"><div id="multiTrainInterPlot" style="width:100%;height:400px;"></div></div></div>';
    }
    if (multiResult.trainGroupStats) html += renderGroupStats(multiResult.trainGroupStats, isPredictive, roles, 'Training Set', 'multiTrainGroupTable');
    if (multiResult.trainEvaluation) html += renderEvaluationPvals(multiResult.trainEvaluation, isPredictive, 'Training', 'multiTrainPvalsTable');
    if (!html) html = '<p class="text-muted">No training evaluation available.</p>';
    return html;
  }

  function renderMultivariateTest(multiResult, isPredictive, roles) {
    var html = '';
    if (isPredictive && multiResult.testGroupStats) {
      html += '<div class="card mb-3"><div class="card-header fw-semibold"><i class="bi bi-graph-up me-1"></i>Interaction Plot (Test)</div><div class="card-body"><div id="multiTestInterPlot" style="width:100%;height:400px;"></div></div></div>';
    }
    if (multiResult.testGroupStats) html += renderGroupStats(multiResult.testGroupStats, isPredictive, roles, 'Test Set', 'multiTestGroupTable');
    if (multiResult.testEvaluation) html += renderEvaluationPvals(multiResult.testEvaluation, isPredictive, 'Test', 'multiTestPvalsTable');
    if (!html) html = '<p class="text-muted">No test evaluation available.</p>';
    return html;
  }

  function renderMultivariateCV(cvRes, isPredictive, roles) {
    if (!cvRes || !cvRes.summary) return '<p class="text-muted">No cross-validation results.</p>';

    var type = roles ? roles.type : 'c';
    var summary = cvRes.summary;
    var html = '';

    // Value boxes row
    var keyPval = isPredictive ? summary.pvals.interaction : summary.pvals.pval;
    var keyMAD = isPredictive ? summary.pvals.mad_interaction : summary.pvals.mad_pval;
    html += '<div class="row value-box-row g-2 mb-3">' +
      '<div class="col-md-4"><div class="value-box value-box-info"><div class="vb-icon"><i class="bi bi-clipboard-data"></i></div><div class="vb-content"><div class="vb-title">Median CV P-value</div><div class="vb-value">' + fmtSig(keyPval) + '</div></div></div></div>' +
      '<div class="col-md-4"><div class="value-box value-box-secondary"><div class="vb-icon"><i class="bi bi-distribute-vertical"></i></div><div class="vb-content"><div class="vb-title">MAD</div><div class="vb-value">' + fmtSig(keyMAD) + '</div></div></div></div>' +
      '<div class="col-md-4"><div class="value-box value-box-primary"><div class="vb-icon"><i class="bi bi-check-circle"></i></div><div class="vb-content"><div class="vb-title">Successful Iterations</div><div class="vb-value">' + cvRes.nSuccess + ' / ' + cvRes.nTotal + '</div></div></div></div>' +
    '</div>';

    // CV P-values table (Median & MAD)
    html += '<div class="card mb-3"><div class="card-header fw-semibold"><i class="bi bi-calculator me-1"></i>Cross-Validation P-values (Median & MAD)</div><div class="card-body">' +
      '<table class="table table-sm table-striped compact" id="multiCVPvalsTable"><thead><tr><th>Test</th><th>Median P-value</th><th>MAD</th></tr></thead><tbody>';

    var pvals = summary.pvals;
    var pkeys = Object.keys(pvals).filter(function(k) { return k.indexOf('mad_') !== 0; });
    pkeys.forEach(function(key) {
      var label = PVAL_LABELS[key] || key;
      var pStr = fmtSig(pvals[key]);
      var madStr = fmtSig(pvals['mad_' + key]);
      var cls = pvals[key] !== null && pvals[key] !== undefined && pvals[key] <= 0.05 ? 'text-success fw-bold' : '';
      html += '<tr><td>' + label + '</td><td class="' + cls + '">' + pStr + '</td><td>' + madStr + '</td></tr>';
    });

    // Ratios if available
    if (summary.ratios) {
      var rkeys = Object.keys(summary.ratios).filter(function(k) { return k.indexOf('mad_') !== 0; });
      rkeys.forEach(function(key) {
        var label = key.replace('hr', 'HR ').replace('or', 'OR ').replace('PosGp', 'Sig+').replace('NegGp', 'Sig-');
        html += '<tr><td>' + label + '</td><td>' + fmtNum(summary.ratios[key]) + '</td><td>' + fmtNum(summary.ratios['mad_' + key]) + '</td></tr>';
      });
    }

    html += '</tbody></table></div></div>';

    // CV Group Statistics
    if (summary.groupStats) {
      html += renderCVGroupStats(summary.groupStats, isPredictive, type);
    }

    // CV Interaction Plot placeholder (predictive only)
    if (isPredictive && summary.groupStats) {
      html += '<div class="card mb-3"><div class="card-header fw-semibold"><i class="bi bi-graph-up me-1"></i>CV Interaction Plot</div><div class="card-body"><div id="multiCVInterPlot" style="width:100%;height:400px;"></div></div></div>';
    }

    return html;
  }

  function renderCVGroupStats(groupStats, isPredictive, type) {
    if (!groupStats) return '';

    var html = '<div class="card mb-3"><div class="card-header fw-semibold"><i class="bi bi-people me-1"></i>Cross-Validation Group Statistics</div><div class="card-body"><table class="table table-sm table-striped compact" id="multiCVGroupTable">';

    // Build header based on type
    var statCols = [];
    if (type === 'c') statCols = [['n','N'], ['mean','Mean'], ['sd','SD'], ['median','Median']];
    else if (type === 's') statCols = [['n','N'], ['rmean','RMST'], ['seRmean','SE'], ['medianSurv','Median Surv']];
    else statCols = [['n','N'], ['respRate','Resp Rate']];

    html += '<thead><tr><th>Subgroup</th>';
    statCols.forEach(function(sc) { html += '<th>' + sc[1] + '</th><th>MAD</th>'; });
    html += '</tr></thead><tbody>';

    var gKeys = isPredictive
      ? ['sigPosTrt', 'sigPosCtrl', 'sigNegTrt', 'sigNegCtrl']
      : ['sigPos', 'sigNeg'];

    gKeys.forEach(function(gk) {
      var g = groupStats[gk];
      if (!g) return;
      var label = GROUP_LABELS[gk] || gk;
      html += '<tr><td><strong>' + label + '</strong></td>';
      statCols.forEach(function(sc) {
        var key = sc[0];
        html += '<td>' + fmtNum(g[key]) + '</td><td>' + fmtNum(g['mad_' + key]) + '</td>';
      });
      html += '</tr>';
    });

    html += '</tbody></table></div></div>';
    return html;
  }

  // ============================================================
  // Shared rendering helpers
  // ============================================================

  function renderGroupStats(stats, isPredictive, roles, label, tableId) {
    var type = roles ? roles.type : 'c';
    var idAttr = tableId ? ' id="' + tableId + '"' : '';
    var html = '<div class="card mb-3"><div class="card-header fw-semibold"><i class="bi bi-people me-1"></i>Group Statistics (' + label + ')</div><div class="card-body"><table class="table table-sm table-striped compact"' + idAttr + '>';

    var keys = Object.keys(stats);

    if (isPredictive) {
      if (type === 'c') {
        html += '<thead><tr><th>Group</th><th>N</th><th>Mean</th><th>SD</th><th>Median</th></tr></thead><tbody>';
        keys.forEach(function(key) { var s = stats[key]; var lbl = GROUP_LABELS[key] || key;
          html += '<tr><td>' + lbl + '</td><td>' + s.n + '</td><td>' + fmtNum(s.mean) + '</td><td>' + fmtNum(s.sd) + '</td><td>' + fmtNum(s.median) + '</td></tr>'; });
      } else if (type === 's') {
        html += '<thead><tr><th>Group</th><th>N</th><th>RMST</th><th>SE</th><th>Median</th></tr></thead><tbody>';
        keys.forEach(function(key) { var s = stats[key]; var lbl = GROUP_LABELS[key] || key;
          html += '<tr><td>' + lbl + '</td><td>' + s.n + '</td><td>' + fmtNum(s.rmean) + '</td><td>' + fmtNum(s.seRmean) + '</td><td>' + fmtNum(s.medianSurv) + '</td></tr>'; });
      } else {
        html += '<thead><tr><th>Group</th><th>N</th><th>Resp Rate</th></tr></thead><tbody>';
        keys.forEach(function(key) { var s = stats[key]; var lbl = GROUP_LABELS[key] || key;
          html += '<tr><td>' + lbl + '</td><td>' + s.n + '</td><td>' + (s.respRate != null ? (s.respRate * 100).toFixed(1) + '%' : 'NA') + '</td></tr>'; });
      }
    } else {
      if (type === 'c') html += '<thead><tr><th>Group</th><th>N</th><th>Mean</th><th>SD</th><th>Median</th></tr></thead><tbody>';
      else if (type === 's') html += '<thead><tr><th>Group</th><th>N</th><th>RMST</th><th>SE</th><th>Median</th></tr></thead><tbody>';
      else html += '<thead><tr><th>Group</th><th>N</th><th>Resp Rate</th></tr></thead><tbody>';

      keys.forEach(function(key) {
        var s = stats[key];
        var lbl = GROUP_LABELS[key] || key;
        if (type === 'c') html += '<tr><td>' + lbl + '</td><td>' + s.n + '</td><td>' + fmtNum(s.mean) + '</td><td>' + fmtNum(s.sd) + '</td><td>' + fmtNum(s.median) + '</td></tr>';
        else if (type === 's') html += '<tr><td>' + lbl + '</td><td>' + s.n + '</td><td>' + fmtNum(s.rmean) + '</td><td>' + fmtNum(s.seRmean) + '</td><td>' + fmtNum(s.medianSurv) + '</td></tr>';
        else html += '<tr><td>' + lbl + '</td><td>' + s.n + '</td><td>' + (s.respRate != null ? (s.respRate * 100).toFixed(1) + '%' : 'NA') + '</td></tr>';
      });
    }

    html += '</tbody></table></div></div>';
    return html;
  }

  function renderEvaluationPvals(evalResult, isPredictive, label, tableId) {
    if (!evalResult || !evalResult.pvals) return '';
    var idAttr = tableId ? ' id="' + tableId + '"' : '';
    var html = '<div class="card mb-3"><div class="card-header fw-semibold"><i class="bi bi-calculator me-1"></i>P-values (' + label + ')</div><div class="card-body"><table class="table table-sm table-striped compact"' + idAttr + '><thead><tr><th>Test</th><th>P-value</th></tr></thead><tbody>';

    var pvals = evalResult.pvals;
    if (isPredictive) {
      var tests = [
        ['Trt effect in Sig+ group', pvals.trtDiffPosGp],
        ['Trt effect in Sig- group', pvals.trtDiffNegGp],
        ['Subgroup diff in Trt arm', pvals.gpDiffTrtArm],
        ['Subgroup diff in Ctrl arm', pvals.gpDiffCtrlArm],
        ['Treatment * Subgroup interaction', pvals.interaction],
        ['Trt+Sig+ vs Ctrl+Sig-', pvals.trtPosCtrlNeg],
      ];
      tests.forEach(function(t) {
        var pStr = fmtPval(t[1]);
        var cls = t[1] !== null && t[1] !== undefined && t[1] <= 0.05 ? 'text-success fw-bold' : '';
        html += '<tr><td>' + t[0] + '</td><td class="' + cls + '">' + pStr + '</td></tr>';
      });
    } else {
      var pStr = fmtPval(pvals.pval);
      var cls = pvals.pval !== null && pvals.pval !== undefined && pvals.pval <= 0.05 ? 'text-success fw-bold' : '';
      html += '<tr><td>Subgroup effect</td><td class="' + cls + '">' + pStr + '</td></tr>';
    }

    var ratios = evalResult.ratios;
    if (ratios) {
      var rkeys = Object.keys(ratios);
      rkeys.forEach(function(key) {
        var val = ratios[key];
        if (val !== null && val !== undefined) {
          var lbl = key.replace('hr', 'HR ').replace('or', 'OR ').replace('PosGp', 'Sig+').replace('NegGp', 'Sig-');
          html += '<tr><td>' + lbl + '</td><td>' + val.toFixed(4) + '</td></tr>';
        }
      });
    }

    html += '</tbody></table></div></div>';
    return html;
  }

  // ============================================================
  // Interaction plot (Plotly.js)
  // ============================================================

  // Pending plots: queue of {containerId, groupStats, type} to render when their tab becomes visible
  var pendingPlots = [];
  var renderedPlots = {};

  function initInteractionPlots(results, isPredictive, roles) {
    var type = roles ? roles.type : 'c';

    pendingPlots = [];
    renderedPlots = {};

    // --- Multivariate training plot ---
    if (isPredictive && results.multivariate && results.multivariate.trainGroupStats) {
      pendingPlots.push({ id: 'multiTrainInterPlot', gs: results.multivariate.trainGroupStats, type: type });
    }

    // Multivariate test plot
    if (isPredictive && results.multivariate && results.multivariate.testGroupStats) {
      pendingPlots.push({ id: 'multiTestInterPlot', gs: results.multivariate.testGroupStats, type: type });
    }

    // Multivariate CV interaction plot
    if (isPredictive && results.multivariate && results.multivariate.cvRes && results.multivariate.cvRes.summary) {
      var gs = results.multivariate.cvRes.summary.groupStats;
      if (gs) pendingPlots.push({ id: 'multiCVInterPlot', gs: gs, type: type });
    }

    // Render any plots whose containers are currently visible
    renderVisiblePlots();

    // --- Univariate Training: set up biomarker selector ---
    var trainSel = document.getElementById('uniTrainBiomarkerSelect');
    if (trainSel && results.univariate) {
      var onChangeTrain = function() {
        var varName = trainSel.value;
        var item = results.univariate.find(function(r) { return r.variable === varName; });
        renderUniTrainDetail(item, isPredictive, roles);
      };
      trainSel.addEventListener('change', onChangeTrain);
      onChangeTrain(); // render first selection
    }

    // --- Univariate Test: set up biomarker selector ---
    var testSel = document.getElementById('uniTestBiomarkerSelect');
    if (testSel && results.univariate) {
      var onChangeTest = function() {
        var varName = testSel.value;
        var item = results.univariate.find(function(r) { return r.variable === varName; });
        renderUniTestDetail(item, isPredictive, roles);
      };
      testSel.addEventListener('change', onChangeTest);
      onChangeTest(); // render first selection
    }

    // --- Univariate CV: set up biomarker selector ---
    var cvSel = document.getElementById('uniCVBiomarkerSelect');
    if (cvSel && results.univariate) {
      var onChangeUniCV = function() {
        var varName = cvSel.value;
        var item = results.univariate.find(function(r) { return r.variable === varName; });
        renderUniCVDetail(item, isPredictive, type);
      };
      cvSel.addEventListener('change', onChangeUniCV);
      onChangeUniCV(); // render first selection
    }
  }

  function renderVisiblePlots() {
    for (var i = 0; i < pendingPlots.length; i++) {
      var p = pendingPlots[i];
      if (renderedPlots[p.id]) continue;
      var el = document.getElementById(p.id);
      if (el && el.offsetWidth > 0) {
        plotInteraction(p.id, p.gs, p.type);
        renderedPlots[p.id] = true;
      }
    }
  }

  function renderUniCVDetail(item, isPredictive, type) {
    var el = document.getElementById('uniCVDetail');
    if (!el) return;
    if (!item || !item.cvRes || !item.cvRes.summary) {
      el.innerHTML = '<p class="text-muted">No CV data for this biomarker.</p>';
      return;
    }

    var cv = item.cvRes;
    var summary = cv.summary;

    var keyPval = isPredictive ? summary.pvals.interaction : summary.pvals.pval;
    var keyMAD = isPredictive ? summary.pvals.mad_interaction : summary.pvals.mad_pval;

    var html = '<div class="row value-box-row g-2 mb-3">' +
      '<div class="col-md-4"><div class="value-box value-box-info"><div class="vb-icon"><i class="bi bi-clipboard-data"></i></div><div class="vb-content"><div class="vb-title">Median CV P-value</div><div class="vb-value">' + fmtSig(keyPval) + '</div></div></div></div>' +
      '<div class="col-md-4"><div class="value-box value-box-secondary"><div class="vb-icon"><i class="bi bi-distribute-vertical"></i></div><div class="vb-content"><div class="vb-title">MAD</div><div class="vb-value">' + fmtSig(keyMAD) + '</div></div></div></div>' +
      '<div class="col-md-4"><div class="value-box value-box-primary"><div class="vb-icon"><i class="bi bi-check-circle"></i></div><div class="vb-content"><div class="vb-title">Successful Iterations</div><div class="vb-value">' + cv.nSuccess + ' / ' + cv.nTotal + '</div></div></div></div>' +
    '</div>';

    if (isPredictive && summary.groupStats) {
      html += '<div id="uniCVInterPlot" style="width:100%;height:350px;"></div>';
    }

    el.innerHTML = html;

    if (isPredictive && summary.groupStats) {
      setTimeout(function() { plotInteraction('uniCVInterPlot', summary.groupStats, type); }, 50);
    }
  }

  function plotInteraction(containerId, gs, type) {
    var el = document.getElementById(containerId);
    if (!el || typeof Plotly === 'undefined') return;

    // Extract values based on type
    var valKey, errFn, yLabel;
    if (type === 's') {
      valKey = 'rmean'; yLabel = 'Restricted Mean Survival Time';
      errFn = function(g) { return g.seRmean || 0; };
    } else if (type === 'b') {
      valKey = 'respRate'; yLabel = 'Response / Event Rate';
      errFn = function(g) { return g.n > 0 ? Math.sqrt(g.respRate * (1 - g.respRate) / g.n) : 0; };
    } else {
      valKey = 'mean'; yLabel = 'Mean';
      errFn = function(g) { return g.n > 1 ? (g.sd || 0) / Math.sqrt(g.n) : 0; };
    }

    var hasTrt = gs.sigPosTrt != null;
    if (!hasTrt) return; // prognostic — no interaction plot

    var trtTrace = {
      x: ['Sig-', 'Sig+'],
      y: [gs.sigNegTrt[valKey], gs.sigPosTrt[valKey]],
      error_y: { type: 'data', array: [errFn(gs.sigNegTrt), errFn(gs.sigPosTrt)], visible: true },
      name: 'Trt', mode: 'lines+markers', type: 'scatter',
      marker: { color: '#0d6efd', size: 8 }, line: { color: '#0d6efd', width: 2 },
    };
    var ctrlTrace = {
      x: ['Sig-', 'Sig+'],
      y: [gs.sigNegCtrl[valKey], gs.sigPosCtrl[valKey]],
      error_y: { type: 'data', array: [errFn(gs.sigNegCtrl), errFn(gs.sigPosCtrl)], visible: true },
      name: 'Ctrl', mode: 'lines+markers', type: 'scatter',
      marker: { color: '#dc3545', size: 8 }, line: { color: '#dc3545', width: 2, dash: 'dash' },
    };

    var layout = {
      yaxis: { title: yLabel },
      xaxis: { title: 'Subgroup' },
      legend: { x: 0.02, y: 0.98 },
      margin: { l: 60, r: 20, t: 30, b: 50 },
      plot_bgcolor: '#fff', paper_bgcolor: '#fff',
    };

    Plotly.newPlot(el, [trtTrace, ctrlTrace], layout, { responsive: true, displayModeBar: false });
  }

  // ============================================================
  // Bootstrap cutoff histogram (Plotly.js)
  // ============================================================

  function plotHistogram(containerId, cutoffs, medianCutoff, varName) {
    var el = document.getElementById(containerId);
    if (!el || typeof Plotly === 'undefined' || !cutoffs || cutoffs.length === 0) return;

    var trace = {
      x: cutoffs,
      type: 'histogram',
      marker: { color: 'rgba(13, 110, 253, 0.6)', line: { color: '#0d6efd', width: 1 } },
      name: 'Bootstrap cutoffs',
    };

    var shapes = [];
    if (medianCutoff != null) {
      shapes.push({
        type: 'line', x0: medianCutoff, x1: medianCutoff, y0: 0, y1: 1,
        yref: 'paper', line: { color: '#dc3545', width: 2, dash: 'dash' },
      });
    }

    var layout = {
      xaxis: { title: varName + ' cutoff' },
      yaxis: { title: 'Count' },
      shapes: shapes,
      margin: { l: 50, r: 20, t: 20, b: 50 },
      plot_bgcolor: '#fff', paper_bgcolor: '#fff',
      annotations: medianCutoff != null ? [{
        x: medianCutoff, y: 1, yref: 'paper', text: 'Median: ' + medianCutoff.toFixed(4),
        showarrow: true, arrowhead: 2, ax: 40, ay: -25,
        font: { color: '#dc3545', size: 11 },
      }] : [],
    };

    Plotly.newPlot(el, [trace], layout, { responsive: true, displayModeBar: false });
  }

  // ============================================================
  // Formatting helpers
  // ============================================================

  function fmtPval(val) {
    if (val === null || val === undefined || isNaN(val)) return 'NA';
    return val.toPrecision(4);
  }

  function fmtSig(val) {
    if (val === null || val === undefined || isNaN(val)) return 'NA';
    return val.toPrecision(4);
  }

  function fmtNum(val) {
    if (val === null || val === undefined || isNaN(val)) return 'NA';
    return typeof val === 'number' ? val.toFixed(4) : String(val);
  }

  // ============================================================
  // Tab-switch: resize Plotly charts when hidden tabs become visible
  // ============================================================

  function wireTabPlotResize() {
    var resultsRoot = document.getElementById('results-module');
    if (!resultsRoot) return;
    // Both Bootstrap tabs and pills fire 'shown.bs.tab' on the button element.
    // Use event delegation on the results container to catch all inner tab switches.
    resultsRoot.addEventListener('shown.bs.tab', function() {
      // Small delay to let the tab content become visible before Plotly measures
      setTimeout(function() {
        // Render any pending plots that are now visible
        renderVisiblePlots();
        // Resize already-rendered plots
        if (typeof Plotly !== 'undefined') {
          var plots = resultsRoot.querySelectorAll('.js-plotly-plot');
          for (var i = 0; i < plots.length; i++) {
            Plotly.Plots.resize(plots[i]);
          }
        }
      }, 50);
    });
  }

  // ============================================================
  // DataTables init
  // ============================================================

  /** Default DataTables config for small tables (no search, no paging) */
  var DT_COMPACT = { paging: false, searching: false, info: false, ordering: true };
  /** Default DataTables config for larger tables */
  var DT_FULL = { pageLength: 25, dom: 'frtip', language: { search: 'Filter:' } };

  function initDataTables() {
    if (typeof $ === 'undefined' || !$.fn.DataTable) return;
    // Main univariate table — sortable + filterable
    initDT('#uniTable', $.extend({}, DT_FULL, { order: [[4, 'asc']] }));
    // Univariate CV summary — sortable + filterable
    initDT('#uniCVSummary', $.extend({}, DT_FULL, { order: [[1, 'asc']] }));
    // Multivariate rules table — sortable only (small)
    initDT('#multiRulesTable', DT_COMPACT);
    // Multivariate Signature aggregate p-values
    initDT('#multiSigPvalsTable', DT_COMPACT);
    // Multivariate Training tables
    initDT('#multiTrainGroupTable', DT_COMPACT);
    initDT('#multiTrainPvalsTable', DT_COMPACT);
    // Multivariate Test tables
    initDT('#multiTestGroupTable', DT_COMPACT);
    initDT('#multiTestPvalsTable', DT_COMPACT);
    // Multivariate CV tables
    initDT('#multiCVPvalsTable', DT_COMPACT);
    initDT('#multiCVGroupTable', DT_COMPACT);
  }

  /** Initialize DataTable on a selector, destroying any prior instance */
  function initDT(selector, opts) {
    if (typeof $ === 'undefined' || !$.fn.DataTable) return;
    try {
      var $t = $(selector);
      if ($t.length === 0) return;
      if ($.fn.DataTable.isDataTable(selector)) { $t.DataTable().destroy(); }
      $t.DataTable(opts || DT_COMPACT);
    } catch (e) { /* skip */ }
  }

  /** Initialize DataTable for dynamically-rendered tables (destroy + reinit) */
  function initDynamicDataTable(selector) {
    initDT(selector, DT_COMPACT);
  }

  // ============================================================
  // Module init
  // ============================================================

  function initResultsModule() { render(); }

  document.addEventListener('shown.bs.tab', function(e) {
    if (e.target.id === 'tab-results-btn') render();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initResultsModule);
  } else {
    initResultsModule();
  }

})();
