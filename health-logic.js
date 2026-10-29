// health-logic.js
//
// Logique pure du module « Santé & Équilibre » : clés de jour, validation
// des documents de pas, série des 7 jours, objectif, état de connexion.
// Aucune dépendance à Firebase, au DOM ou au navigateur : testée avec Node
// (tests/health-logic.test.js) ET chargée telle quelle dans index.html,
// comme auth-logic.js.
//
// Principe : aucune donnée n'est jamais inventée. Un jour sans document
// reçu du téléphone vaut `null` (« pas de donnée »), jamais 0.

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.HealthLogic = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {

  const DEFAULT_GOAL = 8000;
  const MIN_GOAL = 1000;
  const MAX_GOAL = 100000;
  const MAX_STEPS_PER_DAY = 200000;
  const STALE_AFTER_HOURS = 36;
  const DAY_KEY_RE = /^\d{4}-\d{2}-\d{2}$/;

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  // Jour LOCAL de l'appareil, "YYYY-MM-DD".
  function dateKey(d) {
    return d.getFullYear() + "-" + pad(d.getMonth() + 1) + "-" + pad(d.getDate());
  }

  // n jours consécutifs finissant au jour de `today` inclus, le plus ancien
  // en premier. Construit à midi local pour rester juste lors des
  // changements d'heure (journées de 23 h ou 25 h).
  function lastDays(today, n) {
    const out = [];
    for (let i = n - 1; i >= 0; i--) {
      const d = new Date(today.getFullYear(), today.getMonth(), today.getDate() - i, 12, 0, 0);
      out.push(dateKey(d));
    }
    return out;
  }

  function isRealDayKey(key) {
    if (typeof key !== "string" || !DAY_KEY_RE.test(key)) return false;
    const [y, m, d] = key.split("-").map(Number);
    const dt = new Date(Date.UTC(y, m - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
  }

  // Un document users/{uid}/healthSteps/{dayKey} est-il conforme ?
  // Miroir des contraintes de firestore.rules.
  function isValidStepsDoc(dayKey, doc) {
    if (!doc || typeof doc !== "object") return false;
    if (!isRealDayKey(dayKey)) return false;
    if (doc.date !== dayKey) return false;
    if (typeof doc.steps !== "number" || !Number.isInteger(doc.steps)) return false;
    if (doc.steps < 0 || doc.steps > MAX_STEPS_PER_DAY) return false;
    if (typeof doc.source !== "string" || doc.source.length === 0 || doc.source.length > 120) return false;
    return true;
  }

  // days : ["2026-10-23", ...] ; docsByDay : { "2026-10-23": {date, steps, source} }
  // Renvoie [{ day, steps|null, source|null, hasData }]
  function buildSeries(days, docsByDay) {
    const docs = docsByDay || {};
    return days.map(function (day) {
      const doc = docs[day];
      if (isValidStepsDoc(day, doc)) {
        return { day: day, steps: doc.steps, source: doc.source, hasData: true };
      }
      return { day: day, steps: null, source: null, hasData: false };
    });
  }

  function hasAnyData(series) {
    return (series || []).some(function (s) { return s.hasData; });
  }

  function normalizeGoal(v) {
    const n = Math.round(Number(v));
    if (v === "" || v === null || v === undefined || !isFinite(n)) return DEFAULT_GOAL;
    if (n < MIN_GOAL) return MIN_GOAL;
    if (n > MAX_GOAL) return MAX_GOAL;
    return n;
  }

  // Pourcentage 0..100 (plafonné), ou null s'il n'y a pas de donnée.
  function goalProgress(steps, goal) {
    if (steps === null || steps === undefined || !(goal > 0)) return null;
    return Math.min(100, Math.round((steps / goal) * 100));
  }

  function toDate(v) {
    if (!v) return null;
    if (v instanceof Date) return v;
    if (typeof v.toDate === "function") return v.toDate();
    return null;
  }

  // meta : users/{uid}/healthMeta/sync ({ lastSyncAt, source, device }) ou null.
  // options.error : la lecture Firestore a échoué.
  // codes : "error" | "never" | "ok" | "stale"
  function connectionState(meta, now, options) {
    if (options && options.error) {
      return { code: "error", label: "Lecture impossible", ageHours: null };
    }
    const last = meta ? toDate(meta.lastSyncAt) : null;
    if (!last || isNaN(last.getTime()) || last.getTime() > now.getTime()) {
      return { code: "never", label: "Aucune synchronisation", ageHours: null };
    }
    const ageHours = Math.floor((now.getTime() - last.getTime()) / 3600000);
    if (ageHours >= STALE_AFTER_HOURS) {
      return { code: "stale", label: "Synchronisation ancienne", ageHours: ageHours };
    }
    return { code: "ok", label: "Connecté", ageHours: ageHours };
  }

  function formatSteps(n) {
    if (n === null || n === undefined) return "—";
    return String(n).replace(/\B(?=(\d{3})+(?!\d))/g, " ");
  }

  return {
    DEFAULT_GOAL: DEFAULT_GOAL,
    MIN_GOAL: MIN_GOAL,
    MAX_GOAL: MAX_GOAL,
    MAX_STEPS_PER_DAY: MAX_STEPS_PER_DAY,
    STALE_AFTER_HOURS: STALE_AFTER_HOURS,
    dateKey: dateKey,
    lastDays: lastDays,
    isValidStepsDoc: isValidStepsDoc,
    buildSeries: buildSeries,
    hasAnyData: hasAnyData,
    normalizeGoal: normalizeGoal,
    goalProgress: goalProgress,
    connectionState: connectionState,
    formatSteps: formatSteps,
  };
});
