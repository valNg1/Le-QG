# Cahier de recette — Sécurisation de l'accès (v2 : self-service multi-foyers)

## Automatisé

- [x] `npm test` → 26/26 tests passent (`tests/auth-logic.test.js`)
- [x] `node --check` sur le JS extrait de `index.html` → aucune erreur
- [x] Équilibre des balises `<div>` → identique avant/après

## Manuel — inscription et connexion

| # | Scénario | Résultat attendu |
|---|---|---|
| 1 | Ouvrir legeneral.org sans être connecté | Écran de connexion, pas l'application |
| 2 | Cliquer "Pas encore de compte ? Crée-toi en un" | Le formulaire bascule en mode inscription (bouton, sous-titre changent) |
| 3 | S'inscrire avec un email/mot de passe valides (6+ car.) | Compte créé, redirection automatique vers l'écran "Rejoindre un foyer" |
| 4 | S'inscrire avec un email déjà utilisé | Message clair "Un compte existe déjà avec cet email — connecte-toi plutôt." |
| 5 | Se connecter avec un mauvais mot de passe | "Email ou mot de passe incorrect.", sans préciser lequel |
| 6 | Rafraîchir la page une fois connecté | Reste connecté |
| 7 | "Mot de passe oublié ?" avec un email valide | Message de confirmation, email reçu |

## Manuel — foyers

| # | Scénario | Résultat attendu |
|---|---|---|
| 8 | Nouveau compte sans aucune adhésion | Écran "Rejoindre un foyer" (code à 6 caractères) |
| 9 | Saisir un code de foyer valide et existant | Rejoint le foyer en tant que "member", accès à l'app |
| 10 | Saisir un code invalide (mauvais format) | "Code invalide (6 caractères attendus)." |
| 11 | Saisir un code bien formé mais qui n'existe pas | "Aucun foyer ne correspond à ce code." |
| 12 | Depuis Mon QG, rejoindre un 2e foyer avec un autre code | Les deux foyers apparaissent dans "Tes foyers", switcher fonctionnel |
| 13 | Basculer entre deux foyers (bouton "Basculer") | Le foyer actif change, agenda/dîner/mur se rechargent sur le nouveau foyer |
| 14 | Un compte "member" (pas admin) tente de s'auto-promouvoir admin via devtools (écrire directement `role: "admin"`) | Refusé par les règles Firestore |

## Manuel — après publication des règles Firestore

| # | Scénario | Résultat attendu |
|---|---|---|
| 15 | Depuis devtools, en étant connecté avec un compte d'un AUTRE foyer, tenter de lire `groupes/{code}` d'un foyer non rejoint | Refusé (permission-denied) |
| 16 | Même test sans être connecté du tout | Refusé (permission-denied) |
| 17 | Admin d'un foyer (`role: "admin"` sur son adhésion) accède aux fonctions admin de CE foyer | OK |
| 18 | Ajout d'un événement dans l'agenda (non-régression double-listener) | Un seul événement créé, pas de doublon |
| 19 | Toi (compte historique, foyer `8W5D2B`) après ce pivot | Accès complet inchangé — agenda, dîner, mur, mêmes données qu'avant |

## Critère de passage en production

Scénarios 1 à 14 verts avant publication de `firestore.rules` v2.
Scénarios 15 à 19 verts après publication. Attention particulière au
scénario 19 : si le foyer historique perd l'accès, rollback immédiat
(voir `runbook.md`).
