# Le Général Pas — application compagnon Android

Lit **uniquement** le nombre de pas dans **Health Connect** (permission
`READ_STEPS`) et l'envoie vers **votre** compte Le Général (Firebase).
Projet séparé du site : il n'a aucun effet sur `index.html`.

## Ce que fait / ne fait pas l'application

| Fait | Ne fait pas |
|---|---|
| Lit les pas des 7 derniers jours quand vous appuyez sur « Synchroniser maintenant » | Aucune lecture en arrière-plan (permission `READ_HEALTH_DATA_IN_BACKGROUND` volontairement absente) |
| Envoie un document par jour vers `users/{votre uid}/healthSteps/{date}` | Aucune autre donnée de santé (ni sommeil, ni fréquence cardiaque) |
| Ne conserve pas votre mot de passe (seulement un jeton de renouvellement, privé au téléphone) | Aucune clé privée, aucun service account |
| N'envoie jamais de 0 pour un jour sans enregistrement | Aucune sauvegarde cloud du jeton (`allowBackup=false`) |

## Prérequis sur le Pixel

1. **Android 9 (API 26) ou plus.** Android 14 et plus : Health Connect est intégré au système. Android 13 et moins : installer l'application *Health Connect* depuis le Play Store.
2. **Une source de pas qui écrit dans Health Connect.** Le Pixel ne le fait pas tout seul : installez *Google Fit* (ou Fitbit), ouvrez-la une fois, et dans Health Connect › Autorisations des applications, vérifiez qu'elle a le droit d'**écrire** les pas. Sans cela, l'application répond « aucun pas ».
3. Un compte Le Général existant (email + mot de passe).

## Obtenir l'APK (sans Android Studio)

L'APK est compilé par GitHub (workflow **Android APK**).

1. Sur GitHub, dépôt `valNg1/Le-QG` › onglet **Actions** › **Android APK (Le Général Pas)** › dernier run vert.
2. Section **Artifacts** › télécharger `le-general-pas-debug-apk` (un `.zip` contenant `app-debug.apk`).
3. Sur le Pixel : extraire le zip, ouvrir `app-debug.apk`, autoriser « Installer depuis cette source » pour le navigateur ou le gestionnaire de fichiers utilisé.
4. Play Protect peut avertir que l'application n'est pas connue : c'est normal pour un APK de debug personnel.

Alternative (poste de développement avec Android SDK) :

```bash
cd android-companion
gradle testDebugUnitTest assembleDebug
# APK : app/build/outputs/apk/debug/app-debug.apk
```

## Première synchronisation (test réel)

1. Ouvrir **Le Général Pas**, saisir l'email et le mot de passe, **Se connecter**.
2. **Autoriser la lecture des pas** (dialogue Health Connect, une seule permission : *Pas*).
3. **Synchroniser maintenant** : le message « Envoi réussi » n'apparaît que si Firestore a accepté l'écriture.
4. Ouvrir **Le Général › Santé › Santé & Équilibre** : les pas du jour apparaissent, avec la source et l'heure de synchro.

## Cas particuliers

- **Autorisation refusée** : l'application l'indique et propose d'ouvrir les réglages Health Connect (après deux refus Android n'affiche plus le dialogue).
- **« Refusé par les règles Firestore »** : les règles de `firestore.rules` (sections `healthSteps` / `healthMeta`) ne sont pas encore publiées dans la Console Firebase.
- **« Clé Firebase refusée »** : si la clé web est restreinte aux référents HTTP, l'application envoie `Referer: https://legeneral.org/`. Si l'erreur persiste, vérifier dans Google Cloud Console › Identifiants que ce référent est autorisé.

## Révocation et suppression

- **Couper l'accès de l'application** : bouton « Se déconnecter » (efface le jeton du téléphone).
- **Retirer la lecture des pas** : Réglages Android › Applications › Health Connect › Autorisations des applications › Le Général Pas.
- **Effacer les données envoyées** : bouton « Supprimer mes données de santé » dans le module Santé & Équilibre du site.

## Développement

- `SyncLogic.kt` : logique pure (jours, format Firestore), couverte par `SyncLogicTest.kt`.
- `Auth.kt` / `Firestore.kt` : API REST officielles Firebase (Identity Toolkit, Secure Token, Firestore `documents:commit`). Aucun SDK Firebase.
- Les horodatages `syncedAt` / `lastSyncAt` sont posés **par le serveur** (`REQUEST_TIME`).
