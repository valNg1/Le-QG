// tests/auth-logic.test.js
//
// Tests de la logique d'autorisation (v3 : demandes d'adhésion en
// attente + approbation admin, multi-foyers). Aucune dépendance
// externe : Node >= 18 (node:test intégré).
//
// Lancer : npm test

const test = require("node:test");
const assert = require("node:assert/strict");
const {
  resolveScreen,
  activeMemberships,
  pendingRequests,
  isHouseholdAdmin,
  isSuperAdmin,
  pickActiveHousehold,
  canApproveRequest,
  buildJoinRequestPayload,
  buildApprovedMembershipPayload,
  isValidEmail,
  validateLoginForm,
  validateSignupForm,
  isValidHouseholdCode,
  loginErrorMessage,
  signupErrorMessage,
} = require("../auth-logic.js");

// ─── Visiteur non connecté ──────────────────────────────────────────
test("visiteur non connecté -> écran de connexion", () => {
  assert.equal(resolveScreen(null, null, [], [], false), "login");
});

// ─── Aucun foyer, aucune demande ────────────────────────────────────
test("connecté mais aucun document utilisateur -> écran rejoindre un foyer (filet de sécurité)", () => {
  assert.equal(resolveScreen({ uid: "u1" }, null, [], [], false), "join-household");
});

test("connecté, document présent, aucune adhésion, aucune demande -> écran rejoindre un foyer", () => {
  assert.equal(resolveScreen({ uid: "u1" }, { email: "x@x.com" }, [], [], true), "join-household");
});

// ─── Demande en attente : un utilisateur authentifié ne peut PAS rejoindre directement ───
test("une demande pending sans adhésion active -> écran d'attente, jamais l'app directement", () => {
  const requests = [{ code: "ABC123", status: "pending" }];
  assert.equal(resolveScreen({ uid: "u1" }, { email: "x@x.com" }, [], requests, true), "pending-approval");
});

test("une demande refusée sans adhésion active -> retombe sur rejoindre un foyer (pas d'accès)", () => {
  const requests = [{ code: "ABC123", status: "rejected" }];
  assert.equal(resolveScreen({ uid: "u1" }, { email: "x@x.com" }, [], requests, true), "join-household");
});

test("un utilisateur pending n'accède jamais à l'app même avec profil déjà choisi", () => {
  const requests = [{ code: "ABC123", status: "pending" }];
  assert.notEqual(resolveScreen({ uid: "u1" }, { email: "x@x.com" }, [], requests, true), "app");
});

// ─── Adhésion active (après approbation) ────────────────────────────
test("au moins une adhésion active, même avec une demande pending par ailleurs -> app (ou profil)", () => {
  const memberships = [{ code: "ABC123", role: "member", status: "active" }];
  const requests = [{ code: "DEF456", status: "pending" }];
  assert.equal(resolveScreen({ uid: "u1" }, { email: "x@x.com" }, memberships, requests, true), "app");
});

test("adhésion active, profil pas encore choisi -> écran prénom/avatar", () => {
  const memberships = [{ code: "ABC123", role: "member", status: "active" }];
  assert.equal(resolveScreen({ uid: "u1" }, { email: "x@x.com" }, memberships, [], false), "profile-setup");
});

test("adhésion désactivée (status disabled) -> pas d'accès, retombe sur rejoindre", () => {
  const memberships = [{ code: "ABC123", role: "member", status: "disabled" }];
  assert.equal(resolveScreen({ uid: "u1" }, { email: "x@x.com" }, memberships, [], true), "join-household");
});

// ─── Session expirée ────────────────────────────────────────────────
test("session expirée -> retombe sur login même avec des adhésions actives connues localement", () => {
  const memberships = [{ code: "ABC123", role: "admin", status: "active" }];
  assert.equal(resolveScreen(null, { email: "x@x.com" }, memberships, [], true), "login");
});

// ─── Rôle admin de foyer ─────────────────────────────────────────────
test("isHouseholdAdmin est spécifique à un foyer précis et à un statut actif", () => {
  const memberships = [
    { code: "AAA111", role: "admin", status: "active" },
    { code: "BBB222", role: "member", status: "active" },
    { code: "CCC333", role: "admin", status: "disabled" },
  ];
  assert.equal(isHouseholdAdmin(memberships, "AAA111"), true);
  assert.equal(isHouseholdAdmin(memberships, "BBB222"), false);
  assert.equal(isHouseholdAdmin(memberships, "CCC333"), false);
  assert.equal(isHouseholdAdmin(memberships, "ZZZ999"), false);
});

// ─── Super-admin ─────────────────────────────────────────────────────
test("super-admin dépend du champ isSuperAdmin sur users/{uid}, indépendant des foyers", () => {
  assert.equal(isSuperAdmin({ isSuperAdmin: true }), true);
  assert.equal(isSuperAdmin({ isSuperAdmin: false }), false);
  assert.equal(isSuperAdmin(null), false);
});

// ─── Sélection du foyer actif ────────────────────────────────────────
test("pickActiveHousehold conserve le foyer courant s'il est toujours valide, sinon bascule", () => {
  const memberships = [
    { code: "AAA111", role: "member", status: "active" },
    { code: "BBB222", role: "admin", status: "active" },
  ];
  assert.equal(pickActiveHousehold(memberships, "BBB222"), "BBB222");
  assert.equal(pickActiveHousehold(memberships, "ZZZ999"), "AAA111");
  assert.equal(pickActiveHousehold([], null), null);
});

