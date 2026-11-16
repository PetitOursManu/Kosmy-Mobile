import { Image } from "expo-image";
import * as Haptics from "expo-haptics";
import { memo, useEffect, useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  useAnimatedProps,
  useAnimatedStyle,
  useFrameCallback,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withTiming,
  ZoomIn,
  type SharedValue,
} from "react-native-reanimated";
import Svg, { Circle, Defs, Line, Path, Text as SvgText, TextPath } from "react-native-svg";

import { useCatalog } from "../catalog/CatalogProvider";
import type { CatalogApp, Theme } from "../catalog/types";
import { colors, ease, fonts } from "../theme";
import { AppLogo } from "./AppLogo";
import { Mono } from "./Typo";

const AnimatedCircle = Animated.createAnimatedComponent(Circle);
const VB = 540;
const C = VB / 2;
const MARK = require("../../assets/brand/kosmy-mark.png");

/** Anneau : tracé progressivement (anneaux pleins) ou fondu (anneaux pointillés), comme sur le site. */
function Ring({ r, index, k, reduce }: { r: number; index: number; k: number; reduce: boolean }) {
  const len = 2 * Math.PI * r;
  const p = useSharedValue(reduce ? 1 : 0);
  useEffect(() => {
    if (!reduce) p.value = withDelay(index * 250, withTiming(1, { duration: index % 2 ? 1600 : 2400, easing: ease }));
  }, [index, p, reduce]);
  const dashed = index % 2 === 1;
  const props = useAnimatedProps(() =>
    dashed ? { opacity: p.value, strokeDashoffset: 0 } : { opacity: 1, strokeDashoffset: len * (1 - p.value) },
  );
  return (
    <AnimatedCircle
      cx={C}
      cy={C}
      r={r}
      fill="none"
      stroke={colors.lineStrong}
      strokeWidth={1 / k}
      strokeDasharray={dashed ? [2 / k, 6 / k] : [len, len]}
      animatedProps={props}
    />
  );
}

/** Logo qui tourne sur son anneau. Au toucher : il grossit, les orbites s'arrêtent, son nom apparaît. */
const Satellite = memo(function Satellite({
  app,
  theme,
  angle0,
  radius,
  tile,
  t,
  paused,
  delay,
  onPress,
}: {
  app: CatalogApp;
  theme: Theme;
  angle0: number;
  radius: number;
  tile: number;
  t: SharedValue<number>;
  paused: SharedValue<boolean>;
  delay: number;
  onPress: (id: string) => void;
}) {
  const [active, setActive] = useState(false);
  const scale = useSharedValue(1);
  const dur = theme.orbit.duration;

  const pos = useAnimatedStyle(() => {
    const a = ((angle0 + (t.value / dur) * 360) * Math.PI) / 180;
    return { transform: [{ translateX: Math.sin(a) * radius }, { translateY: -Math.cos(a) * radius }] };
  });
  const grow = useAnimatedStyle(() => ({ transform: [{ scale: scale.value }] }));

  const pressIn = () => {
    setActive(true);
    paused.set(true);
    scale.set(withTiming(1.25, { duration: 450, easing: ease }));
    Haptics.selectionAsync().catch(() => {});
  };
  const pressOut = () => {
    setActive(false);
    paused.set(false);
    scale.set(withTiming(1, { duration: 500, easing: ease }));
  };

  return (
    <Animated.View style={[styles.sat, { width: tile, height: tile, marginLeft: -tile / 2, marginTop: -tile / 2, zIndex: active ? 10 : 1 }, pos]}>
      <Animated.View entering={ZoomIn.delay(delay).duration(600)}>
        <Pressable
          onPressIn={pressIn}
          onPressOut={pressOut}
          onPress={() => onPress(app.id)}
          hitSlop={8}
          accessibilityRole="button"
          accessibilityLabel={`${app.name} — ${theme.name.fr}`}
        >
          <Animated.View style={grow}>
            <AppLogo app={app} size={tile} />
            {active && (
              <View
                pointerEvents="none"
                style={[StyleSheet.absoluteFill, { borderRadius: tile * 0.27, borderWidth: 2, borderColor: app.color }]}
              />
            )}
          </Animated.View>
        </Pressable>
        {active && (
          <View style={[styles.tipWrap, { top: tile * 1.15 + 8 }]} pointerEvents="none">
            <View style={[styles.tip, { backgroundColor: app.color }]}>
              <Mono size={10} color={app.ink}>
                {app.name}
              </Mono>
            </View>
          </View>
        )}
      </Animated.View>
    </Animated.View>
  );
});

