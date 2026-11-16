// Signature des builds de release.
// Le dossier android/ est régénéré par Expo : la configuration de signature est donc
// ajoutée ici. Elle lit keystore.properties à la racine du projet (jamais versionné) :
//
//   storeFile=../../kosmy-release.jks   (chemin relatif à android/app)
//   storePassword=...
//   keyAlias=kosmy
//   keyPassword=...
//
// Sans ce fichier, la release reste signée avec la clé de debug (pratique pour tester).
const { withAppBuildGradle } = require("expo/config-plugins");

const MARK = "// kosmy-release-signing";

module.exports = function withReleaseSigning(config) {
  return withAppBuildGradle(config, (cfg) => {
    let src = cfg.modResults.contents;
    if (src.includes(MARK)) return cfg;

    src = src.replace(
      /signingConfigs \{\n/,
      `signingConfigs {
        ${MARK}
        def kosmyProps = new Properties()
        def kosmyPropsFile = rootProject.file("../keystore.properties")
        if (kosmyPropsFile.exists()) {
            kosmyPropsFile.withInputStream { kosmyProps.load(it) }
            release {
                storeFile file(kosmyProps["storeFile"])
                storePassword kosmyProps["storePassword"]
                keyAlias kosmyProps["keyAlias"]
                keyPassword kosmyProps["keyPassword"]
            }
        }
`,
    );
    src = src.replace(
      /(release \{\n(?:\s*\/\/.*\n)*\s*)signingConfig signingConfigs\.debug/,
      `$1signingConfig signingConfigs.findByName("release") ?: signingConfigs.debug`,
    );
    cfg.modResults.contents = src;
    return cfg;
  });
};