// ─── Approbation d'une demande d'adhésion ───────────────────────────
test("un membre ne peut pas approuver sa propre demande, même s'il est admin d'un AUTRE foyer", () => {
  const approverMemberships = [{ code: "ABC123", role: "admin", status: "active" }];
  // La personne qui approuve EST la personne qui a demandé (même uid) :
  assert.equal(canApproveRequest(approverMemberships, "u1", "u1", "ABC123"), false);
});

test("seul un administrateur actif du foyer concerné peut approuver une demande", () => {
  const adminMemberships = [{ code: "ABC123", role: "admin", status: "active" }];
  const memberMemberships = [{ code: "ABC123", role: "member", status: "active" }];
  assert.equal(canApproveRequest(adminMemberships, "admin-uid", "requester-uid", "ABC123"), true);
  assert.equal(canApproveRequest(memberMemberships, "member-uid", "requester-uid", "ABC123"), false);
});

test("un admin d'un AUTRE foyer ne peut pas approuver une demande pour ce foyer-ci", () => {
  const adminOfOtherHousehold = [{ code: "OTHER99", role: "admin", status: "active" }];
  assert.equal(canApproveRequest(adminOfOtherHousehold, "admin-uid", "requester-uid", "ABC123"), false);
});

test("un admin dont l'adhésion est désactivée ne peut plus approuver", () => {
  const disabledAdmin = [{ code: "ABC123", role: "admin", status: "disabled" }];
  assert.equal(canApproveRequest(disabledAdmin, "admin-uid", "requester-uid", "ABC123"), false);
});

// ─── Payloads : un utilisateur ne peut jamais s'attribuer admin/super-admin ───
test("une demande d'adhésion est toujours construite en statut pending", () => {
  const payload = buildJoinRequestPayload("u1", "ABC123");
  assert.equal(payload.status, "pending");
  assert.equal(payload.uid, "u1");
  assert.equal(payload.code, "ABC123");
});

test("une adhésion approuvée est TOUJOURS construite avec role member, jamais admin ni super-admin", () => {
  const payload = buildApprovedMembershipPayload();
  assert.equal(payload.role, "member");
  assert.equal(payload.status, "active");
  assert.equal("isSuperAdmin" in payload, false);
  assert.notEqual(payload.role, "admin");
});

// ─── Email seul ──────────────────────────────────────────────────────
test("isValidEmail valide/rejette correctement", () => {
  assert.equal(isValidEmail("val@legeneral.org"), true);
  assert.equal(isValidEmail("pas-un-email"), false);
  assert.equal(isValidEmail(""), false);
  assert.equal(isValidEmail(undefined), false);
});

// ─── Formulaire de connexion ─────────────────────────────────────────
test("formulaire de connexion : champs vides invalides", () => {
  const r = validateLoginForm("", "");
  assert.equal(r.valid, false);
  assert.deepEqual(r.errors.sort(), ["email", "password"]);
});

test("formulaire de connexion : email + mot de passe valides", () => {
  assert.equal(validateLoginForm("val@legeneral.org", "unmotdepasse").valid, true);
});

// ─── Formulaire d'inscription ─────────────────────────────────────────
test("formulaire d'inscription : mot de passe trop court invalide (< 6 caractères)", () => {
  assert.equal(validateSignupForm("famille@example.com", "abc").valid, false);
});

test("formulaire d'inscription : email + mot de passe valides (6+ caractères)", () => {
  assert.equal(validateSignupForm("famille@example.com", "abcdef").valid, true);
});

// ─── Code de foyer ───────────────────────────────────────────────────
test("isValidHouseholdCode accepte le format généré (6 caractères, charset sans ambiguïté)", () => {
  assert.equal(isValidHouseholdCode("8W5D2B"), true);
  assert.equal(isValidHouseholdCode("8w5d2b"), true);
  assert.equal(isValidHouseholdCode("ABC12"), false);
  assert.equal(isValidHouseholdCode("Family Nanterre"), false);
  assert.equal(isValidHouseholdCode(""), false);
});

// ─── activeMemberships / pendingRequests ─────────────────────────────
test("activeMemberships filtre uniquement les adhésions actives", () => {
  const memberships = [
    { code: "AAA111", role: "member", status: "active" },
    { code: "BBB222", role: "member", status: "disabled" },
  ];
  assert.equal(activeMemberships(memberships).length, 1);
  assert.deepEqual(activeMemberships(null), []);
});

test("pendingRequests filtre uniquement les demandes en attente", () => {
  const requests = [
    { code: "AAA111", status: "pending" },
    { code: "BBB222", status: "approved" },
    { code: "CCC333", status: "rejected" },
  ];
  assert.equal(pendingRequests(requests).length, 1);
  assert.equal(pendingRequests(requests)[0].code, "AAA111");
  assert.deepEqual(pendingRequests(null), []);
});

// ─── Messages d'erreur ───────────────────────────────────────────────
test("messages d'erreur de connexion traduits sans énumération de compte", () => {
  assert.equal(loginErrorMessage("auth/user-not-found"), loginErrorMessage("auth/wrong-password"));
  assert.equal(loginErrorMessage("code-inconnu-xyz"), "Email ou mot de passe incorrect.");
});

test("messages d'erreur d'inscription distincts et informatifs", () => {
  assert.equal(signupErrorMessage("auth/email-already-in-use"), "Un compte existe déjà avec cet email — connecte-toi plutôt.");
  assert.equal(signupErrorMessage("auth/weak-password"), "Mot de passe trop faible (6 caractères minimum).");
});