/**
 * Version mobile des orbites du site : le logo Kosmy au centre, un anneau par thème
 * avec son nom écrit dessus, et les logos des applis qui tournent autour.
 */
export function OrbitSystem({ size, onPressApp }: { size: number; onPressApp: (id: string) => void }) {
  const { catalog, appById } = useCatalog();
  const reduce = useReducedMotion();
  const k = size / VB;
  const tile = Math.round(Math.min(54, Math.max(34, size * 0.1)));
  const fs = 8.5 / k;

  // Temps écoulé (en secondes) : il s'arrête pendant qu'on touche un logo.
  const t = useSharedValue(0);
  const paused = useSharedValue(false);
  useFrameCallback((f) => {
    if (!paused.value) t.value += (f.timeSincePreviousFrame ?? 16) / 1000;
  }, !reduce);

  let order = 0;
  return (
    <View style={{ width: size, height: size }}>
      <Svg width={size} height={size} viewBox={`0 0 ${VB} ${VB}`} style={StyleSheet.absoluteFill}>
        <Defs>
          {catalog.themes.map((th) => {
            // Arc du haut de l'anneau, sur lequel s'écrit le nom du thème (centré sur le trait).
            const rb = th.orbit.radius - fs * 0.36;
            const a1 = (-90 - 70) * (Math.PI / 180);
            const a2 = (-90 + 70) * (Math.PI / 180);
            return (
              <Path
                key={th.id}
                id={`arc-${th.id}`}
                d={`M ${C + rb * Math.cos(a1)} ${C + rb * Math.sin(a1)} A ${rb} ${rb} 0 0 1 ${C + rb * Math.cos(a2)} ${C + rb * Math.sin(a2)}`}
              />
            );
          })}
        </Defs>
        <Line x1={C} y1={0} x2={C} y2={VB} stroke="rgba(241,237,228,0.06)" strokeWidth={1 / k} />
        <Line x1={0} y1={C} x2={VB} y2={C} stroke="rgba(241,237,228,0.06)" strokeWidth={1 / k} />
        {catalog.themes.map((th, i) => (
          <Ring key={th.id} r={th.orbit.radius} index={i} k={k} reduce={reduce} />
        ))}
        {catalog.themes.map((th) =>
          [true, false].map((mask) => (
            <SvgText
              key={th.id + mask}
              fill={mask ? colors.bg : colors.signal}
              stroke={mask ? colors.bg : undefined}
              strokeWidth={mask ? 7 / k : 0}
              fontSize={fs}
              fontFamily={fonts.mono}
              letterSpacing={1.6 / k}
              textAnchor="middle"
            >
              <TextPath href={`#arc-${th.id}`} startOffset="50%">
                {th.name.fr.toUpperCase()}
              </TextPath>
            </SvgText>
          )),
        )}
      </Svg>

      <Animated.View
        entering={ZoomIn.delay(200).duration(900)}
        style={[styles.sun, { width: size * 0.222, height: size * 0.222, borderRadius: size, left: size * 0.389, top: size * 0.389 }]}
      >
        <Image source={MARK} style={{ width: "88%", height: "88%" }} contentFit="contain" accessibilityLabel="Logo Kosmy" />
      </Animated.View>

      <View style={[StyleSheet.absoluteFill, { left: size / 2, top: size / 2 }]} pointerEvents="box-none">
        {catalog.themes.map((th) => {
          const ids = catalog.apps.filter((a) => a.theme === th.id).map((a) => a.id);
          return ids.map((id, i) => {
            const app = appById[id];
            return (
              <Satellite
                key={id}
                app={app}
                theme={th}
                angle0={(th.orbit.start ?? 0) + (360 * i) / ids.length}
                radius={th.orbit.radius * k}
                tile={tile}
                t={t}
                paused={paused}
                delay={500 + order++ * 90}
                onPress={onPressApp}
              />
            );
          });
        })}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  sat: { position: "absolute", left: 0, top: 0 },
  sun: {
    position: "absolute",
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
    borderWidth: 1,
    borderColor: "rgba(241,237,228,0.22)",
  },
  tipWrap: { position: "absolute", left: -80, right: -80, alignItems: "center" },
  tip: {
    paddingHorizontal: 8,
    paddingVertical: 3,
    borderRadius: 4,
  },
});
