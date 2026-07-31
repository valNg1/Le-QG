# Authentification — Le Général

## Vue d'ensemble

Le Général est une PWA statique (GitHub Pages) sans backend applicatif : toute
la logique tourne dans le navigateur et parle directement à Firebase
(Firestore + Authentication) via le SDK client compat v10.12.0.

**Modèle (v3, revue sécurité du 27/07/2026)** : inscription **libre**
(self-service), mais rejoindre un foyer passe désormais par une
**demande d'adhésion** (`status: "pending"`), jamais une adhésion
directe. Seul un admin du foyer concerné peut l'approuver. Un même
compte peut avoir plusieurs adhésions actives (plusieurs foyers).

> Deux versions antérieures ont existé brièvement (v1 : comptes créés à
> la main par l'admin ; v2 : rejoindre un foyer directement avec son
> code, sans validation) — voir les sections "Révision" de l'ADR pour
> le raisonnement de chaque changement. La v2 avait une faille : un code
> à 6 caractères, même difficile à deviner, ne constitue pas une
> autorisation — n'importe quel compte authentifié pouvait rejoindre
> n'importe quel foyer simplement en connaissant (ou en devinant) son
> code.

## Parcours

```
Visiteur non authentifié
      │
      ▼
Écran de connexion — #login-screen
(bascule "Créer un compte" <-> "Se connecter")
      │
      ▼
Firebase Auth confirme la session — onAuthStateChanged(user)
      │
      ▼
Lecture Firestore : users/{uid}, users/{uid}/memberships/*,
                    users/{uid}/membershipRequests/*
      │
      ├── aucune adhésion active, aucune demande pending
      │        ──►  #join-household-screen (code à 6 car.)
      │              │
      │              └─ crée users/{uid}/membershipRequests/{code}
      │                 (status: "pending" — PAS d'accès direct)
      │
      ├── aucune adhésion active, une demande pending existe
      │        ──►  #pending-approval-screen (écran d'attente)
      │              │
      │              └─ un ADMIN du foyer approuve depuis Mon QG
      │                 (bouton ✓ dans "Demandes en attente")
      │                 → crée users/{uid}/memberships/{code}
      │                   avec role: "member" (jamais "admin")
      │
      ▼ (au moins une adhésion active)
state.groupCode = foyer actif choisi
state.isAdmin   = rôle "admin" sur CE foyer précis
      │
      ├── prénom/avatar pas encore choisis  ──►  écran existant (ob-step1)
      │
      ▼
Accueil de Le Général (startApp())
```

## Approbation des demandes (admin de foyer)

Dans **Mon QG**, un admin de foyer voit une section "📥 Demandes en
attente" listant toutes les demandes `pending` adressées à ses foyers
(requête Firestore "collection group" sur `membershipRequests`, filtrée
par règles pour ne montrer que celles concernant les foyers dont il est
admin actif). Deux boutons : ✓ (approuve — crée l'adhésion en
`role: "member"`) et ✕ (refuse — passe la demande à `status: "rejected"`).

Un admin ne peut jamais approuver sa propre demande, même s'il est admin
d'un autre foyer (`AuthLogic.canApproveRequest`, doublé côté règles
Firestore par `request.auth.uid != resource.data.uid`).

Le prénom et l'avatar restent des **profils fonctionnels du foyer**
(affichage, présence au dîner, etc.) — ils ne constituent en aucun cas une
authentification.

## Multi-foyers

Un compte peut appartenir à plusieurs foyers. Dans **Mon QG**, la section
"Tes foyers" liste toutes les adhésions actives avec un bouton "Basculer"
pour changer le foyer actuellement affiché, et un champ pour rejoindre un
foyer supplémentaire à tout moment (même logique que l'écran initial
`#join-household-screen`, réutilisée via `submitJoinRequest()` — qui crée
une DEMANDE, pas une adhésion directe).

## Fichiers concernés

| Fichier | Rôle |
|---|---|
| `auth-logic.js` | Logique de décision pure : quel écran afficher (`resolveScreen`), validation des formulaires (connexion/inscription/code de foyer), sélection du foyer actif (`pickActiveHousehold`), rôles (`isHouseholdAdmin` par foyer, `isSuperAdmin` global). Zéro dépendance Firebase/DOM — testable avec Node seul. |
| `index.html` | Écrans `#login-screen` (connexion + inscription) / `#join-household-screen` / `#pending-approval-screen`, `wireLoginForm()`, `wireJoinHouseholdForm()`, `submitJoinRequest()`, `handleAuthStateChange()`, `proceedAfterAuth()` (bootstrap post-auth), `renderGroupe()` (liste des foyers + switcher + demandes en attente), `loadPendingRequests()` / `handleRequestDecision()` (approbation admin), `initAdminSection()` (espace admin global, gardé par `state.isSuperAdmin`). |
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

### `users/{uid}/membershipRequests/{code}` (une demande = un document)

```jsonc
{
  "uid": "abc123...",         // dupliqué du chemin — nécessaire pour les
  "code": "8W5D2B",           // requêtes "collection group" par un admin
  "status": "pending",        // "pending" | "approved" | "rejected"
  "requestedAt": <timestamp>
}
```

Créé en self-service si le foyer existe et qu'on n'a pas déjà une
adhésion active pour ce code. Ne donne AUCUN accès aux données du foyer
— seule une adhésion (voir ci-dessous) le fait. Seul un admin du foyer
concerné peut faire passer `status` à `"approved"` ou `"rejected"` ;
jamais le demandeur lui-même.

### `users/{uid}/memberships/{code}` (une adhésion active = un document)

```jsonc
{
  "role": "member",     // "member" | "admin"
  "status": "active",   // "active" | "disabled"
}
```

Ne peut être créé ou modifié que par un admin actif du foyer concerné
(via l'approbation d'une demande), et toujours avec `role: "member"` —
impossible d'obtenir `role: "admin"` par ce chemin, quel que soit qui
écrit. Le rôle `"admin"` d'un foyer reste attribué à la main (Firestore
Console) — voir `runbook.md`.

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
