# Runbook — Le Général

## Créer un nouveau compte utilisateur autorisé

1. **Firebase Console** → projet `le-qg-1a6e7` → **Authentication** →
   onglet **Users** → bouton **Add user**.
2. Renseigner l'email et un mot de passe temporaire. Cliquer **Add user**.
3. Copier l'**UID** affiché dans la liste (colonne "User UID").
4. **Firestore Database** → collection `users` → **Add document**.
   - ID du document : coller l'UID copié à l'étape 3.
   - Champs :
     | Champ | Type | Valeur |
     |---|---|---|
     | `email` | string | (le même email qu'à l'étape 2) |
     | `householdId` | string | le `groupCode` du foyer (6 caractères, ex. `ABC123`) |
     | `role` | string | `"admin"` ou `"member"` |
     | `status` | string | `"active"` |
     | `name` | string | (optionnel, informatif) |
5. Communiquer email + mot de passe temporaire à la personne (elle pourra
   le changer une fois connectée — pas encore de self-service en V1, à
   faire manuellement si besoin de reset).

## Désactiver un accès

Firestore → `users/{uid}` → passer `status` à `"disabled"`. Prend effet
au prochain contrôle (rafraîchissement de page ou reconnexion) grâce aux
règles Firestore — pas besoin de toucher Firebase Auth lui-même.

## Donner/retirer le statut super-admin (panneau global)

- Donner : Firestore → collection `superadmins` → **Add document**, ID =
  l'UID de la personne, contenu libre (ex. `{}` ou `{"since": <date>}`).
- Retirer : supprimer ce document.

## Activer Email/Password (à faire une seule fois, avant tout le reste)

1. Firebase Console → projet `le-qg-1a6e7` → **Authentication** → onglet
   **Sign-in method**.
2. Cliquer sur **Email/Password** dans la liste des providers.
3. Activer le toggle **Enable** (premier interrupteur, "Email/Password" —
   pas "Email link (passwordless sign-in)", qui doit rester désactivé).
4. **Save**.

## Ordre d'exécution complet (ne jamais dévier)

1. Activer Email/Password (ci-dessus).
2. Créer TON compte admin (section "Créer un nouveau compte utilisateur",
   avec `role: "admin"` et le `householdId` de ton foyer existant).
3. Créer ton document `superadmins/{tonUID}`.
4. Tester la connexion sur le site **avant** de publier les règles
   Firestore restrictives (les règles actuelles, quelles qu'elles soient
   en Console, restent en place jusque-là).
5. Une fois connecté avec succès et l'app accessible : publier
   `firestore.rules` (voir `deployment.md`).
6. Retester immédiatement la connexion + navigation après publication des
   règles.
7. Si un souci bloque l'accès après publication des règles : rollback
   (section suivante).

## Rollback règles Firestore

Si les nouvelles règles bloquent un accès légitime :
1. Firebase Console → Firestore → Règles → historique des versions
   (Firestore garde les versions précédentes).
2. Restaurer la version précédente, ou republier temporairement une règle
   permissive (`allow read, write: if request.auth != null;`) le temps de
   diagnostiquer, puis republier la version corrigée.

## Rollback application

Le déploiement GitHub Pages suit `main` : `git revert` du commit
concerné puis push revient à l'état précédent. `auth-logic.js` et
`firestore.rules` sont versionnés avec le reste — un `git revert` global
les restaure ensemble.

## Sauvegarde Firestore (avant toute migration de données)

Depuis cet environnement de développement, l'export Firestore n'est pas
accessible (pas de réseau vers `googleapis.com`). À faire toi-même :

**Option Console (le plus simple pour un petit volume)**
Ouvrir chaque document concerné (`groupes/{code}` et ses
sous-collections) et copier son contenu JSON manuellement — volumes
actuels très faibles (un seul foyer).

**Option CLI (export complet, recommandé si tu as `gcloud`/`firebase-tools`)**
```bash
gcloud firestore export gs://<un-bucket-a-toi> --project le-qg-1a6e7
```
(nécessite un bucket Cloud Storage existant et les droits associés).

Pour ce chantier précis, aucune donnée existante n'est modifiée ni
supprimée (`groupes/{code}` reste intact) : la sauvegarde est une
précaution, pas un prérequis strict, mais reste recommandée avant de
publier les nouvelles règles.
