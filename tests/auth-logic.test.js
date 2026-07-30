// tests/auth-logic.test.js
//
// Tests de la logique d'autorisation, écrits AVANT l'implémentation
// (auth-logic.js n'existe pas encore au moment où ces tests sont écrits).
// Aucune dépendance externe : Node >= 18 (node:test intégré).
//
// Lancer : npm test

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveScreen,
  isHouseholdAdmin,
  isSuperAdmin,
  validateLoginForm,
  loginErrorMessage,
} = require("../auth-logic.js");

// ─── Visiteur non connecté ──────────────────────────────────────────
test("visiteur non connecté -> écran de connexion", () => {
  assert.equal(resolveScreen(null, null, false), "login");
  assert.equal(resolveScreen(null, null, true), "login");
});

// ─── Connexion invalide / compte non autorisé ──────────────────────
test("connecté mais aucun document utilisateur -> accès refusé", () => {
  assert.equal(resolveScreen({ uid: "u1" }, null, false), "access-denied");
});

test("connecté, compte désactivé (status disabled) -> accès refusé", () => {
  const userDoc = { householdId: "ABC123", role: "member", status: "disabled" };
  assert.equal(resolveScreen({ uid: "u1" }, userDoc, true), "access-denied");
});

// ─── Connexion valide ───────────────────────────────────────────────
test("connecté, actif, profil pas encore choisi -> écran prénom/avatar", () => {
  const userDoc = { householdId: "ABC123", role: "member", status: "active" };
  assert.equal(resolveScreen({ uid: "u1" }, userDoc, false), "profile-setup");
});

test("connecté, actif, profil déjà choisi -> accès à l'app", () => {
  const userDoc = { householdId: "ABC123", role: "member", status: "active" };
  assert.equal(resolveScreen({ uid: "u1" }, userDoc, true), "app");
});

// ─── Session expirée / déconnexion ──────────────────────────────────
test("session expirée (plus d'authUser) -> retombe sur login même si un ancien profil local existe", () => {
  const staleUserDoc = { householdId: "ABC123", role: "admin", status: "active" };
  assert.equal(resolveScreen(null, staleUserDoc, true), "login");
});

// ─── Rafraîchissement de page ───────────────────────────────────────
test("rafraîchissement avec session Firebase valide -> accès direct à l'app si profil déjà choisi", () => {
  const userDoc = { householdId: "ABC123", role: "member", status: "active" };
  assert.equal(resolveScreen({ uid: "u1" }, userDoc, true), "app");
});

// ─── Rôle administrateur (foyer) ────────────────────────────────────
test("rôle admin de foyer détecté correctement", () => {
  assert.equal(isHouseholdAdmin({ role: "admin" }), true);
  assert.equal(isHouseholdAdmin({ role: "member" }), false);
  assert.equal(isHouseholdAdmin(null), false);
  assert.equal(isHouseholdAdmin(undefined), false);
});

// ─── Super-admin (espace admin global, remplace le mot de passe 2601) ─
test("super-admin dépend uniquement de l'existence du document superadmins/{uid}", () => {
  assert.equal(isSuperAdmin(true), true);
  assert.equal(isSuperAdmin(false), false);
  assert.equal(isSuperAdmin(undefined), false);
});

// ─── Validation du formulaire de connexion ─────────────────────────
test("formulaire de connexion : champs vides invalides", () => {
  const r = validateLoginForm("", "");
  assert.equal(r.valid, false);
  assert.deepEqual(r.errors.sort(), ["email", "password"]);
});

test("formulaire de connexion : email mal formé invalide", () => {
  assert.equal(validateLoginForm("pas-un-email", "x").valid, false);
});

test("formulaire de connexion : mot de passe manquant invalide", () => {
  assert.equal(validateLoginForm("val@legeneral.org", "").valid, false);
});

test("formulaire de connexion : email + mot de passe valides", () => {
  assert.equal(validateLoginForm("val@legeneral.org", "unmotdepasse").valid, true);
});

// ─── Messages d'erreur (ne jamais révéler email vs mot de passe) ────
test("messages d'erreur Firebase Auth traduits sans énumération de compte", () => {
  assert.equal(loginErrorMessage("auth/user-not-found"), loginErrorMessage("auth/wrong-password"));
  assert.equal(loginErrorMessage("auth/invalid-credential"), "Email ou mot de passe incorrect.");
  assert.equal(loginErrorMessage("auth/user-disabled"), "Ce compte a été désactivé.");
  assert.equal(loginErrorMessage("code-inconnu-xyz"), "Email ou mot de passe incorrect.");
});
