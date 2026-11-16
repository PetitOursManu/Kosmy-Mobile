import { router } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  Easing,
  interpolateColor,
  LinearTransition,
  FadeOut,
  useAnimatedStyle,
  useSharedValue,
  withDelay,
  withTiming,
  type EntryAnimationsValues,
} from "react-native-reanimated";

import { useCatalog } from "../catalog/CatalogProvider";
import type { CatalogApp } from "../catalog/types";
import { useStore } from "../store/StoreProvider";
import { colors, ease, fonts, gutter } from "../theme";
import { AppLogo } from "./AppLogo";
import { Mono } from "./Typo";

const wipe = Easing.bezier(0.7, 0, 0.2, 1);

/** Apparition des lignes de l'index : glissé depuis la gauche, comme sur le site. */
export const rowEntering = (delay: number) => (_: EntryAnimationsValues) => {
  "worklet";
  return {
    initialValues: { opacity: 0, transform: [{ translateX: -24 }] },
    animations: {
      opacity: withDelay(delay, withTiming(1, { duration: 800, easing: ease })),
      transform: [{ translateX: withDelay(delay, withTiming(0, { duration: 800, easing: ease })) }],
    },
  };
};

/**
 * Ligne de l'index. Au toucher, elle se remplit de la couleur de l'appli depuis le bas,
 * le logo pivote et grossit, le nom passe en italique — l'effet de survol du site.
 */
export function AppRow({ app, index }: { app: CatalogApp; index: number }) {
  const { themeById } = useCatalog();
  const { statuses } = useStore();
  const [pressed, setPressed] = useState(false);
  const p = useSharedValue(0);

  const bg = useAnimatedStyle(() => ({ transform: [{ scaleY: p.value }] }));
  const ink = useAnimatedStyle(() => ({ color: interpolateColor(p.value, [0, 1], [colors.paper, app.ink]) }));
  const soft = useAnimatedStyle(() => ({ color: interpolateColor(p.value, [0, 1], [colors.mute, app.ink]) }));
  const logo = useAnimatedStyle(() => ({ transform: [{ rotate: `${-10 * p.value}deg` }, { scale: 1 + 0.12 * p.value }] }));
  const arrow = useAnimatedStyle(() => ({ transform: [{ translateX: 6 * p.value }, { translateY: -6 * p.value }] }));

  const s = statuses[app.id];
  const tag = !app.android
    ? null
    : s?.state === "update"
      ? { label: "Mise à jour", signal: true }
      : s?.installed
        ? { label: "Installée", signal: false }
        : { label: "APK", signal: false };

  return (
    <Animated.View entering={rowEntering((index % 4) * 70)} exiting={FadeOut.duration(180)} layout={LinearTransition.duration(420).easing(ease)}>
      <Pressable
        onPressIn={() => {
          setPressed(true);
          p.value = withTiming(1, { duration: 450, easing: wipe });
        }}
        onPressOut={() => {
          setPressed(false);
          p.value = withTiming(0, { duration: 550, easing: wipe });
        }}
        onPress={() => router.push({ pathname: "/app/[id]", params: { id: app.id } })}
        accessibilityRole="button"
        accessibilityLabel={`${app.name}, ${app.text.fr.line}`}
        style={styles.row}
      >
        <Animated.View style={[styles.fill, { backgroundColor: app.color }, bg]} />
        <View style={styles.top}>
          <Animated.View style={logo}>
            <AppLogo app={app} size={48} />
          </Animated.View>
          <Animated.Text
            numberOfLines={1}
            style={[styles.name, { fontFamily: pressed ? fonts.serifItalic : fonts.serif }, ink]}
          >
            {app.name}
          </Animated.Text>
          {tag && (
            <View style={[styles.tag, tag.signal && !pressed ? styles.tagSignal : { borderColor: pressed ? app.ink : colors.lineStrong }]}>
              <Mono size={9.5} color={tag.signal && !pressed ? colors.bg : pressed ? app.ink : colors.text2}>
                {tag.label}
              </Mono>
            </View>
          )}
          <Animated.Text style={[styles.arrow, ink, arrow]}>↗</Animated.Text>
        </View>
        <Animated.Text style={[styles.meta, soft]}>
          {app.n} — {themeById[app.theme]?.name.fr.toUpperCase()}
        </Animated.Text>
        <Animated.Text style={[styles.line1, ink]}>{app.text.fr.line}</Animated.Text>
        <Animated.Text style={[styles.line2, soft]}>{app.text.fr.more}</Animated.Text>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    paddingVertical: 20,
    paddingHorizontal: gutter,
    borderTopWidth: 1,
    borderTopColor: colors.line,
    overflow: "hidden",
  },
  fill: { ...StyleSheet.absoluteFill, transformOrigin: "bottom" },
  top: { flexDirection: "row", alignItems: "center", gap: 16 },
  name: { flex: 1, fontSize: 40, lineHeight: 44, letterSpacing: -0.4 },
  arrow: { fontFamily: fonts.sans, fontSize: 26, lineHeight: 30 },
  tag: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 3 },
  tagSignal: { backgroundColor: colors.signal, borderColor: colors.signal },
  meta: { fontFamily: fonts.mono, fontSize: 10, letterSpacing: 0.6, marginTop: 14 },
  line1: { fontFamily: fonts.sansMedium, fontSize: 17, lineHeight: 24, marginTop: 6 },
  line2: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 19, marginTop: 4 },
});
