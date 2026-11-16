import type { BottomTabBarProps } from "expo-router/js-tabs";
import * as Haptics from "expo-haptics";
import { useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, { useAnimatedStyle, useSharedValue, withSpring, withTiming, ZoomIn } from "react-native-reanimated";

import { useStore } from "../store/StoreProvider";
import { colors, ease } from "../theme";
import { Mono } from "./Typo";

const LABELS: Record<string, string> = {
  index: "Accueil",
  catalogue: "Catalogue",
  "mes-applis": "Mes applis",
  admin: "Admin",
};

/** Barre d'onglets façon navigation du site : « (01) » au-dessus du nom, point vert sur l'onglet actif. */
export function TabBar({ state, navigation, insets }: BottomTabBarProps) {
  const { updateCount } = useStore();
  const [widths, setWidths] = useState<number[]>([]);
  const [lefts, setLefts] = useState<number[]>([]);
  const x = useSharedValue(0);

  useEffect(() => {
    const l = lefts[state.index];
    const w = widths[state.index];
    if (l !== undefined && w !== undefined) x.value = withSpring(l + w / 2 - 3, { damping: 18, stiffness: 180 });
  }, [lefts, state.index, widths, x]);

  const dot = useAnimatedStyle(() => ({ transform: [{ translateX: x.value }] }));

  return (
    <View style={[styles.bar, { paddingBottom: Math.max(insets.bottom, 10) }]}>
      {state.routes.map((route, i) => {
        const focused = state.index === i;
        const badge = route.name === "mes-applis" && updateCount > 0 ? updateCount : 0;
        return (
          <Pressable
            key={route.key}
            accessibilityRole="tab"
            accessibilityState={{ selected: focused }}
            accessibilityLabel={`${LABELS[route.name]}${badge ? `, ${badge} mise${badge > 1 ? "s" : ""} à jour` : ""}`}
            onLayout={(e) => {
              const { x: lx, width } = e.nativeEvent.layout;
              setLefts((a) => Object.assign([...a], { [i]: lx }));
              setWidths((a) => Object.assign([...a], { [i]: width }));
            }}
            onPress={() => {
              const ev = navigation.emit({ type: "tabPress", target: route.key, canPreventDefault: true });
              if (!focused && !ev.defaultPrevented) {
                Haptics.selectionAsync().catch(() => {});
                navigation.navigate(route.name);
              }
            }}
            style={styles.item}
          >
            <TabLabel label={LABELS[route.name] ?? route.name} n={i + 1} focused={focused} />
            {badge > 0 && (
              <Animated.View entering={ZoomIn.duration(400)} style={styles.badge}>
                <Mono size={10} color={colors.bg} weight="medium">
                  {badge}
                </Mono>
              </Animated.View>
            )}
          </Pressable>
        );
      })}
      <Animated.View style={[styles.dot, dot]} />
    </View>
  );
}

function TabLabel({ label, n, focused }: { label: string; n: number; focused: boolean }) {
  const o = useSharedValue(focused ? 1 : 0);
  useEffect(() => {
    o.value = withTiming(focused ? 1 : 0, { duration: 300, easing: ease });
  }, [focused, o]);
  const s = useAnimatedStyle(() => ({ opacity: 0.55 + o.value * 0.45 }));
  return (
    <Animated.View style={[styles.label, s]}>
      <Mono size={9} color={focused ? colors.signal : colors.mute}>
        ({String(n).padStart(2, "0")})
      </Mono>
      <Mono size={11} color={focused ? colors.paper : colors.mute} numberOfLines={1}>
        {label}
      </Mono>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: "row",
    justifyContent: "space-around",
    backgroundColor: colors.bg,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: 14,
  },
  item: { flex: 1, alignItems: "center", paddingVertical: 4 },
  label: { alignItems: "center", gap: 3 },
  badge: {
    position: "absolute",
    top: -4,
    right: 6,
    minWidth: 18,
    height: 18,
    paddingHorizontal: 5,
    borderRadius: 9,
    backgroundColor: colors.signal,
    alignItems: "center",
    justifyContent: "center",
  },
  dot: { position: "absolute", top: 4, left: 0, width: 6, height: 6, borderRadius: 3, backgroundColor: colors.signal },
});
