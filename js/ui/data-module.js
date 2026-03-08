/**
 * data-module.js — Data upload, role assignment, encoding, missing data, validation
 *
 * 5-step wizard.
 * Depends on: window.App (from app.js)
 */

(function() {
  'use strict';

  // ============================================================
  // Utility helpers
  // ============================================================

  function detectType(values) {
    var nonNull = values.filter(function(v) { return v !== null && v !== undefined && v !== ''; });
    if (nonNull.length === 0) return 'categorical';
    var numCount = nonNull.filter(function(v) { return !isNaN(Number(v)); }).length;
    return numCount / nonNull.length > 0.8 ? 'numeric' : 'categorical';
  }

  function columnSummary(rows, col) {
    var values = rows.map(function(r) { return r[col]; });
    var nonMissing = values.filter(function(v) { return v !== null && v !== undefined && v !== '' && !Number.isNaN(v); });
    var type = detectType(values);
    var unique = new Set(nonMissing.map(String));
    return {
      column: col,
      type: type,
      n: nonMissing.length,
      missing: values.length - nonMissing.length,
      pctMissing: ((values.length - nonMissing.length) / values.length * 100).toFixed(1),
      unique: unique.size,
    };
  }

  function initTooltips(container) {
    if (typeof bootstrap === 'undefined' || !bootstrap.Tooltip) return;
    var els = (container || document).querySelectorAll('[data-bs-toggle="tooltip"]');
    els.forEach(function(el) {
      // Dispose existing tooltip if any, then create new
      var existing = bootstrap.Tooltip.getInstance(el);
      if (existing) existing.dispose();
      new bootstrap.Tooltip(el);
    });
  }

  function coerceNumeric(rows, columns) {
    var types = {};
    columns.forEach(function(col) {
      types[col] = detectType(rows.map(function(r) { return r[col]; }));
    });
    rows.forEach(function(row) {
      columns.forEach(function(col) {
        if (types[col] === 'numeric') {
          var v = row[col];
          if (v === null || v === undefined || v === '') {
            row[col] = null;
          } else {
            var n = Number(v);
            row[col] = isNaN(n) ? null : n;
          }
        }
      });
    });
    return types;
  }

  // ============================================================
  // Step rendering
  // ============================================================

  var currentStep = 1;
  var colTypes = {};
  var catEncodings = {};

  function render() {
    var root = document.getElementById('data-module');
    root.innerHTML = '';

    var stepLabels = [
      'Upload Data',
      'Variable Roles',
      'Categorical Encoding',
      'Missing Data',
      'Validation & Summary',
    ];
    var label = document.createElement('div');
    label.className = 'wizard-step-label';
    label.textContent = 'Step ' + currentStep + ' of 5: ' + stepLabels[currentStep - 1];
    root.appendChild(label);

    switch (currentStep) {
      case 1: renderStep1(root); break;
      case 2: renderStep2(root); break;
      case 3: renderStep3(root); break;
      case 4: renderStep4(root); break;
      case 5: renderStep5(root); break;
    }
  }

  // ---- Step 1: Upload ----

  function renderStep1(root) {
    var card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="card-body">' +
      '<div class="row">' +
        '<div class="col-md-4">' +
          '<div class="mb-3">' +
            '<label for="fileInput" class="form-label fw-semibold">Upload Data File</label>' +
            '<input type="file" class="form-control" id="fileInput" accept=".csv,.tsv,.xlsx,.xls">' +
            '<div class="form-text">Accepted: CSV, TSV, Excel (.xlsx)</div>' +
          '</div>' +
          '<hr>' +
          '<label class="form-label fw-semibold">Or generate simulated data:</label>' +
          '<div class="row g-2 mb-2">' +
            '<div class="col-6">' +
              '<label class="form-label form-label-sm">N (sample size)</label>' +
              '<input type="number" class="form-control form-control-sm" id="simN" value="200" min="20" max="5000">' +
            '</div>' +
            '<div class="col-6">' +
              '<label class="form-label form-label-sm">k (markers)</label>' +
              '<input type="number" class="form-control form-control-sm" id="simK" value="5" min="2" max="50">' +
            '</div>' +
          '</div>' +
          '<div class="row g-2 mb-2">' +
            '<div class="col-6">' +
              '<label class="form-label form-label-sm">Type</label>' +
              '<select class="form-select form-select-sm" id="simType">' +
                '<option value="c">Continuous</option>' +
                '<option value="b">Binary</option>' +
                '<option value="s">Survival</option>' +
              '</select>' +
            '</div>' +
            '<div class="col-6">' +
              '<label class="form-label form-label-sm">Mode</label>' +
              '<select class="form-select form-select-sm" id="simMode">' +
                '<option value="predictive">Predictive</option>' +
                '<option value="prognostic">Prognostic</option>' +
              '</select>' +
            '</div>' +
          '</div>' +
          '<button class="btn btn-outline-primary btn-sm" id="genBtn">' +
            '<i class="bi bi-dice-5 me-1"></i>Generate with data.gen()' +
          '</button>' +
        '</div>' +
        '<div class="col-md-8">' +
          '<div class="card mb-2">' +
            '<div class="card-header py-1 small fw-semibold">Data Preview</div>' +
            '<div class="card-body p-2" id="previewArea">' +
              '<div class="placeholder-content py-4">' +
                '<i class="bi bi-cloud-arrow-up" style="font-size:2rem"></i>' +
                '<p class="text-muted mb-0">Upload a file or generate simulated data to begin.</p>' +
              '</div>' +
            '</div>' +
          '</div>' +
          '<div class="card">' +
            '<div class="card-header py-1 small fw-semibold">Column Summary</div>' +
            '<div class="card-body p-2" id="summaryArea"></div>' +
          '</div>' +
        '</div>' +
      '</div>' +
    '</div>' +
    '<div class="card-footer wizard-footer">' +
      '<div></div>' +
      '<button class="btn btn-primary" id="step1Next" disabled>' +
        'Next <i class="bi bi-arrow-right ms-1"></i>' +
      '</button>' +
    '</div>';
    root.appendChild(card);

    document.getElementById('fileInput').addEventListener('change', handleFileUpload);
    document.getElementById('step1Next').addEventListener('click', function() {
      currentStep = 2;
      render();
    });

    // Wire generate button
    document.getElementById('genBtn').addEventListener('click', handleGenerate);

    if (App.state.rawData) {
      showDataPreview();
      document.getElementById('step1Next').disabled = false;
    }
  }

  function handleGenerate() {
    if (!SB || !SB.DataGen) {
      App.showToast('Data generator not available.', 'danger');
      return;
    }
    var n = parseInt(document.getElementById('simN').value) || 200;
    var k = parseInt(document.getElementById('simK').value) || 5;
    var type = document.getElementById('simType').value || 'c';
    var mode = document.getElementById('simMode').value || 'predictive';
    var predictive = mode === 'predictive';

    var result = SB.DataGen.dataGen({ n: n, k: k, type: type, predictive: predictive, seed: 12345 });

    App.state.rawData = result.data;
    App.state.columns = result.columns;
    colTypes = {};
    result.columns.forEach(function(c) {
      colTypes[c] = detectType(result.data.map(function(r) { return r[c]; }));
    });
    coerceNumeric(result.data, result.columns);

    App.state.curationLog = ['Generated simulated data: N=' + n + ', k=' + k + ', type=' + type + ', mode=' + mode];
    showDataPreview();
    document.getElementById('step1Next').disabled = false;
    App.showToast('Generated ' + n + ' rows, ' + result.columns.length + ' columns', 'success');
  }

  function handleFileUpload(e) {
    var file = e.target.files[0];
    if (!file) return;

    var ext = file.name.split('.').pop().toLowerCase();

    if (ext === 'csv' || ext === 'tsv') {
      file.text().then(function(text) {
        var result = Papa.parse(text, { header: true, dynamicTyping: true, skipEmptyLines: true });
        processUploadedData(result.data, result.meta.fields, file.name);
      });
    } else if (ext === 'xlsx' || ext === 'xls') {
      file.arrayBuffer().then(function(buf) {
        var wb = XLSX.read(buf, { type: 'array' });
        var ws = wb.Sheets[wb.SheetNames[0]];
        var rows = XLSX.utils.sheet_to_json(ws);
        var cols = rows.length > 0 ? Object.keys(rows[0]) : [];
        processUploadedData(rows, cols, file.name);
      });
    } else {
      App.showToast('Unsupported file type: ' + ext, 'danger');
    }
  }

  function processUploadedData(rows, cols, filename) {
    if (!rows || rows.length === 0 || !cols || cols.length === 0) {
      App.showToast('File appears empty or could not be parsed.', 'danger');
      return;
    }

    App.state.rawData = rows;
    App.state.columns = cols;
    colTypes = {};
    cols.forEach(function(c) {
      colTypes[c] = detectType(rows.map(function(r) { return r[c]; }));
    });
    coerceNumeric(rows, cols);

    App.state.curationLog = ['Loaded ' + filename + ': ' + rows.length + ' rows, ' + cols.length + ' columns'];
    showDataPreview();
    document.getElementById('step1Next').disabled = false;
    App.showToast('Loaded ' + rows.length + ' rows, ' + cols.length + ' columns', 'success');
  }

  function showDataPreview() {
    var rows = App.state.rawData;
    var cols = App.state.columns;
    if (!rows || !cols) return;

    var previewArea = document.getElementById('previewArea');
    var previewRows = rows.slice(0, 100);
    var html = '<div style="max-height:250px;overflow:auto"><table class="table table-sm table-striped compact" style="font-size:0.8rem"><thead><tr>';
    cols.forEach(function(c) { html += '<th>' + c + '</th>'; });
    html += '</tr></thead><tbody>';
    previewRows.forEach(function(row) {
      html += '<tr>';
      cols.forEach(function(c) {
        var v = row[c];
        html += '<td>' + (v === null || v === undefined ? '<span class="text-muted">NA</span>' : v) + '</td>';
      });
      html += '</tr>';
    });
    html += '</tbody></table></div>';
    if (rows.length > 100) {
      html += '<div class="form-text">Showing first 100 of ' + rows.length + ' rows</div>';
    }
    previewArea.innerHTML = html;

    var summaryArea = document.getElementById('summaryArea');
    var summaries = cols.map(function(c) { return columnSummary(rows, c); });
    var shtml = '<table class="table table-sm table-striped compact" style="font-size:0.8rem"><thead><tr>' +
      '<th>Column</th><th>Type</th><th>N</th><th>Missing</th><th>% Missing</th><th>Unique</th></tr></thead><tbody>';
    summaries.forEach(function(s) {
      shtml += '<tr><td>' + s.column + '</td><td><span class="badge ' + (s.type === 'numeric' ? 'text-bg-primary' : 'text-bg-warning') + '">' +
        (s.type === 'numeric' ? 'num' : 'cat') + '</span></td>' +
        '<td>' + s.n + '</td><td>' + s.missing + '</td><td>' + s.pctMissing + '%</td><td>' + s.unique + '</td></tr>';
    });
    shtml += '</tbody></table>';
    summaryArea.innerHTML = shtml;
  }

  // ---- Step 2: Variable Roles ----

  function renderStep2(root) {
    var cols = App.state.columns || [];
    var noneOpt = '<option value="">(None)</option>';
    var colOpts = cols.map(function(c) { return '<option value="' + c + '">' + c + '</option>'; }).join('');

    var card = document.createElement('div');
    card.className = 'card';
    card.innerHTML = '<div class="card-body"><div class="row">' +
      '<div class="col-md-6">' +
        '<div class="mb-3"><label class="form-label fw-semibold">Response Variable (yvar)</label>' +
        '<select class="form-select" id="yvarSelect">' + noneOpt + colOpts + '</select></div>' +
        '<div class="mb-3"><label class="form-label fw-semibold">Endpoint Type</label>' +
          '<div class="form-check form-check-inline"><input class="form-check-input" type="radio" name="endpointType" id="typeC" value="c" checked><label class="form-check-label" for="typeC">Continuous</label></div>' +
          '<div class="form-check form-check-inline"><input class="form-check-input" type="radio" name="endpointType" id="typeB" value="b"><label class="form-check-label" for="typeB">Binary</label></div>' +
          '<div class="form-check form-check-inline"><input class="form-check-input" type="radio" name="endpointType" id="typeS" value="s"><label class="form-check-label" for="typeS">Survival</label></div>' +
        '</div>' +
        '<div id="survivalFields" style="display:none">' +
          '<div class="mb-3"><label class="form-label fw-semibold">Censoring Variable ' +
            '<i class="bi bi-info-circle text-muted" data-bs-toggle="tooltip" data-bs-placement="top" title="Variable indicating event/censoring status. Must contain exactly 2 unique values (e.g. 0=censored, 1=event)."></i></label>' +
          '<select class="form-select" id="censorSelect">' + noneOpt + colOpts + '</select></div>' +
          '<div class="mb-3" id="eventCodeDiv" style="display:none"><label class="form-label fw-semibold">Event Code ' +
            '<i class="bi bi-info-circle text-muted" data-bs-toggle="tooltip" data-bs-placement="top" title="Select which value of the censoring variable indicates the event occurred. The other value will be treated as censored (coded as 0)."></i></label>' +
          '<select class="form-select" id="eventCodeSelect"></select><div class="form-text" id="eventCodeInfo"></div></div>' +
        '</div><hr>' +
        '<div class="mb-3"><label class="form-label fw-semibold">Treatment Variable (optional) ' +
          '<i class="bi bi-info-circle text-muted" data-bs-toggle="tooltip" data-bs-placement="top" title="Leave as (None) for prognostic mode. If selected, the analysis tests treatment-by-subgroup interactions. Must have exactly 2 arms."></i></label>' +
        '<select class="form-select" id="trtSelect">' + noneOpt + colOpts + '</select></div>' +
        '<div id="trtRefDiv" style="display:none"><div class="mb-3"><label class="form-label fw-semibold">Treatment Reference (trtref) ' +
          '<i class="bi bi-info-circle text-muted" data-bs-toggle="tooltip" data-bs-placement="top" title="Select the treatment arm value. It will be coded as 1; the other arm as 0 (control)."></i></label>' +
        '<select class="form-select" id="trtRefSelect"></select></div></div>' +
      '</div>' +
      '<div class="col-md-6">' +
        '<label class="form-label fw-semibold">Predictors (xvars)</label>' +
        '<div class="form-text mb-2">Select variables to use as predictors. <span class="badge text-bg-primary">num</span> numeric <span class="badge text-bg-warning">cat</span> categorical</div>' +
        '<div class="mb-2"><button type="button" class="btn btn-sm btn-outline-primary me-1" id="xvarsSelectAll"><i class="bi bi-check-all me-1"></i>Select All</button>' +
        '<button type="button" class="btn btn-sm btn-outline-secondary" id="xvarsDeselectAll"><i class="bi bi-x-lg me-1"></i>Deselect All</button></div>' +
        '<div id="xvarsContainer" style="max-height:350px;overflow-y:auto;border:1px solid var(--bs-border-color);border-radius:0.25rem;padding:0.5rem"></div>' +
        '<div class="form-text mt-1" id="xvarsCount">0 selected</div>' +
      '</div>' +
    '</div></div>' +
    '<div class="card-footer wizard-footer">' +
      '<button class="btn btn-outline-secondary" id="step2Back"><i class="bi bi-arrow-left me-1"></i>Back</button>' +
      '<button class="btn btn-primary" id="step2Next" disabled>Next <i class="bi bi-arrow-right ms-1"></i></button>' +
    '</div>';
    root.appendChild(card);

    var xc = document.getElementById('xvarsContainer');
    cols.forEach(function(c) {
      var t = colTypes[c] || 'numeric';
      var badge = t === 'numeric' ? '<span class="badge text-bg-primary me-1">num</span>' : '<span class="badge text-bg-warning me-1">cat</span>';
      xc.innerHTML += '<div class="form-check"><input class="form-check-input xvar-check" type="checkbox" value="' + c + '" id="xvar-' + c + '">' +
        '<label class="form-check-label" for="xvar-' + c + '">' + badge + c + '</label></div>';
    });

    var endpointRadios = document.querySelectorAll('input[name="endpointType"]');
    endpointRadios.forEach(function(r) { r.addEventListener('change', function() {
      document.getElementById('survivalFields').style.display = document.getElementById('typeS').checked ? 'block' : 'none';
      validateStep2();
    }); });

    document.getElementById('censorSelect').addEventListener('change', function() {
      var censorVar = document.getElementById('censorSelect').value;
      if (censorVar) {
        var vals = [];
        var seen = {};
        App.state.rawData.forEach(function(r) { var v = r[censorVar]; if (v !== null && v !== undefined && !seen[v]) { seen[v] = true; vals.push(v); } });
        vals.sort();
        var ecSel = document.getElementById('eventCodeSelect');
        ecSel.innerHTML = vals.map(function(v) { return '<option value="' + v + '">' + v + '</option>'; }).join('');
        document.getElementById('eventCodeDiv').style.display = 'block';
        var info = document.getElementById('eventCodeInfo');
        if (vals.length === 2) { info.textContent = 'Will recode: ' + vals[0] + ' and ' + vals[1] + ' (select the event code)'; }
      } else {
        document.getElementById('eventCodeDiv').style.display = 'none';
      }
      validateStep2();
    });

    document.getElementById('trtSelect').addEventListener('change', function() {
      var trtVar = document.getElementById('trtSelect').value;
      if (trtVar) {
        var vals = [];
        var seen = {};
        App.state.rawData.forEach(function(r) { var v = r[trtVar]; if (v !== null && v !== undefined && !seen[v]) { seen[v] = true; vals.push(v); } });
        vals.sort();
        var trs = document.getElementById('trtRefSelect');
        trs.innerHTML = vals.map(function(v) { return '<option value="' + v + '">' + v + '</option>'; }).join('');
        document.getElementById('trtRefDiv').style.display = 'block';
      } else {
        document.getElementById('trtRefDiv').style.display = 'none';
      }
      validateStep2();
    });

    document.getElementById('yvarSelect').addEventListener('change', function() {
      var yvar = document.getElementById('yvarSelect').value;
      if (yvar && App.state.rawData) {
        var vals = App.state.rawData.map(function(r) { return r[yvar]; }).filter(function(v) { return v !== null; });
        var unique = new Set(vals.map(String));
        if (unique.size === 2) { document.getElementById('typeB').checked = true; }
        document.getElementById('survivalFields').style.display = document.getElementById('typeS').checked ? 'block' : 'none';
      }
      validateStep2();
    });

    xc.addEventListener('change', function() {
      var checked = document.querySelectorAll('.xvar-check:checked');
      document.getElementById('xvarsCount').textContent = checked.length + ' selected';
      validateStep2();
    });

    document.getElementById('xvarsSelectAll').addEventListener('click', function() {
      document.querySelectorAll('.xvar-check').forEach(function(cb) { cb.checked = true; });
      document.getElementById('xvarsCount').textContent = document.querySelectorAll('.xvar-check').length + ' selected';
      validateStep2();
    });

    document.getElementById('xvarsDeselectAll').addEventListener('click', function() {
      document.querySelectorAll('.xvar-check').forEach(function(cb) { cb.checked = false; });
      document.getElementById('xvarsCount').textContent = '0 selected';
      validateStep2();
    });

    document.getElementById('step2Back').addEventListener('click', function() { currentStep = 1; render(); });
    document.getElementById('step2Next').addEventListener('click', function() {
      saveRoles();
      var catXvars = App.state.roles.xvars.filter(function(x) { return colTypes[x] === 'categorical'; });
      currentStep = catXvars.length > 0 ? 3 : 4;
      render();
    });

    if (App.state.roles) {
      var r = App.state.roles;
      document.getElementById('yvarSelect').value = r.yvar || '';
      document.querySelector('input[name="endpointType"][value="' + r.type + '"]').checked = true;
      if (r.type === 's') document.getElementById('survivalFields').style.display = 'block';
      if (r.censorvar) document.getElementById('censorSelect').value = r.censorvar;
      if (r.trtvar) {
        document.getElementById('trtSelect').value = r.trtvar;
        document.getElementById('trtSelect').dispatchEvent(new Event('change'));
        if (r.trtref !== null) setTimeout(function() { document.getElementById('trtRefSelect').value = r.trtref; }, 50);
      }
      r.xvars.forEach(function(x) {
        var cb = document.getElementById('xvar-' + x);
        if (cb) cb.checked = true;
      });
      document.getElementById('xvarsCount').textContent = document.querySelectorAll('.xvar-check:checked').length + ' selected';
    }
    validateStep2();

    // Initialize Bootstrap tooltips
    initTooltips(root);
  }

  function validateStep2() {
    var yvar = document.getElementById('yvarSelect');
    var type = document.querySelector('input[name="endpointType"]:checked');
    var xvars = document.querySelectorAll('.xvar-check:checked');
    var valid = !!(yvar && yvar.value) && xvars.length > 0;

    if (type && type.value === 's') {
      var censor = document.getElementById('censorSelect');
      if (!censor || !censor.value) valid = false;
    }

    // --- Zero-variance check on selected predictors ---
    // Clear previous warnings
    document.querySelectorAll('.xvar-novar-badge').forEach(function(el) { el.remove(); });
    var warnDiv = document.getElementById('xvarsZeroVarWarning');
    if (warnDiv) warnDiv.remove();

    var zeroVarNames = [];
    if (App.state.rawData && xvars.length > 0) {
      xvars.forEach(function(cb) {
        var varName = cb.value;
        var vals = App.state.rawData.map(function(r) { return r[varName]; })
          .filter(function(v) { return v !== null && v !== undefined && v !== '' && !(typeof v === 'number' && isNaN(v)); });
        var unique = new Set(vals.map(String));
        var label = cb.parentElement;
        if (unique.size <= 1) {
          zeroVarNames.push(varName);
          // Add badge next to the checkbox label
          if (label && !label.querySelector('.xvar-novar-badge')) {
            var badge = document.createElement('span');
            badge.className = 'badge text-bg-danger ms-1 xvar-novar-badge';
            badge.textContent = 'no variation';
            label.appendChild(badge);
          }
        }
      });
    }

    if (zeroVarNames.length > 0) {
      valid = false;
      var xc = document.getElementById('xvarsContainer');
      if (xc) {
        var warning = document.createElement('div');
        warning.id = 'xvarsZeroVarWarning';
        warning.className = 'alert alert-danger py-1 px-2 mt-2 small mb-0';
        warning.innerHTML = '<i class="bi bi-x-circle me-1"></i><strong>Cannot proceed:</strong> ' +
          zeroVarNames.join(', ') + (zeroVarNames.length === 1 ? ' has' : ' have') +
          ' no variation (only 1 unique value). Deselect ' + (zeroVarNames.length === 1 ? 'it' : 'them') + ' to continue.';
        xc.parentElement.appendChild(warning);
      }
    }

    var btn = document.getElementById('step2Next');
    if (btn) btn.disabled = !valid;
  }

  function saveRoles() {
    var yvar = document.getElementById('yvarSelect').value;
    var type = document.querySelector('input[name="endpointType"]:checked').value;
    var censorvar = type === 's' ? (document.getElementById('censorSelect').value || null) : null;
    var trtvar = document.getElementById('trtSelect').value || null;
    var trtRefSel = document.getElementById('trtRefSelect');
    var trtref = trtvar ? (trtRefSel ? trtRefSel.value : null) : null;
    var xvars = Array.from(document.querySelectorAll('.xvar-check:checked')).map(function(cb) { return cb.value; });
    var eventCodeSel = document.getElementById('eventCodeSelect');
    var eventCode = type === 's' ? (eventCodeSel ? eventCodeSel.value : null) : null;

    App.state.roles = {
      yvar: yvar, censorvar: censorvar, trtvar: trtvar, trtref: trtref, xvars: xvars, type: type,
      trtrefOriginal: trtref,
      eventCodeOriginal: eventCode,
    };

    App.state.curationLog.push('Roles assigned: yvar=' + yvar + ', type=' + type + ', xvars=[' + xvars.join(', ') + ']' +
      (trtvar ? ', trtvar=' + trtvar + ' (ref=' + trtref + ')' : ' (prognostic mode)'));
  }

  // ---- Step 3: Categorical Encoding ----

  /** Store SortableJS instances so we can read their order later */
  var sortableInstances = {};

  function renderStep3(root) {
    var catXvars = (App.state.roles ? App.state.roles.xvars : []).filter(function(x) { return colTypes[x] === 'categorical'; });

    var card = document.createElement('div');
    card.className = 'card';
    var body = '<div class="card-body"><div class="warning-banner mb-3"><i class="bi bi-exclamation-triangle me-1"></i><strong>' +
      catXvars.length + '</strong> of your selected predictors are categorical and need encoding.</div>';

    catXvars.forEach(function(varName) {
      var levels = getCatLevels(varName);
      var nLevels = levels.length;
      var existing = catEncodings[varName] || { method: 'onehot', levels: levels, selected: [levels[0]] };
      catEncodings[varName] = existing;

      body += '<div class="card mb-3"><div class="card-header py-2"><strong>' + escHtml(varName) + '</strong> (' + nLevels + ' levels)</div>';
      body += '<div class="card-body">';

      // Warning for many levels
      if (nLevels > 20) {
        body += '<div class="alert alert-warning py-1 px-2 small mb-2"><i class="bi bi-exclamation-triangle me-1"></i>This variable has ' + nLevels + ' categories. Consider grouping levels or excluding.</div>';
      }

      // Encoding method radio buttons
      body += '<div class="mb-2">' +
        '<div class="form-check form-check-inline"><input class="form-check-input enc-method" type="radio" name="enc-' + varName + '" id="enc-onehot-' + varName + '" value="onehot" ' + (existing.method === 'onehot' ? 'checked' : '') + ' data-var="' + varName + '"><label class="form-check-label" for="enc-onehot-' + varName + '">One-Hot (binary)</label></div>' +
        '<div class="form-check form-check-inline"><input class="form-check-input enc-method" type="radio" name="enc-' + varName + '" id="enc-label-' + varName + '" value="label" ' + (existing.method === 'label' ? 'checked' : '') + ' data-var="' + varName + '"><label class="form-check-label" for="enc-label-' + varName + '">Label (ordinal)</label></div>' +
        '</div>';

      // Detail area (filled dynamically per method)
      body += '<div id="enc-detail-' + varName + '"></div>';

      body += '</div></div>'; // close card-body, card
    });

    body += '</div>';
    card.innerHTML = body +
      '<div class="card-footer wizard-footer">' +
        '<button class="btn btn-outline-secondary" id="step3Back"><i class="bi bi-arrow-left me-1"></i>Back</button>' +
        '<button class="btn btn-primary" id="step3Next">Apply Encoding & Continue <i class="bi bi-arrow-right ms-1"></i></button>' +
      '</div>';
    root.appendChild(card);

    // Render initial detail panels and wire radio change events
    sortableInstances = {};
    catXvars.forEach(function(varName) {
      renderEncDetail(varName);
      var radios = document.querySelectorAll('input[name="enc-' + varName + '"]');
      radios.forEach(function(radio) {
        radio.addEventListener('change', function() {
          catEncodings[varName].method = this.value;
          renderEncDetail(varName);
        });
      });
    });

    document.getElementById('step3Back').addEventListener('click', function() { currentStep = 2; render(); });
    document.getElementById('step3Next').addEventListener('click', function() {
      // Read final state from UI before applying
      catXvars.forEach(function(varName) { readEncState(varName); });
      applyEncodings();
      currentStep = 4;
      render();
    });
  }

  /** Get sorted unique levels for a categorical variable */
  function getCatLevels(varName) {
    var levels = [], seen = {};
    App.state.rawData.forEach(function(r) {
      var v = r[varName];
      if (v !== null && v !== undefined && v !== '' && !seen[String(v)]) {
        seen[String(v)] = true;
        levels.push(String(v));
      }
    });
    levels.sort();
    return levels;
  }

  /** Render the detail panel for a given variable based on current encoding method */
  function renderEncDetail(varName) {
    var el = document.getElementById('enc-detail-' + varName);
    if (!el) return;
    var enc = catEncodings[varName];
    var levels = enc.levels;
    var nLevels = levels.length;
    var method = enc.method;

    var h = '';

    if (nLevels === 2) {
      // Auto binary — same display for both methods
      if (method === 'onehot') {
        h = '<div class="form-text">Binary: <strong>' + escHtml(levels[0]) + '</strong>=1, <strong>' + escHtml(levels[1]) + '</strong>=0</div>';
      } else {
        h = '<div class="form-text">Ordinal: <strong>' + escHtml(levels[0]) + '</strong>=1, <strong>' + escHtml(levels[1]) + '</strong>=2</div>';
      }
    } else if (method === 'onehot') {
      // Multi-level one-hot: checkboxes to pick which levels = 1
      var selected = enc.selected || [levels[0]];
      h = '<label class="form-label small fw-semibold">Select levels to code as 1 (rest = 0):</label>';
      h += '<div class="enc-checkboxes" id="enc-checks-' + varName + '">';
      levels.forEach(function(lev) {
        var chk = selected.indexOf(lev) >= 0 ? ' checked' : '';
        var id = 'enc-chk-' + varName + '-' + lev.replace(/[^a-zA-Z0-9]/g, '_');
        h += '<div class="form-check"><input class="form-check-input enc-level-check" type="checkbox" id="' + id + '" value="' + escHtml(lev) + '" data-var="' + varName + '"' + chk + '>' +
          '<label class="form-check-label" for="' + id + '">' + escHtml(lev) + '</label></div>';
      });
      h += '</div>';
      h += '<div class="form-text text-muted mt-1">Checked levels = 1, unchecked = 0. A single binary column <code>' + escHtml(varName) + '_...</code> will be created.</div>';
    } else {
      // Multi-level label/ordinal: SortableJS drag-to-reorder
      var order = enc.order || levels;
      h = '<label class="form-label small fw-semibold">Drag to reorder levels from lowest (1) to highest:</label>';
      h += '<ul class="list-group sortable-levels" id="enc-sortable-' + varName + '">';
      order.forEach(function(lev, i) {
        h += '<li class="list-group-item list-group-item-action py-1 px-2 d-flex align-items-center" data-value="' + escHtml(lev) + '">' +
          '<i class="bi bi-grip-vertical me-2 text-muted"></i>' +
          '<span class="me-auto">' + escHtml(lev) + '</span>' +
          '<span class="badge bg-secondary">' + (i + 1) + '</span></li>';
      });
      h += '</ul>';
      h += '<div class="form-text text-muted mt-1">Top = 1 (lowest), bottom = ' + nLevels + ' (highest). Column is encoded in place.</div>';
    }

    el.innerHTML = h;

    // Initialize SortableJS for label method (>2 levels)
    if (nLevels > 2 && method === 'label') {
      var sortEl = document.getElementById('enc-sortable-' + varName);
      if (sortEl && typeof Sortable !== 'undefined') {
        sortableInstances[varName] = Sortable.create(sortEl, {
          animation: 150,
          handle: '.bi-grip-vertical',
          ghostClass: 'list-group-item-primary',
          onEnd: function() { updateSortBadges(varName); }
        });
      }
    }
  }

  /** Update badge numbers after reorder */
  function updateSortBadges(varName) {
    var sortEl = document.getElementById('enc-sortable-' + varName);
    if (!sortEl) return;
    var items = sortEl.querySelectorAll('li');
    items.forEach(function(li, i) {
      var badge = li.querySelector('.badge');
      if (badge) badge.textContent = (i + 1);
    });
  }

  /** Read the current encoding state from the UI before applying */
  function readEncState(varName) {
    var enc = catEncodings[varName];
    if (!enc) return;
    var levels = enc.levels;

    if (levels.length === 2) return; // auto, nothing to read

    if (enc.method === 'onehot') {
      // Read checked checkboxes
      var checks = document.querySelectorAll('#enc-checks-' + varName + ' .enc-level-check:checked');
      var selected = [];
      checks.forEach(function(chk) { selected.push(chk.value); });
      if (selected.length === 0) selected = [levels[0]]; // fallback
      enc.selected = selected;
    } else {
      // Read order from SortableJS
      var sortEl = document.getElementById('enc-sortable-' + varName);
      if (sortEl) {
        var items = sortEl.querySelectorAll('li');
        var order = [];
        items.forEach(function(li) { order.push(li.dataset.value); });
        if (order.length > 0) enc.order = order;
      }
    }
  }

  function escHtml(s) {
    return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
  }

  function applyEncodings() {
    var rows = JSON.parse(JSON.stringify(App.state.rawData));
    var cols = App.state.columns.slice();
    var roles = App.state.roles;
    var newXvars = [];
    var logEntries = [];
    var encodingMap = {}; // structured metadata for interpretRule()

    roles.xvars.forEach(function(varName) {
      if (colTypes[varName] !== 'categorical') {
        newXvars.push(varName);
        return;
      }

      var enc = catEncodings[varName] || { method: 'onehot' };
      var levels = getCatLevels(varName);

      if (enc.method === 'label') {
        // Label (ordinal) encoding: use user-specified order or alphabetical fallback
        var order = enc.order || levels;
        var map = {};
        order.forEach(function(lev, i) { map[String(lev)] = i + 1; });
        rows.forEach(function(r) {
          var v = r[varName];
          r[varName] = v !== null && v !== undefined ? (map[String(v)] != null ? map[String(v)] : null) : null;
        });
        newXvars.push(varName);
        logEntries.push(varName + ': ordinal encoding (' + order.join(' < ') + ')');
        encodingMap[varName] = { originalVar: varName, method: 'label', mapping: map };
      } else {
        // One-hot (binary) encoding
        if (levels.length === 2) {
          // Auto binary: first alphabetical level = 1 (matching Shiny convention)
          var binMap = {};
          binMap[String(levels[0])] = 1;
          binMap[String(levels[1])] = 0;
          rows.forEach(function(r) {
            var v = r[varName];
            r[varName] = v !== null && v !== undefined ? (String(v) === String(levels[0]) ? 1 : 0) : null;
          });
          newXvars.push(varName);
          logEntries.push(varName + ': binary (' + levels[0] + '=1, ' + levels[1] + '=0)');
          encodingMap[varName] = { originalVar: varName, method: 'onehot', mapping: binMap };
        } else {
          // Multi-level: create single binary column (selected levels = 1, rest = 0)
          var selected = enc.selected || [levels[0]];
          // Generate new column name from selected levels
          var safeLevels = selected.map(function(l) { return String(l).replace(/[^a-zA-Z0-9]/g, '_'); });
          var newCol = varName + '_' + safeLevels.join('_');
          var multiMap = {};
          levels.forEach(function(lev) { multiMap[String(lev)] = selected.indexOf(String(lev)) >= 0 ? 1 : 0; });

          rows.forEach(function(r) {
            var v = r[varName];
            r[newCol] = v !== null && v !== undefined ? (selected.indexOf(String(v)) >= 0 ? 1 : 0) : null;
          });

          // Remove old column values (keep in rows but don't add to xvars)
          if (cols.indexOf(newCol) === -1) cols.push(newCol);
          newXvars.push(newCol);
          logEntries.push(varName + ': one-hot binary (' + selected.join(', ') + '=1, rest=0) -> ' + newCol);
          encodingMap[newCol] = { originalVar: varName, method: 'onehot', mapping: multiMap };
        }
      }
    });

    App.state.curatedData = rows;
    App.state.roles.xvars = newXvars;
    App.state.columns = cols;
    App.state.encodingMap = encodingMap;
    logEntries.forEach(function(e) { App.state.curationLog.push(e); });
  }

  // ---- Step 4: Missing Data ----

  function renderStep4(root) {
    var data = App.state.curatedData || App.state.rawData;
    var roles = App.state.roles;
    var relevantCols = [roles.yvar, roles.censorvar, roles.trtvar].concat(roles.xvars).filter(Boolean);

    var missingRows = 0;
    var missingCols = {};
    relevantCols.forEach(function(c) { missingCols[c] = 0; });
    data.forEach(function(row) {
      var hasNull = false;
      relevantCols.forEach(function(c) {
        if (row[c] === null || row[c] === undefined || row[c] === '' || (typeof row[c] === 'number' && isNaN(row[c]))) {
          missingCols[c]++;
          hasNull = true;
        }
      });
      if (hasNull) missingRows++;
    });

    var card = document.createElement('div');
    card.className = 'card';
    var body = '<div class="card-body">';

    if (missingRows === 0) {
      body += '<div class="curation-step-complete"><i class="bi bi-check-circle me-1"></i>No missing data in analysis variables. All ' + data.length + ' rows are complete.</div>';
    } else {
      body += '<div class="warning-banner mb-3"><i class="bi bi-exclamation-triangle me-1"></i><strong>' + missingRows + '</strong> rows have incomplete data in analysis variables (' + (missingRows / data.length * 100).toFixed(1) + '% of dataset).</div>';
      body += '<table class="table table-sm table-striped compact" style="font-size:0.85rem"><thead><tr><th>Column</th><th>Missing</th><th>% Missing</th></tr></thead><tbody>';
      relevantCols.forEach(function(c) {
        if (missingCols[c] > 0) {
          body += '<tr><td>' + c + '</td><td>' + missingCols[c] + '</td><td>' + (missingCols[c] / data.length * 100).toFixed(1) + '%</td></tr>';
        }
      });
      body += '</tbody></table>';
      if (missingRows / data.length > 0.1) {
        body += '<div class="warning-banner"><i class="bi bi-exclamation-circle me-1"></i>More than 10% of rows have missing data. Complete-case analysis assumes data is Missing Completely At Random (MCAR). Results may be biased if this assumption is violated.</div>';
      }
      body += '<button class="btn btn-outline-warning btn-sm mt-2" id="removeMissing"><i class="bi bi-eraser me-1"></i>Remove Incomplete Cases (' + missingRows + ' rows)</button>';
    }

    body += '</div>';
    card.innerHTML = body +
      '<div class="card-footer wizard-footer">' +
        '<button class="btn btn-outline-secondary" id="step4Back"><i class="bi bi-arrow-left me-1"></i>Back</button>' +
        '<button class="btn btn-primary" id="step4Next">Next <i class="bi bi-arrow-right ms-1"></i></button>' +
      '</div>';
    root.appendChild(card);

    var step4Back = document.getElementById('step4Back');
    if (step4Back) step4Back.addEventListener('click', function() {
      var catXvars = (App.state.roles ? App.state.roles.xvars : []).filter(function(x) { return colTypes[x] === 'categorical'; });
      currentStep = catXvars.length > 0 ? 3 : 2;
      render();
    });
    var step4Next = document.getElementById('step4Next');
    if (step4Next) step4Next.addEventListener('click', function() {
      if (!App.state.curatedData) {
        App.state.curatedData = JSON.parse(JSON.stringify(App.state.rawData));
      }
      currentStep = 5;
      render();
    });
    var removeBtn = document.getElementById('removeMissing');
    if (removeBtn) removeBtn.addEventListener('click', function() {
      var source = App.state.curatedData || App.state.rawData;
      var relevantCols2 = [roles.yvar, roles.censorvar, roles.trtvar].concat(roles.xvars).filter(Boolean);
      var before = source.length;
      App.state.curatedData = source.filter(function(row) {
        return relevantCols2.every(function(c) {
          var v = row[c];
          return v !== null && v !== undefined && v !== '' && !(typeof v === 'number' && isNaN(v));
        });
      });
      var removed = before - App.state.curatedData.length;
      App.state.curationLog.push('Removed ' + removed + ' incomplete rows (' + before + ' -> ' + App.state.curatedData.length + ')');
      App.showToast('Removed ' + removed + ' rows with missing data', 'success');
      render();
    });
  }

  // ---- Step 5: Validation & Summary ----

  function renderStep5(root) {
    var data = App.state.curatedData || App.state.rawData;
    var roles = App.state.roles;
    var nObs = data.length;
    var nPred = roles.xvars.length;
    var typeLabel = { c: 'Continuous', b: 'Binary', s: 'Survival' }[roles.type];
    var modeLabel = roles.trtvar ? 'Predictive' : 'Prognostic';

    var checks = [];

    if (roles.trtvar) {
      var counts = {};
      data.forEach(function(r) {
        var v = String(r[roles.trtvar]);
        counts[v] = (counts[v] || 0) + 1;
      });
      var vals = Object.values(counts);
      var ratio = Math.min.apply(null, vals) / Math.max.apply(null, vals);
      if (ratio < 0.3) {
        checks.push({ type: 'warning', msg: 'Treatment arms are imbalanced (ratio ' + ratio.toFixed(2) + '): ' + JSON.stringify(counts) });
      } else {
        checks.push({ type: 'success', msg: 'Treatment arms balanced: ' + JSON.stringify(counts) });
      }
    }

    if (nObs < 50) {
      checks.push({ type: 'warning', msg: 'Small sample size (' + nObs + '). Results may be unstable.' });
    } else {
      checks.push({ type: 'success', msg: 'Sample size: ' + nObs + ' observations' });
    }

    var zeroVar = [];
    roles.xvars.forEach(function(x) {
      var vals = data.map(function(r) { return r[x]; }).filter(function(v) { return v !== null && v !== undefined; });
      var unique = new Set(vals.map(String));
      if (unique.size <= 1) zeroVar.push(x);
    });
    if (zeroVar.length > 0) {
      checks.push({ type: 'danger', msg: 'Zero-variance predictors detected: ' + zeroVar.join(', ') + '. These will be excluded.' });
    }

    var card = document.createElement('div');
    card.className = 'card';
    var body = '<div class="card-body">' +
      '<div class="row value-box-row g-2 mb-3">' +
        '<div class="col-md-3"><div class="value-box value-box-primary"><div class="vb-icon"><i class="bi bi-people"></i></div><div class="vb-content"><div class="vb-title">Observations</div><div class="vb-value">' + nObs + '</div></div></div></div>' +
        '<div class="col-md-3"><div class="value-box value-box-info"><div class="vb-icon"><i class="bi bi-diagram-3"></i></div><div class="vb-content"><div class="vb-title">Predictors</div><div class="vb-value">' + nPred + '</div></div></div></div>' +
        '<div class="col-md-3"><div class="value-box value-box-success"><div class="vb-icon"><i class="bi bi-clipboard-data"></i></div><div class="vb-content"><div class="vb-title">Endpoint</div><div class="vb-value">' + typeLabel + '</div></div></div></div>' +
        '<div class="col-md-3"><div class="value-box value-box-secondary"><div class="vb-icon"><i class="bi bi-search"></i></div><div class="vb-content"><div class="vb-title">Mode</div><div class="vb-value">' + modeLabel + '</div></div></div></div>' +
      '</div>';

    checks.forEach(function(chk) {
      var icon = chk.type === 'success' ? 'bi-check-circle text-success' :
                 chk.type === 'warning' ? 'bi-exclamation-triangle text-warning' :
                 'bi-x-circle text-danger';
      body += '<div class="mb-1"><i class="bi ' + icon + ' me-1"></i>' + chk.msg + '</div>';
    });

    var allVars = [
      { name: roles.yvar, role: 'Response' },
    ];
    if (roles.censorvar) allVars.push({ name: roles.censorvar, role: 'Censor' });
    if (roles.trtvar) allVars.push({ name: roles.trtvar, role: 'Treatment' });
    roles.xvars.forEach(function(x) { allVars.push({ name: x, role: 'Predictor' }); });

    body += '<div class="card mt-3"><div class="card-header py-1 small fw-semibold">Analysis Dataset Summary</div><div class="card-body p-2">' +
      '<table class="table table-sm table-striped compact" style="font-size:0.85rem"><thead><tr><th>Variable</th><th>Role</th><th>Type</th><th>N</th><th>Unique</th></tr></thead><tbody>';
    allVars.forEach(function(v) {
      var s = columnSummary(data, v.name);
      body += '<tr><td>' + v.name + '</td><td>' + v.role + '</td><td>' + s.type + '</td><td>' + s.n + '</td><td>' + s.unique + '</td></tr>';
    });
    body += '</tbody></table></div></div>';

    body += '<div class="card mt-3"><div class="card-header py-1 small fw-semibold">Curation Log</div>' +
      '<div class="card-body p-2"><pre class="console-log mb-0" style="max-height:150px">' + App.state.curationLog.join('\n') + '</pre></div></div>';

    body += '</div>';

    var hasError = checks.some(function(c) { return c.type === 'danger'; });
    card.innerHTML = body +
      '<div class="card-footer wizard-footer">' +
        '<button class="btn btn-outline-secondary" id="step5Back"><i class="bi bi-arrow-left me-1"></i>Back</button>' +
        '<button class="btn ' + (hasError ? 'btn-danger disabled' : 'btn-success') + '" id="step5Confirm" ' + (hasError ? 'disabled' : '') + '>' +
          '<i class="bi bi-check-lg me-1"></i>Confirm & Unlock Configuration' +
        '</button>' +
      '</div>';
    root.appendChild(card);

    var step5Back = document.getElementById('step5Back');
    if (step5Back) step5Back.addEventListener('click', function() { currentStep = 4; render(); });
    var step5Confirm = document.getElementById('step5Confirm');
    if (step5Confirm) step5Confirm.addEventListener('click', function() {
      if (!App.state.curatedData) {
        App.state.curatedData = JSON.parse(JSON.stringify(App.state.rawData));
      }

      if (roles.trtvar && roles.trtref !== null) {
        App.state.curatedData.forEach(function(row) {
          row[roles.trtvar] = String(row[roles.trtvar]) === String(roles.trtref) ? 1 : 0;
        });
        App.state.curationLog.push('Treatment recoded: ' + roles.trtref + '=1, other=0');
      }

      if (roles.type === 's' && roles.eventCodeOriginal !== null && roles.censorvar) {
        App.state.curatedData.forEach(function(row) {
          row[roles.censorvar] = String(row[roles.censorvar]) === String(roles.eventCodeOriginal) ? 1 : 0;
        });
        App.state.curationLog.push('Censoring recoded: ' + roles.eventCodeOriginal + '=1 (event), other=0');
      }

      if (zeroVar.length > 0) {
        roles.xvars = roles.xvars.filter(function(x) { return zeroVar.indexOf(x) === -1; });
        App.state.curationLog.push('Removed zero-variance predictors: ' + zeroVar.join(', '));
      }

      App.state.curationLog.push('Data confirmed. Ready for configuration.');
      App.unlockConfig();
      App.showToast('Data confirmed. Configure analysis parameters.', 'success');
    });
  }

  // ============================================================
  // Module initialization
  // ============================================================

  function initDataModule() {
    render();
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initDataModule);
  } else {
    initDataModule();
  }

})();
