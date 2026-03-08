/**
 * prediction.js — Rule application (query.data, pred.seqlr)
 *
 * No dependencies on other SB modules.
 *
 * Namespace: SB.Prediction
 */
var SB = self.SB = self.SB || {};

(function() {
  'use strict';

  /**
   * Apply a set of rules to data, returning a boolean array.
   * A row is TRUE (Sig+) if ALL rules are satisfied.
   */
  function queryData(data, rules) {
    if (!rules || rules.length === 0) {
      return new Array(data.length).fill(true);
    }

    return data.map(function(row) {
      for (var r = 0; r < rules.length; r++) {
        var rule = rules[r];
        var val = row[rule.variable];
        if (val === null || val === undefined || isNaN(val)) return false;
        var cutoff = typeof rule.threshold === 'string' ? parseFloat(rule.threshold) : rule.threshold;
        if (cutoff === null || isNaN(cutoff)) return false;
        if (rule.direction === '>') {
          if (!(val > cutoff)) return false;
        } else if (rule.direction === '<') {
          if (!(val < cutoff)) return false;
        } else {
          return false;
        }
      }
      return true;
    });
  }

  /**
   * Predict Sig+/Sig- group membership for new data.
   */
  function predSeqlr(data, predictRule) {
    if (!predictRule || predictRule.length === 0) {
      return new Array(data.length).fill(true);
    }
    return queryData(data, predictRule);
  }

  /**
   * Format a rule set as a human-readable string.
   */
  function formatRules(rules) {
    if (!rules || rules.length === 0) return '(no rules)';
    return rules.map(function(r) { return r.variable + ' ' + r.direction + ' ' + r.threshold; }).join(' AND ');
  }

  // ============================================================
  // Export to namespace
  // ============================================================

  SB.Prediction = {
    queryData: queryData,
    predSeqlr: predSeqlr,
    formatRules: formatRules,
  };

})();
