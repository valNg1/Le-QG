# Security baseline — Le Général

## Avant ce chantier (état constaté à l'audit)

- **Aucune authentification.** Prénom/avatar stockés en `localStorage`,
  spoofables trivialement.
- **`groupCode` = seule barrière.** Quiconque connaît/devine un code à 6
  caractères peut lire et écrire tout le foyer correspondant (events, mur,
  dîner), sans aucune vérification serveur.
- **`db.collection("groupes").get()` sans filtre**, appelé depuis
  `loadAdminData()` : n'importe quel visiteur ouvrant les devtools pouvait
  lister **tous les foyers de l'application** (noms, membres, codes,
  admin), tant que les règles Firestore ne le bloquaient pas explicitement
  côté serveur (les règles elles-mêmes ne sont pas versionnées avant ce
  chantier — à vérifier dans la Console, voir runbook).
- **Mot de passe admin `"2601"` codé en dur** dans `index.html`, protégeant
  un panneau qui peut suspendre/réactiver n'importe quel foyer et lire un
  lien Stripe. Visible en clair par quiconque lit le code source (page
  publique).
- **`isAdmin` (foyer) déterminé côté client** par comparaison de chaîne
  (`data.admin === state.name`) — falsifiable en changeant simplement son
  prénom local.
- **Eruda (console de debug tierce)** chargée inconditionnellement en
  production (`<script src="https://cdn.jsdelivr.net/npm/eruda">` +
  `eruda.init()`), donnant à tout visiteur un inspecteur JS complet. Hors
  périmètre strict de ce chantier d'authentification, mais à traiter :
  voir "Dette restante" plus bas.

## Après ce chantier

| Risque | Avant | Après |
|---|---|---|
| Accès aux données d'un foyer sans compte | Oui (code seul) | Non — `firestore.rules` exige `request.auth != null` + un document `users/{uid}/memberships/{code}` actif |
| Lister tous les foyers | Oui, si les règles Firestore actuelles l'autorisent | Non — réservé à `isSuperAdmin()` |
| Devenir admin d'un foyer en changeant son prénom, ou en le rejoignant | Oui (avant) / self-service donnerait admin (v1 mal cadrée) | Non — rejoindre un foyer en self-service donne toujours `role: "member"`, jamais modifiable par le client |
| Accéder au panneau admin global sans y être autorisé | Mot de passe unique visible dans le code source | Champ `isSuperAdmin` sur son propre document `users/{uid}` vérifié côté serveur (règles) et côté client (UI) |
| Secret exposé côté client | `ADMIN_PASS_HASH` en clair | Aucun secret dans le client ; `firebaseConfig` reste public (ce n'est pas un secret — c'est la protection par Auth + règles qui compte) |

## Principes appliqués

- **Refus par défaut** : `firestore.rules` commence par
  `match /{document=**} { allow read, write: if false; }`.
- **Pas de Service Role côté client** : aucune clé d'administration
  Firebase (Admin SDK / service account JSON) n'existe dans ce
  repository, et ce chantier n'en introduit aucune.
- **Séparation stricte des foyers** : toute règle d'accès à
  `groupes/{code}` passe par la vérification d'un document
  `users/{uid}/memberships/{code}` actif, jamais par une simple
  connaissance du code.
- **Contrôle serveur, pas seulement frontend** : chaque décision UI
  (afficher le panneau admin, afficher tel foyer) est redondante avec une
  règle Firestore équivalente — si le JS client est modifié ou contourné,
  les règles refusent quand même l'accès.

## Dette restante (hors périmètre de ce sprint, à traiter séparément)

1. **Eruda en production** — à retirer ou à conditionner (ex. paramètre
   d'URL `?debug=1`) dans un futur sprint dédié à l'hygiène de prod.
2. **Récupération de mot de passe** — la récupération standard Firebase
   ("mot de passe oublié") n'est pas encore branchée côté UI en V1
   (décision explicite du directeur technique), à ajouter plus tard.
3. **Rotation de la `firebaseConfig`** — pas nécessaire dans l'immédiat
   (ce n'est pas un secret), mais si l'`apiKey` devait être régénérée un
   jour, penser à mettre à jour `index.html`.
