# Kosmy pour Android

Le catalogue des applications open source de [PetitOursManu](https://github.com/PetitOursManu), dans sa version mobile.
Kosmy présente les huit applis du site vitrine, et sert de « store » : elle installe et met à jour les
versions Android publiées dans les releases GitHub de chaque dépôt.

- **Accueil** : le logo Kosmy et les orbites animées, un anneau par thème.
- **Catalogue** : l'index des applis, filtrable par thème, et une fiche par appli.
- **Mes applis** : installer, mettre à jour, ouvrir. Un badge compte les mises à jour disponibles.
- **Admin** : le panneau d'administration de vos instances (Kanby, Crafty, Lumy…), même pour les applis
  qui n'existent que sur le web. On donne l'adresse de son instance, on se connecte dans la page, et Kosmy garde la session.

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

Pour proposer l'appli dans l'onglet Admin, indiquez le chemin de sa page d'administration :

```json
"admin": { "path": "/admin" }
```

Kosmy l'ajoute à l'adresse que chacun donne pour son instance (ex. `https://kanby.mondomaine.fr` + `/admin`).
On peut toujours le modifier dans Kosmy si une instance est différente.

Si l'interface existe en plusieurs langues, listez-les en codes à deux lettres. La fiche affiche
« Disponible en plusieurs langues (FR, EN…) » :

```json
"languages": ["fr", "en", "de"]
```

Les points forts (`text.fr.more`) sont séparés par ` · ` : la fiche en affiche un par ligne.

Les captures d'écran vont dans `catalog/screenshots/<appli>/`, en WebP. Indiquez leurs dimensions, pour que
Kosmy réserve la place avant le chargement :

```json
"screenshots": [
  { "src": "screenshots/kanby/01.webp", "w": 1170, "h": 2532, "caption": { "fr": "Le tableau", "en": "The board" } }
]
```

`src` peut aussi être une adresse `https://`. Les captures ne sont pas embarquées dans l'APK : elles se chargent
à l'ouverture de la fiche, puis restent en cache.

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

## Espaces admin : comment ça marche

- La page d'administration s'ouvre dans Kosmy (WebView), sous un bandeau qui rappelle l'instance et son adresse.
- On se connecte dans la page, comme dans un navigateur. Kosmy ne voit pas et ne stocke pas les mots de passe :
  la session (cookies, stockage local du site) reste dans la WebView et survit au redémarrage du téléphone.
- « Se déconnecter » efface la session de ce site sur le téléphone ; supprimer l'instance aussi. Rien n'est touché sur le serveur.
- Verrouillage (activé par défaut) : l'empreinte ou le code du téléphone est demandé avant d'ouvrir un espace,
  puis à nouveau après plus d'une minute passée hors de Kosmy.
- Les adresses `http://` sont acceptées pour les serveurs du réseau local, avec un avertissement : sur Internet,
  le mot de passe circulerait en clair.

### Synchronisation avec Kosmy Board

[Kosmy Board](https://github.com/PetitOursManu/Kosmy-Board) est l'équivalent web de l'onglet Admin, avec des comptes.
Dans l'onglet Admin, **Kosmy Board → Se connecter** (adresse du Board, e-mail, mot de passe, et code si la double
authentification est activée) relie le téléphone au compte, une seule fois :

- À la première connexion, les instances du téléphone rejoignent le compte (sans doublon), puis Kosmy reprend la liste du Board.
- Ensuite, ajouter, modifier ou supprimer une instance le fait aussi sur le Board. La liste se met à jour au démarrage,
  en revenant dans Kosmy (au plus toutes les 30 s) et en tirant la liste vers le bas. Sans réseau, la liste reste consultable,
  mais les modifications sont refusées tant que le Board est injoignable.
- Kosmy garde un jeton d'appareil dans le stockage sécurisé d'Android (`expo-secure-store`), jamais le mot de passe.
  Il est valable un an et prolongé à chaque synchronisation. Le Board le retire si on déconnecte l'appareil
  (**Compte → Appareils connectés**) ou si l'on change de mot de passe : Kosmy demande alors de se reconnecter.
- Se déconnecter du Board dans Kosmy garde les instances sur le téléphone, sans synchronisation.
- Seule la liste est synchronisée : les sessions ouvertes dans les pages d'admin restent propres à chaque appareil.

### Notifications de Kosmy Board

Les applis reliées à Kosmy Board (Soundy : une nouvelle demande de musique) envoient leurs notifications au Board.
Une fois le téléphone relié au Board, Kosmy les affiche comme des notifications Android, **sans service Google** :

- Kosmy demande au Board s'il y a du nouveau (`GET /api/notifications?after=…`, avec le jeton d'appareil) :
  à l'ouverture, au retour dans l'appli, puis toutes les minutes tant qu'elle est ouverte ;
  appli fermée, par une tâche de fond d'Android (`expo-background-task`), **au mieux toutes les 15 minutes**.
  Android peut l'espacer davantage quand le téléphone est en veille ou en économie de batterie : pour être prévenu
  plus régulièrement, désactivez l'optimisation de batterie pour Kosmy dans les réglages d'Android.
- L'autorisation d'afficher des notifications est demandée en reliant le Board (Android 13 et plus).
  Elles arrivent dans le canal « Kosmy Board », réglable dans les réglages d'Android.
- Toucher une notification ouvre l'écran **Notifications** (aussi depuis l'onglet Admin → Kosmy Board) ;
  toucher une notification de la liste ouvre la page concernée dans l'espace admin de l'instance.
- Les anciennes notifications ne sont pas réaffichées en reliant le Board : seules les nouvelles déclenchent une alerte.

Kosmy utilise la permission `QUERY_ALL_PACKAGES` pour savoir si une appli du catalogue est installée,
même si elle a été ajoutée au catalogue après la sortie de Kosmy. Cette permission est restreinte sur le Play Store,
sans conséquence pour un APK distribué sur GitHub.

## Licence

MIT
