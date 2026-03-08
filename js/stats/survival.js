/**
 * survival.js — Kaplan-Meier estimator and restricted mean survival
 *
 * Matches R's survival::survfit() output.
 * No dependencies on other SB modules.
 *
 * Namespace: SB.Survival
 */
var SB = self.SB = self.SB || {};

(function() {
  'use strict';

  // ============================================================
  // Kaplan-Meier Estimator
  // ============================================================

  function kaplanMeier(time, status) {
    var n = time.length;
    if (n === 0) return { time: [], nrisk: [], nevent: [], surv: [], se: [] };

    var events = {};
    for (var i = 0; i < n; i++) {
      var t = time[i];
      var s = status[i];
      if (!events[t]) {
        events[t] = { time: t, nevent: 0, ncensor: 0 };
      }
      if (s === 1) {
        events[t].nevent++;
      } else {
        events[t].ncensor++;
      }
    }

    var sortedTimes = Object.values(events).sort(function(a, b) { return a.time - b.time; });

    var resultTime = [];
    var resultNrisk = [];
    var resultNevent = [];
    var resultSurv = [];
    var resultSE = [];

    var nAtRisk = n;
    var survProb = 1;
    var greenwood = 0;

    for (var idx = 0; idx < sortedTimes.length; idx++) {
      var entry = sortedTimes[idx];
      var t = entry.time;
      var d = entry.nevent;
      var c = entry.ncensor;

      if (d > 0) {
        survProb *= (1 - d / nAtRisk);

        if (nAtRisk > d) {
          greenwood += d / (nAtRisk * (nAtRisk - d));
        }

        resultTime.push(t);
        resultNrisk.push(nAtRisk);
        resultNevent.push(d);
        resultSurv.push(survProb);
        resultSE.push(survProb * Math.sqrt(greenwood));
      }

      nAtRisk -= (d + c);
    }

    return {
      time: resultTime,
      nrisk: resultNrisk,
      nevent: resultNevent,
      surv: resultSurv,
      se: resultSE,
    };
  }

  // ============================================================
  // Restricted Mean Survival Time (RMST)
  // ============================================================

  function restrictedMean(km, tau) {
    if (km.time.length === 0) {
      return { rmean: tau, se: 0 };
    }

    var rmean = 0;
    var prevTime = 0;
    var prevSurv = 1;

    for (var i = 0; i < km.time.length; i++) {
      var t = Math.min(km.time[i], tau);
      if (t <= prevTime) continue;

      rmean += prevSurv * (t - prevTime);
      prevTime = t;
      prevSurv = km.surv[i];

      if (km.time[i] >= tau) break;
    }

    if (prevTime < tau) {
      rmean += prevSurv * (tau - prevTime);
    }

    var seSquared = 0;
    for (var i = 0; i < km.time.length; i++) {
      if (km.time[i] >= tau) break;
      if (km.surv[i] <= 0) continue;
      if (km.nrisk[i] <= km.nevent[i]) continue;

      var areaAfter = 0;
      var pTime = km.time[i];
      var pSurv = km.surv[i];
      for (var j = i + 1; j < km.time.length; j++) {
        var tj = Math.min(km.time[j], tau);
        if (tj <= pTime) continue;
        areaAfter += pSurv * (tj - pTime);
        pTime = tj;
        pSurv = km.surv[j];
        if (km.time[j] >= tau) break;
      }
      if (pTime < tau) {
        areaAfter += pSurv * (tau - pTime);
      }

      var d = km.nevent[i];
      var nrisk = km.nrisk[i];
      seSquared += (areaAfter * areaAfter * d) / (nrisk * (nrisk - d));
    }

    return { rmean: rmean, se: Math.sqrt(seSquared) };
  }

  // ============================================================
  // Median Survival
  // ============================================================

  function medianSurvival(km) {
    for (var i = 0; i < km.time.length; i++) {
      if (km.surv[i] <= 0.5) {
        return km.time[i];
      }
    }
    return null;
  }

  // ============================================================
  // Combined survfit-like function
  // ============================================================

  function survfit(time, status, tau) {
    if (tau === undefined) tau = null;
    var km = kaplanMeier(time, status);

    if (tau === null) {
      // Use max observed time (including censored) — matches R's survfit() default
      tau = Math.max.apply(null, time);
    }

    var rm = restrictedMean(km, tau);
    var median = medianSurvival(km);
    var nEvents = 0;
    for (var i = 0; i < status.length; i++) nEvents += status[i];

    return {
      n: time.length,
      events: nEvents,
      km: km,
      rmean: rm.rmean,
      seRmean: rm.se,
      median: median,
      tau: tau,
    };
  }

  function rmstDifference(time1, status1, time2, status2) {
    var eventTimes1 = time1.filter(function(t, i) { return status1[i] === 1; });
    var eventTimes2 = time2.filter(function(t, i) { return status2[i] === 1; });
    var maxEvent1 = eventTimes1.length > 0 ? Math.max.apply(null, eventTimes1) : Math.max.apply(null, time1);
    var maxEvent2 = eventTimes2.length > 0 ? Math.max.apply(null, eventTimes2) : Math.max.apply(null, time2);
    var tau = Math.min(maxEvent1, maxEvent2);

    var km1 = kaplanMeier(time1, status1);
    var km2 = kaplanMeier(time2, status2);
    var rm1 = restrictedMean(km1, tau);
    var rm2 = restrictedMean(km2, tau);

    return {
      tau: tau,
      rmean1: rm1.rmean,
      rmean2: rm2.rmean,
      diff: rm1.rmean - rm2.rmean,
      se1: rm1.se,
      se2: rm2.se,
    };
  }

  // ============================================================
  // Export to namespace
  // ============================================================

  SB.Survival = {
    kaplanMeier: kaplanMeier,
    restrictedMean: restrictedMean,
    medianSurvival: medianSurvival,
    survfit: survfit,
    rmstDifference: rmstDifference,
  };

})();
