# Kosmy pour Android

Le catalogue des applications open source de [PetitOursManu](https://github.com/PetitOursManu), dans sa version mobile.
Kosmy présente les huit applis du site vitrine, et sert de « store » : elle installe et met à jour les
versions Android publiées dans les releases GitHub de chaque dépôt.

- **Accueil** : le logo Kosmy et les orbites animées, un anneau par thème.
- **Catalogue** : l'index des applis, filtrable par thème, et une fiche par appli.
- **Mes applis** : installer, mettre à jour, ouvrir. Un badge compte les mises à jour disponibles.

Expo SDK 57, React Native 0.86, TypeScript, Expo Router et Reanimated, avec un petit module Kotlin
(`modules/kosmy-installer`) pour PackageManager et PackageInstaller.

## Ajouter ou modifier une appli (sans republier Kosmy)

Tout le catalogue tient dans [`catalog/catalog.json`](catalog/catalog.json), avec les logos dans `catalog/logos/`.
Kosmy relit ce fichier sur la branche `main` à chaque ouverture (et quand on tire la liste vers le bas).
Modifier le fichier sur GitHub suffit : pas besoin de reconstruire ni de réinstaller l'application.
GitHub peut mettre jusqu'à 5 minutes à servir la nouvelle version.

Pour rendre une appli installable, ajoutez-lui un bloc `android` :

```json
"android": {
  "name": "Mon Appli",
  "package": "fr.monappli.app",
  "repo": "MonAppli-Android"
}
```

- `package` : l'identifiant Android de l'appli (applicationId).
- `repo` : le dépôt dont les releases contiennent l'APK (`releases/latest`).
- `assetPattern` (facultatif) : une expression régulière pour choisir le bon fichier si la release en contient plusieurs.

Kosmy choisit tout seul l'APK de l'architecture de l'appareil (`arm64-v8a`, `armeabi-v7a`, `x86_64`, `x86`)
quand le nom du fichier la contient (ex. `DashyMobile-v1.0.1-arm64-v8a.apk`), sinon l'APK universel.

Pour que Kosmy compare bien les versions, le tag de la release (ex. `v1.5.7`) doit correspondre au
`versionName` de l'APK (ex. `1.5.7`).

Les entrées incomplètes du catalogue sont ignorées plutôt que de casser l'application.
Le fichier contient les textes en français et en anglais : le site pourra le lire aussi.

## Développer

Prérequis : Node 24, le SDK Android, et un **JDK 17**. Le JDK 25 fourni avec Android Studio fait échouer
la compilation native (CMake), il faut donc pointer `JAVA_HOME` vers un JDK 17.

```bash
npm install
npx expo run:android      # build de développement sur l'émulateur ou le téléphone
npx expo start --dev-client
```

Vérifications : `npx tsc --noEmit`.

Le dossier `android/` est généré par Expo (`npx expo prebuild`) et n'est pas versionné.
Toute la configuration native passe par `app.json`, les plugins de `plugins/` et le module `modules/kosmy-installer`.

## Publier une version de Kosmy

1. Augmentez `version` et `android.versionCode` dans `app.json`.
2. Lancez `bash scripts/build-release.sh` : l'APK signé arrive dans `dist/Kosmy-v<version>.apk`.
3. Publiez une release `v<version>` sur ce dépôt avec ce fichier. Kosmy la verra et proposera la mise à jour.

### Clé de signature

L'APK est signé avec `kosmy-release.jks`, décrit par `keystore.properties` (racine du projet) :

```properties
storeFile=../../kosmy-release.jks
storePassword=…
keyAlias=kosmy
keyPassword=…
```

Ces deux fichiers ne sont **jamais** versionnés. Gardez-en une copie en lieu sûr : sans cette clé,
Android refusera d'installer les futures versions de Kosmy par-dessus l'actuelle.

## Installation des APK : comment ça marche

1. Kosmy lit la dernière release avec l'API GitHub (sans jeton, avec cache ETag pour ménager la limite de 60 requêtes par heure).
2. L'APK est téléchargé dans le cache de l'appli, avec une barre de progression.
3. Kosmy vérifie que le fichier installe bien le package attendu.
4. L'installation passe par une session `PackageInstaller`. La première fois, Android demande d'autoriser Kosmy
   comme source d'applications : un écran l'explique, ouvre le bon réglage, et l'installation reprend au retour.
5. Quand Kosmy a installé une appli elle-même, les mises à jour suivantes peuvent se faire sans confirmation (Android 12 et plus).

Kosmy utilise la permission `QUERY_ALL_PACKAGES` pour savoir si une appli du catalogue est installée,
même si elle a été ajoutée au catalogue après la sortie de Kosmy. Cette permission est restreinte sur le Play Store,
sans conséquence pour un APK distribué sur GitHub.

## Licence

MIT
