# Santé & Équilibre — architecture

## Vue d'ensemble

```
Google Pixel ── Health Connect (READ_STEPS)
      │
 Le Général Pas (Android, projet android-companion/)
      │  HTTPS, jeton Firebase Auth de l'utilisateur
      ▼
Firestore : users/{uid}/healthSteps/{YYYY-MM-DD}, users/{uid}/healthMeta/{sync|settings}
      ▲
      │  onSnapshot (lecture seule pour les pas)
legeneral.org › Santé › Santé & Équilibre (index.html + health-logic.js)
```

## Modèle de données

| Chemin | Champs | Écrit par |
|---|---|---|
| `users/{uid}/healthSteps/{YYYY-MM-DD}` | `date` (= id), `steps` (entier 0–200 000), `source` (≤120), `syncedAt` (horodatage serveur) | application Android |
| `users/{uid}/healthMeta/sync` | `lastSyncAt` (serveur), `source`, `device` | application Android |
| `users/{uid}/healthMeta/settings` | `dailyGoal` (entier 1 000–100 000) | site web |

Un jour sans enregistrement n'a **pas** de document : le site l'affiche vide, jamais « 0 ».

## Sécurité

- Propriété stricte : `request.auth.uid == uid` du chemin. Aucune règle pour un membre du foyer, un admin ou un super-admin, et aucune règle « collection group » (pas de moisson inter-comptes).
- Validation de forme dans `firestore.rules` : champs exacts (`hasOnly` + `hasAll`), types, bornes, id de document = date.
- Suppression autorisée au titulaire seulement (droit à l'effacement) ; le site supprime pas + méta + objectif en un lot.
- Android : permission santé unique `READ_STEPS`, pas de lecture en arrière-plan, pas de mot de passe conservé, jeton privé (`allowBackup=false`).
- La clé API web Firebase est publique par conception (identifie le projet) ; aucune clé privée côté client ni dans le dépôt.

## Limites connues

- Synchronisation **manuelle, application ouverte** : une synchro automatique en arrière-plan exigerait la permission supplémentaire `READ_HEALTH_DATA_IN_BACKGROUND`, hors périmètre de ce sprint.
- Les pas dépendent d'une application qui écrit dans Health Connect (Google Fit, Fitbit…).
- Les jours sont calculés sur le fuseau de l'appareil.
- L'application Android n'a pas encore été compilée ni installée au moment de la livraison : voir le cahier de recette.
