import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useCallback, useEffect, useRef, useState } from "react";
import { BackHandler, KeyboardAvoidingView, Linking, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeOut, useAnimatedStyle, useSharedValue, withTiming } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { WebView, type WebViewNavigation } from "react-native-webview";

import Installer from "../../../modules/kosmy-installer";
import { hostOf, isCleartext, spaceUrl, useAdmin } from "../../admin/AdminProvider";
import { SpaceLogo } from "../../admin/SpaceLogo";
import { Body, Em, Mono, Serif } from "../../components/Typo";
import { colors, ease, gutter } from "../../theme";

/** L'adresse est-elle sur l'instance elle-même (même schéma, hôte et port) ? */
function sameOrigin(url: string, base: string) {
  const origin = (u: string) => u.match(/^(https?:\/\/[^/?#]+)/i)?.[1].toLowerCase();
  return Boolean(origin(url)) && origin(url) === origin(base);
}

/** Schémas que la WebView sait ouvrir elle-même ; le reste (mailto:, tel:, intent:…) part vers Android. */
const WEB = /^(https?|about|data|blob|javascript):/i;

const ERRORS: Record<string, string> = {
  ERR_NAME_NOT_RESOLVED: "Cette adresse n'existe pas, ou le téléphone n'est pas connecté.",
  ERR_INTERNET_DISCONNECTED: "Le téléphone n'est pas connecté à Internet.",
  ERR_CONNECTION_REFUSED: "Le serveur refuse la connexion : l'appli est peut-être arrêtée.",
  ERR_CONNECTION_TIMED_OUT: "Le serveur ne répond pas.",
  ERR_ADDRESS_UNREACHABLE: "Le serveur est injoignable depuis ce réseau.",
  ERR_CLEARTEXT_NOT_PERMITTED: "Les adresses http ne sont pas autorisées.",
  ERR_CERT_AUTHORITY_INVALID: "Le certificat HTTPS du serveur n'est pas reconnu.",
  ERR_CERT_COMMON_NAME_INVALID: "Le certificat HTTPS ne correspond pas à cette adresse.",
  ERR_CERT_DATE_INVALID: "Le certificat HTTPS du serveur a expiré.",
};

export default function Espace() {
  // « url » : une page précise de l'instance (le lien d'une notification), sinon sa page d'admin.
  const { id, url: target } = useLocalSearchParams<{ id: string; url?: string }>();
  const insets = useSafeAreaInsets();
  const admin = useAdmin();
  const space = admin.spaces.find((s) => s.id === id);
  const web = useRef<WebView>(null);
  const [nav, setNav] = useState<{ canGoBack: boolean; url: string; title: string }>({ canGoBack: false, url: "", title: "" });
  const [loaded, setLoaded] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  const [everUnlocked, setEverUnlocked] = useState(admin.unlocked);
  const progress = useSharedValue(0);
  const shown = useSharedValue(1);
  const asking = useRef(false);

  const { touch, unlock, unlocked } = admin;
  useEffect(() => {
    if (space) touch(space.id);
    // Une seule fois à l'ouverture.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Verrouillé (à l'ouverture, ou après un passage hors de Kosmy) : on demande tout de suite.
  const ask = useCallback(async () => {
    if (asking.current) return;
    asking.current = true;
    await unlock();
    asking.current = false;
  }, [unlock]);
  // La page n'est chargée qu'après le premier déverrouillage ; ensuite elle reste en mémoire sous le voile.
  if (unlocked && !everUnlocked) setEverUnlocked(true);
  useEffect(() => {
    if (!unlocked) ask();
  }, [unlocked, ask]);

  // Les cookies de la session sont écrits sur le disque en quittant l'écran.
  useEffect(() => () => void Installer.flushCookies().catch(() => {}), []);

  // Bouton retour d'Android : d'abord l'historique de la page, puis Kosmy.
  useEffect(() => {
    const sub = BackHandler.addEventListener("hardwareBackPress", () => {
      if (nav.canGoBack && !failure) {
        web.current?.goBack();
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [nav.canGoBack, failure]);

  const bar = useAnimatedStyle(() => ({ transform: [{ scaleX: progress.value }], opacity: shown.value }));

  if (!space) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Serif size={40}>
          Instance <Em>introuvable</Em>
        </Serif>
        <Pressable onPress={() => router.back()} style={{ marginTop: 20 }}>
          <Mono color={colors.paper}>← Retour</Mono>
        </Pressable>
      </View>
    );
  }

  const url = target && sameOrigin(target, space.base) ? target : spaceUrl(space);
  const current = nav.url || url;
  const clear = isCleartext(current);
  const elsewhere = hostOf(current) !== hostOf(url);

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <StatusBar style="light" />
      <View style={[styles.top, { paddingTop: insets.top + 6 }]}>
        <Pressable
          onPress={() => router.back()}
          hitSlop={8}
          style={styles.icon}
          accessibilityRole="button"
          accessibilityLabel="Revenir à Kosmy"
        >
          <Mono color={colors.paper} size={16}>
            ←
          </Mono>
        </Pressable>
        <SpaceLogo space={space} size={30} />
        <View style={{ flex: 1, minWidth: 0 }}>
          <Body weight="semi" size={15} color={colors.paper} numberOfLines={1} style={{ lineHeight: 19 }}>
            {space.name}
          </Body>
          <Mono size={9} numberOfLines={1} color={clear ? colors.danger : elsewhere ? colors.text2 : colors.mute}>
            {clear ? "Non chiffré · " : ""}
            {hostOf(current)}
          </Mono>
        </View>
        <Pressable
          onPress={() => {
            setFailure(null);
            web.current?.reload();
          }}
          hitSlop={6}
          style={styles.icon}
          accessibilityRole="button"
          accessibilityLabel="Recharger la page"
        >
          <Mono color={colors.paper} size={16}>
            ↻
          </Mono>
        </Pressable>
        <Pressable
          onPress={() => Linking.openURL(current).catch(() => {})}
          hitSlop={6}
          style={styles.icon}
          accessibilityRole="button"
          accessibilityLabel="Ouvrir dans le navigateur"
        >
          <Mono color={colors.paper} size={16}>
            ↗
          </Mono>
        </Pressable>
        <Animated.View style={[styles.progress, bar]} />
      </View>

      <KeyboardAvoidingView behavior="padding" style={{ flex: 1 }}>
        {everUnlocked && (
          <WebView
            ref={web}
            source={{ uri: url }}
            style={{ flex: 1, backgroundColor: colors.bg }}
            containerStyle={{ backgroundColor: colors.bg }}
            applicationNameForUserAgent="Kosmy/1.1"
            domStorageEnabled
            javaScriptEnabled
            thirdPartyCookiesEnabled
            setSupportMultipleWindows={false}
            allowsBackForwardNavigationGestures
            forceDarkOn={false}
            overScrollMode="never"
            originWhitelist={["*"]}
            onShouldStartLoadWithRequest={(req) => {
              if (WEB.test(req.url)) return true;
              Linking.openURL(req.url).catch(() => {});
              return false;
            }}
            onNavigationStateChange={(n: WebViewNavigation) => setNav({ canGoBack: n.canGoBack, url: n.url, title: n.title })}
            onLoadStart={() => {
              shown.set(1);
            }}
            onLoadProgress={({ nativeEvent }) => {
              progress.set(withTiming(Math.max(0.08, nativeEvent.progress), { duration: 200, easing: ease }));
            }}
            onLoadEnd={() => {
              setLoaded(true);
              progress.set(withTiming(1, { duration: 200 }));
              shown.set(withTiming(0, { duration: 500 }));
            }}
            onError={({ nativeEvent }) => {
              shown.set(withTiming(0, { duration: 300 }));
              const code = (nativeEvent.description || "").match(/ERR_[A-Z_]+/)?.[0] ?? "";
              setFailure(ERRORS[code] ?? (nativeEvent.description || "La page n'a pas pu être chargée."));
            }}
            renderError={() => <View style={{ flex: 1, backgroundColor: colors.bg }} />}
          />
        )}

        {!loaded && !failure && everUnlocked && (
          <Animated.View exiting={FadeOut.duration(300)} style={[StyleSheet.absoluteFill, styles.center]} pointerEvents="none">
            <SpaceLogo space={space} size={64} />
            <Mono style={{ marginTop: 18 }}>Connexion à {hostOf(url)}…</Mono>
          </Animated.View>
        )}

        {failure && (
          <Animated.View entering={FadeIn.duration(300)} style={[StyleSheet.absoluteFill, styles.panel]}>
            <Mono color={colors.danger}>Page injoignable</Mono>
            <Serif size={44} style={{ marginTop: 12 }}>
              Impossible d'ouvrir <Em>{space.name}.</Em>
            </Serif>
            <Body style={{ marginTop: 14 }}>{failure}</Body>
            <Body size={13} color={colors.mute} style={{ marginTop: 8 }} selectable>
              {current}
            </Body>
            <Pressable
              onPress={() => {
                setFailure(null);
                setLoaded(false);
                web.current?.reload();
              }}
              style={styles.cta}
              accessibilityRole="button"
            >
              <Body weight="semi" size={15} color={colors.bg}>
                Réessayer
              </Body>
            </Pressable>
            <Pressable
              onPress={() => router.push({ pathname: "/espace/edition", params: { id: space.id } })}
              style={styles.second}
              accessibilityRole="button"
            >
              <Body weight="medium" size={15} color={colors.mute}>
                Modifier l'adresse
              </Body>
            </Pressable>
          </Animated.View>
        )}

        {!unlocked && (
          <Animated.View entering={FadeIn.duration(200)} style={[StyleSheet.absoluteFill, styles.panel, { backgroundColor: colors.bg }]}>
            <Mono color={colors.signal}>Espace protégé</Mono>
            <Serif size={48} style={{ marginTop: 12 }}>
              Espace <Em>verrouillé.</Em>
            </Serif>
            <Body style={{ marginTop: 14 }}>
              Utilisez l'empreinte ou le code de votre téléphone pour ouvrir l'administration de {space.name}.
            </Body>
            <Pressable onPress={ask} style={styles.cta} accessibilityRole="button">
              <Body weight="semi" size={15} color={colors.bg}>
                Déverrouiller
              </Body>
            </Pressable>
            <Pressable onPress={() => router.back()} style={styles.second} accessibilityRole="button">
              <Body weight="medium" size={15} color={colors.mute}>
                Revenir à Kosmy
              </Body>
            </Pressable>
          </Animated.View>
        )}
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  top: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 10,
    paddingBottom: 10,
    backgroundColor: colors.bg,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  icon: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  progress: {
    position: "absolute",
    left: 0,
    right: 0,
    bottom: -1,
    height: 2,
    backgroundColor: colors.signal,
    transformOrigin: "left",
  },
  center: { flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg },
  panel: { backgroundColor: colors.bg, paddingHorizontal: gutter, paddingTop: 40 },
  cta: { marginTop: 28, height: 54, borderRadius: 999, backgroundColor: colors.signal, alignItems: "center", justifyContent: "center" },
  second: { height: 48, alignItems: "center", justifyContent: "center", marginTop: 4 },
});
