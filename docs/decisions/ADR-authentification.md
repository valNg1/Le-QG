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

## Révision — 27/07/2026 : inscription libre + multi-foyers

**Contexte** : la v1 (comptes créés par l'admin via Console ou via un
formulaire "Ajouter un membre" dans l'app, un seul foyer par compte)
correspondait à une mauvaise lecture du besoin. Le directeur technique a
précisé : les gens s'inscrivent eux-mêmes, et le rattachement à un foyer
n'est pas unique (quelqu'un doit pouvoir rejoindre plusieurs foyers —
cohérent avec le modèle SaaS visé, où une même personne peut faire partie
de plusieurs "Général" différents).

**Décision** :
1. Inscription self-service (email + mot de passe), sans validation
   admin préalable — le foyer reste la barrière (connaître le code),
   pas le compte.
2. Une adhésion à un foyer = un document séparé
   (`users/{uid}/memberships/{code}`) plutôt qu'un champ unique
   `householdId`, pour permettre plusieurs foyers par compte SANS
   fragiliser les règles Firestore (pas de diff de map à valider — un
   `allow create` standard suffit).
3. Rejoindre un foyer en self-service donne toujours `role: "member"` —
   jamais `admin`, jamais super-admin. Devenir admin d'un foyer reste un
   geste manuel (Console) pour l'instant ; un flux dédié pourra être
   ajouté plus tard si le besoin se confirme.
4. Le formulaire "Ajouter un membre" piloté par l'admin (introduit puis
   retiré dans la foulée) est entièrement supprimé du code — remplacé par
   l'inscription libre + le fait de rejoindre un foyer avec son code.
5. La création de NOUVEAUX foyers reste hors périmètre : seuls des foyers
   déjà existants (Console) peuvent être rejoints en self-service. Un
   flux de création de foyer en self-service (avec attribution automatique
   du rôle admin au créateur) est une extension naturelle mais non
   demandée à ce stade.

## Révision — 27/07/2026 (suite) : demandes d'adhésion + approbation admin

**Contexte** : revue de sécurité du directeur technique sur la v2
(rejoindre un foyer directement avec son code, sans validation). Faille
identifiée : un code à 6 caractères, même généré aléatoirement, ne
constitue pas une autorisation suffisante — n'importe quel compte
authentifié pouvait rejoindre n'importe quel foyer en connaissant (ou en
devinant) son code, sans qu'aucun membre du foyer n'en soit informé ni
n'ait à valider quoi que ce soit.

**Décision** :
1. Rejoindre un foyer crée désormais une **demande d'adhésion**
   (`users/{uid}/membershipRequests/{code}`, `status: "pending"`), pas
   une adhésion active. Aucun accès aux données du foyer tant que la
   demande n'est pas approuvée.
2. Seul un **admin actif du foyer concerné** peut approuver ou refuser
   une demande (bouton dans Mon QG → section "Demandes en attente").
   L'approbation crée l'adhésion, toujours avec `role: "member"` —
   jamais "admin".
3. Un admin ne peut jamais approuver sa propre demande, même s'il est
   admin d'un autre foyer (vérifié à la fois dans `auth-logic.js`
   `canApproveRequest()` et dans `firestore.rules` via
   `request.auth.uid != resource.data.uid`).
4. **Modification du document principal `groupes/{code}`** restreinte
   aux admins actifs du foyer (ou super-admin) — un simple membre ne
   peut plus le modifier (il conserve l'accès en lecture/écriture aux
   sous-collections métier : agenda, mur, dîner).
5. Chaque demande vit dans un document séparé de l'adhésion elle-même
   (deux collections distinctes plutôt qu'un statut supplémentaire sur
   le même document) — permet des règles Firestore simples : la
   création d'une demande et l'approbation d'une adhésion sont deux
   opérations indépendantes, sur deux documents différents, chacune
   avec ses propres contraintes, sans avoir à gérer des transitions
   d'état complexes sur un seul document.

## Révision — 27/07/2026 (suite) : durcissement ciblé post-revue

Trois failles supplémentaires identifiées en revue avant publication des
règles v3, corrigées avant tout déploiement :

1. **Chemin trop large** : la règle `match /{path=**}/membershipRequests/{reqId}`
   aurait potentiellement autorisé une écriture à n'importe quel chemin
   se terminant par ce nom de sous-collection. Corrigé en imbriquant la
   règle strictement dans `match /users/{uid}/membershipRequests/{code}`
   — `uid` et `code` deviennent des variables de CHEMIN (garanties par
   Firestore lui-même), pas de simples champs de contenu qu'on pourrait
   tenter de falsifier. La lecture par un admin via une requête
   "collection group" reste fonctionnelle : Firestore évalue cette même
   règle document par document, donc chaque résultat de la requête est
   filtré individuellement selon que l'admin qui interroge est bien
   admin du foyer de CE document précis.

2. **Approbation non atomique** : `handleRequestDecision()` faisait deux
   écritures Firestore séquentielles (`await` puis `await`), sans
   garantie que les deux réussissent ou échouent ensemble. Corrigé avec
   un `db.batch()` : la mise à jour du statut de la demande et la
   création de l'adhésion sont désormais une seule opération atomique.

3. **Immutabilité de la demande** : la règle `update` impose désormais
   explicitement `uid`, `code` et `requestedAt` inchangés
   (`request.resource.data.X == resource.data.X`), et ajoute
   `diff(resource.data).affectedKeys().hasOnly(['status'])` pour
   interdire toute modification d'un champ non prévu, même un champ pas
   encore imaginé aujourd'hui.
