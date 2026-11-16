import { router, useLocalSearchParams } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { useEffect, useState } from "react";
import { Linking, Pressable, StyleSheet, View } from "react-native";
import Animated, {
  FadeInDown,
  interpolate,
  useAnimatedScrollHandler,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  ZoomIn,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { hostOf, useAdmin } from "../../admin/AdminProvider";
import { useCatalog } from "../../catalog/CatalogProvider";
import { ActionButton } from "../../components/ActionButton";
import { AppLogo } from "../../components/AppLogo";
import { versionLine } from "../../components/InstallRow";
import { Body, Em, Mono, Serif } from "../../components/Typo";
import { formatSize } from "../../store/github";
import { useStore } from "../../store/StoreProvider";
import { colors, ease, gutter } from "../../theme";

const fade = (d: number) => FadeInDown.duration(700).delay(d).easing(ease);

/** Notes de version : on garde le texte, sans la syntaxe Markdown. */
const plain = (md: string) =>
  md
    .replace(/\r/g, "")
    .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
    .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
    .replace(/^#+\s*/gm, "")
    .replace(/[*_`>]/g, "")
    .replace(/^\s*-\s+/gm, "· ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

/** Couleur claire : la barre d'état passe en texte sombre. */
const isLight = (hex: string) => {
  const n = parseInt(hex.replace("#", "").slice(0, 6), 16);
  const r = (n >> 16) & 255, g = (n >> 8) & 255, b = n & 255;
  return 0.299 * r + 0.587 * g + 0.114 * b > 150;
};

const date = (iso: string) => {
  const d = new Date(iso);
  return isNaN(d.getTime()) ? "" : d.toLocaleDateString("fr-FR", { day: "numeric", month: "long", year: "numeric" });
};

function Row({ k, v }: { k: string; v: string }) {
  return (
    <View style={styles.kv}>
      <Mono size={10}>{k}</Mono>
      <Body size={14} color={colors.paper} style={{ flexShrink: 1, textAlign: "right" }}>
        {v}
      </Body>
    </View>
  );
}

export default function AppDetail() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const { appById, themeById, catalog } = useCatalog();
  const store = useStore();
  const app = appById[id];
  const adminCtx = useAdmin();
  const mine = adminCtx.spaces.filter((sp) => sp.appId === id);

  // Le bandeau de couleur monte depuis le bas, comme le remplissage des lignes de l'index.
  const fill = useSharedValue(0);
  useEffect(() => {
    fill.value = withDelay(80, withTiming(1, { duration: 650, easing: ease }));
  }, [fill]);
  const band = useAnimatedStyle(() => ({ transform: [{ scaleY: fill.value }] }));

  // Au défilement, une bande sombre passe derrière la barre d'état.
  const y = useSharedValue(0);
  const [scrolled, setScrolled] = useState(false);
  const onScroll = useAnimatedScrollHandler((e) => {
    y.value = e.contentOffset.y;
  });
  const scrim = useAnimatedStyle(() => ({ opacity: interpolate(y.value, [140, 260], [0, 1], "clamp") }));

  if (!app) {
    return (
      <View style={[styles.center, { paddingTop: insets.top }]}>
        <Serif size={40}>Appli introuvable</Serif>
        <Pressable onPress={() => router.back()} style={{ marginTop: 20 }}>
          <Mono color={colors.paper}>← Retour</Mono>
        </Pressable>
      </View>
    );
  }

  const s = store.statuses[app.id];
  const theme = themeById[app.theme];
  const repoUrl = `${catalog.github.replace(/\/+$/, "")}/${app.repo}`;
  const apkRepoUrl = app.android ? `${catalog.github.replace(/\/+$/, "")}/${app.android.repo}/releases` : null;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <StatusBar style={!scrolled && isLight(app.color) ? "dark" : "light"} />
    <Animated.ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingBottom: insets.bottom + 40 }}
      onScroll={onScroll}
      scrollEventThrottle={16}
      onMomentumScrollEnd={(e) => setScrolled(e.nativeEvent.contentOffset.y > 200)}
      onScrollEndDrag={(e) => setScrolled(e.nativeEvent.contentOffset.y > 200)}
    >
      {/* Bandeau à la couleur de l'appli */}
      <View style={[styles.hero, { paddingTop: insets.top + 12 }]}>
        <Animated.View style={[StyleSheet.absoluteFill, { backgroundColor: app.color, transformOrigin: "bottom" }, band]} />
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" accessibilityLabel="Retour" style={styles.back}>
          <Mono color={app.ink} size={11}>
            ← Retour
          </Mono>
        </Pressable>
        <Animated.View entering={fade(150)}>
          <Mono color={app.ink} style={{ opacity: 0.75 }}>
            {app.n} — {theme?.name.fr}
          </Mono>
        </Animated.View>
        <View style={styles.heroMain}>
          <Animated.View entering={ZoomIn.delay(200).duration(700)} style={{ transform: [{ rotate: "-6deg" }] }}>
            <AppLogo app={app} size={92} />
          </Animated.View>
          <Animated.View entering={fade(260)} style={{ flex: 1 }}>
            <Serif size={60} color={app.ink} numberOfLines={1} adjustsFontSizeToFit accessibilityRole="header">
              {app.name}
            </Serif>
          </Animated.View>
        </View>
        <Animated.View entering={fade(320)}>
          <Serif size={30} color={app.ink} style={{ marginTop: 18, lineHeight: 32 }}>
            <Em>{app.text.fr.line}</Em>
          </Serif>
        </Animated.View>
      </View>

      <View style={{ paddingHorizontal: gutter }}>
        <Animated.View entering={fade(380)}>
          <Body size={17} style={{ marginTop: 26 }}>
            {app.text.fr.more}
          </Body>
        </Animated.View>

        <Animated.View entering={fade(440)} style={{ marginTop: 30 }}>
          <Mono style={{ marginBottom: 12 }}>Plateformes</Mono>
          <View style={styles.tags}>
            {app.platforms.map((p) => (
              <View key={p} style={styles.tag}>
                <Mono size={11} color={colors.paper}>
                  {p}
                </Mono>
              </View>
            ))}
          </View>
        </Animated.View>

        {/* Android */}
        <Animated.View entering={fade(500)} style={styles.panel}>
          <Mono color={colors.signal} style={{ marginBottom: 14 }}>
            Android
          </Mono>
          {app.android && s ? (
            <>
              <Serif size={36}>
                {app.android.name}
                {s.state === "update" ? <Em color={colors.signal}> · nouvelle version</Em> : null}
              </Serif>
              <Mono size={10} style={{ marginTop: 8 }} color={s.state === "update" && !s.task ? colors.signal : colors.mute}>
                {versionLine(s)}
              </Mono>
              <View style={{ marginTop: 20 }}>
                <ActionButton status={s} wide />
              </View>
              {s.task?.phase === "downloading" && (
                <Body size={13} color={colors.mute} style={{ marginTop: 10, textAlign: "center" }}>
                  Touchez le bouton pour annuler le téléchargement.
                </Body>
              )}
              {s.task?.phase === "waiting_user" && (
                <Pressable onPress={() => store.cancel(app.id)} style={{ marginTop: 12, alignSelf: "center" }}>
                  <Body size={14} weight="medium" color={colors.mute}>
                    Annuler l'installation
                  </Body>
                </Pressable>
              )}
              {s.task?.phase === "error" && (
                <View style={styles.error}>
                  <Body size={14} color={colors.paper}>
                    {s.task.message}
                  </Body>
                  {s.task.status === "conflict" && (
                    <Pressable onPress={() => store.uninstall(app.id)} style={{ marginTop: 10 }}>
                      <Body size={14} weight="semi" color={colors.signal}>
                        Désinstaller la version actuelle →
                      </Body>
                    </Pressable>
                  )}
                </View>
              )}

              <View style={{ marginTop: 22 }}>
                <Row k="Package" v={app.android.package} />
                {s.installed && <Row k="Installée" v={s.installed.versionName ? `v${s.installed.versionName.replace(/^v/i, "")}` : "Oui"} />}
                {s.release && <Row k="Dernière version" v={s.release.tag} />}
                {s.release?.publishedAt ? <Row k="Publiée le" v={date(s.release.publishedAt)} /> : null}
                {s.asset && <Row k="Fichier" v={`${s.asset.name} · ${formatSize(s.asset.size)}`} />}
                {s.release && !s.asset && <Row k="Fichier" v="Aucun APK compatible avec cet appareil" />}
              </View>

              {s.release?.notes ? (
                <View style={{ marginTop: 22 }}>
                  <Mono style={{ marginBottom: 10 }}>Nouveautés</Mono>
                  <Body size={14} numberOfLines={12}>
                    {plain(s.release.notes)}
                  </Body>
                </View>
              ) : null}
              {apkRepoUrl && (
                <Pressable onPress={() => Linking.openURL(apkRepoUrl)} style={{ marginTop: 18 }}>
                  <Body size={14} weight="medium" color={colors.paper}>
                    Toutes les releases ↗
                  </Body>
                </Pressable>
              )}
            </>
          ) : (
            <>
              <Serif size={32}>
                Pas encore <Em>sur Android.</Em>
              </Serif>
              <Body style={{ marginTop: 12 }}>
                Dès qu'une version Android de {app.name} sera publiée, elle apparaîtra ici et s'installera depuis Kosmy.
              </Body>
            </>
          )}
        </Animated.View>

        {/* Administration */}
        {app.admin && (
          <Animated.View entering={fade(530)} style={[styles.panel, { marginTop: 14 }]}>
            <Mono color={colors.signal} style={{ marginBottom: 14 }}>
              Administration
            </Mono>
            {mine.length ? (
              mine.map((sp) => (
                <Pressable
                  key={sp.id}
                  onPress={async () => {
                    if (await adminCtx.unlock()) router.push({ pathname: "/espace/[id]", params: { id: sp.id } });
                  }}
                  style={styles.space}
                  accessibilityRole="button"
                >
                  <View style={{ flex: 1 }}>
                    <Body size={16} weight="medium" color={colors.paper}>
                      Ouvrir l'admin
                    </Body>
                    <Mono size={10} numberOfLines={1}>
                      {hostOf(sp.base)}
                    </Mono>
                  </View>
                  <Mono color={colors.signal} size={16}>
                    →
                  </Mono>
                </Pressable>
              ))
            ) : (
              <>
                <Body>Gérez votre instance de {app.name} depuis Kosmy : il suffit de son adresse.</Body>
                <Pressable
                  onPress={() => router.push({ pathname: "/espace/edition", params: { app: app.id } })}
                  style={{ marginTop: 14 }}
                  accessibilityRole="button"
                >
                  <Body size={15} weight="semi" color={colors.signal}>
                    Ajouter mon instance →
                  </Body>
                </Pressable>
              </>
            )}
          </Animated.View>
        )}

        {/* Dépôt */}
        <Animated.View entering={fade(560)}>
          <Pressable onPress={() => Linking.openURL(repoUrl)} style={styles.repo} accessibilityRole="link">
            <View style={{ flex: 1 }}>
              <Mono style={{ marginBottom: 6 }}>Code source</Mono>
              <Body size={16} color={colors.paper} weight="medium" numberOfLines={1}>
                {repoUrl.replace(/^https:\/\//, "")}
              </Body>
            </View>
            <Body size={26} color={colors.paper}>
              ↗
            </Body>
          </Pressable>
        </Animated.View>
      </View>
    </Animated.ScrollView>
    <Animated.View pointerEvents="none" style={[styles.scrim, { height: insets.top }, scrim]} />
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: "rgba(13,12,10,0.94)" },
  center: { flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" },
  hero: { paddingHorizontal: gutter, paddingBottom: 28, overflow: "hidden", borderBottomLeftRadius: 28, borderBottomRightRadius: 28 },
  back: { alignSelf: "flex-start", paddingVertical: 8, marginBottom: 18 },
  heroMain: { flexDirection: "row", alignItems: "center", gap: 18, marginTop: 18 },
  tags: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tag: { borderWidth: 1, borderColor: colors.lineStrong, borderRadius: 999, paddingHorizontal: 12, paddingVertical: 5 },
  space: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line },
  panel: {
    marginTop: 30,
    padding: 22,
    borderRadius: 24,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
  },
  kv: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "baseline",
    gap: 16,
    paddingVertical: 10,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  error: { marginTop: 16, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: colors.signal },
  repo: {
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    marginTop: 26,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
});
