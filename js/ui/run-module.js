/**
 * run-module.js — Analysis execution control
 *
 * Depends on: window.App
 *
 * Fixes applied:
 *   - logBuffer persists console log messages across tab-switch re-renders
 *   - startTimer uses live DOM lookups so timer survives re-renders
 *   - render() restores running state (buttons, timer, log) after DOM rebuild
 *   - Worker creation wrapped in try-catch (surfaces file:// SecurityError)
 */

(function() {
  'use strict';

  var worker = null;
  var isRunning = false;
  var timerInterval = null;
  var timerStart = 0;
  var logBuffer = [];       // persists log messages across re-renders
  var runComplete = false;  // true after a run finishes (success or failure)

  // ============================================================
  // Render
  // ============================================================

  function render() {
    var root = document.getElementById('run-module');
    if (!root) return;

    var config = App.state.config;
    var roles = App.state.roles;
    if (!config || !roles) {
      root.innerHTML = '<div class="placeholder-content"><i class="bi bi-gear"></i><h5>Configuration Required</h5><p class="text-muted">Complete the Configuration step first.</p></div>';
      return;
    }

    var typeLabel = { c: 'Continuous', b: 'Binary', s: 'Survival' }[roles.type] || roles.type;
    var modeLabel = roles.trtvar ? 'Predictive' : 'Prognostic';
    var nTrain = config.dataTrain ? config.dataTrain.length : '?';
    var nTest = config.dataTest ? config.dataTest.length : 0;

    root.innerHTML =
      '<div class="row g-3">' +
        '<div class="col-12"><div class="row value-box-row g-2">' +
          '<div class="col-md-2"><div class="value-box value-box-primary"><div class="vb-icon"><i class="bi bi-people"></i></div><div class="vb-content"><div class="vb-title">Train N</div><div class="vb-value">' + nTrain + '</div></div></div></div>' +
          '<div class="col-md-2"><div class="value-box value-box-info"><div class="vb-icon"><i class="bi bi-diagram-3"></i></div><div class="vb-content"><div class="vb-title">Predictors</div><div class="vb-value">' + roles.xvars.length + '</div></div></div></div>' +
          '<div class="col-md-2"><div class="value-box value-box-success"><div class="vb-icon"><i class="bi bi-clipboard-data"></i></div><div class="vb-content"><div class="vb-title">Endpoint</div><div class="vb-value">' + typeLabel + '</div></div></div></div>' +
          '<div class="col-md-2"><div class="value-box value-box-secondary"><div class="vb-icon"><i class="bi bi-search"></i></div><div class="vb-content"><div class="vb-title">Mode</div><div class="vb-value">' + modeLabel + '</div></div></div></div>' +
          '<div class="col-md-2"><div class="value-box value-box-warning"><div class="vb-icon"><i class="bi bi-bootstrap"></i></div><div class="vb-content"><div class="vb-title">n.boot</div><div class="vb-value">' + config.nBoot + '</div></div></div></div>' +
          '<div class="col-md-2"><div class="value-box ' + (nTest > 0 ? 'value-box-danger' : 'value-box-secondary') + '"><div class="vb-icon"><i class="bi bi-scissors"></i></div><div class="vb-content"><div class="vb-title">Test N</div><div class="vb-value">' + (nTest || 'None') + '</div></div></div></div>' +
        '</div></div>' +
        '<div class="col-12"><div class="card"><div class="card-body d-flex align-items-center gap-3">' +
          '<button class="btn btn-lg btn-success" id="runBtn"><i class="bi bi-play-fill me-1"></i>Run Analysis</button>' +
          '<button class="btn btn-outline-danger" id="stopBtn" disabled><i class="bi bi-stop-fill me-1"></i>Stop</button>' +
          '<div class="ms-3" id="runTimer" style="display:none"><span class="text-muted">Elapsed: </span><span class="fw-bold" id="elapsedTime">0.0s</span></div>' +
          '<div class="spinner-border text-success ms-2" role="status" id="runSpinner" style="display:none"><span class="visually-hidden">Running...</span></div>' +
        '</div></div></div>' +
        '<div class="col-12"><div class="card"><div class="card-header py-2 d-flex justify-content-between align-items-center">' +
          '<span class="fw-semibold"><i class="bi bi-terminal me-1"></i>Console Log</span>' +
          '<button class="btn btn-sm btn-outline-secondary" id="clearLog"><i class="bi bi-trash me-1"></i>Clear</button>' +
        '</div><div class="card-body p-2"><pre class="console-log mb-0" id="consoleLog" style="min-height:350px;max-height:600px"></pre></div></div></div>' +
      '</div>';

    wireEvents();
    restoreState();
  }

  // ============================================================
  // Restore running/completed state after DOM rebuild
  // ============================================================

  function restoreState() {
    // Replay buffered log messages
    if (logBuffer.length > 0) {
      var log = document.getElementById('consoleLog');
      if (log) {
        log.textContent = logBuffer.join('\n') + '\n';
        log.scrollTop = log.scrollHeight;
      }
    }

    // Restore button/timer/spinner state if analysis is in progress
    if (isRunning) {
      var runBtn = document.getElementById('runBtn');
      var stopBtn = document.getElementById('stopBtn');
      var spinner = document.getElementById('runSpinner');
      var timerEl = document.getElementById('runTimer');
      var elapsedEl = document.getElementById('elapsedTime');

      if (runBtn) { runBtn.disabled = true; runBtn.classList.add('btn-running'); }
      if (stopBtn) stopBtn.disabled = false;
      if (spinner) spinner.style.display = 'inline-block';
      if (timerEl) timerEl.style.display = 'inline';
      if (elapsedEl && timerStart > 0) {
        var elapsed = ((Date.now() - timerStart) / 1000).toFixed(1);
        elapsedEl.textContent = elapsed + 's';
      }
    }
  }

  // ============================================================
  // Event wiring
  // ============================================================

  function wireEvents() {
    var runBtn = document.getElementById('runBtn');
    if (runBtn) runBtn.addEventListener('click', startRun);
    var stopBtn = document.getElementById('stopBtn');
    if (stopBtn) stopBtn.addEventListener('click', stopRun);
    var clearLog = document.getElementById('clearLog');
    if (clearLog) clearLog.addEventListener('click', function() {
      logBuffer = [];
      var log = document.getElementById('consoleLog');
      if (log) log.textContent = '';
    });
  }

  // ============================================================
  // Console logging (persisted in logBuffer)
  // ============================================================

  function logMessage(msg) {
    var ts = new Date().toLocaleTimeString();
    var line = '[' + ts + '] ' + msg;
    logBuffer.push(line);

    var log = document.getElementById('consoleLog');
    if (log) {
      log.textContent += line + '\n';
      log.scrollTop = log.scrollHeight;
    }
    // Also log to browser console for debugging
    console.log('[SeqBATTing]', msg);
  }

  // ============================================================
  // Timer (uses live DOM lookups to survive re-renders)
  // ============================================================

  function startTimer() {
    timerStart = Date.now();
    var timerEl = document.getElementById('runTimer');
    if (timerEl) timerEl.style.display = 'inline';

    timerInterval = setInterval(function() {
      var elapsed = ((Date.now() - timerStart) / 1000).toFixed(1);
      // Live lookup — element may have been recreated by render()
      var elapsedEl = document.getElementById('elapsedTime');
      var timerDiv = document.getElementById('runTimer');
      if (elapsedEl) elapsedEl.textContent = elapsed + 's';
      if (timerDiv) timerDiv.style.display = 'inline';
    }, 100);
  }

  function stopTimer() {
    if (timerInterval) {
      clearInterval(timerInterval);
      timerInterval = null;
    }
  }

  // ============================================================
  // Start analysis
  // ============================================================

  function startRun() {
    if (isRunning) return;
    isRunning = true;
    runComplete = false;

    var runBtn = document.getElementById('runBtn');
    var stopBtn = document.getElementById('stopBtn');
    var spinner = document.getElementById('runSpinner');

    if (runBtn) { runBtn.disabled = true; runBtn.classList.add('btn-running'); }
    if (stopBtn) stopBtn.disabled = false;
    if (spinner) spinner.style.display = 'inline-block';

    App.invalidateResults();

    // Clear previous log for new run
    logBuffer = [];
    var logEl = document.getElementById('consoleLog');
    if (logEl) logEl.textContent = '';

    startTimer();
    logMessage('Starting analysis...');

    // Create Web Worker — wrapped in try-catch for file:// SecurityError
    try {
      worker = new Worker('js/worker.js');
    } catch (err) {
      logMessage('ERROR: Failed to create Web Worker: ' + err.message);
      logMessage('');
      logMessage('If you opened this page via file://, Web Workers may be blocked.');
      logMessage('Try serving the app via a local web server instead:');
      logMessage('  python3 -m http.server 8000');
      logMessage('  Then open http://localhost:8000');
      finishRun(false);
      return;
    }

    worker.onmessage = function(event) {
      var data = event.data;
      if (data.type === 'progress') {
        logMessage(data.message);
      } else if (data.type === 'result') {
        logMessage('Analysis completed successfully.');
        App.state.results = {
          univariate: data.payload.univariate,
          multivariate: data.payload.multivariate,
          timing: data.payload.timing,
          success: true,
        };
        finishRun(true);
      } else if (data.type === 'error') {
        logMessage('ERROR: ' + data.message);
        finishRun(false);
      }
    };

    worker.onerror = function(err) {
      logMessage('Worker error: ' + (err.message || 'Unknown error'));
      logMessage('Check the browser developer console (F12) for details.');
      finishRun(false);
    };

    var config = App.state.config;
    var roles = App.state.roles;

    try {
      worker.postMessage({
        type: 'run',
        payload: {
          data: config.dataTrain || App.state.curatedData,
          roles: {
            yvar: roles.yvar,
            censorvar: roles.censorvar,
            trtvar: roles.trtvar,
            xvars: roles.xvars,
            type: roles.type,
          },
          config: {
            analysisScope: config.analysisScope,
            desRes: config.desRes,
            nBoot: config.nBoot,
            minSigpPrcnt: config.minSigpPrcnt,
            randomSeed: config.randomSeed,
            dataTrain: config.dataTrain,
            dataTest: config.dataTest,
            enableCV: config.enableCV || false,
            kFold: config.kFold || 5,
            cvIter: config.cvIter || 20,
            maxIter: config.maxIter || 500,
          },
        },
      });
    } catch (err) {
      logMessage('ERROR: Failed to send data to worker: ' + err.message);
      finishRun(false);
    }
  }

  // ============================================================
  // Stop analysis
  // ============================================================

  function stopRun() {
    if (worker) {
      worker.terminate();
      worker = null;
      logMessage('Analysis stopped by user.');
      finishRun(false);
    }
  }

  // ============================================================
  // Finish analysis
  // ============================================================

  function finishRun(success) {
    isRunning = false;
    runComplete = true;
    stopTimer();

    var runBtn = document.getElementById('runBtn');
    var stopBtn = document.getElementById('stopBtn');
    var spinner = document.getElementById('runSpinner');

    if (runBtn) { runBtn.disabled = false; runBtn.classList.remove('btn-running'); }
    if (stopBtn) stopBtn.disabled = true;
    if (spinner) spinner.style.display = 'none';

    if (worker) {
      worker.terminate();
      worker = null;
    }

    if (success) {
      App.unlockResults();
      App.showToast('Analysis complete! Results tab unlocked.', 'success');
    } else {
      App.showToast('Analysis did not complete successfully.', 'warning');
    }
  }

  // ============================================================
  // Module initialization
  // ============================================================

  function initRunModule() {
    render();
  }

  document.addEventListener('shown.bs.tab', function(e) {
    if (e.target.id === 'tab-run-btn') render();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initRunModule);
  } else {
    initRunModule();
  }

})();
