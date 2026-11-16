#!/usr/bin/env bash
# Construit l'APK de release signé : dist/Kosmy-v<version>.apk
# Prérequis : JDK 17 (le JDK 25 d'Android Studio fait échouer CMake), SDK Android,
# et keystore.properties + kosmy-release.jks à la racine (voir README).
set -euo pipefail
cd "$(dirname "$0")/.."

: "${ANDROID_HOME:=$LOCALAPPDATA/Android/Sdk}"
: "${JAVA_HOME:=$HOME/.gradle/jdks/eclipse_adoptium-17-amd64-windows.2}"
export ANDROID_HOME JAVA_HOME PATH="$JAVA_HOME/bin:$PATH"

VERSION=$(node -p "require('./app.json').expo.version")
[ -f keystore.properties ] || echo "Attention : keystore.properties absent, l'APK sera signé avec la clé de debug."

npx expo prebuild --platform android --no-install
(cd android && ./gradlew assembleRelease -PreactNativeArchitectures=arm64-v8a,armeabi-v7a,x86_64)

mkdir -p dist
cp android/app/build/outputs/apk/release/app-release.apk "dist/Kosmy-v$VERSION.apk"
echo "APK prêt : dist/Kosmy-v$VERSION.apk"
