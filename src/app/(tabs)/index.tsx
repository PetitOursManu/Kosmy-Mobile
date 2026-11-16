import { Image } from "expo-image";
import { router } from "expo-router";
import { useEffect } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  FadeInDown,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withSequence,
  withTiming,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCatalog } from "../../catalog/CatalogProvider";
import { Footer, Headline, Stamp, StatusScrim } from "../../components/Decor";
import { InstallRow } from "../../components/InstallRow";
import { OrbitSystem } from "../../components/OrbitSystem";
import { Body, Em, Mono, Serif } from "../../components/Typo";
import { useStore } from "../../store/StoreProvider";
import { colors, ease, gutter } from "../../theme";

const MARK = require("../../../assets/brand/kosmy-mark.png");
const fade = (d: number) => FadeInDown.duration(800).delay(d).easing(ease);

function BlinkDot() {
  const reduce = useReducedMotion();
  const o = useSharedValue(1);
  useEffect(() => {
    if (!reduce) o.value = withRepeat(withSequence(withTiming(1, { duration: 800 }), withTiming(0.25, { duration: 0 }), withTiming(0.25, { duration: 800 }), withTiming(1, { duration: 0 })), -1);
  }, [o, reduce]);
  const s = useAnimatedStyle(() => ({ opacity: o.value }));
  return <Animated.View style={[styles.dot, s]} />;
}

export default function Home() {
  const insets = useSafeAreaInsets();
  const { width } = useWindowDimensions();
  const { catalog, refresh: refreshCatalog, refreshing } = useCatalog();
  const store = useStore();
  const size = Math.min(width - gutter * 2, 440);
  const androidApps = catalog.apps.filter((a) => a.android).map((a) => store.statuses[a.id]).filter(Boolean);
  const installed = androidApps.filter((s) => s.installed).length;

  const pressCta = useSharedValue(0);
  const cta = useAnimatedStyle(() => ({
    backgroundColor: pressCta.value > 0.5 ? colors.signal : colors.paper,
    transform: [{ translateY: -3 * pressCta.value }, { rotate: `${-1.5 * pressCta.value}deg` }],
  }));

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 10, paddingBottom: 24 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            refreshCatalog();
            store.refresh(true);
          }}
          tintColor={colors.signal}
          colors={[colors.bg]}
          progressBackgroundColor={colors.signal}
        />
      }
    >
      {/* Barre du haut */}
      <Animated.View entering={fade(0)} style={styles.top}>
        <View style={styles.brand}>
          <View style={styles.mark}>
            <Image source={MARK} style={{ width: 30, height: 30 }} contentFit="contain" />
          </View>
          <Serif size={28}>Kosmy</Serif>
        </View>
        <View style={styles.status}>
          <BlinkDot />
          <Mono size={10}>{catalog.apps.length} applis en orbite</Mono>
        </View>
      </Animated.View>

      <View style={{ alignItems: "center", marginTop: 18 }}>
        <OrbitSystem size={size} onPressApp={(id) => router.push({ pathname: "/app/[id]", params: { id } })} />
      </View>

      <View style={{ paddingHorizontal: gutter, marginTop: 24 }}>
        <Animated.View entering={fade(100)}>
          <Mono style={{ marginBottom: 20, lineHeight: 17 }}>Catalogue N°01 — Logiciels libres, faits main, par PetitOursManu</Mono>
        </Animated.View>
        <Headline lines={[["Des", "applis"], ["libres,", "à"], ["installer"], ["chez", "soi."]]} accent="libres," />
        <Animated.View entering={fade(800)}>
          <Body size={17} style={{ marginTop: 24 }}>
            {catalog.apps.length === 8 ? "Huit" : catalog.apps.length} applications open source publiées sur GitHub : de la musique, de l'IA, des
            tableaux de bord, de la documentation et de quoi s'organiser. Pas d'abonnement, vos données restent chez vous.
          </Body>
          <View style={styles.actions}>
            <Pressable
              onPressIn={() => (pressCta.value = withTiming(1, { duration: 300, easing: ease }))}
              onPressOut={() => (pressCta.value = withTiming(0, { duration: 300, easing: ease }))}
              onPress={() => router.navigate("/catalogue")}
              accessibilityRole="button"
            >
              <Animated.View style={[styles.btn, cta]}>
                <Body weight="semi" size={15} color={colors.bg}>
                  Découvrir les applis →
                </Body>
              </Animated.View>
            </Pressable>
            <Pressable onPress={() => Linking.openURL(catalog.github)} accessibilityRole="link">
              <Body weight="medium" size={15} color={colors.paper} style={styles.link}>
                Voir sur GitHub ↗
              </Body>
            </Pressable>
          </View>
        </Animated.View>
      </View>

      {/* Android */}
      <Animated.View entering={fade(1000)} style={styles.panel}>
        <View style={styles.stamp}>
          <Stamp text="KOSMY · INSTALLER · METTRE À JOUR · " size={92} />
        </View>
        <Mono color={colors.signal} style={{ marginBottom: 18 }}>
          (02) — Sur cet appareil
        </Mono>
        <Serif size={48} style={{ maxWidth: "75%" }}>
          Installez <Em>en un geste.</Em>
        </Serif>
        <Body size={16} style={{ marginTop: 18 }}>
          Les versions Android de vos applis, installées et mises à jour directement depuis leurs releases GitHub.
        </Body>
        <Mono size={10} style={{ marginTop: 18 }}>
          {androidApps.length} applis Android · {installed} installée{installed > 1 ? "s" : ""}
          {store.updateCount ? ` · ${store.updateCount} mise${store.updateCount > 1 ? "s" : ""} à jour` : ""}
        </Mono>
        <View style={{ marginTop: 14, borderBottomWidth: 1, borderBottomColor: colors.line }}>
          {androidApps.map((s, i) => (
            <InstallRow key={s.item.id} status={s} index={i} />
          ))}
        </View>
        <Pressable onPress={() => router.navigate("/mes-applis")} style={{ marginTop: 18 }} accessibilityRole="button">
          <Body weight="medium" size={15} color={colors.paper}>
            Tout voir dans Mes applis →
          </Body>
        </Pressable>
      </Animated.View>

      <Footer />
    </ScrollView>
    <StatusScrim />
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: gutter },
  brand: { flexDirection: "row", alignItems: "center", gap: 12 },
  mark: {
    width: 36,
    height: 36,
    borderRadius: 10,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: colors.line,
  },
  status: { flexDirection: "row", alignItems: "center", gap: 8 },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.signal },
  actions: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 20, marginTop: 28 },
  btn: { paddingVertical: 15, paddingHorizontal: 22, borderRadius: 999 },
  link: { borderBottomWidth: 1, borderBottomColor: colors.paper, paddingBottom: 3 },
  panel: {
    marginTop: 56,
    marginHorizontal: gutter - 6,
    padding: 22,
    borderRadius: 28,
    backgroundColor: colors.panel,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
  },
  stamp: { position: "absolute", right: 14, top: 14 },
});
