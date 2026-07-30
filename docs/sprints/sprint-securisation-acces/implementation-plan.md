# Sprint sécurisation de l'accès — Plan d'implémentation

## Ordre suivi (repris du cadrage du directeur technique)

- [x] A. Audit complet et identification des données existantes
- [x] B. Plan de sauvegarde (voir `runbook.md`)
- [x] C. Tests en échec décrivant le comportement cible
      (`tests/auth-logic.test.js`, rouges avant `auth-logic.js`)
- [x] D. Implémentation de Firebase Auth côté application
- [x] E. Modèle de rattachement utilisateur/foyer (`users/{uid}`)
- [x] F. Remplacement de l'accès administrateur actuel (superadmin Firestore)
- [x] G. Écriture des règles Firestore (`firestore.rules`)
- [x] H. Tests, lint, typecheck et build
- [ ] I. Action manuelle : activation Email/Password (Firebase Console)
- [ ] J. Action manuelle : création du compte administrateur
- [ ] K. Récupération et configuration de son uid
- [ ] L. Test de connexion sans verrouiller Firestore
- [ ] M. Déploiement GitHub Pages
- [ ] N. Validation fonctionnelle
- [ ] O. Déploiement des règles Firestore en dernière étape
- [ ] P. Recette de production
- [ ] Q. Documentation et preuves finales

Les étapes A → H sont couvertes par ce commit. I → Q reprennent après
retour du directeur technique sur les actions manuelles listées dans
`runbook.md`.

## Fichiers créés

- `auth-logic.js` — logique de décision pure
- `tests/auth-logic.test.js` — 14 tests (Node natif, zéro dépendance)
- `package.json` — script `npm test` uniquement
- `firestore.rules` — règles serveur
- `docs/architecture/authentification.md`
- `docs/architecture/security-baseline.md`
- `docs/decisions/ADR-authentification.md`
- `docs/operations/deployment.md`
- `docs/operations/runbook.md`
- `docs/sprints/sprint-securisation-acces/implementation-plan.md` (ce fichier)
- `docs/sprints/sprint-securisation-acces/cahier-de-recette.md`

## Fichiers modifiés

- `index.html` :
  - ajout des SDK `firebase-auth-compat.js` et `auth-logic.js`
  - ajout des écrans `#login-screen` et `#access-denied-screen`
  - ajout du bouton "🔓 Se déconnecter" (Mon QG)
  - `initFirebase()` : simplifié (délègue à `startApp()`, corrige au
    passage un bug de double-listener Firestore déjà traité en amont de
    ce sprint)
  - nouveau : `proceedAfterAuth()` (= ancien contenu de
    `DOMContentLoaded`, inchangé), `hideSplash()`, `showAuthScreen()`,
    `wireLoginForm()`, `handleAuthStateChange()`
  - `initAdminSection()` : mot de passe codé en dur remplacé par
    vérification `state.isSuperAdmin`
  - état par défaut : ajout de `isSuperAdmin: false`

## Limite connue de l'environnement de développement

Le sandbox utilisé pour ce travail n'a pas d'accès réseau à
`firebase.google.com` / `googleapis.com`. Conséquences :
- Impossible de tester ces règles avec l'émulateur Firestore depuis cet
  environnement (l'émulateur télécharge ses binaires depuis
  `storage.googleapis.com`, domaine non accessible ici).
- Impossible d'activer Email/Password, créer le compte admin, ou
  déployer les règles depuis cet environnement — actions manuelles
  requises (voir `runbook.md`).

La logique métier (routage écran, validation formulaire, messages
d'erreur) est intégralement couverte par des tests Node purs
(`tests/auth-logic.test.js`), qui ne nécessitent aucun accès réseau. Les
règles Firestore elles-mêmes n'ont donc **pas** de couverture automatisée
dans ce sprint — la recette de production (`cahier-de-recette.md`) sert de
filet de sécurité manuel à leur place.
