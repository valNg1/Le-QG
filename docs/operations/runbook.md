# Runbook — Le Général

## Inscription et rattachement à un foyer (self-service + approbation admin)

N'importe qui peut s'inscrire depuis l'écran de connexion ("Pas encore
de compte ? Crée-toi en un"), puis demander à rejoindre un foyer en
saisissant son code à 6 caractères. **Cette demande n'accorde aucun
accès direct** : elle reste "en attente" jusqu'à ce qu'un admin du
foyer l'approuve depuis **Mon QG → "📥 Demandes en attente"** (bouton
✓). Rien à faire côté Console pour ça — l'admin traite ses demandes
directement dans l'app.

## Créer un nouveau foyer

Hors périmètre self-service pour l'instant (voir ADR). Pour créer un
nouveau foyer :
1. **Firestore Database** → collection **groupes** → **Ajouter un
   document** avec un ID à 6 caractères (charset
   `ABCDEFGHJKLMNPQRSTUVWXYZ23456789`, en évitant `0/O/1/I` par
   convention avec le reste du code), champs `name`, `members: []`,
   `createdAt`.
2. La première personne qui doit être admin de ce foyer doit ensuite
   avoir son adhésion promue à la main (étape suivante).

## Promouvoir quelqu'un admin d'un foyer

Toute personne qui rejoint un foyer en self-service obtient `role:
"member"` — jamais `admin` (contrainte imposée par les règles
Firestore, pas contournable côté client). Pour la promouvoir :

**Firestore Database** → `users/{sonUID}/memberships/{code}` → modifie
le champ `role` de `"member"` à `"admin"`.

(Retrouver l'UID de la personne : **Authentication → Users**, colonne
"User UID", en cherchant par email.)

## Donner/retirer le statut super-admin (panneau global)

- Donner : Firestore → `users/{uid}` → ajouter/modifier le champ
  `isSuperAdmin` → valeur `true` (booléen).
- Retirer : repasser ce champ à `false` (ou le supprimer).

## Désactiver l'accès de quelqu'un à UN foyer précis

Firestore → `users/{uid}/memberships/{code}` → passer `status` à
`"disabled"`. La personne perd l'accès à CE foyer uniquement — si elle a
rejoint d'autres foyers, ils restent accessibles.

## Désactiver un compte entièrement

Firebase Console → Authentication → Users → menu ⋮ sur la ligne du
compte → **Disable account**. Coupe l'accès à Firebase Auth lui-même
(plus radical que désactiver une seule adhésion).

## Activer Email/Password (déjà fait, à ne pas refaire)

1. Firebase Console → projet `le-qg-1a6e7` → **Authentication** → onglet
   **Sign-in method**.
2. **Email/Password** → **Enable** (premier interrupteur uniquement,
   pas "Email link").
3. **Save**.

## Rollback règles Firestore

Si les règles bloquent un accès légitime :
1. Firebase Console → Firestore → Règles → historique des versions.
2. Restaurer la version précédente, ou republier temporairement
   `allow read, write: if request.auth != null;` le temps de
   diagnostiquer, puis republier la version corrigée.

## Rollback application

Déploiement GitHub Pages suit `main` : `git revert` du commit concerné
puis push. `auth-logic.js` et `firestore.rules` sont versionnés avec le
reste — un `git revert` global les restaure ensemble.

## Sauvegarde Firestore

Depuis l'environnement de développement utilisé pour ce chantier, pas
d'accès réseau à `googleapis.com` — l'export doit se faire depuis ta
machine :
```bash
gcloud firestore export gs://<un-bucket-a-toi> --project le-qg-1a6e7
```
(nécessite un bucket Cloud Storage existant). Pour un volume aussi
faible que le foyer actuel, une copie manuelle des documents clés
(Console) suffit aussi.
