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
  isValidEmail,
  validateLoginForm,
  validateNewMemberForm,
  loginErrorMessage,
  createAccountErrorMessage,
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
test("super-admin dépend du champ isSuperAdmin sur le même document users/{uid}", () => {
  assert.equal(isSuperAdmin({ role: "admin", status: "active", isSuperAdmin: true }), true);
  assert.equal(isSuperAdmin({ role: "admin", status: "active", isSuperAdmin: false }), false);
  assert.equal(isSuperAdmin({ role: "admin", status: "active" }), false);
  assert.equal(isSuperAdmin(null), false);
  assert.equal(isSuperAdmin(undefined), false);
});

test("rôle de foyer et statut super-admin sont des axes indépendants sur le même document", () => {
  // Admin de son foyer ET super-admin global (cas de Val) :
  assert.equal(isHouseholdAdmin({ role: "admin", isSuperAdmin: true }), true);
  assert.equal(isSuperAdmin({ role: "admin", isSuperAdmin: true }), true);
  // Simple membre d'un foyer mais quand même super-admin (cas théorique futur) :
  assert.equal(isHouseholdAdmin({ role: "member", isSuperAdmin: true }), false);
  assert.equal(isSuperAdmin({ role: "member", isSuperAdmin: true }), true);
});


test("isValidEmail valide/rejette correctement", () => {
  assert.equal(isValidEmail("val@legeneral.org"), true);
  assert.equal(isValidEmail("pas-un-email"), false);
  assert.equal(isValidEmail(""), false);
  assert.equal(isValidEmail(undefined), false);
  assert.equal(isValidEmail("  val@legeneral.org  "), true);
});


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

// ─── Création de compte membre (par un admin de foyer) ──────────────
test("formulaire nouveau membre : mot de passe trop court invalide (< 6 caractères, minimum Firebase)", () => {
  assert.equal(validateNewMemberForm("famille@example.com", "abc").valid, false);
});

test("formulaire nouveau membre : email invalide rejeté", () => {
  assert.equal(validateNewMemberForm("pas-un-email", "motdepasse123").valid, false);
});

test("formulaire nouveau membre : email + mot de passe valides (6+ caractères)", () => {
  assert.equal(validateNewMemberForm("famille@example.com", "abcdef").valid, true);
});

test("messages d'erreur de création de compte, distincts et informatifs pour l'admin", () => {
  assert.equal(createAccountErrorMessage("auth/email-already-in-use"), "Un compte existe déjà avec cet email.");
  assert.equal(createAccountErrorMessage("auth/weak-password"), "Mot de passe trop faible (6 caractères minimum).");
  assert.equal(createAccountErrorMessage("code-inconnu-xyz"), "Erreur lors de la création du compte.");
});
