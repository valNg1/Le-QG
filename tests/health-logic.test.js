// tests/health-logic.test.js
// Logique pure du module « Santé & Équilibre » — exécutable avec `npm test`.
const { test } = require("node:test");
const assert = require("node:assert/strict");
const H = require("../health-logic.js");

// ─── Clés de jour ────────────────────────────────────────────────────
test("dateKey formate un jour local en YYYY-MM-DD avec zéros", () => {
  assert.equal(H.dateKey(new Date(2026, 0, 5, 23, 59)), "2026-01-05");
  assert.equal(H.dateKey(new Date(2026, 9, 29, 0, 1)), "2026-10-29");
});

test("lastDays renvoie n jours consécutifs, le plus ancien d'abord, jour courant en dernier", () => {
  const days = H.lastDays(new Date(2026, 9, 29, 15, 0), 7);
  assert.deepEqual(days, [
    "2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26",
    "2026-10-27", "2026-10-28", "2026-10-29",
  ]);
});

test("lastDays traverse correctement un changement de mois et d'année", () => {
  const days = H.lastDays(new Date(2027, 0, 2), 4);
  assert.deepEqual(days, ["2026-12-30", "2026-12-31", "2027-01-01", "2027-01-02"]);
});

test("lastDays traverse le passage à l'heure d'hiver sans doublon ni trou", () => {
  // 25 octobre 2026 : retour à l'heure d'hiver (journée de 25 h) en France
  const days = H.lastDays(new Date(2026, 9, 27, 12, 0), 5);
  assert.deepEqual(days, ["2026-10-23", "2026-10-24", "2026-10-25", "2026-10-26", "2026-10-27"]);
});

// ─── Validation d'un document de pas ─────────────────────────────────
test("isValidStepsDoc accepte un document conforme", () => {
  assert.equal(H.isValidStepsDoc("2026-10-29", { date: "2026-10-29", steps: 8421, source: "Health Connect" }), true);
});

test("isValidStepsDoc refuse pas négatifs, décimaux, absurdes ou non numériques", () => {
  const d = "2026-10-29";
  assert.equal(H.isValidStepsDoc(d, { date: d, steps: -1, source: "x" }), false);
  assert.equal(H.isValidStepsDoc(d, { date: d, steps: 12.5, source: "x" }), false);
  assert.equal(H.isValidStepsDoc(d, { date: d, steps: 200001, source: "x" }), false);
  assert.equal(H.isValidStepsDoc(d, { date: d, steps: "8000", source: "x" }), false);
  assert.equal(H.isValidStepsDoc(d, { date: d, steps: NaN, source: "x" }), false);
});

test("isValidStepsDoc refuse une date incohérente avec l'identifiant ou mal formée", () => {
  assert.equal(H.isValidStepsDoc("2026-10-29", { date: "2026-10-28", steps: 1, source: "x" }), false);
  assert.equal(H.isValidStepsDoc("29/10/2026", { date: "29/10/2026", steps: 1, source: "x" }), false);
  assert.equal(H.isValidStepsDoc("2026-13-40", { date: "2026-13-40", steps: 1, source: "x" }), false);
});

test("isValidStepsDoc refuse null, source manquante et source trop longue", () => {
  assert.equal(H.isValidStepsDoc("2026-10-29", null), false);
  assert.equal(H.isValidStepsDoc("2026-10-29", { date: "2026-10-29", steps: 1 }), false);
  assert.equal(H.isValidStepsDoc("2026-10-29", { date: "2026-10-29", steps: 1, source: "a".repeat(121) }), false);
});

// ─── Série des 7 jours : jamais de donnée inventée ───────────────────
test("buildSeries marque les jours sans document comme absents (steps null), jamais 0", () => {
  const days = ["2026-10-27", "2026-10-28", "2026-10-29"];
  const docs = { "2026-10-28": { date: "2026-10-28", steps: 5000, source: "Health Connect" } };
  const s = H.buildSeries(days, docs);
  assert.deepEqual(s.map(x => x.steps), [null, 5000, null]);
  assert.deepEqual(s.map(x => x.hasData), [false, true, false]);
});

