// auth-logic.js
//
// Logique de décision pure pour le parcours d'authentification de Le Général.
// Aucune dépendance à Firebase, au DOM ou au navigateur : uniquement des
// fonctions pures (entrée -> sortie), pour pouvoir être testées avec Node
// sans émulateur Firestore, ET chargées telles quelles dans index.html.
// Une seule source de vérité : ce qui est testé est ce qui tourne en prod.
//
// Modèle : inscription libre (self-service), appartenance à PLUSIEURS
// foyers possible. Chaque adhésion vit dans users/{uid}/memberships/{code}
// (voir firestore.rules) ; ici on manipule ces adhésions sous forme d'un
// tableau simple [{code, role, status}, ...].

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

  // Décide quel écran afficher en fonction de l'état d'authentification.
  //
  // authUser    : null | { uid, email }
  // userDoc     : null | { email, isSuperAdmin }        (users/{uid})
  // memberships : [{ code, role, status }, ...]          (users/{uid}/memberships/*)
  // hasProfile  : bool (prénom/avatar déjà choisis en local)
  //
  // Retourne l'un de : "login" | "join-household" | "profile-setup" | "app"
  function resolveScreen(authUser, userDoc, memberships, hasProfile) {
    if (!authUser) return "login";
    if (!userDoc) return "join-household"; // filet de sécurité, ne devrait pas arriver
    if (activeMemberships(memberships).length === 0) return "join-household";
    if (!hasProfile) return "profile-setup";
    return "app";
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
    isHouseholdAdmin,
    isSuperAdmin,
    pickActiveHousehold,
    isValidEmail,
    validateLoginForm,
    validateSignupForm,
    isValidHouseholdCode,
    loginErrorMessage,
    signupErrorMessage,
  };
});
