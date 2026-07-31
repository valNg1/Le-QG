// tests/firestore.rules.test.js
//
// Tests des règles Firestore (firestore.rules) avec @firebase/rules-unit-testing.
//
// ⚠️ CES TESTS NÉCESSITENT L'ÉMULATEUR FIRESTORE. Ils sont écrits et
// prêts à l'emploi, mais NE PEUVENT PAS être exécutés depuis cet
// environnement de développement : l'émulateur télécharge son binaire
// depuis storage.googleapis.com au premier lancement, domaine absent de
// la liste blanche réseau de ce sandbox (confirmé par tentative réelle :
// `firebase emulators:start --only firestore` échoue avec
// "download failed, status 403: Host not in allowlist: storage.googleapis.com").
//
// Pour les exécuter (depuis une machine avec accès réseau complet) :
//   npm run test:rules
// (lance l'émulateur Firestore localement, puis ce fichier contre lui —
// voir le script "test:rules" dans package.json)
//
// tests/auth-logic.test.js (npm test) reste la suite exécutable dans cet
// environnement — logique pure, zéro dépendance réseau.

const { test, before, after } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} = require("@firebase/rules-unit-testing");

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: "legeneral-rules-test",
    firestore: {
      rules: fs.readFileSync(path.resolve(__dirname, "../firestore.rules"), "utf8"),
    },
  });
});

after(async () => {
  if (testEnv) await testEnv.cleanup();
});

// Prépare un foyer existant + un admin déjà membre actif, pour chaque test.
async function seedHouseholdWithAdmin(code, adminUid) {
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.collection("groupes").doc(code).set({ name: "Foyer test", members: [] });
    await db.collection("users").doc(adminUid)
      .collection("memberships").doc(code)
      .set({ role: "admin", status: "active" });
  });
}

// ─── 1. Chemin strict des demandes ──────────────────────────────────
test("impossible de créer une demande hors de users/{uid}/membershipRequests/{code}", async () => {
  const code = "AAA111";
  await seedHouseholdWithAdmin(code, "admin1");
  const alice = testEnv.authenticatedContext("alice").firestore();
  // Tentative à un chemin qui n'est PAS users/{uid}/membershipRequests/{code}
  // (ex. une collection top-level "membershipRequests" au lieu d'imbriquée) :
  await assertFails(
    alice.collection("membershipRequests").doc(code).set({
      uid: "alice", code, status: "pending", requestedAt: new Date(),
    })
  );
});

test("impossible de créer une demande pour un autre uid que soi-même", async () => {
  const code = "AAA111";
  await seedHouseholdWithAdmin(code, "admin1");
  const alice = testEnv.authenticatedContext("alice").firestore();
  await assertFails(
    alice.collection("users").doc("alice").collection("membershipRequests").doc(code).set({
      uid: "bob", // <-- usurpe un autre uid
      code, status: "pending", requestedAt: new Date(),
    })
  );
});

test("impossible de créer une demande pour un code différent du segment de chemin", async () => {
  const code = "AAA111";
  await seedHouseholdWithAdmin(code, "admin1");
  const alice = testEnv.authenticatedContext("alice").firestore();
  await assertFails(
    alice.collection("users").doc("alice").collection("membershipRequests").doc(code).set({
      uid: "alice", code: "ZZZ999", // <-- ne correspond pas au segment de chemin "AAA111"
      status: "pending", requestedAt: new Date(),
    })
  );
});

test("création d'une demande valide, correctement scopée, réussit", async () => {
  const code = "AAA111";
  await seedHouseholdWithAdmin(code, "admin1");
  const alice = testEnv.authenticatedContext("alice").firestore();
  await assertSucceeds(
    alice.collection("users").doc("alice").collection("membershipRequests").doc(code).set({
      uid: "alice", code, status: "pending", requestedAt: new Date(),
    })
  );
});

