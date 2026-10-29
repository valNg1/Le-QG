# Sprint Santé 01 — plan d'implémentation

Objectif : afficher dans Le Général le nombre réel de pas du Pixel.

- [x] Audit : onglet Santé existant (grille de modules, jeûne), Firebase Auth/Firestore, règles `users/{uid}/…`
- [x] `health-logic.js` + `tests/health-logic.test.js` (21 tests, écrits avant l'implémentation)
- [x] Règles Firestore `healthSteps` / `healthMeta` + 13 tests `tests/firestore.rules.test.js` (émulateur requis)
- [x] Module « Santé & Équilibre » dans `index.html` (pas du jour, objectif, 7 jours, source, dernière synchro, état, emplacements futurs)
- [x] Projet Android séparé `android-companion/` (Health Connect, `READ_STEPS` seul) + tests unitaires
- [x] Workflow GitHub Actions `android-apk.yml`
- [ ] Publier `firestore.rules` dans la Console Firebase (action humaine)
- [ ] Récupérer l'APK, l'installer sur le Pixel, autoriser les pas, synchroniser (action humaine)
- [ ] Recette réelle (cahier de recette)

Hors périmètre : HealthKit, API Health cloud, montre, IA, score global, sommeil, temps d'écran.
