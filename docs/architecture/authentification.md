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
| `firestore.rules` | Règles serveur : refus par défaut, isolation stricte par foyer, `users/` et `superadmins/` en lecture seule (soi-même uniquement), jamais d'écriture client sur ces deux collections. |
| `tests/auth-logic.test.js` | Couverture de `auth-logic.js` (Node natif, `node --test`, zéro dépendance). |

## Modèle de données Firestore

### `users/{uid}` (nouveau)

```jsonc
{
  "email": "val@example.com",
  "householdId": "ABC123",   // = l'ancien groupCode
  "role": "admin",           // "admin" | "member"
  "status": "active",        // "active" | "disabled"
  "name": "Val",             // optionnel, informatif
  "createdAt": <timestamp>
}
```

Créé et modifié **uniquement à la main dans la Firebase Console** (ou via
l'onglet Firestore de la console). Aucune écriture client autorisée
(`firestore.rules`). Lecture limitée au propriétaire (`request.auth.uid ==
uid`).

### `superadmins/{uid}` (nouveau)

Document vide ou `{ "since": <timestamp> }` — seule son **existence**
compte. Remplace le mot de passe `"2601"` codé en dur pour l'accès au
panneau d'administration global (liste de tous les foyers, suspension,
lien Stripe). Lecture limitée au propriétaire, aucune écriture client.

### `groupes/{code}` (existant, inchangé dans sa forme)

Inchangé : `{ code, name, admin, members: [{name, avatar}], createdAt,
suspended? }`. Ce qui change, c'est **qui peut y accéder** (voir
`firestore.rules` et `security-baseline.md`) — ce n'est plus "quiconque
connaît le code", mais "un membre authentifié dont `users/{uid}.householdId
== code`", ou un super-admin.

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