// ─── 2. Immutabilité lors du traitement ─────────────────────────────
test("un admin ne peut pas modifier uid ou code en traitant une demande", async () => {
  const code = "BBB222";
  await seedHouseholdWithAdmin(code, "admin1");
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection("users").doc("alice").collection("membershipRequests").doc(code)
      .set({ uid: "alice", code, status: "pending", requestedAt: new Date() });
  });
  const admin = testEnv.authenticatedContext("admin1").firestore();
  await assertFails(
    admin.collection("users").doc("alice").collection("membershipRequests").doc(code).update({
      uid: "quelqu-un-dautre", status: "approved",
    })
  );
});

// ─── 3 & 4. Atomicité (getAfter) ─────────────────────────────────────
test("approbation ATOMIQUE (batch avec les deux écritures) réussit", async () => {
  const code = "CCC333";
  await seedHouseholdWithAdmin(code, "admin1");
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection("users").doc("alice").collection("membershipRequests").doc(code)
      .set({ uid: "alice", code, status: "pending", requestedAt: new Date() });
  });
  const adminDb = testEnv.authenticatedContext("admin1").firestore();
  const batch = adminDb.batch();
  batch.update(adminDb.collection("users").doc("alice").collection("membershipRequests").doc(code), { status: "approved" });
  batch.set(adminDb.collection("users").doc("alice").collection("memberships").doc(code), { role: "member", status: "active" });
  await assertSucceeds(batch.commit());
});

test("impossible d'approuver SANS créer la membership dans le même batch (getAfter)", async () => {
  const code = "DDD444";
  await seedHouseholdWithAdmin(code, "admin1");
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection("users").doc("alice").collection("membershipRequests").doc(code)
      .set({ uid: "alice", code, status: "pending", requestedAt: new Date() });
  });
  const adminDb = testEnv.authenticatedContext("admin1").firestore();
  // Seule la demande est mise à jour — pas de membership créée en parallèle :
  await assertFails(
    adminDb.collection("users").doc("alice").collection("membershipRequests").doc(code).update({ status: "approved" })
  );
});

test("impossible de créer la membership SANS que la demande passe à approved dans le même batch (getAfter)", async () => {
  const code = "EEE555";
  await seedHouseholdWithAdmin(code, "admin1");
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection("users").doc("alice").collection("membershipRequests").doc(code)
      .set({ uid: "alice", code, status: "pending", requestedAt: new Date() });
  });
  const adminDb = testEnv.authenticatedContext("admin1").firestore();
  // Seule la membership est créée — la demande reste "pending" :
  await assertFails(
    adminDb.collection("users").doc("alice").collection("memberships").doc(code).set({ role: "member", status: "active" })
  );
});

test("aucun état 'approved' sans membership active correspondante (conséquence de l'atomicité)", async () => {
  const code = "FFF666";
  await seedHouseholdWithAdmin(code, "admin1");
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection("users").doc("alice").collection("membershipRequests").doc(code)
      .set({ uid: "alice", code, status: "pending", requestedAt: new Date() });
  });
  const adminDb = testEnv.authenticatedContext("admin1").firestore();
  await assertFails(
    adminDb.collection("users").doc("alice").collection("membershipRequests").doc(code).update({ status: "approved" })
  );
  // Vérifie qu'aucune membership n'a été créée malgré la tentative :
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const snap = await ctx.firestore().collection("users").doc("alice").collection("memberships").doc(code).get();
    assert.equal(snap.exists, false);
  });
});

// ─── 5. keys().hasOnly() sur la création de membership ──────────────
test("impossible de créer une membership avec un champ additionnel non prévu", async () => {
  const code = "GGG777";
  await seedHouseholdWithAdmin(code, "admin1");
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection("users").doc("alice").collection("membershipRequests").doc(code)
      .set({ uid: "alice", code, status: "pending", requestedAt: new Date() });
  });
  const adminDb = testEnv.authenticatedContext("admin1").firestore();
  const batch = adminDb.batch();
  batch.update(adminDb.collection("users").doc("alice").collection("membershipRequests").doc(code), { status: "approved" });
  batch.set(adminDb.collection("users").doc("alice").collection("memberships").doc(code), {
    role: "member", status: "active", isSuperAdmin: true, // <-- champ non autorisé
  });
  await assertFails(batch.commit());
});

