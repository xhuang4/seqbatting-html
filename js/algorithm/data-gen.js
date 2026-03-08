/**
 * data-gen.js — Simulated data generator
 *
 * Depends on: SB.Utils
 *
 * Namespace: SB.DataGen
 */
var SB = self.SB = self.SB || {};

(function() {
  'use strict';

  function dataGen(params) {
    var n = params.n;
    var k = params.k;
    var type = params.type || 'c';
    var predictive = params.predictive !== undefined ? params.predictive : true;
    var seed = params.seed || 12345;

    var rng = SB.Utils.mulberry32(seed);

    var xNames = [];
    for (var j = 0; j < k; j++) xNames.push('x' + (j + 1));

    var rows = [];
    for (var i = 0; i < n; i++) {
      var row = {};
      for (var j = 0; j < k; j++) {
        row[xNames[j]] = boxMuller(rng);
      }
      rows.push(row);
    }

    if (predictive) {
      for (var i = 0; i < n; i++) {
        rows[i].trt = rng() < 0.5 ? 1 : 0;
      }
    }

    if (type === 'c') {
      for (var i = 0; i < n; i++) {
        var x1 = rows[i].x1;
        var x2 = k > 1 ? rows[i].x2 : 0;
        var y;
        if (predictive) {
          var trt = rows[i].trt;
          y = 2 + trt * 1.5 * (x1 > 0 ? 1 : 0) + 0.3 * x2 + boxMuller(rng);
        } else {
          y = 2 + 1.0 * (x1 > 0 ? 1 : 0) + 0.3 * x2 + boxMuller(rng);
        }
        rows[i].y = Math.round(y * 1000) / 1000;
      }
    } else if (type === 'b') {
      for (var i = 0; i < n; i++) {
        var x1 = rows[i].x1;
        var x2 = k > 1 ? rows[i].x2 : 0;
        var logit;
        if (predictive) {
          var trt = rows[i].trt;
          logit = -0.5 + trt * 1.2 * (x1 > 0 ? 1 : 0) + 0.3 * x2;
        } else {
          logit = -0.5 + 1.0 * (x1 > 0 ? 1 : 0) + 0.3 * x2;
        }
        var prob = 1 / (1 + Math.exp(-logit));
        rows[i].y = rng() < prob ? 1 : 0;
      }
    } else if (type === 's') {
      for (var i = 0; i < n; i++) {
        var x1 = rows[i].x1;
        var x2 = k > 1 ? rows[i].x2 : 0;
        var logHazard;
        if (predictive) {
          var trt = rows[i].trt;
          logHazard = -1 + trt * (-0.8) * (x1 > 0 ? 1 : 0) + 0.2 * x2;
        } else {
          logHazard = -1 + (-0.6) * (x1 > 0 ? 1 : 0) + 0.2 * x2;
        }
        var hazard = Math.exp(logHazard);
        var survTime = -Math.log(rng() + 1e-10) / hazard;
        var censorTime = -Math.log(rng() + 1e-10) / (hazard * 0.4);
        var observed = survTime <= censorTime;
        rows[i].time = Math.round(Math.min(survTime, censorTime) * 1000) / 1000;
        rows[i].status = observed ? 1 : 0;
      }
    }

    var columns = [];
    if (type === 's') {
      columns.push('time', 'status');
    } else {
      columns.push('y');
    }
    if (predictive) columns.push('trt');
    columns.push.apply(columns, xNames);

    return { data: rows, columns: columns };
  }

  function boxMuller(rng) {
    var u, v, s;
    do {
      u = 2 * rng() - 1;
      v = 2 * rng() - 1;
      s = u * u + v * v;
    } while (s >= 1 || s === 0);
    return u * Math.sqrt(-2 * Math.log(s) / s);
  }

  // ============================================================
  // Export to namespace
  // ============================================================

  SB.DataGen = {
    dataGen: dataGen,
  };

})();
