import { Text, type TextProps, type TextStyle } from "react-native";

import { colors, fonts } from "../theme";

type P = TextProps & { color?: string; size?: number };

/** Titres en Instrument Serif. Les enfants <Em> passent en italique. */
export function Serif({ style, color = colors.paper, size = 40, ...p }: P) {
  return (
    <Text
      {...p}
      style={[{ fontFamily: fonts.serif, fontSize: size, lineHeight: size * 1.02, color, letterSpacing: -size * 0.01 }, style]}
    />
  );
}

/** Mot mis en avant dans un titre : italique, éventuellement coloré. */
export function Em({ style, color, ...p }: TextProps & { color?: string }) {
  return <Text {...p} style={[{ fontFamily: fonts.serifItalic }, color ? { color } : null, style]} />;
}

/** Petites étiquettes en JetBrains Mono, toujours en majuscules. */
export function Mono({ style, color = colors.mute, size = 11, weight, ...p }: P & { weight?: "medium" }) {
  return (
    <Text
      {...p}
      style={[
        {
          fontFamily: weight === "medium" ? fonts.monoMedium : fonts.mono,
          fontSize: size,
          letterSpacing: size * 0.06,
          textTransform: "uppercase",
          color,
        },
        style,
      ]}
    />
  );
}

/** Texte courant en Inter Tight. */
export function Body({ style, color = colors.text2, size = 16, weight, ...p }: P & { weight?: "medium" | "semi" }) {
  const fontFamily = weight === "semi" ? fonts.sansSemi : weight === "medium" ? fonts.sansMedium : fonts.sans;
  const s: TextStyle = { fontFamily, fontSize: size, lineHeight: size * 1.55, color };
  return <Text {...p} style={[s, style]} />;
}