// ─── 6. diff().affectedKeys().hasOnly(['status']) ────────────────────
test("impossible d'ajouter un champ non prévu en traitant une demande", async () => {
  const code = "HHH888";
  await seedHouseholdWithAdmin(code, "admin1");
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection("users").doc("alice").collection("membershipRequests").doc(code)
      .set({ uid: "alice", code, status: "pending", requestedAt: new Date() });
  });
  const adminDb = testEnv.authenticatedContext("admin1").firestore();
  await assertFails(
    adminDb.collection("users").doc("alice").collection("membershipRequests").doc(code).update({
      status: "rejected", note: "raison du refus", // <-- champ non prévu
    })
  );
});

// ─── 7. Rôle immutable ────────────────────────────────────────────────
test("un admin ne peut pas changer le rôle d'une adhésion existante", async () => {
  const code = "III999";
  await seedHouseholdWithAdmin(code, "admin1");
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection("users").doc("alice").collection("memberships").doc(code)
      .set({ role: "member", status: "active" });
  });
  const adminDb = testEnv.authenticatedContext("admin1").firestore();
  await assertFails(
    adminDb.collection("users").doc("alice").collection("memberships").doc(code).update({
      role: "admin", status: "active",
    })
  );
});

test("un admin peut désactiver une adhésion existante (statut seul, rôle inchangé)", async () => {
  const code = "III999b";
  await seedHouseholdWithAdmin(code, "admin1");
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    await ctx.firestore().collection("users").doc("alice").collection("memberships").doc(code)
      .set({ role: "member", status: "active" });
  });
  const adminDb = testEnv.authenticatedContext("admin1").firestore();
  await assertSucceeds(
    adminDb.collection("users").doc("alice").collection("memberships").doc(code).update({
      role: "member", status: "disabled",
    })
  );
});

// ─── 8. Requête admin limitée au foyer concerné ─────────────────────
test("un admin ne voit QUE les demandes de son propre foyer, jamais celles d'un autre", async () => {
  const codeA = "JJJ000";
  const codeB = "KKK111";
  await seedHouseholdWithAdmin(codeA, "adminA");
  await seedHouseholdWithAdmin(codeB, "adminB");
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.collection("users").doc("alice").collection("membershipRequests").doc(codeA)
      .set({ uid: "alice", code: codeA, status: "pending", requestedAt: new Date() });
    await db.collection("users").doc("bob").collection("membershipRequests").doc(codeB)
      .set({ uid: "bob", code: codeB, status: "pending", requestedAt: new Date() });
  });
  const adminADb = testEnv.authenticatedContext("adminA").firestore();
  // adminA interroge le foyer B, dont il n'est PAS admin -> aucun résultat autorisé
  await assertFails(
    adminADb.collectionGroup("membershipRequests").where("code", "==", codeB).get()
  );
  // adminA interroge son propre foyer A -> autorisé
  await assertSucceeds(
    adminADb.collectionGroup("membershipRequests").where("code", "==", codeA).get()
  );
});

// ─── Non-régression : super-admin, foyer principal ──────────────────
test("un membre (non admin) ne peut pas modifier le document principal du foyer", async () => {
  const code = "LLL222";
  await testEnv.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await db.collection("groupes").doc(code).set({ name: "Foyer test", members: [] });
    await db.collection("users").doc("membre1").collection("memberships").doc(code)
      .set({ role: "member", status: "active" });
  });
  const membre = testEnv.authenticatedContext("membre1").firestore();
  await assertFails(
    membre.collection("groupes").doc(code).update({ name: "Nom modifié" })
  );
});

test("un admin actif peut modifier le document principal du foyer", async () => {
  const code = "MMM333";
  await seedHouseholdWithAdmin(code, "admin1");
  const admin = testEnv.authenticatedContext("admin1").firestore();
  await assertSucceeds(
    admin.collection("groupes").doc(code).update({ name: "Nom modifié" })
  );
});
