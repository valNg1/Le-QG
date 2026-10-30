# Migration vers legeneral.everboarding.fr

Décision (Val, 30/10/2026) : tout Le Général déménage sur `legeneral.everboarding.fr`
(domaine possédé par Val, un sous-domaine par projet). Firebase est conservé
(`le-qg-1a6e7`) : aucun compte ni donnée à migrer.

## Phase A — code prêt pour les deux domaines (v3.3.78, fait)
- Liens absolus `https://legeneral.org/...` remplacés par des liens relatifs ou `location.origin`
  (lien d'invitation de foyer inclus) : l'app fonctionne sur n'importe quel domaine.
- `vercel.json` (en-têtes no-cache sur index.html, sw.js, version.json).
- `CNAME` et GitHub Pages inchangés : legeneral.org reste en service pendant la bascule.

## Phase B — actions de Val (une à la fois)
1. Vercel : importer le dépôt `valNg1/Le-QG` (framework « Other », pas de build, répertoire racine), puis Settings › Domains › ajouter `legeneral.everboarding.fr`.
2. DNS d'everboarding.fr : créer l'enregistrement demandé par Vercel (CNAME `legeneral` → valeur indiquée).
3. Firebase Console › Authentication › Settings › Authorized domains : ajouter `legeneral.everboarding.fr`.
4. Google Cloud › APIs & Services › Credentials › clé web : si restreinte aux référents HTTP, ajouter `https://legeneral.everboarding.fr/*`.

## Phase C — bascule (après vérification du nouveau domaine)
- Se reconnecter une fois sur le nouveau domaine (la session Firebase est liée à l'origine : elle ne suit pas).
- `android-companion/.../Config.kt` : `REFERER = "https://legeneral.everboarding.fr/"`, rebuild de l'APK.
- Redirection de legeneral.org vers le nouveau domaine (chemin, requête `?g=` et hash conservés), puis retrait de `CNAME`.
- Prévenir les foyers (liens d'invitation déjà envoyés pointant vers l'ancien domaine : conservés par la redirection).

## Points de vigilance
- PWA : une app déjà installée depuis legeneral.org ne migre pas ; réinstaller depuis le nouveau domaine.
- localStorage / IndexedDB sont par origine : préférences locales non reprises.
