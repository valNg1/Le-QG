# Déploiement — Le Général

## Application (GitHub Pages)

Inchangé par ce chantier :

1. Push sur `main` du repo `valNg1/Le-QG`.
2. Si le build GitHub Pages reste bloqué en "building" : pousser un
   commit sur `README.md`, puis `POST /repos/valNg1/Le-QG/pages/builds`
   (ou `git commit --allow-empty` + push). Vérifier via
   `GET /repos/valNg1/Le-QG/pages/builds/latest` (statut `built`).
3. Toujours bumper `version.json` **et** la constante `APP_VERSION` dans
   `index.html` ensemble (sinon le bandeau de mise à jour boucle — bug
   déjà rencontré et corrigé une fois, voir historique de commits).

## Règles Firestore (nouveau avec ce chantier)

Le sandbox de développement n'a **pas accès réseau** à
`firebase.google.com` / `googleapis.com` : le fichier `firestore.rules`
de ce repo ne peut donc pas être déployé automatiquement depuis cet
environnement. Deux options pour toi :

**Option A — Copier-coller dans la Console (le plus simple)**
1. Firebase Console → projet `le-qg-1a6e7` → Firestore Database → onglet
   **Règles**.
2. Ouvre `firestore.rules` dans ce repo, copie tout le contenu.
3. Colle-le dans l'éditeur de règles de la Console, clique **Publier**.

**Option B — Firebase CLI depuis ta machine**
```bash
npm install -g firebase-tools   # une fois
firebase login                  # ouvre un navigateur, OAuth Google
firebase deploy --only firestore:rules --project le-qg-1a6e7
```
(nécessite un `firebase.json` minimal pointant vers `firestore.rules` —
je peux le générer si tu choisis cette option.)

**Important** : ne publie les nouvelles règles qu'**après** avoir créé ton
compte Firebase Auth, ton document `users/{uid}` et vérifié que la
connexion fonctionne (voir `runbook.md` — ordre d'exécution). Publier les
règles restrictives avant que ton compte existe te couperait l'accès à
toi-même.

## Comptes utilisateurs (self-service depuis le pivot du 27/07/2026)

Inscription libre depuis l'écran de connexion — rien à faire côté
Console pour un nouveau compte ou pour rejoindre un foyer existant.
Voir `runbook.md` uniquement pour : créer un nouveau foyer, promouvoir
quelqu'un admin d'un foyer, ou donner le statut super-admin — ces
actions-là restent manuelles (Console).
