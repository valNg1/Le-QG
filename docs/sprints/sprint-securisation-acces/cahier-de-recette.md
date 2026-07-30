# Cahier de recette — Sécurisation de l'accès

À exécuter manuellement en production après déploiement (étape N du plan),
puis une seconde fois après publication des règles Firestore (étape P).

## Automatisé (déjà vert avant tout déploiement)

- [x] `npm test` → 14/14 tests passent (`tests/auth-logic.test.js`)
- [x] `node --check` sur le JS extrait de `index.html` → aucune erreur
- [x] Équilibre des balises `<div>` → identique avant/après

## Manuel — avant publication des règles Firestore

| # | Scénario | Résultat attendu |
|---|---|---|
| 1 | Ouvrir legeneral.org sans être connecté | Écran de connexion s'affiche, pas l'application |
| 2 | Se connecter avec un email/mot de passe valides (ton compte) | Accès à l'écran prénom/avatar puis à l'app |
| 3 | Se connecter avec un mauvais mot de passe | Message "Email ou mot de passe incorrect.", pas de détail sur lequel des deux est faux |
| 4 | Rafraîchir la page une fois connecté | Reste connecté, pas de retour à l'écran de connexion |
| 5 | Cliquer "Se déconnecter" (Mon QG) | Retour à l'écran de connexion, plus d'accès à l'app tant qu'on ne se reconnecte pas |
| 6 | Modifier l'URL pour tenter d'accéder directement à une vue (ex. `#agenda`) sans être connecté | Toujours l'écran de connexion (aucune vue de l'app visible en arrière-plan) |
| 7 | Panneau admin (Mon QG) si `superadmins/{tonUID}` existe | Section visible, plus de prompt mot de passe |
| 8 | Panneau admin si `superadmins/{uid}` n'existe PAS pour le compte connecté | Section totalement invisible |

## Manuel — après publication des règles Firestore

| # | Scénario | Résultat attendu |
|---|---|---|
| 9 | Compte avec `status: "disabled"` tente de se connecter | Écran "Accès non autorisé" après connexion Firebase réussie |
| 10 | Compte sans document `users/{uid}` du tout | Écran "Accès non autorisé" |
| 11 | Depuis la console navigateur (devtools), tenter `db.collection("groupes").doc("UNCODE_QUELCONQUE").get()` en étant connecté avec un compte d'un AUTRE foyer | Requête refusée (permission-denied) |
| 12 | Même test que 11, mais sans être connecté du tout | Requête refusée (permission-denied) |
| 13 | Membre normal (`role: "member"`) tente d'ouvrir le panneau admin foyer (`isAdmin`) | Non affiché — seul `role: "admin"` y a droit |
| 14 | Toi (compte admin, foyer existant) après publication des règles | Accès complet inchangé — agenda, dîner, mur, mêmes données qu'avant |
| 15 | Ajout d'un nouvel événement dans l'agenda (test de non-régression du fix double-listener) | Un seul événement créé, pas de doublon visuel |

## Critère de passage en production

Tous les scénarios 1 à 8 doivent être verts **avant** de publier
`firestore.rules`. Tous les scénarios 9 à 15 doivent être verts **après**
publication, avec une attention particulière au scénario 14 : si le
foyer existant perd l'accès à ses propres données, rollback immédiat
(voir `runbook.md`).
