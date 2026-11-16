import { Easing } from "react-native-reanimated";

/** Identité Kosmy : la même que le site vitrine. */
export const colors = {
  bg: "#0d0c0a",
  panel: "#15130f",
  paper: "#f1ede4",
  text2: "#c9c3b6",
  mute: "#8f897c",
  line: "rgba(241,237,228,0.12)",
  lineStrong: "rgba(241,237,228,0.18)",
  signal: "#c5f04a",
  tile: "#16140f",
  danger: "#ff8a7a",
} as const;

export const fonts = {
  serif: "InstrumentSerif_400Regular",
  serifItalic: "InstrumentSerif_400Regular_Italic",
  mono: "JetBrainsMono_400Regular",
  monoMedium: "JetBrainsMono_500Medium",
  sans: "InterTight_400Regular",
  sansMedium: "InterTight_500Medium",
  sansSemi: "InterTight_600SemiBold",
} as const;

/** cubic-bezier(.2,.8,.2,1) du site. */
export const ease = Easing.bezier(0.2, 0.8, 0.2, 1);

export const gutter = 20;

/** Petites étiquettes en JetBrains Mono majuscules. */
export const monoLabel = {
  fontFamily: fonts.mono,
  fontSize: 11,
  letterSpacing: 0.6,
  textTransform: "uppercase" as const,
  color: colors.mute,
};