test("buildSeries conserve un vrai 0 reçu du téléphone (0 pas ≠ pas de donnée)", () => {
  const s = H.buildSeries(["2026-10-29"], { "2026-10-29": { date: "2026-10-29", steps: 0, source: "x" } });
  assert.equal(s[0].steps, 0);
  assert.equal(s[0].hasData, true);
});

test("buildSeries ignore un document invalide plutôt que de l'afficher", () => {
  const s = H.buildSeries(["2026-10-29"], { "2026-10-29": { date: "2026-10-29", steps: -50, source: "x" } });
  assert.equal(s[0].hasData, false);
  assert.equal(s[0].steps, null);
});

test("hasAnyData est faux sans aucun jour renseigné", () => {
  assert.equal(H.hasAnyData(H.buildSeries(["2026-10-29"], {})), false);
  assert.equal(H.hasAnyData(H.buildSeries(["2026-10-29"], { "2026-10-29": { date: "2026-10-29", steps: 1, source: "x" } })), true);
});

// ─── Objectif quotidien ──────────────────────────────────────────────
test("normalizeGoal borne l'objectif et retombe sur 8000 si invalide", () => {
  assert.equal(H.normalizeGoal("10000"), 10000);
  assert.equal(H.normalizeGoal(7500.7), 7501);
  assert.equal(H.normalizeGoal(""), H.DEFAULT_GOAL);
  assert.equal(H.normalizeGoal("abc"), H.DEFAULT_GOAL);
  assert.equal(H.normalizeGoal(50), H.MIN_GOAL);
  assert.equal(H.normalizeGoal(999999), H.MAX_GOAL);
  assert.equal(H.DEFAULT_GOAL, 8000);
});

test("goalProgress renvoie un pourcentage plafonné, et null sans donnée", () => {
  assert.equal(H.goalProgress(4000, 8000), 50);
  assert.equal(H.goalProgress(12000, 8000), 100);
  assert.equal(H.goalProgress(0, 8000), 0);
  assert.equal(H.goalProgress(null, 8000), null);
});

// ─── État de connexion ───────────────────────────────────────────────
const NOW = new Date("2026-10-29T12:00:00Z");

test("connectionState : jamais synchronisé sans meta", () => {
  assert.equal(H.connectionState(null, NOW).code, "never");
  assert.equal(H.connectionState({}, NOW).code, "never");
});

test("connectionState : connecté si dernière synchro < 36 h", () => {
  const meta = { lastSyncAt: new Date("2026-10-29T10:00:00Z") };
  const st = H.connectionState(meta, NOW);
  assert.equal(st.code, "ok");
  assert.equal(st.ageHours, 2);
});

test("connectionState : synchro ancienne au-delà de 36 h", () => {
  const meta = { lastSyncAt: new Date("2026-10-27T12:00:00Z") };
  assert.equal(H.connectionState(meta, NOW).code, "stale");
});

test("connectionState : erreur de lecture prioritaire sur le reste", () => {
  assert.equal(H.connectionState({ lastSyncAt: new Date("2026-10-29T11:00:00Z") }, NOW, { error: true }).code, "error");
});

test("connectionState accepte un Timestamp Firestore (toDate)", () => {
  const meta = { lastSyncAt: { toDate: () => new Date("2026-10-29T11:00:00Z") } };
  assert.equal(H.connectionState(meta, NOW).code, "ok");
});

test("connectionState : date future ou illisible → traitée comme jamais synchronisé", () => {
  assert.equal(H.connectionState({ lastSyncAt: "n'importe quoi" }, NOW).code, "never");
  assert.equal(H.connectionState({ lastSyncAt: new Date("2027-01-01T00:00:00Z") }, NOW).code, "never");
});

// ─── Formatage ───────────────────────────────────────────────────────
test("formatSteps utilise l'espace insécable français pour les milliers", () => {
  assert.equal(H.formatSteps(8421), "8 421");
  assert.equal(H.formatSteps(512), "512");
  assert.equal(H.formatSteps(null), "—");
});
