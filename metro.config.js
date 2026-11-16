// https://docs.expo.dev/guides/customizing-metro/
const path = require("path");
const { getDefaultConfig } = require("expo/metro-config");

const config = getDefaultConfig(__dirname);

const escape = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const fromRoot = (dir) => new RegExp(`^${escape(path.join(__dirname, dir))}[\\\\/].*`);

// Metro n'a pas à parcourir les dossiers de compilation Android : sous Windows, leurs chemins
// dépassent la longueur maximale et bloquent le démarrage du serveur.
const ignored = [
  /[\\/]android[\\/](app[\\/])?build[\\/].*/,
  /[\\/]android[\\/]\.(gradle|cxx)[\\/].*/,
  fromRoot("dist"), // les APK publiés, à la racine du projet seulement
];
const existing = config.resolver.blockList;
config.resolver.blockList = [...(Array.isArray(existing) ? existing : existing ? [existing] : []), ...ignored];

module.exports = config;
