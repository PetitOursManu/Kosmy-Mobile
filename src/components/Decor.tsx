import { useEffect } from "react";
import { Linking, Pressable, StyleSheet, View, useWindowDimensions } from "react-native";
import Animated, {
  Easing,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withDelay,
  withRepeat,
  withTiming,
  type EntryAnimationsValues,
} from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import Svg, { Circle, Defs, Path, Text as SvgText, TextPath } from "react-native-svg";

import { colors, ease, fonts, gutter } from "../theme";
import { Body, Mono } from "./Typo";

/** Tampon circulaire qui tourne lentement (repris de la section Android du site). */
export function Stamp({ text, size = 104 }: { text: string; size?: number }) {
  const reduce = useReducedMotion();
  const r = useSharedValue(0);
  useEffect(() => {
    if (!reduce) r.value = withRepeat(withTiming(360, { duration: 18000, easing: Easing.linear }), -1);
  }, [r, reduce]);
  const spin = useAnimatedStyle(() => ({ transform: [{ rotate: `${r.value}deg` }] }));
  return (
    <Animated.View style={[{ width: size, height: size }, spin]} accessible={false}>
      <Svg width={size} height={size} viewBox="0 0 132 132">
        <Defs>
          <Path id="circ" d="M66,66 m-50,0 a50,50 0 1,1 100,0 a50,50 0 1,1 -100,0" />
        </Defs>
        <SvgText fontSize={11} fill={colors.signal} fontFamily={fonts.mono} letterSpacing={2}>
          <TextPath href="#circ">{text}</TextPath>
        </SvgText>
        <Circle cx={66} cy={66} r={20} fill={colors.signal} />
      </Svg>
    </Animated.View>
  );
}

/** Bande opaque derrière la barre d'état, pour que le contenu ne défile pas sous l'heure. */
export function StatusScrim() {
  const { top } = useSafeAreaInsets();
  return <View pointerEvents="none" style={[styles.scrim, { height: top }]} />;
}

/** Mot d'un titre qui monte depuis sous sa ligne (animation « rise » du site). */
const rise = (delay: number, h: number) => (_: EntryAnimationsValues) => {
  "worklet";
  return {
    initialValues: { transform: [{ translateY: h * 1.05 }] },
    animations: { transform: [{ translateY: withDelay(delay, withTiming(0, { duration: 900, easing: ease })) }] },
  };
};

export function Headline({
  lines,
  accent,
  size = 62,
}: {
  lines: string[][];
  accent?: string;
  size?: number;
}) {
  const lh = size * 0.92;
  return (
    <View accessible accessibilityRole="header" accessibilityLabel={lines.flat().join(" ")}>
      {lines.map((line, i) => (
        <View key={i} style={{ flexDirection: "row", flexWrap: "wrap" }}>
          {line.map((w, j) => (
            <View key={j} style={{ overflow: "hidden", height: lh + size * 0.08, marginRight: size * 0.22 }}>
              <Animated.Text
                entering={rise(120 + (i * 2 + j) * 80, lh)}
                style={{
                  fontFamily: w === accent ? fonts.serifItalic : fonts.serif,
                  color: w === accent ? colors.signal : colors.paper,
                  fontSize: size,
                  lineHeight: lh + size * 0.08,
                  letterSpacing: -size * 0.01,
                }}
              >
                {w}
              </Animated.Text>
            </View>
          ))}
        </View>
      ))}
    </View>
  );
}

/** Pied de page : crédit et grand « Kosmy » en contour. */
export function Footer() {
  const { width } = useWindowDimensions();
  const w = width - gutter * 2;
  return (
    <View style={styles.foot}>
      <Mono size={10} style={{ lineHeight: 16 }}>
        Fait par PetitOursManu · chaque logo appartient à son application
      </Mono>
      <Pressable onPress={() => Linking.openURL("https://github.com/PetitOursManu/Mocky")} style={{ marginTop: 10 }}>
        <Body size={13} color={colors.mute}>
          Design réalisé avec <Body size={13} color={colors.paper} weight="medium">Mocky</Body> ↗
        </Body>
      </Pressable>
      <Svg width={w} height={w * 0.42} viewBox="0 0 400 168" style={{ marginTop: 18 }}>
        <SvgText
          x={200}
          y={118}
          textAnchor="middle"
          fontFamily={fonts.serif}
          fontSize={150}
          fill="none"
          stroke="rgba(241,237,228,0.22)"
          strokeWidth={0.8}
        >
          Kosmy
        </SvgText>
      </Svg>
    </View>
  );
}

const styles = StyleSheet.create({
  scrim: { position: "absolute", top: 0, left: 0, right: 0, backgroundColor: "rgba(13,12,10,0.94)" },
  foot: { marginTop: 56, paddingTop: 28, paddingHorizontal: gutter, borderTopWidth: 1, borderTopColor: colors.line },
});
