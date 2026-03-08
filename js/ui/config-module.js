/**
 * config-module.js — Algorithm parameter configuration
 *
 * Depends on: window.App
 */

(function() {
  'use strict';

  var DEFAULTS = {
    desRes: 'larger',
    analysisScope: 'both',
    nBoot: 25,
    minSigpPrcnt: 0.20,
    enablePrefilter: false,
    filterMethod: 'univariate',
    preFilter: 'opt',
    enableCV: false,
    kFold: 5,
    cvIter: 20,
    mcIter: 20,
    maxIter: 500,
    splitMethod: 'none',
    customSplit: 0.75,
    randomSeed: 12345,
  };

  /** Shorthand to create a tooltip info-circle icon */
  function ttip(text) {
    return '<i class="bi bi-info-circle text-muted ms-1" data-bs-toggle="tooltip" data-bs-placement="top" title="' +
      text.replace(/"/g, '&quot;') + '"></i>';
  }

  function initTooltips(container) {
    if (typeof bootstrap === 'undefined' || !bootstrap.Tooltip) return;
    var els = (container || document).querySelectorAll('[data-bs-toggle="tooltip"]');
    els.forEach(function(el) {
      var existing = bootstrap.Tooltip.getInstance(el);
      if (existing) existing.dispose();
      new bootstrap.Tooltip(el);
    });
  }

  function render() {
    var root = document.getElementById('config-module');
    if (!root) return;

    var roles = App.state.roles;
    var endpointType = roles ? roles.type : 'c';
    var typeLabel = { c: 'Continuous', b: 'Binary', s: 'Survival' }[endpointType] || endpointType;
    var modeLabel = roles && roles.trtvar ? 'Predictive' : 'Prognostic';

    var cfg = App.state.config || {};
    var desRes        = cfg.desRes != null ? cfg.desRes : DEFAULTS.desRes;
    var analysisScope = cfg.analysisScope != null ? cfg.analysisScope : DEFAULTS.analysisScope;
    var nBoot         = cfg.nBoot != null ? cfg.nBoot : DEFAULTS.nBoot;
    var minSigpPrcnt  = cfg.minSigpPrcnt != null ? cfg.minSigpPrcnt : DEFAULTS.minSigpPrcnt;
    var enablePrefilter = cfg.enablePrefilter != null ? cfg.enablePrefilter : DEFAULTS.enablePrefilter;
    var filterMethod  = cfg.filterMethod != null ? cfg.filterMethod : DEFAULTS.filterMethod;
    var preFilter     = cfg.preFilter != null ? cfg.preFilter : DEFAULTS.preFilter;
    var enableCV      = cfg.enableCV != null ? cfg.enableCV : DEFAULTS.enableCV;
    var kFold         = cfg.kFold != null ? cfg.kFold : DEFAULTS.kFold;
    var cvIter        = cfg.cvIter != null ? cfg.cvIter : DEFAULTS.cvIter;
    var mcIter        = cfg.mcIter != null ? cfg.mcIter : DEFAULTS.mcIter;
    var maxIter       = cfg.maxIter != null ? cfg.maxIter : DEFAULTS.maxIter;
    var splitMethod   = cfg.splitMethod != null ? cfg.splitMethod : DEFAULTS.splitMethod;
    var customSplit   = cfg.customSplit != null ? cfg.customSplit : DEFAULTS.customSplit;
    var randomSeed    = cfg.randomSeed != null ? cfg.randomSeed : DEFAULTS.randomSeed;

    // Using the same HTML layout as the original, just inlined as string
    root.innerHTML =
      '<div class="sb-layout-sidebar">' +
        '<div class="sb-sidebar"><div class="card"><div class="card-header fw-semibold"><i class="bi bi-sliders me-1"></i>Algorithm Parameters</div>' +
        '<div class="card-body p-2"><div class="accordion" id="configAccordion">' +

        // Panel 1: Analysis Settings
        '<div class="accordion-item"><h2 class="accordion-header"><button class="accordion-button" type="button" data-bs-toggle="collapse" data-bs-target="#panelAnalysis" aria-expanded="true"><i class="bi bi-sliders me-2"></i>Analysis Settings</button></h2>' +
        '<div id="panelAnalysis" class="accordion-collapse collapse show" data-bs-parent="#configAccordion"><div class="accordion-body">' +
          '<div class="mb-3"><label class="form-label fw-semibold">Endpoint Type</label><input type="text" class="form-control form-control-sm" value="' + typeLabel + '" readonly disabled><div class="form-text">Auto-detected from data step.</div></div>' +
          '<div class="mb-3"><label class="form-label fw-semibold">Analysis Type</label><input type="text" class="form-control form-control-sm" value="' + modeLabel + '" readonly disabled></div><hr>' +
          '<div class="mb-3"><label class="form-label fw-semibold">Desired Response Direction ' + ttip('For continuous/survival: larger means higher values = better outcome. For binary: larger means response (1) is desired.') + '</label>' +
            '<div class="form-check"><input class="form-check-input cfg-input" type="radio" name="desRes" id="desResLarger" value="larger" ' + (desRes === 'larger' ? 'checked' : '') + '><label class="form-check-label" for="desResLarger">Larger is better</label></div>' +
            '<div class="form-check"><input class="form-check-input cfg-input" type="radio" name="desRes" id="desResSmaller" value="smaller" ' + (desRes === 'smaller' ? 'checked' : '') + '><label class="form-check-label" for="desResSmaller">Smaller is better</label></div></div>' +
          '<div class="mb-3"><label class="form-label fw-semibold">Analysis Scope ' + ttip('Univariate tests each biomarker independently. Multivariate builds a combined AND-logic signature via sequential forward selection. Both runs both analyses.') + '</label>' +
            '<div class="form-check"><input class="form-check-input cfg-input" type="radio" name="analysisScope" id="scopeUni" value="univariate" ' + (analysisScope === 'univariate' ? 'checked' : '') + '><label class="form-check-label" for="scopeUni">Univariate BATTing</label></div>' +
            '<div class="form-check"><input class="form-check-input cfg-input" type="radio" name="analysisScope" id="scopeMulti" value="multivariate" ' + (analysisScope === 'multivariate' ? 'checked' : '') + '><label class="form-check-label" for="scopeMulti">Multivariate Sequential BATTing</label></div>' +
            '<div class="form-check"><input class="form-check-input cfg-input" type="radio" name="analysisScope" id="scopeBoth" value="both" ' + (analysisScope === 'both' ? 'checked' : '') + '><label class="form-check-label" for="scopeBoth">Both</label></div></div><hr>' +
          '<div class="mb-2"><label class="form-label fw-semibold" for="cfgSeed">Random Seed ' + ttip('Seed for reproducible random number generation. Same seed = same results.') + '</label><input type="number" class="form-control form-control-sm cfg-input" id="cfgSeed" value="' + randomSeed + '" min="1" max="2147483647" step="1"></div>' +
        '</div></div></div>' +

        // Panel 2: Bootstrap & Subgroup
        '<div class="accordion-item"><h2 class="accordion-header"><button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#panelBootstrap"><i class="bi bi-bootstrap me-2"></i>Bootstrap &amp; Subgroup</button></h2>' +
        '<div id="panelBootstrap" class="accordion-collapse collapse" data-bs-parent="#configAccordion"><div class="accordion-body">' +
          '<div class="mb-3"><label class="form-label fw-semibold" for="cfgNBoot">Bootstrap Samples (n.boot) ' + ttip('Number of bootstrap resamples for cutoff estimation. Higher = more stable cutoffs but slower. Recommended: 25-100 for exploration, 200+ for final analysis.') + '</label><input type="number" class="form-control form-control-sm cfg-input" id="cfgNBoot" value="' + nBoot + '" min="10" max="500" step="5"></div>' +
          '<div class="mb-2"><label class="form-label fw-semibold" for="cfgMinSig">Min Subgroup Size (min.sigp.prcnt) ' + ttip('Minimum proportion of patients that must be in the sig+ subgroup. Prevents trivially small or large subgroups. Default: 20%.') + '</label><input type="range" class="form-range cfg-input" id="cfgMinSig" min="0.05" max="0.50" step="0.05" value="' + minSigpPrcnt + '">' +
          '<div class="d-flex justify-content-between"><span class="form-text">5%</span><span class="form-text fw-semibold" id="cfgMinSigLabel">' + Math.round(minSigpPrcnt * 100) + '%</span><span class="form-text">50%</span></div></div>' +
        '</div></div></div>' +

        // Panel 3: Pre-filtering
        '<div class="accordion-item"><h2 class="accordion-header"><button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#panelPrefilter"><i class="bi bi-funnel me-2"></i>Pre-filtering</button></h2>' +
        '<div id="panelPrefilter" class="accordion-collapse collapse" data-bs-parent="#configAccordion"><div class="accordion-body">' +
          '<div class="form-check form-switch mb-3"><input class="form-check-input cfg-input" type="checkbox" role="switch" id="cfgEnablePrefilter" ' + (enablePrefilter ? 'checked' : '') + '><label class="form-check-label fw-semibold" for="cfgEnablePrefilter">Enable Pre-filtering ' + ttip('Reduce the number of predictors before BATTing using a screening method. Useful when many predictors are available.') + '</label></div>' +
          '<div id="prefilterOptions" style="display:' + (enablePrefilter ? 'block' : 'none') + '">' +
            '<div class="mb-3"><label class="form-label fw-semibold" for="cfgFilterMethod">Filter Method</label><select class="form-select form-select-sm cfg-input" id="cfgFilterMethod"><option value="univariate" ' + (filterMethod === 'univariate' ? 'selected' : '') + '>Univariate</option><option value="glmnet" disabled>GLMNET (not available)</option><option value="unicart" disabled>UniCART (not available)</option></select></div>' +
            '<div class="mb-2"><label class="form-label fw-semibold" for="cfgPreFilter">Number of Predictors (pre.filter)</label><input type="text" class="form-control form-control-sm cfg-input" id="cfgPreFilter" value="' + preFilter + '" placeholder="\'opt\' or integer"></div>' +
          '</div>' +
        '</div></div></div>' +

        // Panel 4: Cross-Validation
        '<div class="accordion-item"><h2 class="accordion-header"><button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#panelCV"><i class="bi bi-arrow-repeat me-2"></i>Cross-Validation</button></h2>' +
        '<div id="panelCV" class="accordion-collapse collapse" data-bs-parent="#configAccordion"><div class="accordion-body">' +
          '<div class="form-check form-switch mb-3"><input class="form-check-input cfg-input" type="checkbox" role="switch" id="cfgEnableCV" ' + (enableCV ? 'checked' : '') + '><label class="form-check-label fw-semibold" for="cfgEnableCV">Enable Cross-Validation ' + ttip('Assess signature stability using repeated k-fold cross-validation. Trains on k-1 folds, validates on hold-out fold.') + '</label></div>' +
          '<div id="cvOptions" style="display:' + (enableCV ? 'block' : 'none') + '">' +
            '<div class="mb-3"><label class="form-label fw-semibold">CV Folds ' + ttip('Number of cross-validation folds (k). Data is split into k parts; each part is used once as the test set.') + '</label><input type="number" class="form-control form-control-sm cfg-input" id="cfgKFold" value="' + kFold + '" min="3" max="10"></div>' +
            '<div class="mb-3"><label class="form-label fw-semibold">Successful Iterations (cv.iter) ' + ttip('Number of successful CV iterations required. A CV iteration is successful when the algorithm finds a signature on the training folds.') + '</label><input type="number" class="form-control form-control-sm cfg-input" id="cfgCVIter" value="' + cvIter + '" min="5" max="100"></div>' +
            '<div class="mb-3"><label class="form-label fw-semibold">Monte Carlo Iterations (mc.iter) ' + ttip('Number of Monte Carlo repetitions per CV fold for variance estimation.') + '</label><input type="number" class="form-control form-control-sm cfg-input" id="cfgMCIter" value="' + mcIter + '" min="5" max="50"></div>' +
            '<div class="mb-2"><label class="form-label fw-semibold">Max Total Iterations (max.iter) ' + ttip('Maximum total CV attempts. Stops even if the required number of successful iterations has not been reached.') + '</label><input type="number" class="form-control form-control-sm cfg-input" id="cfgMaxIter" value="' + maxIter + '" min="100" max="1000" step="100"></div>' +
          '</div>' +
        '</div></div></div>' +

        // Panel 5: Train/Test Split
        '<div class="accordion-item"><h2 class="accordion-header"><button class="accordion-button collapsed" type="button" data-bs-toggle="collapse" data-bs-target="#panelSplit"><i class="bi bi-scissors me-2"></i>Train/Test Split</button></h2>' +
        '<div id="panelSplit" class="accordion-collapse collapse" data-bs-parent="#configAccordion"><div class="accordion-body">' +
          '<div class="mb-3"><label class="form-label fw-semibold">Split Method</label>' +
            '<div class="form-check"><input class="form-check-input cfg-input" type="radio" name="splitMethod" id="splitNone" value="none" ' + (splitMethod === 'none' ? 'checked' : '') + '><label class="form-check-label" for="splitNone">No split (full data)</label></div>' +
            '<div class="form-check"><input class="form-check-input cfg-input" type="radio" name="splitMethod" id="split70" value="0.7" ' + (splitMethod === '0.7' ? 'checked' : '') + '><label class="form-check-label" for="split70">70/30</label></div>' +
            '<div class="form-check"><input class="form-check-input cfg-input" type="radio" name="splitMethod" id="split80" value="0.8" ' + (splitMethod === '0.8' ? 'checked' : '') + '><label class="form-check-label" for="split80">80/20</label></div>' +
            '<div class="form-check"><input class="form-check-input cfg-input" type="radio" name="splitMethod" id="splitCustom" value="custom" ' + (splitMethod === 'custom' ? 'checked' : '') + '><label class="form-check-label" for="splitCustom">Custom</label></div></div>' +
          '<div id="customSplitDiv" style="display:' + (splitMethod === 'custom' ? 'block' : 'none') + '"><label class="form-label fw-semibold" for="cfgCustomSplit">Training Proportion</label><input type="range" class="form-range cfg-input" id="cfgCustomSplit" min="0.50" max="0.90" step="0.05" value="' + customSplit + '"><div class="d-flex justify-content-between"><span class="form-text">50%</span><span class="form-text fw-semibold" id="cfgCustomSplitLabel">' + Math.round(customSplit * 100) + '%</span><span class="form-text">90%</span></div></div>' +
        '</div></div></div>' +

        '</div><hr>' +
        '<div class="d-flex gap-2"><button class="btn btn-outline-secondary btn-sm flex-grow-1" id="cfgReset"><i class="bi bi-arrow-counterclockwise me-1"></i>Reset Defaults</button></div>' +
        '<div class="d-grid mt-2"><button class="btn btn-success" id="cfgConfirm"><i class="bi bi-check-lg me-1"></i>Confirm &amp; Proceed to Run</button></div>' +
        '</div></div></div>' +

        // Main panel
        '<div class="sb-main"><div class="card"><div class="card-header fw-semibold"><i class="bi bi-clipboard-check me-1"></i>Configuration Summary</div>' +
        '<div class="card-body"><pre class="console-log mb-0" id="cfgSummary" style="min-height:300px">Loading...</pre></div></div></div>' +

      '</div>';

    wireEvents();
    updateSummary();
    initTooltips(root);
  }

  function wireEvents() {
    document.querySelectorAll('.cfg-input').forEach(function(el) {
      el.addEventListener('change', updateSummary);
      el.addEventListener('input', updateSummary);
    });

    var cfgMinSig = document.getElementById('cfgMinSig');
    if (cfgMinSig) cfgMinSig.addEventListener('input', function(e) {
      var lbl = document.getElementById('cfgMinSigLabel');
      if (lbl) lbl.textContent = Math.round(e.target.value * 100) + '%';
    });

    var cfgCustomSplit = document.getElementById('cfgCustomSplit');
    if (cfgCustomSplit) cfgCustomSplit.addEventListener('input', function(e) {
      var lbl = document.getElementById('cfgCustomSplitLabel');
      if (lbl) lbl.textContent = Math.round(e.target.value * 100) + '%';
    });

    var cfgEnablePrefilter = document.getElementById('cfgEnablePrefilter');
    if (cfgEnablePrefilter) cfgEnablePrefilter.addEventListener('change', function(e) {
      var div = document.getElementById('prefilterOptions');
      if (div) div.style.display = e.target.checked ? 'block' : 'none';
    });

    var cfgEnableCV = document.getElementById('cfgEnableCV');
    if (cfgEnableCV) cfgEnableCV.addEventListener('change', function(e) {
      var div = document.getElementById('cvOptions');
      if (div) div.style.display = e.target.checked ? 'block' : 'none';
    });

    document.querySelectorAll('input[name="splitMethod"]').forEach(function(r) {
      r.addEventListener('change', function() {
        var div = document.getElementById('customSplitDiv');
        var splitCustom = document.getElementById('splitCustom');
        if (div) div.style.display = splitCustom && splitCustom.checked ? 'block' : 'none';
      });
    });

    var cfgReset = document.getElementById('cfgReset');
    if (cfgReset) cfgReset.addEventListener('click', function() {
      App.state.config = null;
      render();
      App.showToast('Parameters reset to defaults.', 'info');
    });

    var cfgConfirm = document.getElementById('cfgConfirm');
    if (cfgConfirm) cfgConfirm.addEventListener('click', confirmConfig);
  }

  function readValues() {
    var roles = App.state.roles;
    var endpointType = roles ? roles.type : 'c';
    var desRes = (document.querySelector('input[name="desRes"]:checked') || {}).value || DEFAULTS.desRes;
    var analysisScope = (document.querySelector('input[name="analysisScope"]:checked') || {}).value || DEFAULTS.analysisScope;
    var nBoot = parseInt((document.getElementById('cfgNBoot') || {}).value) || DEFAULTS.nBoot;
    var minSigpPrcnt = parseFloat((document.getElementById('cfgMinSig') || {}).value) || DEFAULTS.minSigpPrcnt;
    var enablePrefilter = document.getElementById('cfgEnablePrefilter') ? document.getElementById('cfgEnablePrefilter').checked : DEFAULTS.enablePrefilter;
    var filterMethod = (document.getElementById('cfgFilterMethod') || {}).value || DEFAULTS.filterMethod;
    var preFilter = (document.getElementById('cfgPreFilter') || {}).value || DEFAULTS.preFilter;
    var enableCV = document.getElementById('cfgEnableCV') ? document.getElementById('cfgEnableCV').checked : DEFAULTS.enableCV;
    var kFold = parseInt((document.getElementById('cfgKFold') || {}).value) || DEFAULTS.kFold;
    var cvIter = parseInt((document.getElementById('cfgCVIter') || {}).value) || DEFAULTS.cvIter;
    var mcIter = parseInt((document.getElementById('cfgMCIter') || {}).value) || DEFAULTS.mcIter;
    var maxIter = parseInt((document.getElementById('cfgMaxIter') || {}).value) || DEFAULTS.maxIter;
    var splitMethod = (document.querySelector('input[name="splitMethod"]:checked') || {}).value || DEFAULTS.splitMethod;
    var customSplit = parseFloat((document.getElementById('cfgCustomSplit') || {}).value) || DEFAULTS.customSplit;
    var randomSeed = parseInt((document.getElementById('cfgSeed') || {}).value) || DEFAULTS.randomSeed;

    return {
      endpointType: endpointType, desRes: desRes, analysisScope: analysisScope, nBoot: nBoot, minSigpPrcnt: minSigpPrcnt,
      enablePrefilter: enablePrefilter, filterMethod: filterMethod, preFilter: preFilter,
      enableCV: enableCV, kFold: kFold, cvIter: cvIter, mcIter: mcIter, maxIter: maxIter,
      splitMethod: splitMethod, customSplit: customSplit, randomSeed: randomSeed,
    };
  }

  function updateSummary() {
    var el = document.getElementById('cfgSummary');
    if (!el) return;
    var v = readValues();
    var roles = App.state.roles;
    var typeLabel = { c: 'Continuous', b: 'Binary', s: 'Survival' }[v.endpointType] || v.endpointType;
    var modeLabel = roles && roles.trtvar ? 'Predictive' : 'Prognostic';
    var splitLabel;
    switch (v.splitMethod) {
      case 'none':   splitLabel = 'No split (full data)'; break;
      case '0.7':    splitLabel = '70/30'; break;
      case '0.8':    splitLabel = '80/20'; break;
      case 'custom': splitLabel = Math.round(v.customSplit * 100) + '/' + Math.round((1 - v.customSplit) * 100); break;
      default:       splitLabel = v.splitMethod;
    }
    var prefilterLabel = v.enablePrefilter ? v.filterMethod + ' (' + v.preFilter + ')' : 'Disabled';
    var cvLabel = v.enableCV ? v.kFold + '-fold, ' + v.cvIter + ' iters (max ' + v.maxIter + ')' : 'Disabled';

    var text = '=== Configuration Summary ===\n\n' +
      'Endpoint type:     ' + typeLabel + '\n' +
      'Analysis type:     ' + modeLabel + '\n' +
      'Analysis scope:    ' + v.analysisScope + '\n' +
      'Desired response:  ' + (v.desRes === 'larger' ? 'Larger is better' : 'Smaller is better') + '\n' +
      'Bootstrap samples: ' + v.nBoot + '\n' +
      'Min subgroup size: ' + Math.round(v.minSigpPrcnt * 100) + '%\n' +
      'Pre-filtering:     ' + prefilterLabel + '\n' +
      'Cross-validation:  ' + cvLabel + '\n' +
      'Random seed:       ' + v.randomSeed + '\n' +
      'Train/test split:  ' + splitLabel;

    if (roles) {
      var data = App.state.curatedData || App.state.rawData;
      var n = data ? data.length : '?';
      text += '\n\n--- Data Summary ---\n' +
        'Response:          ' + roles.yvar + '\n' +
        'Predictors:        ' + roles.xvars.length + ' variables\n' +
        'N (curated):       ' + n;
      if (roles.trtvar) {
        text += '\nTreatment:         ' + roles.trtvar + ' (ref: ' + (roles.trtrefOriginal || roles.trtref) + ')';
      }
      if (roles.censorvar) {
        text += '\nCensoring:         ' + roles.censorvar;
      }
    }

    el.textContent = text;
  }

  function mulberry32(seed) {
    return function() {
      seed |= 0;
      seed = seed + 0x6D2B79F5 | 0;
      var t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
      t = t + Math.imul(t ^ (t >>> 7), 61 | t) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  function seededShuffle(arr, rng) {
    var a = arr.slice();
    for (var i = a.length - 1; i > 0; i--) {
      var j = Math.floor(rng() * (i + 1));
      var tmp = a[i]; a[i] = a[j]; a[j] = tmp;
    }
    return a;
  }

  function confirmConfig() {
    var roles = App.state.roles;
    var data = App.state.curatedData;
    if (!roles || !data) {
      App.showToast('No curated data available. Complete the Data step first.', 'danger');
      return;
    }

    var v = readValues();

    if (v.nBoot < 10 || v.nBoot > 500) {
      App.showToast('Bootstrap samples must be between 10 and 500.', 'warning');
      return;
    }
    if (v.randomSeed < 1) {
      App.showToast('Random seed must be a positive integer.', 'warning');
      return;
    }
    if (v.preFilter !== 'opt') {
      var pf = parseInt(v.preFilter);
      if (isNaN(pf) || pf < 1) {
        App.showToast("Pre-filter must be 'opt' or a positive integer.", 'warning');
        return;
      }
    }

    var splitProp = null;
    switch (v.splitMethod) {
      case '0.7':    splitProp = 0.7; break;
      case '0.8':    splitProp = 0.8; break;
      case 'custom': splitProp = v.customSplit; break;
      default:       splitProp = null;
    }

    var dataTrain = data;
    var dataTest = null;

    if (splitProp !== null) {
      var n = data.length;
      var rng = mulberry32(v.randomSeed);
      var indices = seededShuffle(Array.from({length: n}, function(_, i) { return i; }), rng);
      var trainSize = Math.floor(n * splitProp);
      var trainIdx = {};
      for (var i = 0; i < trainSize; i++) trainIdx[indices[i]] = true;

      dataTrain = data.filter(function(_, i) { return trainIdx[i]; });
      dataTest  = data.filter(function(_, i) { return !trainIdx[i]; });

      App.showToast('Data split: ' + dataTrain.length + ' train / ' + dataTest.length + ' test (' +
        Math.round(splitProp * 100) + '/' + Math.round((1 - splitProp) * 100) + ')', 'info');
    }

    App.state.config = {
      endpointType:    v.endpointType,
      analysisScope:   v.analysisScope,
      desRes:          v.desRes,
      nBoot:           v.nBoot,
      minSigpPrcnt:    v.minSigpPrcnt,
      enablePrefilter: v.enablePrefilter,
      filterMethod:    v.enablePrefilter ? v.filterMethod : null,
      preFilter:       v.enablePrefilter ? v.preFilter : null,
      enableCV:        v.enableCV,
      kFold:           v.enableCV ? v.kFold : null,
      cvIter:          v.enableCV ? v.cvIter : null,
      mcIter:          v.enableCV ? v.mcIter : null,
      maxIter:         v.enableCV ? v.maxIter : null,
      randomSeed:      v.randomSeed,
      splitMethod:     v.splitMethod,
      splitProp:       splitProp,
      customSplit:     v.customSplit,
      dataTrain:       dataTrain,
      dataTest:        dataTest,
    };

    App.unlockRun();
    App.showToast('Configuration confirmed. Run tab unlocked.', 'success');
  }

  function initConfigModule() {
    render();
  }

  document.addEventListener('shown.bs.tab', function(e) {
    if (e.target.id === 'tab-config-btn') render();
  });

  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', initConfigModule);
  } else {
    initConfigModule();
  }

})();
