# Authentification — Le Général

## Vue d'ensemble

Le Général est une PWA statique (GitHub Pages) sans backend applicatif : toute
la logique tourne dans le navigateur et parle directement à Firebase
(Firestore + Authentication) via le SDK client compat v10.12.0.

**Modèle (v2, pivot du 27/07/2026)** : inscription **libre** (self-service),
appartenance à **plusieurs foyers** possible pour un même compte. Rejoindre
un foyer nécessite d'en connaître le code à 6 caractères — c'est la barrière
fonctionnelle (comme avant la sécurisation), mais désormais chaque personne a
une vraie identité Firebase derrière.

> Une v1 antérieure (comptes créés à la main par l'admin, un seul foyer par
> compte) a existé brièvement avant ce pivot — voir l'ADR pour le
> raisonnement du changement.

## Parcours

```
Visiteur non authentifié
      │
      ▼
Écran de connexion — #login-screen
(bascule "Créer un compte" <-> "Se connecter" sur le même écran)
      │
      ├── Inscription : createUserWithEmailAndPassword()
      │   puis création immédiate de users/{uid} (email, isSuperAdmin: false)
      │
      └── Connexion : signInWithEmailAndPassword()
      ▼
Firebase Auth confirme la session — onAuthStateChanged(user)
      │
      ▼
Lecture Firestore : users/{uid} + users/{uid}/memberships/* (collection)
      │
      ├── aucune adhésion active  ──►  #join-household-screen (code à 6 car.)
      │                                   │
      │                                   └─ crée users/{uid}/memberships/{code}
      │                                      (toujours role: "member")
      │
      ▼ (au moins une adhésion active)
state.groupCode = foyer actif choisi (conserve le précédent si valide,
                  sinon le premier actif — voir pickActiveHousehold)
state.isAdmin   = rôle "admin" sur CE foyer précis (isHouseholdAdmin)
state.isSuperAdmin = champ global sur users/{uid} (indépendant des foyers)
      │
      ├── prénom/avatar pas encore choisis  ──►  écran existant (ob-step1)
      │
      ▼
Accueil de Le Général (startApp())
```

Le prénom et l'avatar restent des **profils fonctionnels du foyer**
(affichage, présence au dîner, etc.) — ils ne constituent en aucun cas une
authentification.

## Multi-foyers

Un compte peut appartenir à plusieurs foyers. Dans **Mon QG**, la section
"Tes foyers" liste toutes les adhésions actives avec un bouton "Basculer"
pour changer le foyer actuellement affiché, et un champ pour rejoindre un
foyer supplémentaire à tout moment (même logique que l'écran initial
`#join-household-screen`, réutilisée via `joinHouseholdByCode()`).

## Fichiers concernés

| Fichier | Rôle |
|---|---|
| `auth-logic.js` | Logique de décision pure : quel écran afficher (`resolveScreen`), validation des formulaires (connexion/inscription/code de foyer), sélection du foyer actif (`pickActiveHousehold`), rôles (`isHouseholdAdmin` par foyer, `isSuperAdmin` global). Zéro dépendance Firebase/DOM — testable avec Node seul. |
| `index.html` | Écrans `#login-screen` (connexion + inscription) / `#join-household-screen`, `wireLoginForm()`, `wireJoinHouseholdForm()`, `joinHouseholdByCode()`, `handleAuthStateChange()`, `proceedAfterAuth()` (bootstrap post-auth, simplifié), `renderGroupe()` (liste des foyers + switcher), `initAdminSection()` (espace admin global, gardé par `state.isSuperAdmin`). |
| `firestore.rules` | Règles serveur : refus par défaut, isolation stricte par foyer via `users/{uid}/memberships/{code}`, inscription libre mais encadrée (jamais super-admin auto-attribué, jamais admin auto-attribué en rejoignant un foyer). |
| `tests/auth-logic.test.js` | Couverture de `auth-logic.js` (Node natif, `node --test`, zéro dépendance). |

## Modèle de données Firestore

### `users/{uid}`

```jsonc
{
  "email": "quelquun@example.com",
  "isSuperAdmin": false,      // axe global, indépendant de tout foyer
  "createdAt": <timestamp>
}
```

Créé par l'utilisateur lui-même au moment de l'inscription (auto-service).
Modifiable uniquement par son propriétaire, et seulement pour des champs
qui ne sont ni `email` ni `isSuperAdmin` (ces deux-là sont figés après
création côté règles Firestore — pas de self-service pour devenir
super-admin).

### `users/{uid}/memberships/{code}` (une adhésion = un document)

```jsonc
{
  "role": "member",     // "member" | "admin" — jamais "admin" en self-service
  "status": "active",   // "active" | "disabled"
  "joinedAt": <timestamp>
}
```

Créé en self-service **uniquement si le foyer `code` existe déjà**
(`exists(/groupes/{code})`), toujours avec `role: "member"` et
`status: "active"` — impossible de s'auto-attribuer le rôle admin par ce
chemin. Le rôle `"admin"` d'un foyer reste attribué à la main (Firestore
Console) pour l'instant — voir `runbook.md`.

Modéliser chaque adhésion comme un document séparé (plutôt qu'un champ
dans une map sur `users/{uid}`) simplifie beaucoup les règles Firestore :
pas besoin de valider un diff de map, juste une règle `create` standard.

### `groupes/{code}` (existant, inchangé dans sa forme)

Inchangé : `{ code, name?, admin?, members: [{name, avatar}], createdAt,
suspended? }`. Ce qui a changé : qui peut y accéder (voir
`firestore.rules`) — plus "quiconque connaît le code", mais "un membre
authentifié dont `users/{uid}/memberships/{code}.status == 'active'`", ou
un super-admin. La création de nouveaux foyers reste hors périmètre de ce
sprint (Console uniquement).

## Session

- Persistance : comportement par défaut du SDK Firebase Auth web — une
  session survit à un rafraîchissement de page sans reconnexion.
- Détection de session : `firebase.auth().onAuthStateChanged()`, seule
  source de vérité.
- Déconnexion : bouton "🔓 Se déconnecter" (Mon QG) et sur l'écran
  "rejoindre un foyer" → `firebase.auth().signOut()`.

## Récupération de mot de passe

Bouton "Mot de passe oublié ?" sur l'écran de connexion (masqué en mode
inscription) → `firebase.auth().sendPasswordResetEmail(email)`. Même
message de confirmation que le compte existe ou non (protection contre
l'énumération de comptes).

## Espace admin global (super-admin)

Inchangé dans son principe : `state.isSuperAdmin` (dérivé du champ
`isSuperAdmin` sur `users/{uid}`) gate l'accès au panneau qui liste tous
les foyers et permet de les suspendre/réactiver. Attribué à la main dans
Firestore Console (jamais via l'app).
