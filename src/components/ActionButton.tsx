import * as Haptics from "expo-haptics";
import { useEffect } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import Animated, {
  cancelAnimation,
  useAnimatedStyle,
  useReducedMotion,
  useSharedValue,
  withRepeat,
  withTiming,
} from "react-native-reanimated";

import { useStore, type AppStatus } from "../store/StoreProvider";
import { colors, ease } from "../theme";
import { Body, Mono } from "./Typo";

type Kind = "primary" | "signal" | "outline" | "progress" | "busy";

/** Libellé et style du bouton selon l'état de l'appli et de son installation. */
export function actionFor(s: AppStatus): { label: string; kind: Kind; onPress?: "install" | "open" | "cancel" } {
  const task = s.task;
  if (task) {
    switch (task.phase) {
      case "downloading":
        return { label: `${Math.round(task.progress * 100)} %`, kind: "progress", onPress: "cancel" };
      case "verifying":
        return { label: "Vérification…", kind: "busy" };
      case "installing":
        return { label: "Installation…", kind: "busy" };
      case "waiting_user":
        return { label: "À confirmer…", kind: "busy", onPress: "install" };
      case "done":
        return { label: "Installée ✓", kind: "outline", onPress: "open" };
      case "error":
        return { label: "Réessayer", kind: "primary", onPress: "install" };
    }
  }
  if (!s.release) return s.installed ? { label: "Ouvrir", kind: "outline", onPress: "open" } : { label: "Indisponible", kind: "busy" };
  if (!s.asset && s.state !== "up_to_date" && s.state !== "unknown") return { label: "Incompatible", kind: "busy" };
  switch (s.state) {
    case "not_installed":
      return { label: "Installer", kind: "primary", onPress: "install" };
    case "update":
      return { label: "Mettre à jour", kind: "signal", onPress: "install" };
    default:
      return { label: "Ouvrir", kind: "outline", onPress: "open" };
  }
}

export function ActionButton({ status, wide }: { status: AppStatus; wide?: boolean }) {
  const store = useStore();
  const a = actionFor(status);
  const reduce = useReducedMotion();
  const press = useSharedValue(1);
  const pulse = useSharedValue(1);
  const fill = useSharedValue(0);

  const progress = status.task?.phase === "downloading" ? status.task.progress : 0;
  useEffect(() => {
    fill.value = withTiming(progress, { duration: 200 });
  }, [fill, progress]);

  useEffect(() => {
    if (a.kind === "busy" && status.task && !reduce) {
      pulse.value = withRepeat(withTiming(0.45, { duration: 700 }), -1, true);
    } else {
      cancelAnimation(pulse);
      pulse.value = withTiming(1, { duration: 200 });
    }
  }, [a.kind, pulse, reduce, status.task]);

  const scale = useAnimatedStyle(() => ({ transform: [{ scale: press.value }] }));
  const bar = useAnimatedStyle(() => ({ width: `${fill.value * 100}%` }));
  const blink = useAnimatedStyle(() => ({ opacity: pulse.value }));

  const id = status.item.id;
  const onPress = () => {
    if (!a.onPress) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    if (a.onPress === "install") store.install(id);
    else if (a.onPress === "open") store.open(id);
    else store.cancel(id);
  };

  const bg =
    a.kind === "primary" ? colors.paper : a.kind === "signal" ? colors.signal : a.kind === "progress" ? colors.panel : "transparent";
  const fg = a.kind === "primary" || a.kind === "signal" ? colors.bg : a.kind === "busy" ? colors.mute : colors.paper;

  return (
    <Pressable
      onPress={onPress}
      onPressIn={() => press.set(withTiming(0.94, { duration: 120 }))}
      onPressOut={() => press.set(withTiming(1, { duration: 350, easing: ease }))}
      disabled={!a.onPress}
      accessibilityRole="button"
      accessibilityLabel={a.kind === "progress" ? `Téléchargement ${a.label}, toucher pour annuler` : `${a.label} ${status.item.android.name}`}
      hitSlop={6}
    >
      <Animated.View
        style={[
          styles.btn,
          wide && styles.wide,
          { backgroundColor: bg, borderColor: a.kind === "outline" || a.kind === "busy" ? colors.lineStrong : bg },
          scale,
        ]}
      >
        {a.kind === "progress" && <Animated.View style={[styles.fill, bar]} />}
        <Animated.View style={[styles.row, a.kind === "busy" ? blink : null]}>
          {a.kind === "progress" ? (
            <Mono size={11} color={colors.paper} weight="medium">
              {a.label}
            </Mono>
          ) : (
            <Body size={14} weight="semi" color={fg} style={{ lineHeight: 18 }}>
              {a.label}
            </Body>
          )}
        </Animated.View>
        {a.kind === "progress" && <View style={styles.cancel} />}
      </Animated.View>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  btn: {
    minWidth: 112,
    height: 40,
    paddingHorizontal: 18,
    borderRadius: 999,
    borderWidth: 1,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  wide: { height: 52, minWidth: "100%" },
  row: { flexDirection: "row", alignItems: "center" },
  fill: { position: "absolute", left: 0, top: 0, bottom: 0, backgroundColor: "rgba(197,240,74,0.28)" },
  cancel: {},
});
