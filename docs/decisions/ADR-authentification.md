# ADR — Authentification de Le Général

**Statut** : Accepté
**Date** : 2026-07-27

## Contexte

Le Général (legeneral.org) n'a aucune authentification : l'accès repose
sur un `groupCode` à 6 caractères et un prénom local, tous deux
falsifiables côté client (voir `security-baseline.md`). Une première
demande envisageait de reprendre tel quel le modèle d'authentification du
projet Hazumi (React/Vite/Supabase). Le directeur technique a ensuite
précisé le cadrage réel (2ᵉ brief) : **Le Général reste sur Firebase,
Firestore et GitHub Pages** ; seul le *principe* du parcours
(connexion → session → autorisation → profil → app) est repris de Hazumi,
sans migration de backend.

## Décision

1. **Firebase Authentication, email + mot de passe**, aucune inscription
   publique. Chaque personne autorisée a un compte Firebase distinct,
   créé manuellement par Val dans la Firebase Console. Pas de connexion
   Google, pas de magic link, pas de mot de passe familial partagé — ces
   options restent ouvertes pour une version ultérieure si besoin.

2. **Rattachement utilisateur ↔ foyer via une nouvelle collection
   `users/{uid}`** (`householdId`, `role`, `status`), plutôt que
   d'utiliser les Custom Claims Firebase Auth. Les Custom Claims
   demandent l'Admin SDK côté serveur (Cloud Function ou script Node
   avec une clé de service) — solution écartée pour rester sur une
   architecture 100 % statique (GitHub Pages), sans introduire de
   backend ni de secret serveur à gérer. Un document Firestore, lu
   uniquement par son propriétaire, est la solution la moins invasive
   compatible avec l'existant.

3. **Un seul champ `isSuperAdmin` sur ce même document `users/{uid}`**
   pour le panneau d'administration global (aujourd'hui protégé par un
   mot de passe `"2601"` codé en dur) — **pas** de collection
   `superadmins` séparée. Première version de ce chantier introduisait
   une collection dédiée ; en la justifiant, aucune raison technique ne
   la distinguait d'un champ booléen sur le document existant : côté
   règles Firestore, `exists(/superadmins/$(uid))` et
   `get(/users/$(uid)).data.isSuperAdmin == true` coûtent la même chose
   (une lecture), offrent le même niveau de protection (écriture
   interdite au client dans les deux cas), et un utilisateur peut très
   bien être à la fois admin de son propre foyer et super-admin global
   (cas de Val) — deux axes orthogonaux, mais un seul document reste la
   source de vérité la plus simple. Corrigé sur relecture du directeur
   technique.

4. **`groupes/{code}` conservé tel quel** dans sa structure — seul l'accès
   change (voir `firestore.rules`). Aucune migration de données
   nécessaire pour le foyer existant : il suffit de créer son
   `users/{uid}` pointant vers son `groupCode` actuel.

5. **Refus par défaut** dans `firestore.rules`, avec des règles explicites
   par collection plutôt qu'une règle globale permissive.

## Pourquoi pas Supabase / le modèle Hazumi tel quel

Migrer vers Supabase aurait signifié réécrire l'intégralité de la couche
données (Firestore → Postgres), une migration à plusieurs ordres de
grandeur plus large qu'une simple sécurisation d'accès, pour un
bénéfice non demandé par le cadrage final. Le directeur technique a
tranché explicitement ce point dans son 2ᵉ brief : conserver Firebase,
ne reprendre de Hazumi que le *principe* du parcours d'authentification.

## Conséquences

- Pas de inscription self-service : chaque nouvel utilisateur autorisé
  nécessite une action manuelle de Val (créer le compte Auth + le
  document `users/{uid}`). Acceptable pour un foyer, documenté dans le
  runbook pour que ça reste rapide à refaire.
- Le contrôle d'autorisation dépend d'une lecture Firestore
  supplémentaire au démarrage (`users/{uid}`, qui porte à la fois le
  rôle de foyer et le statut super-admin) — impact négligeable (lecture
  unique, mise en cache SDK).
- `createGroup()` / `joinGroup()` restent dans le code par compatibilité
  mais ne sont plus le chemin principal : à documenter clairement pour
  ne pas dérouter un futur développeur qui les retrouverait.
