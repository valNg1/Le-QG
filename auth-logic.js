// auth-logic.js
//
// Logique de décision pure pour le parcours d'authentification de Le Général.
// Aucune dépendance à Firebase, au DOM ou au navigateur : uniquement des
// fonctions pures (entrée -> sortie), pour pouvoir être testées avec Node
// sans émulateur Firestore, ET chargées telles quelles dans index.html.
// Une seule source de vérité : ce qui est testé est ce qui tourne en prod.
//
// Modèle (v3, revue sécurité du 27/07/2026) : inscription libre
// (self-service), mais REJOINDRE un foyer passe par une DEMANDE
// d'adhésion (users/{uid}/membershipRequests/{code}, status "pending"),
// jamais une adhésion directe. Seul un admin du foyer peut approuver
// (users/{uid}/memberships/{code}, toujours role "member" via ce
// chemin — voir firestore.rules). Un compte peut appartenir à
// PLUSIEURS foyers.

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.AuthLogic = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {

  // Ne garde que les adhésions actives (status === "active").
  function activeMemberships(memberships) {
    return (memberships || []).filter(m => m && m.status === "active");
  }

  // Ne garde que les demandes en attente (status === "pending").
  function pendingRequests(requests) {
    return (requests || []).filter(r => r && r.status === "pending");
  }

  // Décide quel écran afficher en fonction de l'état d'authentification.
  //
  // authUser    : null | { uid, email }
  // userDoc     : null | { email, isSuperAdmin }              (users/{uid})
  // memberships : [{ code, role, status }, ...]                (users/{uid}/memberships/*)
  // requests    : [{ code, status }, ...]                      (users/{uid}/membershipRequests/*)
  // hasProfile  : bool (prénom/avatar déjà choisis en local)
  //
  // Retourne l'un de :
  // "login" | "join-household" | "pending-approval" | "profile-setup" | "app"
  function resolveScreen(authUser, userDoc, memberships, requests, hasProfile) {
    if (!authUser) return "login";
    if (!userDoc) return "join-household"; // filet de sécurité, ne devrait pas arriver
    if (activeMemberships(memberships).length > 0) {
      return hasProfile ? "app" : "profile-setup";
    }
    if (pendingRequests(requests).length > 0) return "pending-approval";
    return "join-household";
  }

  // Un utilisateur est admin d'un foyer précis ("code") si son adhésion
  // à CE foyer porte le rôle "admin".
  function isHouseholdAdmin(memberships, code) {
    const m = (memberships || []).find(x => x && x.code === code);
    return !!m && m.status === "active" && m.role === "admin";
  }

  // Un utilisateur est super-admin (espace admin global, remplace l'ancien
  // mot de passe "2601") si SON PROPRE document users/{uid} porte le champ
  // isSuperAdmin: true. Axe global, indépendant de tout foyer particulier.
  function isSuperAdmin(userDoc) {
    return !!userDoc && userDoc.isSuperAdmin === true;
  }

  // Choisit le foyer actif par défaut parmi les adhésions actives :
  // conserve le foyer déjà sélectionné localement s'il est toujours
  // valide, sinon prend le premier disponible. Retourne null si aucun.
  function pickActiveHousehold(memberships, currentCode) {
    const active = activeMemberships(memberships);
    if (active.length === 0) return null;
    if (currentCode && active.some(m => m.code === currentCode)) return currentCode;
    return active[0].code;
  }

  // Un admin peut-il approuver CETTE demande précise ? Toujours faux si
  // l'admin est le demandeur lui-même (personne ne s'approuve soi-même),
  // même s'il est par ailleurs admin d'un AUTRE foyer.
  //
  // approverMemberships : adhésions de la personne qui clique "Approuver"
  // approverUid, requesterUid : uid des deux personnes
  // code : le foyer concerné
  function canApproveRequest(approverMemberships, approverUid, requesterUid, code) {
    if (!approverUid || !requesterUid) return false;
    if (approverUid === requesterUid) return false;
    return isHouseholdAdmin(approverMemberships, code);
  }

  // Construit le payload d'une nouvelle demande d'adhésion (self-service).
  // Toujours "pending" — jamais un statut qui donnerait un accès direct.
  function buildJoinRequestPayload(uid, code) {
    return { uid, code, status: "pending" };
  }

  // Construit le payload d'une adhésion APPROUVÉE. Toujours role:
  // "member" — il n'existe aucun chemin, dans ce fichier ni dans
  // firestore.rules, pour qu'une approbation self-service crée un rôle
  // "admin" ou un statut super-admin.
  function buildApprovedMembershipPayload() {
    return { role: "member", status: "active" };
  }

  // Validation d'un email seul (réutilisée par la connexion, l'inscription
  // et la récupération de mot de passe).
  function isValidEmail(email) {
    return !!email && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email).trim());
  }

  // Valide un formulaire de connexion email/mot de passe avant d'appeler
  // Firebase (retour rapide, message d'erreur clair, pas d'appel réseau
  // inutile sur un champ vide).
  function validateLoginForm(email, password) {
    const errors = [];
    if (!isValidEmail(email)) errors.push("email");
    if (!password || String(password).length < 1) errors.push("password");
    return { valid: errors.length === 0, errors };
  }

  // Valide le formulaire d'INSCRIPTION (self-service, mot de passe >= 6
  // caractères — minimum imposé par Firebase Auth).
  function validateSignupForm(email, password) {
    const errors = [];
    if (!isValidEmail(email)) errors.push("email");
    if (!password || String(password).length < 6) errors.push("password");
    return { valid: errors.length === 0, errors };
  }

  // Valide un code de foyer à rejoindre (format généré par le code :
  // 6 caractères, charset sans caractères ambigus).
  function isValidHouseholdCode(code) {
    return !!code && /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/.test(String(code).trim().toUpperCase());
  }

  // Traduit une erreur Firebase Auth (code) en message utilisateur clair,
  // sans jamais révéler si c'est l'email ou le mot de passe qui est faux
  // (bonne pratique de sécurité : ne pas aider à l'énumération de comptes).
  function loginErrorMessage(errorCode) {
    const generic = "Email ou mot de passe incorrect.";
    const map = {
      "auth/invalid-email": generic,
      "auth/user-not-found": generic,
      "auth/wrong-password": generic,
      "auth/invalid-credential": generic,
      "auth/user-disabled": "Ce compte a été désactivé.",
      "auth/too-many-requests": "Trop de tentatives. Réessaie dans quelques minutes.",
      "auth/network-request-failed": "Problème de connexion réseau.",
    };
    return map[errorCode] || generic;
  }

  // Traduit une erreur Firebase Auth survenue lors de l'INSCRIPTION.
  function signupErrorMessage(errorCode) {
    const map = {
      "auth/email-already-in-use": "Un compte existe déjà avec cet email — connecte-toi plutôt.",
      "auth/invalid-email": "Adresse email invalide.",
      "auth/weak-password": "Mot de passe trop faible (6 caractères minimum).",
      "auth/network-request-failed": "Problème de connexion réseau.",
    };
    return map[errorCode] || "Erreur lors de la création du compte.";
  }

  return {
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
  };
});
