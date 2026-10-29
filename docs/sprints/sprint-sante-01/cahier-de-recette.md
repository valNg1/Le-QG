# Sprint Santé 01 — cahier de recette

Statut : **les pas ne sont pas considérés comme synchronisés tant que le test 9 n'est pas passé sur le Pixel.**

## Automatisés (exécutés)

| # | Test | Résultat |
|---|---|---|
| 1 | `npm test` : logique d'authentification + santé (54 tests) | à jour dans le journal de livraison |
| 2 | Rendu du module (données / aucune donnée / erreur de lecture) dans Chromium avec un faux Firestore de test | ok, aucun débordement, aucune erreur console |

## Automatisés (non exécutables dans l'environnement de développement)

| # | Test | Comment l'exécuter |
|---|---|---|
| 3 | Règles Firestore santé (13 tests : propriétaire, anonyme, autre membre, admin, super-admin, collectionGroup, validation, suppression) | `npm run test:rules` (émulateur Firestore, réseau complet) |
| 4 | Tests unitaires Android `SyncLogicTest` + compilation de l'APK | workflow GitHub **Android APK** (Actions) |

## Manuels (action humaine)

| # | Étape | Attendu |
|---|---|---|
| 5 | Publier `firestore.rules` dans la Console Firebase | Publication sans erreur |
| 6 | Ouvrir Santé › Santé & Équilibre avant toute synchro | Pastille « Aucune synchronisation », pas du jour « — », 7 jours vides, aucun chiffre |
| 7 | Installer l'APK, se connecter, refuser l'autorisation | Message de refus + bouton réglages ; aucune donnée envoyée |
| 8 | Accorder `READ_STEPS` (une seule permission demandée) | « Autorisation accordée » |
| 9 | « Synchroniser maintenant » | « Envoi réussi » ; sur le site, pas du jour = valeur de Google Fit/Health Connect, source et heure affichées, pastille « Connecté » |
| 10 | Changer l'objectif | Barre de progression recalculée, valeur conservée après rechargement |
| 11 | Compte d'un autre membre du foyer (et admin) : ouvrir ses propres Santé | Ne voit que ses propres données (vides) ; tentative de lecture de vos documents refusée (voir test 3) |
| 12 | « Supprimer mes données de santé » (2 clics) | Données et objectif supprimés, module revenu à l'état vide |
| 13 | « Se déconnecter » dans l'application | Jeton effacé ; nouvelle synchro impossible sans reconnexion |
