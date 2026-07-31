# Cahier de recette — Sécurisation de l'accès (v3 : demandes d'adhésion + approbation admin)

## Automatisé

- [x] `npm test` → 29/29 tests passent (`tests/auth-logic.test.js`)
- [x] `node --check` sur le JS extrait de `index.html` → aucune erreur
- [x] Équilibre des balises `<div>` → identique avant/après

## Manuel — inscription et connexion

| # | Scénario | Résultat attendu |
|---|---|---|
| 1 | Ouvrir legeneral.org sans être connecté | Écran de connexion |
| 2 | S'inscrire avec un email/mot de passe valides | Compte créé, redirection vers "Rejoindre un foyer" |
| 3 | Se connecter avec un mauvais mot de passe | "Email ou mot de passe incorrect." |
| 4 | Rafraîchir la page une fois connecté | Reste connecté |

## Manuel — demande d'adhésion (faille corrigée)

| # | Scénario | Résultat attendu |
|---|---|---|
| 5 | Un utilisateur authentifié saisit un code de foyer valide | Une DEMANDE est créée (`status: pending`) — **aucun accès direct au foyer** |
| 6 | Vérifier côté Firestore : `users/{uid}/memberships/{code}` | N'existe PAS tant que non approuvé |
| 7 | L'utilisateur avec une demande pending tente d'accéder à l'app | Bloqué sur l'écran "Demande en attente", ne voit aucune donnée du foyer |
| 8 | Depuis devtools, en étant ce même utilisateur pending, tenter de lire `groupes/{code}/events` | Refusé (permission-denied) — pas membre actif |
| 9 | Code invalide (mauvais format) | "Code invalide (6 caractères attendus)." |
| 10 | Code bien formé mais foyer inexistant | "Aucun foyer ne correspond à ce code." |

## Manuel — approbation admin

| # | Scénario | Résultat attendu |
|---|---|---|
| 11 | Un admin de foyer ouvre Mon QG | Voit la section "Demandes en attente" avec la demande du #5 |
| 12 | Un simple membre (pas admin) de ce foyer | Ne voit PAS la section "Demandes en attente" |
| 13 | L'admin clique ✓ (approuver) | `users/{demandeur}/memberships/{code}` créé avec `role: "member"` ; la demande passe à `"approved"` |
| 14 | Le demandeur (maintenant approuvé) rafraîchit / se reconnecte | Accès normal à l'app, foyer visible dans "Tes foyers" |
| 15 | Un admin tente d'approuver SA PROPRE demande (si applicable) | Refusé, ni côté UI (bouton non affiché pour ses propres demandes) ni côté règles Firestore |
| 16 | Depuis devtools, un membre (non admin) tente d'écrire directement `users/{quelqu'un}/memberships/{code}` avec `role: "member"` | Refusé (permission-denied) — seul un admin actif peut écrire |
| 17 | Depuis devtools, un admin tente d'écrire `role: "admin"` via une approbation | Refusé par les règles (`request.resource.data.role == 'member'` uniquement) |
| 18 | Un admin clique ✕ (refuser) une demande | La demande passe à `"rejected"`, aucune adhésion créée, le demandeur reste bloqué sur "Rejoindre un foyer" |

## Manuel — modification du foyer

| # | Scénario | Résultat attendu |
|---|---|---|
| 19 | Un simple membre tente de modifier `groupes/{code}` (ex. renommer) depuis devtools | Refusé (permission-denied) |
| 20 | Un admin actif du foyer modifie `groupes/{code}` | Autorisé |
| 21 | Un membre continue d'utiliser les sous-collections (agenda, mur, dîner) normalement | Fonctionne comme avant — seul le document principal est restreint |

## Manuel — non-régression

| # | Scénario | Résultat attendu |
|---|---|---|
| 22 | Toi (compte historique, foyer `8W5D2B`, déjà admin) | Accès complet inchangé après publication des nouvelles règles |
| 23 | Ajout d'un événement dans l'agenda | Un seul événement créé, pas de doublon (non-régression fix double-listener) |

## Critère de passage en production

Scénarios 1 à 18 verts avant publication de `firestore.rules` v3.
Scénarios 19 à 23 verts après publication. Attention particulière au
scénario 22 : si le foyer historique perd l'accès, rollback immédiat
(voir `runbook.md`).
