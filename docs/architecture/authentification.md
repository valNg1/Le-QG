# Authentification — Le Général

## Vue d'ensemble

Le Général est une PWA statique (GitHub Pages) sans backend applicatif : toute
la logique tourne dans le navigateur et parle directement à Firebase
(Firestore + Authentication) via le SDK client compat v10.12.0.

Parcours cible :

```
Visiteur non authentifié
      │
      ▼
Écran de connexion (email + mot de passe) ── #login-screen
      │  firebase.auth().signInWithEmailAndPassword()
      ▼
Firebase Auth confirme la session
      │  onAuthStateChanged(user)
      ▼
Lecture Firestore : users/{uid}
      │
      ├── doc absent OU status != "active"  ──►  #access-denied-screen
      │
      ▼ (doc présent, status == "active")
state.groupCode = users/{uid}.householdId
state.isAdmin   = (users/{uid}.role == "admin")
      │
      ├── prénom/avatar pas encore choisis  ──►  écran existant (ob-step1)
      │
      ▼
Accueil de Le Général (startApp())
```

Le prénom et l'avatar restent des **profils fonctionnels du foyer**
(affichage, présence au dîner, etc.) — ils ne constituent en aucun cas une
authentification et n'ont plus aucun rôle dans le contrôle d'accès.

## Pourquoi ce modèle (résumé — voir l'ADR pour le détail)

- Pas d'inscription publique : les comptes sont créés **manuellement** par
  Val dans la Firebase Console (Authentication → Users), avec un document
  `users/{uid}` correspondant créé à la main dans Firestore.
- Un compte Firebase distinct par personne autorisée (pas de mot de passe
  familial partagé).
- Le foyer (`groupCode`/`householdId`) et le rôle (`admin`/`member`) sont
  **déterminés côté serveur** (document `users/{uid}`), jamais choisis ou
  modifiables par le client.

## Fichiers concernés

| Fichier | Rôle |
|---|---|
| `auth-logic.js` | Logique de décision pure (quel écran afficher, validation du formulaire, messages d'erreur). Zéro dépendance Firebase/DOM — testable avec Node seul. Chargé à la fois dans `index.html` et dans les tests. |
| `index.html` | Écrans `#login-screen` / `#access-denied-screen`, `wireLoginForm()`, `handleAuthStateChange()`, `proceedAfterAuth()` (ancien bootstrap, inchangé, simplement déplacé derrière la vérification d'auth), `initAdminSection()` (espace admin, désormais gardé par `state.isSuperAdmin` au lieu d'un mot de passe). |
| `firestore.rules` | Règles serveur : refus par défaut, isolation stricte par foyer, `users/{uid}` en lecture seule (soi-même uniquement), jamais d'écriture client dessus. |
| `tests/auth-logic.test.js` | Couverture de `auth-logic.js` (Node natif, `node --test`, zéro dépendance). |

## Modèle de données Firestore

### `users/{uid}` (nouveau — source de vérité unique)

```jsonc
{
  "email": "val@example.com",
  "householdId": "ABC123",   // = l'ancien groupCode
  "role": "admin",           // "admin" | "member" — scopé au foyer
  "status": "active",        // "active" | "disabled"
  "isSuperAdmin": true,      // optionnel, false/absent par défaut — axe
                              // global indépendant du rôle de foyer (voir
                              // ADR pour la justification du modèle)
  "name": "Val",             // optionnel, informatif
  "createdAt": <timestamp>
}
```

Un seul document par utilisateur, une seule source de vérité : le rôle de
foyer (`role`) et le statut super-admin global (`isSuperAdmin`) sont deux
champs indépendants du même document, pas deux collections séparées.

Créé et modifié **uniquement à la main dans la Firebase Console** (ou via
l'onglet Firestore de la console). Aucune écriture client autorisée
(`firestore.rules`). Lecture limitée au propriétaire (`request.auth.uid ==
uid`).

Remplace l'ancien mot de passe `"2601"` codé en dur pour l'accès au
panneau d'administration global (liste de tous les foyers, suspension,
lien Stripe) : ce panneau n'est visible que si `isSuperAdmin === true` sur
son propre document, vérifié à la fois côté UI et côté règles Firestore.

### `groupes/{code}` (existant, inchangé dans sa forme)

Inchangé : `{ code, name, admin, members: [{name, avatar}], createdAt,
suspended? }`. Ce qui change, c'est **qui peut y accéder** (voir
`firestore.rules` et `security-baseline.md`) — ce n'est plus "quiconque
connaît le code", mais "un membre authentifié dont `users/{uid}.householdId
== code`", ou un super-admin.

## Récupération de mot de passe

Bouton "Mot de passe oublié ?" sur l'écran de connexion → appelle
`firebase.auth().sendPasswordResetEmail(email)` (mécanisme standard
Firebase, aucune infrastructure email à gérer côté Le Général). Le même
message de confirmation s'affiche que le compte existe ou non (protection
contre l'énumération de comptes, cohérent avec `loginErrorMessage`).

## Session

- Persistance : comportement par défaut du SDK Firebase Auth web
  (`indexedDB`/`localStorage` selon navigateur) — une session survit à un
  rafraîchissement de page sans reconnexion.
- Détection de session : `firebase.auth().onAuthStateChanged()`, seule
  source de vérité pour savoir si quelqu'un est connecté. Jamais de
  logique "êtes-vous connecté" basée sur `localStorage`/`state` seuls.
- Expiration : gérée nativement par le SDK (rafraîchissement de token en
  arrière-plan) ; si le compte est désactivé côté Firebase Auth
  (`auth/user-disabled`) ou que son document `users/{uid}` passe à
  `status: "disabled"`, l'accès est coupé au prochain contrôle
  (`onAuthStateChanged` ou prochaine lecture Firestore, qui échouera grâce
  aux règles).
- Déconnexion : bouton "🔓 Se déconnecter" (Mon QG) et sur l'écran
  d'accès refusé → `firebase.auth().signOut()` → `onAuthStateChanged(null)`
  → retour à `#login-screen`.

## Ce qui N'A PAS changé

- L'écran prénom/avatar (`ob-step1`) et son fonctionnement.
- Le modèle `groupes/{code}` et ses sous-collections `events`, `mur`,
  `diner`.
- `createGroup()` / `joinGroup()` restent dans le code (compatibilité),
  mais ne sont plus le chemin principal d'accès : le foyer d'un utilisateur
  authentifié est désormais fixé par son document `users/{uid}`, qui prend
  le pas sur toute valeur locale.
- L'hébergement GitHub Pages, Firestore, le reste des fonctionnalités
  (météo, dîner, médias, quiz, mini-apps sport).
