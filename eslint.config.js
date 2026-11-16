// https://docs.expo.dev/guides/using-eslint/
const { defineConfig } = require("eslint/config");
const expoConfig = require("eslint-config-expo/flat");

module.exports = defineConfig([
  expoConfig,
  {
    ignores: ["dist/*", "modules/*/android/build/*"],
  },
  {
    rules: {
      // Règle pensée pour le HTML : React Native affiche les apostrophes des textes français telles quelles.
      "react/no-unescaped-entities": "off",
    },
  },
]);
