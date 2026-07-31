// tests/auth-logic.test.js
//
// Tests de la logique d'autorisation multi-foyers (inscription libre,
// appartenance à plusieurs foyers). Aucune dépendance externe : Node >= 18
// (node:test intégré).
//
// Lancer : npm test

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveScreen,
  activeMemberships,
  isHouseholdAdmin,
  isSuperAdmin,
  pickActiveHousehold,
  isValidEmail,
  validateLoginForm,
  validateSignupForm,
  isValidHouseholdCode,
  loginErrorMessage,
  signupErrorMessage,
} = require("../auth-logic.js");

// ─── Visiteur non connecté ──────────────────────────────────────────
test("visiteur non connecté -> écran de connexion", () => {
  assert.equal(resolveScreen(null, null, [], false), "login");
  assert.equal(resolveScreen(null, { email: "x@x.com" }, [{ code: "ABC123", role: "member", status: "active" }], true), "login");
});

// ─── Aucun foyer rejoint ─────────────────────────────────────────────
test("connecté mais aucun document utilisateur -> écran rejoindre un foyer (filet de sécurité)", () => {
  assert.equal(resolveScreen({ uid: "u1" }, null, [], false), "join-household");
});

test("connecté, document présent, mais aucune adhésion -> écran rejoindre un foyer", () => {
  assert.equal(resolveScreen({ uid: "u1" }, { email: "x@x.com", isSuperAdmin: false }, [], true), "join-household");
});

test("connecté, une seule adhésion mais désactivée -> écran rejoindre un foyer", () => {
  const memberships = [{ code: "ABC123", role: "member", status: "disabled" }];
  assert.equal(resolveScreen({ uid: "u1" }, { email: "x@x.com" }, memberships, true), "join-household");
});

// ─── Connexion valide, au moins un foyer actif ─────────────────────
test("au moins une adhésion active, profil pas encore choisi -> écran prénom/avatar", () => {
  const memberships = [{ code: "ABC123", role: "member", status: "active" }];
  assert.equal(resolveScreen({ uid: "u1" }, { email: "x@x.com" }, memberships, false), "profile-setup");
});

test("au moins une adhésion active, profil déjà choisi -> accès à l'app", () => {
  const memberships = [{ code: "ABC123", role: "member", status: "active" }];
  assert.equal(resolveScreen({ uid: "u1" }, { email: "x@x.com" }, memberships, true), "app");
});

test("plusieurs adhésions, au moins une active -> accès à l'app même si une autre est désactivée", () => {
  const memberships = [
    { code: "AAA111", role: "member", status: "disabled" },
    { code: "BBB222", role: "admin", status: "active" },
  ];
  assert.equal(resolveScreen({ uid: "u1" }, { email: "x@x.com" }, memberships, true), "app");
});

// ─── Session expirée ────────────────────────────────────────────────
test("session expirée (plus d'authUser) -> retombe sur login même avec des adhésions actives connues localement", () => {
  const memberships = [{ code: "ABC123", role: "admin", status: "active" }];
  assert.equal(resolveScreen(null, { email: "x@x.com" }, memberships, true), "login");
});

// ─── Rôle admin de foyer (par foyer, pas global) ───────────────────
test("isHouseholdAdmin est spécifique à un foyer précis", () => {
  const memberships = [
    { code: "AAA111", role: "admin", status: "active" },
    { code: "BBB222", role: "member", status: "active" },
  ];
  assert.equal(isHouseholdAdmin(memberships, "AAA111"), true);
  assert.equal(isHouseholdAdmin(memberships, "BBB222"), false);
  assert.equal(isHouseholdAdmin(memberships, "CCC333"), false); // pas membre du tout
});

test("isHouseholdAdmin faux si l'adhésion admin est désactivée", () => {
  const memberships = [{ code: "AAA111", role: "admin", status: "disabled" }];
  assert.equal(isHouseholdAdmin(memberships, "AAA111"), false);
});

// ─── Super-admin (espace admin global) ──────────────────────────────
test("super-admin dépend du champ isSuperAdmin sur users/{uid}, indépendant des foyers", () => {
  assert.equal(isSuperAdmin({ isSuperAdmin: true }), true);
  assert.equal(isSuperAdmin({ isSuperAdmin: false }), false);
  assert.equal(isSuperAdmin({}), false);
  assert.equal(isSuperAdmin(null), false);
});

