// auth-logic.js
//
// Logique de décision pure pour le parcours d'authentification de Le Général.
// Aucune dépendance à Firebase, au DOM ou au navigateur : uniquement des
// fonctions pures (entrée -> sortie), pour pouvoir être testées avec Node
// sans émulateur Firestore, ET chargées telles quelles dans index.html.
// Une seule source de vérité : ce qui est testé est ce qui tourne en prod.

(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.AuthLogic = factory();
  }
})(typeof self !== "undefined" ? self : this, function () {

  // Décide quel écran afficher en fonction de l'état d'authentification.
  //
  // authUser : null | { uid, email }               (firebase.auth().currentUser)
  // userDoc  : null | { householdId, role, status } (doc Firestore users/{uid})
  // hasProfile : bool (prénom/avatar déjà choisis en local pour ce foyer)
  //
  // Retourne l'un de : "login" | "access-denied" | "profile-setup" | "app"
  function resolveScreen(authUser, userDoc, hasProfile) {
    if (!authUser) return "login";
    if (!userDoc) return "access-denied";
    if (userDoc.status !== "active") return "access-denied";
    if (!hasProfile) return "profile-setup";
    return "app";
  }

  // Un utilisateur est admin de FOYER si son rôle enregistré est "admin".
  function isHouseholdAdmin(userDoc) {
    return !!userDoc && userDoc.role === "admin";
  }

  // Un utilisateur est super-admin (espace admin global, remplace l'ancien
  // mot de passe "2601") si SON PROPRE document users/{uid} porte le champ
  // isSuperAdmin: true. Un seul document, une seule source de vérité : pas
  // de collection séparée. "role" est scopé au foyer (household admin),
  // isSuperAdmin est un axe orthogonal et global — les deux vivent dans le
  // même document utilisateur.
  function isSuperAdmin(userDoc) {
    return !!userDoc && userDoc.isSuperAdmin === true;
  }

  // Validation d'un email seul (réutilisée par le formulaire de connexion
  // et par la récupération de mot de passe).
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

  // Valide le formulaire de création d'un compte membre (utilisé par un
  // admin de foyer pour provisionner sa famille — aucune inscription
  // publique, c'est toujours l'admin qui saisit ces informations).
  function validateNewMemberForm(email, password) {
    const errors = [];
    if (!isValidEmail(email)) errors.push("email");
    if (!password || String(password).length < 6) errors.push("password");
    return { valid: errors.length === 0, errors };
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

  // Traduit une erreur Firebase Auth survenue lors de la CRÉATION d'un
  // compte membre (contexte différent de la connexion : ici l'admin a le
  // droit de savoir précisément ce qui cloche, ce n'est pas une tentative
  // de connexion d'un tiers).
  function createAccountErrorMessage(errorCode) {
    const map = {
      "auth/email-already-in-use": "Un compte existe déjà avec cet email.",
      "auth/invalid-email": "Adresse email invalide.",
      "auth/weak-password": "Mot de passe trop faible (6 caractères minimum).",
      "auth/network-request-failed": "Problème de connexion réseau.",
    };
    return map[errorCode] || "Erreur lors de la création du compte.";
  }

  return {
    resolveScreen,
    isHouseholdAdmin,
    isSuperAdmin,
    isValidEmail,
    validateLoginForm,
    validateNewMemberForm,
    loginErrorMessage,
    createAccountErrorMessage,
  };
});
