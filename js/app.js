/**
 * app.js — Main entry point for the Sequential BATTing HTML App
 *
 * Manages shared state, tab visibility, dark mode, toast notifications.
 * Sets window.App for UI module access.
 */

(function() {
  'use strict';

  // ============================================================
  // Shared State
  // ============================================================

  var state = {
    rawData: null,
    columns: null,
    curatedData: null,
    curationLog: [],
    encodingMap: {},   // structured encoding metadata for interpretRule()
    roles: null,
    config: null,
    results: null,
  };

  // ============================================================
  // Tab Management
  // ============================================================

  function setTabVisible(tabName, visible) {
    var btn = document.getElementById('tab-' + tabName + '-btn');
    if (!btn) return;
    if (visible) {
      btn.classList.remove('tab-hidden');
    } else {
      btn.classList.add('tab-hidden');
    }
  }

  function activateTab(tabName) {
    var btn = document.getElementById('tab-' + tabName + '-btn');
    if (btn) {
      var tab = new bootstrap.Tab(btn);
      tab.show();
    }
  }

  // ============================================================
  // Wizard Flow Helpers
  // ============================================================

  function unlockConfig() {
    setTabVisible('config', true);
    activateTab('config');
  }

  function unlockRun() {
    setTabVisible('run', true);
    activateTab('run');
  }

  function unlockResults() {
    setTabVisible('results', true);
    setTabVisible('report', true);
    activateTab('results');
  }

  function invalidateResults() {
    state.results = null;
    setTabVisible('results', false);
    setTabVisible('report', false);
    setTabVisible('deepdives', false);
  }

  function resetWizard() {
    state.rawData = null;
    state.columns = null;
    state.curatedData = null;
    state.curationLog = [];
    state.encodingMap = {};
    state.roles = null;
    state.config = null;
    state.results = null;
    setTabVisible('config', false);
    setTabVisible('run', false);
    setTabVisible('results', false);
    setTabVisible('report', false);
    setTabVisible('deepdives', false);
    activateTab('data');
  }

  // ============================================================
  // Dark Mode
  // ============================================================

  function initDarkMode() {
    var toggle = document.getElementById('darkModeToggle');
    var icon = document.getElementById('darkModeIcon');
    if (!toggle) return;

    var saved = localStorage.getItem('sb-dark-mode');
    if (saved === 'true') {
      document.documentElement.setAttribute('data-bs-theme', 'dark');
      icon.className = 'bi bi-sun';
    }

    toggle.addEventListener('click', function() {
      var isDark = document.documentElement.getAttribute('data-bs-theme') === 'dark';
      if (isDark) {
        document.documentElement.setAttribute('data-bs-theme', 'light');
        icon.className = 'bi bi-moon-stars';
        localStorage.setItem('sb-dark-mode', 'false');
      } else {
        document.documentElement.setAttribute('data-bs-theme', 'dark');
        icon.className = 'bi bi-sun';
        localStorage.setItem('sb-dark-mode', 'true');
      }
    });
  }

  // ============================================================
  // Toast Notifications
  // ============================================================

  var toastContainer;

  function ensureToastContainer() {
    if (!toastContainer) {
      toastContainer = document.createElement('div');
      toastContainer.className = 'toast-container position-fixed bottom-0 end-0 p-3';
      toastContainer.style.zIndex = '1090';
      document.body.appendChild(toastContainer);
    }
    return toastContainer;
  }

  function showToast(message, type, delay) {
    if (!type) type = 'info';
    if (!delay) delay = 4000;
    var container = ensureToastContainer();
    var iconMap = {
      success: 'bi-check-circle-fill',
      warning: 'bi-exclamation-triangle-fill',
      danger:  'bi-x-circle-fill',
      info:    'bi-info-circle-fill',
    };
    var id = 'toast-' + Date.now();
    var html = '<div id="' + id + '" class="toast align-items-center text-bg-' + type + ' border-0" role="alert" data-bs-delay="' + delay + '">' +
      '<div class="d-flex"><div class="toast-body">' +
      '<i class="bi ' + (iconMap[type] || iconMap.info) + ' me-1"></i>' +
      message +
      '</div><button type="button" class="btn-close btn-close-white me-2 m-auto" data-bs-dismiss="toast"></button></div></div>';
    container.insertAdjacentHTML('beforeend', html);
    var el = document.getElementById(id);
    var toast = new bootstrap.Toast(el);
    toast.show();
    el.addEventListener('hidden.bs.toast', function() { el.remove(); });
  }

  // ============================================================
  // Rule Interpretation (reverse-map encoded columns to human-readable)
  // ============================================================

  /**
   * Translate an encoded BATTing rule into a human-readable description.
   * Uses App.state.encodingMap populated by data-module.js applyEncodings().
   *
   * @param {string} variable  - Encoded column name (e.g. "race_Asian_Hispanic")
   * @param {string} direction - "<" or ">"
   * @param {number} threshold - Numeric cutoff
   * @returns {string} Human-readable rule (e.g. "race is Asian or Hispanic")
   */
  function interpretRule(variable, direction, threshold) {
    if (!variable || !direction || threshold == null || isNaN(threshold)) {
      return 'NA';
    }

    var encMap = state.encodingMap;
    if (!encMap || !encMap[variable]) {
      // No encoding — numeric variable, return plain rule
      return variable + ' ' + direction + ' ' + threshold.toFixed(4);
    }

    var info = encMap[variable];
    var originalVar = info.originalVar;
    var method = info.method;
    var mapping = info.mapping; // { levelName: numericValue, ... }

    if (method === 'onehot') {
      // Binary 0/1 column. Determine which original levels the rule selects.
      var levelsAs1 = [];
      var levelsAs0 = [];
      for (var lev in mapping) {
        if (mapping.hasOwnProperty(lev)) {
          if (mapping[lev] === 1) levelsAs1.push(lev);
          else levelsAs0.push(lev);
        }
      }

      var selected;
      if (direction === '>') {
        // e.g. > 0.5 selects value=1 group
        selected = threshold < 1 ? levelsAs1 : [];
      } else {
        // e.g. < 0.5 selects value=0 group
        selected = threshold > 0 ? levelsAs0 : [];
      }

      if (selected.length === 0) {
        return variable + ' ' + direction + ' ' + threshold.toFixed(4);
      }
      if (selected.length === 1) {
        return originalVar + ' is ' + selected[0];
      }
      return originalVar + ' in {' + selected.join(', ') + '}';

    } else if (method === 'label') {
      // Ordinal encoding: integer codes 1, 2, 3, ...
      // Find which levels satisfy the direction + threshold
      var levelNames = [];
      var levelCodes = [];
      for (var lev2 in mapping) {
        if (mapping.hasOwnProperty(lev2)) {
          levelNames.push(lev2);
          levelCodes.push(mapping[lev2]);
        }
      }
      // Sort by code
      var indices = levelCodes.map(function(_, i) { return i; });
      indices.sort(function(a, b) { return levelCodes[a] - levelCodes[b]; });
      var sortedNames = indices.map(function(i) { return levelNames[i]; });
      var sortedCodes = indices.map(function(i) { return levelCodes[i]; });

      var selected2 = [];
      for (var j = 0; j < sortedCodes.length; j++) {
        if (direction === '>' && sortedCodes[j] > threshold) {
          selected2.push(sortedNames[j]);
        } else if (direction === '<' && sortedCodes[j] < threshold) {
          selected2.push(sortedNames[j]);
        }
      }

      if (selected2.length === 0) {
        return variable + ' ' + direction + ' ' + threshold.toFixed(4);
      }
      if (selected2.length === 1) {
        return originalVar + ' is ' + selected2[0];
      }
      return originalVar + ' in {' + selected2.join(', ') + '}';
    }

    // Fallback
    return variable + ' ' + direction + ' ' + threshold.toFixed(4);
  }

  // ============================================================
  // Public API
  // ============================================================

  var App = {
    state: state,
    setTabVisible: setTabVisible,
    activateTab: activateTab,
    unlockConfig: unlockConfig,
    unlockRun: unlockRun,
    unlockResults: unlockResults,
    invalidateResults: invalidateResults,
    resetWizard: resetWizard,
    showToast: showToast,
    interpretRule: interpretRule,
  };

  window.App = App;

  // ============================================================
  // Initialization
  // ============================================================

  function init() {
    initDarkMode();

    setTabVisible('config', false);
    setTabVisible('run', false);
    setTabVisible('results', false);
    setTabVisible('report', false);
    setTabVisible('deepdives', false);

    console.log('[SeqBATTing] App initialized. Awaiting module setup.');
  }

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
  } else {
    init();
  }

})();
