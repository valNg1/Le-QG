# Cahier de recette — Sécurisation de l'accès (v4 : verrous d'atomicité getAfter())

## Automatisé — logique applicative (exécuté, vert)

- [x] `npm test` → 33/33 tests passent (`tests/auth-logic.test.js`)
- [x] `node --check` sur le JS extrait de `index.html` → aucune erreur
- [x] Équilibre des balises `<div>` → identique avant/après

## Automatisé — règles Firestore (ÉCRIT, NON EXÉCUTÉ)

- [x] `tests/firestore.rules.test.js` écrit avec `@firebase/rules-unit-testing`
      (17 scénarios couvrant chemin strict, immutabilité, atomicité
      getAfter(), keys().hasOnly(), rôle immutable, portée admin)
- [ ] **Non exécutable depuis cet environnement** : `npm run test:rules`
      échoue au téléchargement du binaire de l'émulateur
      (`storage.googleapis.com` hors liste blanche réseau) — tentative
      réelle documentée dans l'ADR. À exécuter sur une machine avec accès
      réseau normal avant toute future modification des règles.

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

## Manuel — durcissement post-revue (chemin, immutabilité, atomicité)

| # | Scénario | Résultat attendu |
|---|---|---|
| 18b | Depuis devtools, tenter de créer un document à un chemin arbitraire se terminant par `membershipRequests/{x}` hors de `users/{sonUID}/membershipRequests/{code}` | Refusé (permission-denied) |
| 18c | Depuis devtools, tenter de créer une demande avec `uid` différent de son propre uid, ou `code` différent du segment de chemin | Refusé (permission-denied) |
| 18d | Depuis devtools, un admin tente de modifier `uid`, `code` ou `requestedAt` d'une demande en même temps que son statut | Refusé (permission-denied) |
| 18e | Simuler une coupure réseau juste après le clic "Approuver" (devtools → offline pendant le batch) | Ni la demande ni l'adhésion ne changent (le batch échoue en bloc, pas d'état à moitié appliqué) |

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