// ─── Sélection du foyer actif ───────────────────────────────────────
test("pickActiveHousehold conserve le foyer courant s'il est toujours valide", () => {
  const memberships = [
    { code: "AAA111", role: "member", status: "active" },
    { code: "BBB222", role: "admin", status: "active" },
  ];
  assert.equal(pickActiveHousehold(memberships, "BBB222"), "BBB222");
});

test("pickActiveHousehold bascule sur le premier actif si le foyer courant n'est plus valide", () => {
  const memberships = [{ code: "AAA111", role: "member", status: "active" }];
  assert.equal(pickActiveHousehold(memberships, "ZZZ999"), "AAA111");
});

test("pickActiveHousehold retourne null si aucune adhésion active", () => {
  assert.equal(pickActiveHousehold([], null), null);
  assert.equal(pickActiveHousehold([{ code: "AAA111", role: "member", status: "disabled" }], null), null);
});

// ─── activeMemberships ───────────────────────────────────────────────
test("activeMemberships filtre uniquement les adhésions actives", () => {
  const memberships = [
    { code: "AAA111", role: "member", status: "active" },
    { code: "BBB222", role: "member", status: "disabled" },
  ];
  assert.equal(activeMemberships(memberships).length, 1);
  assert.equal(activeMemberships(memberships)[0].code, "AAA111");
  assert.deepEqual(activeMemberships(null), []);
});

// ─── Email seul ──────────────────────────────────────────────────────
test("isValidEmail valide/rejette correctement", () => {
  assert.equal(isValidEmail("val@legeneral.org"), true);
  assert.equal(isValidEmail("pas-un-email"), false);
  assert.equal(isValidEmail(""), false);
  assert.equal(isValidEmail(undefined), false);
  assert.equal(isValidEmail("  val@legeneral.org  "), true);
});

// ─── Formulaire de connexion ─────────────────────────────────────────
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

// ─── Formulaire d'inscription ─────────────────────────────────────────
test("formulaire d'inscription : mot de passe trop court invalide (< 6 caractères, minimum Firebase)", () => {
  assert.equal(validateSignupForm("famille@example.com", "abc").valid, false);
});

test("formulaire d'inscription : email invalide rejeté", () => {
  assert.equal(validateSignupForm("pas-un-email", "motdepasse123").valid, false);
});

test("formulaire d'inscription : email + mot de passe valides (6+ caractères)", () => {
  assert.equal(validateSignupForm("famille@example.com", "abcdef").valid, true);
});

// ─── Code de foyer ───────────────────────────────────────────────────
test("isValidHouseholdCode accepte le format généré (6 caractères, charset sans ambiguïté)", () => {
  assert.equal(isValidHouseholdCode("8W5D2B"), true);
  assert.equal(isValidHouseholdCode("8w5d2b"), true); // insensible à la casse
  assert.equal(isValidHouseholdCode("ABC12"), false); // trop court
  assert.equal(isValidHouseholdCode("Family Nanterre"), false); // pas un code
  assert.equal(isValidHouseholdCode(""), false);
  assert.equal(isValidHouseholdCode("ABC1O0"), false); // O et 0 exclus du charset généré
});

// ─── Messages d'erreur ───────────────────────────────────────────────
test("messages d'erreur de connexion traduits sans énumération de compte", () => {
  assert.equal(loginErrorMessage("auth/user-not-found"), loginErrorMessage("auth/wrong-password"));
  assert.equal(loginErrorMessage("auth/invalid-credential"), "Email ou mot de passe incorrect.");
  assert.equal(loginErrorMessage("auth/user-disabled"), "Ce compte a été désactivé.");
  assert.equal(loginErrorMessage("code-inconnu-xyz"), "Email ou mot de passe incorrect.");
});

test("messages d'erreur d'inscription distincts et informatifs", () => {
  assert.equal(signupErrorMessage("auth/email-already-in-use"), "Un compte existe déjà avec cet email — connecte-toi plutôt.");
  assert.equal(signupErrorMessage("auth/weak-password"), "Mot de passe trop faible (6 caractères minimum).");
  assert.equal(signupErrorMessage("code-inconnu-xyz"), "Erreur lors de la création du compte.");
});
