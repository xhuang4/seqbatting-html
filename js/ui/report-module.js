/**
 * report-module.js — CSV export, HTML report, curation log, session save/load
 *
 * Exports:
 *   - Univariate results CSV
 *   - Per-biomarker summary CSV (with bootstrap cutoff stats)
 *   - Univariate group statistics CSV (all biomarkers)
 *   - Multivariate rules CSV
 *   - Multivariate group statistics CSV
 *   - Multivariate CV summary CSV
 *   - Curated data CSV
 *   - HTML report download
 *   - Session JSON (save/load)
 */
(function() {
  'use strict';

  // ============================================================
  // Render
  // ============================================================

  function render() {
    var root = document.getElementById('report-module');
    if (!root) return;

    var results = App.state.results;
    if (!results || !results.success) {
      root.innerHTML = '<div class="placeholder-content">' +
        '<i class="bi bi-file-earmark-text"></i>' +
        '<h5>No Results to Export</h5>' +
        '<p class="text-muted">Run the analysis first.</p>' +
        '</div>';
      return;
    }

    var hasUni = results.univariate && results.univariate.length > 0;
    var hasMulti = results.multivariate && results.multivariate.rules && results.multivariate.rules.length > 0;
    var hasMultiCV = results.multivariate && results.multivariate.cvRes;

    var html = '<div class="row g-3">';

    // --- Column 1: Report + CSV exports ---
    html += '<div class="col-md-6">';

    // HTML Report card
    html += '<div class="card mb-3">' +
      '<div class="card-header fw-semibold"><i class="bi bi-file-earmark-richtext me-1"></i>Generate Report</div>' +
      '<div class="card-body">' +
        '<p class="text-muted small mb-2">Download a self-contained HTML report with data summary, curation log, configuration, and all results.</p>' +
        '<div class="d-grid"><button class="btn btn-primary" id="exportHTMLReport"><i class="bi bi-filetype-html me-1"></i>Download HTML Report</button></div>' +
      '</div></div>';

    // CSV Exports card
    html += '<div class="card mb-3">' +
      '<div class="card-header fw-semibold"><i class="bi bi-download me-1"></i>Data Exports (CSV)</div>' +
      '<div class="card-body">';

    if (hasUni) {
      html += '<p class="fw-semibold mb-1">Univariate</p>' +
        '<div class="d-grid gap-2 mb-3">' +
          '<button class="btn btn-outline-primary btn-sm" id="exportUniCSV"><i class="bi bi-table me-1"></i>Signature Rules</button>' +
          '<button class="btn btn-outline-primary btn-sm" id="exportUniSummaryCSV"><i class="bi bi-clipboard-data me-1"></i>Per-Biomarker Summary</button>' +
          '<button class="btn btn-outline-primary btn-sm" id="exportUniGroupCSV"><i class="bi bi-people me-1"></i>Group Statistics (All Biomarkers)</button>' +
        '</div>';
    }

    if (hasMulti) {
      html += '<p class="fw-semibold mb-1">Multivariate</p>' +
        '<div class="d-grid gap-2 mb-3">' +
          '<button class="btn btn-outline-info btn-sm" id="exportMultiCSV"><i class="bi bi-diagram-3 me-1"></i>Sequential Signature Rules</button>' +
          '<button class="btn btn-outline-info btn-sm" id="exportMultiGroupCSV"><i class="bi bi-people me-1"></i>Multivariate Group Statistics</button>';
      if (hasMultiCV) {
        html += '<button class="btn btn-outline-info btn-sm" id="exportMultiCVCSV"><i class="bi bi-arrow-repeat me-1"></i>Multivariate CV Summary</button>';
      }
      html += '</div>';
    }

    html += '<p class="fw-semibold mb-1">Data</p>' +
      '<div class="d-grid gap-2">' +
        '<button class="btn btn-outline-secondary btn-sm" id="exportDataCSV"><i class="bi bi-database me-1"></i>Curated Dataset</button>' +
      '</div>';

    html += '</div></div>'; // close card-body, card
    html += '</div>'; // close col

    // --- Column 2: Session + Curation Log ---
    html += '<div class="col-md-6">';

    // Session card
    html += '<div class="card mb-3">' +
      '<div class="card-header fw-semibold"><i class="bi bi-save me-1"></i>Session Management</div>' +
      '<div class="card-body">' +
        '<div class="d-grid gap-2 mb-3">' +
          '<button class="btn btn-outline-success" id="exportSession"><i class="bi bi-box-arrow-up me-1"></i>Save Session (JSON)</button>' +
        '</div>' +
        '<label class="form-label">Load Session:</label>' +
        '<input type="file" class="form-control" id="loadSession" accept=".json">' +
      '</div></div>';

    // Curation Log card
    html += '<div class="card mb-3">' +
      '<div class="card-header fw-semibold"><i class="bi bi-journal-text me-1"></i>Curation Log</div>' +
      '<div class="card-body">';

    var log = App.state.curationLog;
    if (log && log.length > 0) {
      html += '<pre class="console-log mb-0" style="max-height:300px;overflow-y:auto;font-size:0.82rem;background:#f8f9fa;padding:0.75rem;border-radius:0.375rem">';
      for (var i = 0; i < log.length; i++) {
        html += escapeHtml(log[i]) + '\n';
      }
      html += '</pre>';
    } else {
      html += '<p class="text-muted mb-0">No curation log available.</p>';
    }

    html += '</div></div>';

    html += '</div>'; // close col
    html += '</div>'; // close row

    root.innerHTML = html;
    wireEvents();
  }

  // ============================================================
  // Event wiring
  // ============================================================

  function wireEvents() {
    wire('exportHTMLReport', exportHTMLReport);
    wire('exportUniCSV', exportUnivariateCSV);
    wire('exportUniSummaryCSV', exportUnivariateSummaryCSV);
    wire('exportUniGroupCSV', exportUnivariateGroupCSV);
    wire('exportMultiCSV', exportMultivariateCSV);
    wire('exportMultiGroupCSV', exportMultivariateGroupCSV);
    wire('exportMultiCVCSV', exportMultivariateCVCSV);
    wire('exportDataCSV', exportDataCSV);
    wire('exportSession', exportSession);

    var el = document.getElementById('loadSession');
    if (el) el.addEventListener('change', loadSession);
  }

  function wire(id, fn) {
    var el = document.getElementById(id);
    if (el) el.addEventListener('click', fn);
  }

  // ============================================================
  // CSV helpers
  // ============================================================

  function downloadBlob(filename, content, type) {
    var blob = new Blob([content], { type: type || 'text/csv;charset=utf-8;' });
    var url = URL.createObjectURL(blob);
    var a = document.createElement('a');
    a.href = url;
    a.download = filename;
    a.click();
    URL.revokeObjectURL(url);
    App.showToast('Downloaded ' + filename, 'success');
  }

  function csvEscape(val) {
    if (val === null || val === undefined) return '';
    var s = String(val);
    if (s.indexOf(',') >= 0 || s.indexOf('"') >= 0 || s.indexOf('\n') >= 0) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  }

  function objectsToCSV(objects, columns) {
    var header = columns.join(',');
    var rows = objects.map(function(obj) {
      return columns.map(function(col) {
        return csvEscape(obj[col]);
      }).join(',');
    });
    return header + '\n' + rows.join('\n');
  }

  function fmtVal(v) {
    if (v === null || v === undefined || (typeof v === 'number' && isNaN(v))) return '';
    return v;
  }

  function dateStr() { return new Date().toISOString().slice(0, 10); }

  // ============================================================
  // Univariate CSV exports
  // ============================================================

  function exportUnivariateCSV() {
    var results = App.state.results && App.state.results.univariate;
    if (!results) return;
    var roles = App.state.roles;
    var isPredictive = roles && roles.trtvar;

    var columns = ['variable', 'direction', 'threshold', 'pvalue', 'nSigPos', 'nSigNeg', 'sigpPrcnt'];
    if (isPredictive) columns.push('interactionP');

    var rows = results.map(function(r) {
      var obj = {
        variable: r.variable,
        direction: r.direction || '',
        threshold: fmtVal(r.threshold),
        pvalue: fmtVal(r.pvalue),
        nSigPos: fmtVal(r.nSigPos),
        nSigNeg: fmtVal(r.nSigNeg),
        sigpPrcnt: fmtVal(r.sigpPrcnt),
      };
      if (isPredictive) {
        obj.interactionP = r.evaluation && r.evaluation.pvals ? fmtVal(r.evaluation.pvals.interaction) : '';
      }
      return obj;
    });

    downloadBlob('signature_rules_' + dateStr() + '.csv', objectsToCSV(rows, columns));
  }

  function exportUnivariateSummaryCSV() {
    var results = App.state.results && App.state.results.univariate;
    if (!results) return;

    var rows = results.map(function(r) {
      var bc = r.bootCutoffs || [];
      var mean = bc.length > 0 ? bc.reduce(function(a, b) { return a + b; }, 0) / bc.length : null;
      var sd = null;
      if (bc.length > 1) {
        var m = mean;
        var ss = bc.reduce(function(a, b) { return a + (b - m) * (b - m); }, 0) / (bc.length - 1);
        sd = Math.sqrt(ss);
      }
      var q25 = null, q75 = null;
      if (bc.length > 0) {
        var sorted = bc.slice().sort(function(a, b) { return a - b; });
        q25 = sorted[Math.floor(sorted.length * 0.25)];
        q75 = sorted[Math.floor(sorted.length * 0.75)];
      }

      return {
        variable: r.variable,
        direction: r.direction || '',
        threshold: fmtVal(r.threshold),
        cutoffMedian: fmtVal(r.threshold),
        cutoffMean: fmtVal(mean),
        cutoffSD: fmtVal(sd),
        cutoffQ25: fmtVal(q25),
        cutoffQ75: fmtVal(q75),
        nBoot: bc.length,
        pvalue: fmtVal(r.pvalue),
        nSigPos: fmtVal(r.nSigPos),
        nSigNeg: fmtVal(r.nSigNeg),
      };
    });

    var columns = ['variable', 'direction', 'threshold', 'cutoffMedian', 'cutoffMean', 'cutoffSD', 'cutoffQ25', 'cutoffQ75', 'nBoot', 'pvalue', 'nSigPos', 'nSigNeg'];
    downloadBlob('univariate_summary_' + dateStr() + '.csv', objectsToCSV(rows, columns));
  }

  function exportUnivariateGroupCSV() {
    var results = App.state.results && App.state.results.univariate;
    if (!results) return;

    var allRows = [];
    results.forEach(function(r) {
      if (!r.groupStats) return;
      var gs = r.groupStats;
      var gKeys = Object.keys(gs);
      gKeys.forEach(function(gk) {
        var s = gs[gk];
        var row = { variable: r.variable, subgroup: gk, n: s.n };
        var sKeys = Object.keys(s);
        sKeys.forEach(function(sk) {
          if (sk !== 'n') row[sk] = fmtVal(s[sk]);
        });
        allRows.push(row);
      });
    });

    if (allRows.length === 0) { App.showToast('No group statistics available.', 'warning'); return; }
    var columns = Object.keys(allRows[0]);
    downloadBlob('univariate_group_stats_' + dateStr() + '.csv', objectsToCSV(allRows, columns));
  }

  // ============================================================
  // Multivariate CSV exports
  // ============================================================

  function exportMultivariateCSV() {
    var rules = App.state.results && App.state.results.multivariate && App.state.results.multivariate.rules;
    if (!rules) return;

    var rows = rules.map(function(r, i) {
      return { step: i + 1, variable: r.variable, direction: r.direction, threshold: fmtVal(r.threshold), logLik: fmtVal(r.logLik) };
    });
    downloadBlob('multivariate_rules_' + dateStr() + '.csv', objectsToCSV(rows, ['step', 'variable', 'direction', 'threshold', 'logLik']));
  }

  function exportMultivariateGroupCSV() {
    var multi = App.state.results && App.state.results.multivariate;
    if (!multi) return;

    var sections = [];
    if (multi.trainGroupStats) sections.push({ label: 'Training', gs: multi.trainGroupStats });
    if (multi.testGroupStats) sections.push({ label: 'Test', gs: multi.testGroupStats });

    var allRows = [];
    sections.forEach(function(sec) {
      var gKeys = Object.keys(sec.gs);
      gKeys.forEach(function(gk) {
        var s = sec.gs[gk];
        var row = { dataset: sec.label, subgroup: gk, n: s.n };
        Object.keys(s).forEach(function(sk) {
          if (sk !== 'n') row[sk] = fmtVal(s[sk]);
        });
        allRows.push(row);
      });
    });

    // Also add p-values as separate section
    var pvalRows = [];
    if (multi.trainEvaluation && multi.trainEvaluation.pvals) {
      var pv = multi.trainEvaluation.pvals;
      Object.keys(pv).forEach(function(k) {
        pvalRows.push({ dataset: 'Training', test: k, pvalue: fmtVal(pv[k]) });
      });
    }
    if (multi.testEvaluation && multi.testEvaluation.pvals) {
      var pv2 = multi.testEvaluation.pvals;
      Object.keys(pv2).forEach(function(k) {
        pvalRows.push({ dataset: 'Test', test: k, pvalue: fmtVal(pv2[k]) });
      });
    }

    if (allRows.length === 0 && pvalRows.length === 0) { App.showToast('No multivariate statistics available.', 'warning'); return; }

    var csv = '';
    if (allRows.length > 0) {
      csv += '## Group Statistics\n';
      csv += objectsToCSV(allRows, Object.keys(allRows[0]));
    }
    if (pvalRows.length > 0) {
      csv += '\n\n## P-values\n';
      csv += objectsToCSV(pvalRows, ['dataset', 'test', 'pvalue']);
    }

    downloadBlob('multivariate_stats_' + dateStr() + '.csv', csv);
  }

  function exportMultivariateCVCSV() {
    var cvRes = App.state.results && App.state.results.multivariate && App.state.results.multivariate.cvRes;
    if (!cvRes || !cvRes.summary) return;

    var summary = cvRes.summary;
    var csv = '';

    // P-values section
    if (summary.pvals) {
      csv += '## CV P-values (Median & MAD)\n';
      var pkeys = Object.keys(summary.pvals).filter(function(k) { return k.indexOf('mad_') !== 0; });
      var pvRows = pkeys.map(function(k) {
        return { test: k, median: fmtVal(summary.pvals[k]), mad: fmtVal(summary.pvals['mad_' + k]) };
      });
      csv += objectsToCSV(pvRows, ['test', 'median', 'mad']);
    }

    // Ratios section
    if (summary.ratios) {
      csv += '\n\n## Ratios (Median & MAD)\n';
      var rkeys = Object.keys(summary.ratios).filter(function(k) { return k.indexOf('mad_') !== 0; });
      var rRows = rkeys.map(function(k) {
        return { ratio: k, median: fmtVal(summary.ratios[k]), mad: fmtVal(summary.ratios['mad_' + k]) };
      });
      csv += objectsToCSV(rRows, ['ratio', 'median', 'mad']);
    }

    // Group stats section
    if (summary.groupStats) {
      csv += '\n\n## CV Group Statistics\n';
      var gsRows = [];
      var gKeys = Object.keys(summary.groupStats);
      gKeys.forEach(function(gk) {
        var s = summary.groupStats[gk];
        var row = { subgroup: gk };
        Object.keys(s).forEach(function(sk) { row[sk] = fmtVal(s[sk]); });
        gsRows.push(row);
      });
      if (gsRows.length > 0) csv += objectsToCSV(gsRows, Object.keys(gsRows[0]));
    }

    csv += '\n\n## Summary\nnSuccess,' + cvRes.nSuccess + '\nnTotal,' + cvRes.nTotal;

    downloadBlob('multivariate_cv_summary_' + dateStr() + '.csv', csv);
  }

  // ============================================================
  // Data CSV export
  // ============================================================

  function exportDataCSV() {
    var data = App.state.curatedData;
    if (!data || data.length === 0) return;
    var columns = Object.keys(data[0]);
    downloadBlob('curated_data_' + dateStr() + '.csv', objectsToCSV(data, columns));
  }

  // ============================================================
  // HTML report generation
  // ============================================================

  // ============================================================
  // Cached Bootstrap assets (loaded once)
  // ============================================================
  var _bsCSS = null;
  var _bsJS = null;

  function loadBootstrapAssets() {
    if (_bsCSS && _bsJS) return Promise.resolve({ css: _bsCSS, js: _bsJS });
    return Promise.all([
      fetch('assets/bootstrap.min.css').then(function(r) { return r.text(); }),
      fetch('assets/bootstrap.bundle.min.js').then(function(r) { return r.text(); })
    ]).then(function(arr) {
      _bsCSS = arr[0];
      _bsJS = arr[1];
      return { css: _bsCSS, js: _bsJS };
    });
  }

  function exportHTMLReport() {
    var results = App.state.results;
    var roles = App.state.roles;
    var config = App.state.config;
    var log = App.state.curationLog || [];
    if (!results || !results.success) return;

    loadBootstrapAssets().then(function(bs) {
      buildAndDownloadReport(results, roles, config, log, bs);
    }).catch(function(err) {
      App.showToast('Error loading report assets: ' + err.message, 'danger');
    });
  }

  function buildAndDownloadReport(results, roles, config, log, bs) {
    var isPredictive = roles && roles.trtvar;
    var type = roles ? roles.type : 'c';
    var typeLabel = type === 'c' ? 'Continuous' : type === 'b' ? 'Binary' : 'Time-to-Event';
    var hasUni = results.univariate && results.univariate.length > 0;
    var hasMulti = results.multivariate && results.multivariate.rules && results.multivariate.rules.length > 0;

    // Prepare a serializable data blob (strip large arrays we don't need)
    var reportData = {
      isPredictive: !!isPredictive,
      type: type,
      univariate: results.univariate || [],
      multivariate: results.multivariate || null,
      timing: results.timing || null,
      encodingMap: App.state.encodingMap || {},
    };

    var h = [];
    h.push('<!DOCTYPE html>');
    h.push('<html lang="en"><head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1.0">');
    h.push('<title>Sequential BATTing Report</title>');

    // Inline Bootstrap CSS
    h.push('<style>');
    h.push(bs.css);
    h.push('</style>');

    // Custom report CSS
    h.push('<style>');
    h.push('body{padding:1.5rem 0}.rpt-header{border-bottom:2px solid #0d6efd;padding-bottom:.5rem;margin-bottom:1rem}');
    h.push('.section-title{color:#0d6efd;border-bottom:1px solid #dee2e6;padding-bottom:.3rem;margin-top:2rem}');
    h.push('.sig{color:#198754;font-weight:700}.meta{color:#6c757d;font-size:0.85rem}');
    h.push('.value-box{display:inline-block;padding:.6rem 1.2rem;margin:.3rem;border-radius:.375rem;text-align:center}');
    h.push('.vb-info{background:#e7f1ff}.vb-success{background:#d1e7dd}.vb-secondary{background:#e2e3e5}.vb-primary{background:#cfe2ff}');
    h.push('.vb-title{font-size:.72rem;color:#6c757d;text-transform:uppercase}.vb-value{font-size:1.15rem;font-weight:700;color:#0d6efd}');
    h.push('canvas.chart{border:1px solid #dee2e6;border-radius:.375rem;background:#fff;max-width:100%}');
    h.push('.sortable-th{cursor:pointer;user-select:none}.sortable-th:hover{background:#e9ecef}');
    h.push('.sortable-th::after{content:" \\25B4\\25BE";font-size:.65em;color:#adb5bd;margin-left:.3em}');
    h.push('@media print{.nav-tabs,.nav-pills{display:none!important}.tab-pane{display:block!important;opacity:1!important}}');
    h.push('</style>');
    h.push('</head><body>');

    h.push('<div class="container">');

    // ---- Title ----
    h.push('<h1 class="rpt-header">Sequential BATTing Analysis Report</h1>');
    h.push('<p class="meta">Generated: ' + new Date().toLocaleString() + '</p>');
    if (results.timing) {
      h.push('<p class="meta">Analysis completed in ' + results.timing.totalSeconds + 's on ' + new Date(results.timing.startTime).toLocaleString() + '</p>');
    }

    // ---- 1. Data Summary ----
    h.push('<h2 class="section-title">1. Data Summary</h2>');
    h.push('<table class="table table-sm table-bordered" style="max-width:600px">');
    h.push('<tr><th>Endpoint Type</th><td>' + typeLabel + '</td></tr>');
    h.push('<tr><th>Analysis Type</th><td>' + (isPredictive ? 'Predictive' : 'Prognostic') + '</td></tr>');
    h.push('<tr><th>Response Variable</th><td>' + esc(roles.yvar || 'NA') + '</td></tr>');
    if (isPredictive) h.push('<tr><th>Treatment Variable</th><td>' + esc(roles.trtvar) + '</td></tr>');
    if (roles.censorvar) h.push('<tr><th>Censor Variable</th><td>' + esc(roles.censorvar) + '</td></tr>');
    h.push('<tr><th>Predictors</th><td>' + esc(roles.xvars ? roles.xvars.join(', ') : 'NA') + '</td></tr>');
    var nTrain = config && config.dataTrain ? config.dataTrain.length : (App.state.curatedData ? App.state.curatedData.length : 'NA');
    h.push('<tr><th>N (training)</th><td>' + nTrain + '</td></tr>');
    if (config && config.dataTest) h.push('<tr><th>N (test)</th><td>' + config.dataTest.length + '</td></tr>');
    h.push('</table>');

    // ---- 2. Curation Log ----
    if (log.length > 0) {
      h.push('<h2 class="section-title">2. Curation Log</h2>');
      h.push('<pre class="bg-light border p-3" style="max-height:300px;overflow-y:auto;font-size:.82rem">');
      log.forEach(function(l) { h.push(esc(l)); });
      h.push('</pre>');
    }

    // ---- 3. Configuration ----
    if (config) {
      h.push('<h2 class="section-title">3. Configuration</h2>');
      h.push('<table class="table table-sm table-bordered" style="max-width:600px">');
      h.push('<tr><th>Analysis Scope</th><td>' + esc(config.analysisScope || 'NA') + '</td></tr>');
      h.push('<tr><th>Bootstrap Samples</th><td>' + (config.nBoot || 'NA') + '</td></tr>');
      h.push('<tr><th>Min Sig+ %</th><td>' + ((config.minSigpPrcnt || 0.2) * 100) + '%</td></tr>');
      h.push('<tr><th>Desired Response</th><td>' + esc(config.desRes || 'larger') + '</td></tr>');
      h.push('<tr><th>Random Seed</th><td>' + (config.randomSeed || 'NA') + '</td></tr>');
      if (config.enableCV) {
        h.push('<tr><th>Cross-Validation</th><td>Enabled (' + config.kFold + '-fold, ' + config.cvIter + ' iterations)</td></tr>');
      }
      h.push('</table>');
    }

    // ---- 4. Univariate Results (interactive) ----
    if (hasUni) {
      h.push('<h2 class="section-title">4. Univariate BATTing Results</h2>');
      h.push('<div id="uniSection"></div>');
    }

    // ---- 5. Multivariate Results (interactive) ----
    if (hasMulti) {
      h.push('<h2 class="section-title">5. Multivariate Sequential BATTing</h2>');
      h.push('<div id="multiSection"></div>');
    }

    // ---- 6. Interpretation Guide ----
    h.push('<h2 class="section-title">6. Interpretation Guide</h2>');
    h.push('<h5>Reading Univariate Results</h5><ul>');
    h.push('<li><strong>Direction (<code>&gt;</code> or <code>&lt;</code>)</strong>: The threshold direction for the sig+ subgroup. For example, <code>x1 &gt; 2.3</code> means patients with x1 greater than 2.3 are classified as sig+ (signature positive).</li>');
    h.push('<li><strong>P-value</strong>:<ul><li><em>Predictive mode</em>: Tests the treatment-by-subgroup interaction.</li><li><em>Prognostic mode</em>: Tests the main effect of the subgroup.</li></ul></li>');
    h.push('<li><strong>Cutoff (Median)</strong>: The median of bootstrap-aggregated cutoffs.</li>');
    h.push('<li><strong>Group Statistics</strong>: Mean response (continuous), response rate (binary), or restricted mean survival time (survival) for each subgroup, split by treatment arm in predictive mode.</li>');
    h.push('</ul>');
    h.push('<h5>Reading Multivariate Results</h5><ul>');
    h.push('<li><strong>Sequential Rules</strong>: Each step adds one variable. Patients satisfying <em>all</em> steps are classified as sig+.</li>');
    h.push('<li><strong>Log-Likelihood</strong>: The log-likelihood improvement at each step.</li>');
    h.push('<li><strong>Aggregate P-values</strong>: Test statistics evaluating the overall multivariate signature.</li>');
    h.push('<li><strong>Group Statistics</strong>: Outcome summaries for sig+ vs sig&minus; based on the combined multi-variable rule.</li>');
    h.push('</ul>');

    h.push('<hr><p class="meta">Report generated by Sequential BATTing HTML App</p>');
    h.push('</div>'); // close container

    // ---- Inline Bootstrap JS ----
    h.push('<script>');
    h.push(bs.js);
    h.push('</' + 'script>');

    // ---- Embedded report data ----
    h.push('<script>');
    h.push('var REPORT_DATA=' + JSON.stringify(reportData) + ';');
    h.push('</' + 'script>');

    // ---- Inline rendering JS ----
    h.push('<script>');
    h.push(getReportRenderingJS());
    h.push('</' + 'script>');

    h.push('</body></html>');

    downloadBlob('sequential_batting_report_' + dateStr() + '.html', h.join('\n'), 'text/html;charset=utf-8;');
  }

  /** Helper: escape HTML */
  function esc(s) { return escapeHtml(s); }

  /**
   * Returns the inline JS that runs inside the downloaded HTML report.
   * This is a self-contained block that reads REPORT_DATA and renders
   * the same layout as the Results tab, with Canvas charts and sortable tables.
   */
  function getReportRenderingJS() {
    // We return the JS as a string literal.  Use a template approach for readability.
    return [
      '(function(){',
      '"use strict";',

      // === Constants ===
      'var D=REPORT_DATA,ip=D.isPredictive,tp=D.type;',
      'var PVAL_LABELS={trtDiffPosGp:"Trt Diff Pos Gp",trtDiffNegGp:"Trt Diff Neg Gp",gpDiffTrtArm:"Gp Diff Trt Arm",gpDiffCtrlArm:"Gp Diff Ctrl Arm",interaction:"Interaction",trtPosCtrlNeg:"Trt Pos Gp by Ctrl Neg Gp",pval:"Subgroup Effect"};',
      'var GL={sigPosTrt:"Sig+ Trt",sigPosCtrl:"Sig+ Ctrl",sigNegTrt:"Sig- Trt",sigNegCtrl:"Sig- Ctrl",sigPos:"Sig+",sigNeg:"Sig-"};',

      // === Formatting helpers ===
      'function fp(v){return v==null||isNaN(v)?"NA":v.toPrecision(4);}',
      'function fn(v){return v==null||isNaN(v)?"NA":typeof v==="number"?v.toFixed(4):String(v);}',
      'function esc(s){return String(s).replace(/&/g,"&amp;").replace(/</g,"&lt;").replace(/>/g,"&gt;");}',
      'function pCls(v){return v!=null&&v<=0.05?" class=\\"sig\\"":"";}',
      'function pClsTd(v){return v!=null&&v<=0.05?" text-success fw-bold":"";}',

      // === Rule interpretation (reverse encoding map) ===
      'function iR(v,dir,thr){',
      '  if(!v||!dir||thr==null||isNaN(thr))return "NA";',
      '  var em=D.encodingMap;if(!em||!em[v])return v+" "+dir+" "+thr.toFixed(4);',
      '  var info=em[v],orig=info.originalVar,m=info.mapping;',
      '  if(info.method==="onehot"){',
      '    var l1=[],l0=[];for(var k in m){if(m.hasOwnProperty(k)){if(m[k]===1)l1.push(k);else l0.push(k);}}',
      '    var sel=dir===">"?(thr<1?l1:[]):(thr>0?l0:[]);',
      '    if(sel.length===0)return v+" "+dir+" "+thr.toFixed(4);',
      '    return sel.length===1?orig+" is "+sel[0]:orig+" in {"+sel.join(", ")+"}";',
      '  }else if(info.method==="label"){',
      '    var ns=[],cs=[];for(var k2 in m){if(m.hasOwnProperty(k2)){ns.push(k2);cs.push(m[k2]);}}',
      '    var idx=cs.map(function(_,i){return i;}).sort(function(a,b){return cs[a]-cs[b];});',
      '    var sel2=[];for(var j=0;j<idx.length;j++){var c=cs[idx[j]];if((dir===">"&&c>thr)||(dir==="<"&&c<thr))sel2.push(ns[idx[j]]);}',
      '    if(sel2.length===0)return v+" "+dir+" "+thr.toFixed(4);',
      '    return sel2.length===1?orig+" is "+sel2[0]:orig+" in {"+sel2.join(", ")+"}";',
      '  }',
      '  return v+" "+dir+" "+thr.toFixed(4);',
      '}',

      // === Sortable table ===
      'function initSort(){',
      '  document.querySelectorAll("th.sortable-th").forEach(function(th){',
      '    th.addEventListener("click",function(){',
      '      var table=th.closest("table"),tbody=table.querySelector("tbody");',
      '      var idx=Array.prototype.indexOf.call(th.parentNode.children,th);',
      '      var rows=Array.from(tbody.querySelectorAll("tr"));',
      '      var asc=th.dataset.sortDir!=="asc";th.dataset.sortDir=asc?"asc":"desc";',
      '      rows.sort(function(a,b){',
      '        var va=a.cells[idx].textContent.trim(),vb=b.cells[idx].textContent.trim();',
      '        var na=parseFloat(va),nb=parseFloat(vb);',
      '        if(!isNaN(na)&&!isNaN(nb))return asc?na-nb:nb-na;',
      '        return asc?va.localeCompare(vb):vb.localeCompare(va);',
      '      });',
      '      rows.forEach(function(r){tbody.appendChild(r);});',
      '    });',
      '  });',
      '}',

      // === P-values table ===
      'function pvTable(ev,label){',
      '  if(!ev||!ev.pvals)return"";',
      '  var h=\'<div class="card mb-3"><div class="card-header fw-semibold">P-values (\'+label+\')</div><div class="card-body"><table class="table table-sm table-striped"><thead><tr><th>Test</th><th>P-value</th></tr></thead><tbody>\';',
      '  var p=ev.pvals;',
      '  if(ip){',
      '    [["Trt effect in Sig+ group",p.trtDiffPosGp],["Trt effect in Sig- group",p.trtDiffNegGp],["Subgroup diff in Trt arm",p.gpDiffTrtArm],["Subgroup diff in Ctrl arm",p.gpDiffCtrlArm],["Treatment * Subgroup interaction",p.interaction],["Trt+Sig+ vs Ctrl+Sig-",p.trtPosCtrlNeg]].forEach(function(t){',
      '      h+=\'<tr><td>\'+t[0]+\'</td><td class="\'+pClsTd(t[1])+\'">\'+fp(t[1])+\'</td></tr>\';',
      '    });',
      '  }else{',
      '    h+=\'<tr><td>Subgroup effect</td><td class="\'+pClsTd(p.pval)+\'">\'+fp(p.pval)+\'</td></tr>\';',
      '  }',
      '  if(ev.ratios){Object.keys(ev.ratios).forEach(function(k){var v=ev.ratios[k];if(v!=null)h+=\'<tr><td>\'+k+\'</td><td>\'+fn(v)+\'</td></tr>\';});}',
      '  h+=\'</tbody></table></div></div>\';return h;',
      '}',

      // === Group stats table ===
      'function gsTable(stats,label){',
      '  if(!stats)return"";',
      '  var h=\'<div class="card mb-3"><div class="card-header fw-semibold">Group Statistics (\'+label+\')</div><div class="card-body"><table class="table table-sm table-striped"><thead><tr><th>Group</th><th>N</th>\';',
      '  if(tp==="c")h+=\'<th>Mean</th><th>SD</th><th>Median</th>\';',
      '  else if(tp==="s")h+=\'<th>RMST</th><th>SE</th><th>Median</th>\';',
      '  else h+=\'<th>Resp Rate</th>\';',
      '  h+=\'</tr></thead><tbody>\';',
      '  Object.keys(stats).forEach(function(k){var s=stats[k],lbl=GL[k]||k;',
      '    h+=\'<tr><td>\'+lbl+\'</td><td>\'+s.n+\'</td>\';',
      '    if(tp==="c")h+=\'<td>\'+fn(s.mean)+\'</td><td>\'+fn(s.sd)+\'</td><td>\'+fn(s.median)+\'</td>\';',
      '    else if(tp==="s")h+=\'<td>\'+fn(s.rmean)+\'</td><td>\'+fn(s.seRmean)+\'</td><td>\'+fn(s.medianSurv)+\'</td>\';',
      '    else h+=\'<td>\'+(s.respRate!=null?(s.respRate*100).toFixed(1)+"%":"NA")+\'</td>\';',
      '    h+=\'</tr>\';',
      '  });',
      '  h+=\'</tbody></table></div></div>\';return h;',
      '}',

      // === Canvas interaction plot ===
      'function drawInteraction(canvasId,gs){',
      '  var c=document.getElementById(canvasId);if(!c||!gs||!gs.sigPosTrt)return;',
      '  var ctx=c.getContext("2d"),W=c.width,H=c.height;',
      '  var vk=tp==="s"?"rmean":tp==="b"?"respRate":"mean";',
      '  var ek=tp==="s"?"seRmean":null;',
      '  var vals=[gs.sigNegTrt[vk],gs.sigPosTrt[vk],gs.sigNegCtrl[vk],gs.sigPosCtrl[vk]];',
      '  var errs=[0,0,0,0];',
      '  if(ek){errs=[gs.sigNegTrt[ek]||0,gs.sigPosTrt[ek]||0,gs.sigNegCtrl[ek]||0,gs.sigPosCtrl[ek]||0];}',
      '  else if(tp==="c"){',
      '    errs=[gs.sigNegTrt.n>1?(gs.sigNegTrt.sd||0)/Math.sqrt(gs.sigNegTrt.n):0,',
      '          gs.sigPosTrt.n>1?(gs.sigPosTrt.sd||0)/Math.sqrt(gs.sigPosTrt.n):0,',
      '          gs.sigNegCtrl.n>1?(gs.sigNegCtrl.sd||0)/Math.sqrt(gs.sigNegCtrl.n):0,',
      '          gs.sigPosCtrl.n>1?(gs.sigPosCtrl.sd||0)/Math.sqrt(gs.sigPosCtrl.n):0];',
      '  }',
      '  var allV=vals.concat(vals.map(function(v,i){return v+errs[i];}),vals.map(function(v,i){return v-errs[i];}));',
      '  var mn=Math.min.apply(null,allV),mx=Math.max.apply(null,allV);',
      '  var pad=(mx-mn)*0.15||1;mn-=pad;mx+=pad;',
      '  var L=70,R=W-30,T=30,B=H-50;',
      '  var xPos=[L+(R-L)*0.25,L+(R-L)*0.75];',
      '  function yMap(v){return T+(B-T)*(1-(v-mn)/(mx-mn));}',
      // Grid
      '  ctx.strokeStyle="#dee2e6";ctx.lineWidth=1;',
      '  for(var g=0;g<5;g++){var gy=T+(B-T)*g/4;ctx.beginPath();ctx.moveTo(L,gy);ctx.lineTo(R,gy);ctx.stroke();}',
      // Axes
      '  ctx.strokeStyle="#333";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(L,T);ctx.lineTo(L,B);ctx.lineTo(R,B);ctx.stroke();',
      // Y-axis labels
      '  ctx.fillStyle="#333";ctx.font="11px sans-serif";ctx.textAlign="right";ctx.textBaseline="middle";',
      '  for(var g=0;g<5;g++){var yv=mn+(mx-mn)*g/4;ctx.fillText(yv.toFixed(2),L-5,yMap(yv));}',
      // X-axis labels
      '  ctx.textAlign="center";ctx.textBaseline="top";',
      '  ctx.fillText("Sig-",xPos[0],B+8);ctx.fillText("Sig+",xPos[1],B+8);',
      // Draw Trt line (blue)
      '  ctx.strokeStyle="#0d6efd";ctx.lineWidth=2.5;ctx.beginPath();ctx.moveTo(xPos[0],yMap(vals[0]));ctx.lineTo(xPos[1],yMap(vals[1]));ctx.stroke();',
      '  [0,1].forEach(function(i){',
      '    ctx.fillStyle="#0d6efd";ctx.beginPath();ctx.arc(xPos[i],yMap(vals[i]),5,0,Math.PI*2);ctx.fill();',
      '    if(errs[i]>0){ctx.strokeStyle="#0d6efd";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(xPos[i],yMap(vals[i]-errs[i]));ctx.lineTo(xPos[i],yMap(vals[i]+errs[i]));ctx.stroke();ctx.beginPath();ctx.moveTo(xPos[i]-4,yMap(vals[i]-errs[i]));ctx.lineTo(xPos[i]+4,yMap(vals[i]-errs[i]));ctx.stroke();ctx.beginPath();ctx.moveTo(xPos[i]-4,yMap(vals[i]+errs[i]));ctx.lineTo(xPos[i]+4,yMap(vals[i]+errs[i]));ctx.stroke();}',
      '  });',
      // Draw Ctrl line (red dashed)
      '  ctx.strokeStyle="#dc3545";ctx.lineWidth=2.5;ctx.setLineDash([6,4]);ctx.beginPath();ctx.moveTo(xPos[0],yMap(vals[2]));ctx.lineTo(xPos[1],yMap(vals[3]));ctx.stroke();ctx.setLineDash([]);',
      '  [2,3].forEach(function(i){',
      '    ctx.fillStyle="#dc3545";ctx.beginPath();ctx.arc(xPos[i-2],yMap(vals[i]),5,0,Math.PI*2);ctx.fill();',
      '    if(errs[i]>0){ctx.strokeStyle="#dc3545";ctx.lineWidth=1.5;ctx.beginPath();ctx.moveTo(xPos[i-2],yMap(vals[i]-errs[i]));ctx.lineTo(xPos[i-2],yMap(vals[i]+errs[i]));ctx.stroke();ctx.beginPath();ctx.moveTo(xPos[i-2]-4,yMap(vals[i]-errs[i]));ctx.lineTo(xPos[i-2]+4,yMap(vals[i]-errs[i]));ctx.stroke();ctx.beginPath();ctx.moveTo(xPos[i-2]-4,yMap(vals[i]+errs[i]));ctx.lineTo(xPos[i-2]+4,yMap(vals[i]+errs[i]));ctx.stroke();}',
      '  });',
      // Legend
      '  ctx.fillStyle="#0d6efd";ctx.fillRect(R-80,T,12,3);ctx.fillStyle="#333";ctx.font="11px sans-serif";ctx.textAlign="left";ctx.fillText("Trt",R-64,T+4);',
      '  ctx.strokeStyle="#dc3545";ctx.setLineDash([4,3]);ctx.beginPath();ctx.moveTo(R-80,T+15);ctx.lineTo(R-68,T+15);ctx.stroke();ctx.setLineDash([]);ctx.fillText("Ctrl",R-64,T+18);',
      '}',

      // === Canvas histogram ===
      'function drawHistogram(canvasId,cutoffs,median,varName){',
      '  var c=document.getElementById(canvasId);if(!c||!cutoffs||cutoffs.length===0)return;',
      '  var ctx=c.getContext("2d"),W=c.width,H=c.height;',
      '  var sorted=cutoffs.slice().sort(function(a,b){return a-b;});',
      '  var mn=sorted[0],mx=sorted[sorted.length-1];',
      '  var range=mx-mn;if(range===0)range=1;',
      '  var nBins=Math.min(Math.max(Math.ceil(Math.sqrt(cutoffs.length)),5),30);',
      '  var binW=range/nBins;',
      '  var bins=new Array(nBins).fill(0);',
      '  cutoffs.forEach(function(v){var i=Math.min(Math.floor((v-mn)/binW),nBins-1);bins[i]++;});',
      '  var maxCount=Math.max.apply(null,bins);',
      '  var L=60,R=W-20,T=20,B=H-45;',
      '  var bw=(R-L)/nBins;',
      // Grid + axes
      '  ctx.strokeStyle="#dee2e6";ctx.lineWidth=1;',
      '  for(var g=0;g<5;g++){var gy=T+(B-T)*g/4;ctx.beginPath();ctx.moveTo(L,gy);ctx.lineTo(R,gy);ctx.stroke();}',
      '  ctx.strokeStyle="#333";ctx.lineWidth=1;ctx.beginPath();ctx.moveTo(L,T);ctx.lineTo(L,B);ctx.lineTo(R,B);ctx.stroke();',
      // Bars
      '  ctx.fillStyle="rgba(13,110,253,0.5)";ctx.strokeStyle="#0d6efd";ctx.lineWidth=1;',
      '  for(var i=0;i<nBins;i++){var bh=maxCount>0?bins[i]/maxCount*(B-T):0;ctx.fillRect(L+i*bw,B-bh,bw-1,bh);ctx.strokeRect(L+i*bw,B-bh,bw-1,bh);}',
      // Y-axis labels
      '  ctx.fillStyle="#333";ctx.font="11px sans-serif";ctx.textAlign="right";ctx.textBaseline="middle";',
      '  for(var g=0;g<5;g++){var cv=maxCount*g/4;ctx.fillText(Math.round(cv),L-5,B-(B-T)*g/4);}',
      // X-axis labels
      '  ctx.textAlign="center";ctx.textBaseline="top";',
      '  for(var i=0;i<=nBins;i+=Math.max(1,Math.floor(nBins/5))){ctx.fillText((mn+i*binW).toFixed(2),L+i*bw,B+5);}',
      // Median line
      '  if(median!=null){var mx2=(median-mn)/range;var xm=L+mx2*(R-L);',
      '    ctx.strokeStyle="#dc3545";ctx.lineWidth=2;ctx.setLineDash([5,3]);ctx.beginPath();ctx.moveTo(xm,T);ctx.lineTo(xm,B);ctx.stroke();ctx.setLineDash([]);',
      '    ctx.fillStyle="#dc3545";ctx.font="11px sans-serif";ctx.textAlign="left";ctx.fillText("Median: "+median.toFixed(4),xm+4,T+4);',
      '  }',
      // X-axis title
      '  ctx.fillStyle="#333";ctx.font="12px sans-serif";ctx.textAlign="center";ctx.fillText(varName+" cutoff",L+(R-L)/2,B+30);',
      '}',

      // === Value box helper ===
      'function vbox(title,val,cls){',
      '  return \'<div class="col-md-4"><div class="value-box \'+cls+\'"><div class="vb-title">\'+title+\'</div><div class="vb-value">\'+val+\'</div></div></div>\';',
      '}',

      // === Univariate rendering ===
      'function renderUni(){',
      '  var root=document.getElementById("uniSection");if(!root)return;',
      '  var uni=D.univariate;if(!uni||!uni.length)return;',
      '  var sorted=uni.slice().sort(function(a,b){return(a.pvalue!=null?a.pvalue:1)-(b.pvalue!=null?b.pvalue:1);});',
      '  var hasCV=uni.some(function(r){return r.cvRes;});',
      '  var hasTest=uni.some(function(r){return r.testEvaluation;});',

      // Inner tabs
      '  var h=\'<ul class="nav nav-pills nav-fill mb-3" role="tablist">\';',
      '  h+=\'<li class="nav-item"><button class="nav-link active" data-bs-toggle="pill" data-bs-target="#rUniSig" type="button">Signature Rules</button></li>\';',
      '  h+=\'<li class="nav-item"><button class="nav-link" data-bs-toggle="pill" data-bs-target="#rUniTrain" type="button">Training</button></li>\';',
      '  if(hasTest)h+=\'<li class="nav-item"><button class="nav-link" data-bs-toggle="pill" data-bs-target="#rUniTest" type="button">Test Results</button></li>\';',
      '  if(hasCV)h+=\'<li class="nav-item"><button class="nav-link" data-bs-toggle="pill" data-bs-target="#rUniCV" type="button">Cross-Validation</button></li>\';',
      '  h+=\'</ul><div class="tab-content">\';',

      // Signature Rules tab
      '  h+=\'<div class="tab-pane fade show active" id="rUniSig">\';',
      '  h+=\'<div class="card"><div class="card-header fw-semibold">Univariate BATTing Results</div><div class="card-body">\';',
      '  h+=\'<p class="text-muted small mb-2">Each row is an independent single-biomarker BATTing rule. Threshold is the bootstrap median cutoff.</p>\';',
      '  h+=\'<table class="table table-sm table-striped"><thead><tr><th class="sortable-th">#</th><th class="sortable-th">Variable</th><th class="sortable-th">Signature</th><th class="sortable-th">P-value</th><th class="sortable-th">N(sig+)</th><th class="sortable-th">N(sig-)</th><th class="sortable-th">Sig+%</th>\';',
      '  if(ip)h+=\'<th class="sortable-th">Interaction P</th>\';',
      '  h+=\'</tr></thead><tbody>\';',
      '  sorted.forEach(function(r,i){',
      '    var sigp=r.sigpPrcnt!=null?(r.sigpPrcnt*100).toFixed(1)+"%":"NA";',
      '    var interP=ip&&r.evaluation&&r.evaluation.pvals&&r.evaluation.pvals.interaction!=null?fp(r.evaluation.pvals.interaction):"NA";',
      '    h+=\'<tr><td>\'+(i+1)+\'</td><td><strong>\'+r.variable+\'</strong></td><td>\'+iR(r.variable,r.direction,r.threshold)+\'</td><td class="\'+pClsTd(r.pvalue)+\'">\'+fp(r.pvalue)+\'</td><td>\'+(r.nSigPos!=null?r.nSigPos:"NA")+\'</td><td>\'+(r.nSigNeg!=null?r.nSigNeg:"NA")+\'</td><td>\'+sigp+\'</td>\';',
      '    if(ip)h+=\'<td>\'+interP+\'</td>\';',
      '    h+=\'</tr>\';',
      '  });',
      '  h+=\'</tbody></table></div></div></div>\';',

      // Training tab (per-biomarker navigator)
      '  h+=\'<div class="tab-pane fade" id="rUniTrain">\';',
      '  h+=\'<div class="card mb-3"><div class="card-body"><label class="form-label fw-semibold">Select Biomarker:</label>\';',
      '  h+=\'<select class="form-select" id="rUniTrainSel">\';',
      '  sorted.forEach(function(r,i){h+=\'<option value="\'+i+\'"\'+(i===0?" selected":"")+\'>\'+r.variable+" (p="+fp(r.pvalue)+\')</option>\';});',
      '  h+=\'</select></div></div><div id="rUniTrainDetail"></div></div>\';',

      // Test tab
      '  if(hasTest){',
      '    var withTest=sorted.filter(function(r){return r.testEvaluation;});',
      '    h+=\'<div class="tab-pane fade" id="rUniTest">\';',
      '    h+=\'<div class="card mb-3"><div class="card-body"><label class="form-label fw-semibold">Select Biomarker:</label>\';',
      '    h+=\'<select class="form-select" id="rUniTestSel">\';',
      '    withTest.forEach(function(r,i){h+=\'<option value="\'+r.variable+\'"\'+(i===0?" selected":"")+\'>\'+r.variable+" (p="+fp(r.pvalue)+\')</option>\';});',
      '    h+=\'</select></div></div><div id="rUniTestDetail"></div></div>\';',
      '  }',

      // CV tab
      '  if(hasCV){',
      '    var withCV=sorted.filter(function(r){return r.cvRes;});',
      '    h+=\'<div class="tab-pane fade" id="rUniCV">\';',
      '    h+=\'<div class="card mb-3"><div class="card-header fw-semibold">CV Summary</div><div class="card-body">\';',
      '    h+=\'<table class="table table-sm table-striped"><thead><tr><th class="sortable-th">Variable</th><th class="sortable-th">Median P</th><th class="sortable-th">MAD</th><th class="sortable-th">Iterations</th></tr></thead><tbody>\';',
      '    withCV.forEach(function(r){',
      '      var cvp=ip?r.cvRes.summary.pvals.interaction:r.cvRes.summary.pvals.pval;',
      '      var cvm=ip?r.cvRes.summary.pvals.mad_interaction:r.cvRes.summary.pvals.mad_pval;',
      '      h+=\'<tr><td><strong>\'+r.variable+\'</strong></td><td>\'+fp(cvp)+\'</td><td>\'+fp(cvm)+\'</td><td>\'+r.cvRes.nSuccess+"/"+r.cvRes.nTotal+\'</td></tr>\';',
      '    });',
      '    h+=\'</tbody></table></div></div></div>\';',
      '  }',

      '  h+=\'</div>\';', // close tab-content
      '  root.innerHTML=h;',

      // Wire biomarker selector: Training
      '  var tSel=document.getElementById("rUniTrainSel");',
      '  if(tSel){',
      '    var showTrain=function(){',
      '      var item=sorted[parseInt(tSel.value)];',
      '      var el=document.getElementById("rUniTrainDetail");if(!el)return;',
      '      if(!item){el.innerHTML="";return;}',
      '      var d=\'<div class="row mb-2"><div class="col"><h6>\'+iR(item.variable,item.direction,item.threshold)+\'</h6></div></div>\';',
      '      if(ip&&item.groupStats){d+=\'<div class="card mb-3"><div class="card-header fw-semibold">Interaction Plot (Training)</div><div class="card-body"><canvas id="rUniTrainPlot" class="chart" width="560" height="360"></canvas></div></div>\';}',
      '      if(item.bootCutoffs&&item.bootCutoffs.length>0){d+=\'<div class="card mb-3"><div class="card-header fw-semibold">Bootstrap Cutoff Distribution</div><div class="card-body"><canvas id="rUniTrainHist" class="chart" width="560" height="280"></canvas></div></div>\';}',
      '      if(item.evaluation)d+=pvTable(item.evaluation,"Training");',
      '      if(item.groupStats)d+=gsTable(item.groupStats,"Training Set");',
      '      el.innerHTML=d;',
      '      if(ip&&item.groupStats)drawInteraction("rUniTrainPlot",item.groupStats);',
      '      if(item.bootCutoffs&&item.bootCutoffs.length>0)drawHistogram("rUniTrainHist",item.bootCutoffs,item.threshold,item.variable);',
      '      initSort();',
      '    };',
      '    tSel.addEventListener("change",showTrain);showTrain();',
      '  }',

      // Wire biomarker selector: Test
      '  var teSel=document.getElementById("rUniTestSel");',
      '  if(teSel){',
      '    var showTest=function(){',
      '      var varName=teSel.value;',
      '      var item=sorted.find(function(r){return r.variable===varName;});',
      '      var el=document.getElementById("rUniTestDetail");if(!el||!item)return;',
      '      var d=\'<div class="row mb-2"><div class="col"><h6>Test: \'+iR(item.variable,item.direction,item.threshold)+\'</h6></div></div>\';',
      '      if(ip&&item.testGroupStats){d+=\'<div class="card mb-3"><div class="card-header fw-semibold">Interaction Plot (Test)</div><div class="card-body"><canvas id="rUniTestPlot" class="chart" width="560" height="360"></canvas></div></div>\';}',
      '      if(item.testEvaluation)d+=pvTable(item.testEvaluation,"Test");',
      '      if(item.testGroupStats)d+=gsTable(item.testGroupStats,"Test Set");',
      '      el.innerHTML=d;',
      '      if(ip&&item.testGroupStats)drawInteraction("rUniTestPlot",item.testGroupStats);',
      '      initSort();',
      '    };',
      '    teSel.addEventListener("change",showTest);showTest();',
      '  }',
      '}',

      // === Multivariate rendering ===
      'function renderMulti(){',
      '  var root=document.getElementById("multiSection");if(!root)return;',
      '  var m=D.multivariate;if(!m||!m.rules||!m.rules.length)return;',
      '  var hasTest=m.testEvaluation!=null||m.testGroupStats!=null;',
      '  var hasCV=m.cvRes!=null;',

      // Inner tabs
      '  var h=\'<ul class="nav nav-pills nav-fill mb-3" role="tablist">\';',
      '  h+=\'<li class="nav-item"><button class="nav-link active" data-bs-toggle="pill" data-bs-target="#rMultiSig" type="button">Signature</button></li>\';',
      '  h+=\'<li class="nav-item"><button class="nav-link" data-bs-toggle="pill" data-bs-target="#rMultiTrain" type="button">Training</button></li>\';',
      '  if(hasTest)h+=\'<li class="nav-item"><button class="nav-link" data-bs-toggle="pill" data-bs-target="#rMultiTest" type="button">Test Results</button></li>\';',
      '  if(hasCV)h+=\'<li class="nav-item"><button class="nav-link" data-bs-toggle="pill" data-bs-target="#rMultiCV" type="button">Cross-Validation</button></li>\';',
      '  h+=\'</ul><div class="tab-content">\';',

      // Signature tab
      '  h+=\'<div class="tab-pane fade show active" id="rMultiSig"><div class="row"><div class="col-lg-7">\';',
      // Value boxes
      '  var nTotal=0;if(D.univariate&&D.univariate.length>0)nTotal=(D.univariate[0].nSigPos||0)+(D.univariate[0].nSigNeg||0);',
      '  var nsp=m.sigpPrcnt!=null&&nTotal>0?Math.round(m.sigpPrcnt*nTotal):"NA";',
      '  var nsn=m.sigpPrcnt!=null&&nTotal>0?nTotal-nsp:"NA";',
      '  h+=\'<div class="row g-2 mb-3">\'+vbox("Sequential Rules",m.rules.length,"vb-info")+vbox("N(sig+)",nsp,"vb-success")+vbox("N(sig-)",nsn,"vb-secondary")+\'</div>\';',
      // Rules table
      '  h+=\'<div class="card mb-3"><div class="card-header fw-semibold">Sequential Signature</div><div class="card-body">\';',
      '  h+=\'<p class="text-muted small">sig+ if ALL rules satisfied (AND-conjunction)</p>\';',
      '  h+=\'<table class="table table-sm table-striped"><thead><tr><th>Step</th><th>Variable</th><th>Signature</th><th>LogLik</th></tr></thead><tbody>\';',
      '  m.rules.forEach(function(r,i){h+=\'<tr><td>\'+(i+1)+\'</td><td><strong>\'+r.variable+\'</strong></td><td>\'+iR(r.variable,r.direction,r.threshold)+\'</td><td>\'+(r.logLik!=null?r.logLik.toFixed(4):"NA")+\'</td></tr>\';});',
      '  h+=\'</tbody></table>\';',
      '  h+=\'<p><strong>Signature:</strong> \'+m.rules.map(function(r){return iR(r.variable,r.direction,r.threshold);}).join(" AND ")+\'</p>\';',
      '  h+=\'</div></div></div>\';', // close col-lg-7
      // Aggregate p-values
      '  h+=\'<div class="col-lg-5">\';',
      '  if(m.trainEvaluation)h+=pvTable(m.trainEvaluation,"Aggregate");',
      '  h+=\'</div></div></div>\';', // close row, tab-pane

      // Training tab
      '  h+=\'<div class="tab-pane fade" id="rMultiTrain">\';',
      '  if(ip&&m.trainGroupStats){h+=\'<div class="card mb-3"><div class="card-header fw-semibold">Interaction Plot (Training)</div><div class="card-body"><canvas id="rMultiTrainPlot" class="chart" width="560" height="360"></canvas></div></div>\';}',
      '  if(m.trainGroupStats)h+=gsTable(m.trainGroupStats,"Training Set");',
      '  if(m.trainEvaluation)h+=pvTable(m.trainEvaluation,"Training");',
      '  h+=\'</div>\';',

      // Test tab
      '  if(hasTest){',
      '    h+=\'<div class="tab-pane fade" id="rMultiTest">\';',
      '    if(ip&&m.testGroupStats){h+=\'<div class="card mb-3"><div class="card-header fw-semibold">Interaction Plot (Test)</div><div class="card-body"><canvas id="rMultiTestPlot" class="chart" width="560" height="360"></canvas></div></div>\';}',
      '    if(m.testGroupStats)h+=gsTable(m.testGroupStats,"Test Set");',
      '    if(m.testEvaluation)h+=pvTable(m.testEvaluation,"Test");',
      '    h+=\'</div>\';',
      '  }',

      // CV tab
      '  if(hasCV&&m.cvRes.summary){',
      '    var cv=m.cvRes,s=cv.summary;',
      '    var cvKey=ip?s.pvals.interaction:s.pvals.pval;',
      '    var cvMad=ip?s.pvals.mad_interaction:s.pvals.mad_pval;',
      '    h+=\'<div class="tab-pane fade" id="rMultiCV">\';',
      '    h+=\'<div class="row g-2 mb-3">\'+vbox("Median CV P",fp(cvKey),"vb-info")+vbox("MAD",fp(cvMad),"vb-secondary")+vbox("Successful",cv.nSuccess+"/"+cv.nTotal,"vb-primary")+\'</div>\';',
      // CV p-values table
      '    h+=\'<div class="card mb-3"><div class="card-header fw-semibold">CV P-values (Median & MAD)</div><div class="card-body"><table class="table table-sm table-striped"><thead><tr><th>Test</th><th>Median P</th><th>MAD</th></tr></thead><tbody>\';',
      '    var pv=s.pvals,pk=Object.keys(pv).filter(function(k){return k.indexOf("mad_")!==0;});',
      '    pk.forEach(function(k){h+=\'<tr><td>\'+(PVAL_LABELS[k]||k)+\'</td><td class="\'+pClsTd(pv[k])+\'">\'+fp(pv[k])+\'</td><td>\'+fp(pv["mad_"+k])+\'</td></tr>\';});',
      '    h+=\'</tbody></table></div></div>\';',
      // CV group stats
      '    if(s.groupStats)h+=gsTable(s.groupStats,"Cross-Validation");',
      '    if(ip&&s.groupStats){h+=\'<div class="card mb-3"><div class="card-header fw-semibold">CV Interaction Plot</div><div class="card-body"><canvas id="rMultiCVPlot" class="chart" width="560" height="360"></canvas></div></div>\';}',
      '    h+=\'</div>\';',
      '  }',

      '  h+=\'</div>\';', // close tab-content
      '  root.innerHTML=h;',

      // Render multi charts
      '  setTimeout(function(){',
      '    if(ip&&m.trainGroupStats)drawInteraction("rMultiTrainPlot",m.trainGroupStats);',
      '    if(ip&&m.testGroupStats)drawInteraction("rMultiTestPlot",m.testGroupStats);',
      '    if(ip&&m.cvRes&&m.cvRes.summary&&m.cvRes.summary.groupStats)drawInteraction("rMultiCVPlot",m.cvRes.summary.groupStats);',
      '  },100);',
      '}',

      // === Tab-switch: render charts when tab becomes visible ===
      'document.addEventListener("shown.bs.tab",function(){',
      '  setTimeout(function(){',
      '    document.querySelectorAll("canvas.chart").forEach(function(c){',
      '      if(c.getContext("2d").__rendered)return;',
      '    });',
      '    var m=D.multivariate;',
      '    if(m){',
      '      if(D.isPredictive&&m.trainGroupStats)drawInteraction("rMultiTrainPlot",m.trainGroupStats);',
      '      if(D.isPredictive&&m.testGroupStats)drawInteraction("rMultiTestPlot",m.testGroupStats);',
      '      if(D.isPredictive&&m.cvRes&&m.cvRes.summary&&m.cvRes.summary.groupStats)drawInteraction("rMultiCVPlot",m.cvRes.summary.groupStats);',
      '    }',
      '  },100);',
      '});',

      // === Init ===
      'document.addEventListener("DOMContentLoaded",function(){',
      '  renderUni();',
      '  renderMulti();',
      '  initSort();',
      '});',

      '})();'
    ].join('\n');
  }

  // ============================================================
  // Session save/load
  // ============================================================

  function exportSession() {
    var config = {};
    if (App.state.config) {
      var keys = Object.keys(App.state.config);
      for (var i = 0; i < keys.length; i++) {
        if (keys[i] !== 'dataTrain' && keys[i] !== 'dataTest') {
          config[keys[i]] = App.state.config[keys[i]];
        }
      }
    }

    var session = {
      version: 1,
      timestamp: new Date().toISOString(),
      roles: App.state.roles,
      config: config,
      results: App.state.results,
      curationLog: App.state.curationLog,
    };

    var json = JSON.stringify(session, null, 2);
    downloadBlob('seqbatting_session_' + dateStr() + '.json', json, 'application/json');
  }

  function loadSession(e) {
    var file = e.target.files[0];
    if (!file) return;

    var reader = new FileReader();
    reader.onload = function(evt) {
      try {
        var session = JSON.parse(evt.target.result);

        if (session.version !== 1) {
          App.showToast('Unsupported session version.', 'danger');
          return;
        }

        if (session.roles) App.state.roles = session.roles;
        if (session.results) {
          App.state.results = session.results;
          App.unlockResults();
        }
        if (session.curationLog) App.state.curationLog = session.curationLog;
        if (session.config) App.state.config = session.config;

        App.showToast('Session loaded successfully.', 'success');
        render();
      } catch (err) {
        App.showToast('Error loading session: ' + err.message, 'danger');
      }
    };
    reader.readAsText(file);
  }

  // ============================================================
  // Utility
  // ============================================================

  function escapeHtml(str) {
    return String(str).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  // ============================================================
  // Module initialization
  // ============================================================

  document.addEventListener('DOMContentLoaded', function() {
    render();
  });

  document.addEventListener('shown.bs.tab', function(e) {
    if (e.target.id === 'tab-report-btn') {
      render();
    }
  });

})();
