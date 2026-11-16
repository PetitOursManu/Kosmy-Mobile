import { Modal, Pressable, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInDown, FadeOut } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCatalog } from "../catalog/CatalogProvider";
import { useStore } from "../store/StoreProvider";
import { colors, ease, gutter } from "../theme";
import { Body, Em, Mono, Serif } from "./Typo";

const STEPS = [
  "Touchez « Ouvrir les réglages ».",
  "Activez « Autoriser cette source ».",
  "Revenez dans Kosmy : l'installation reprend toute seule.",
];

/** Explique l'autorisation « Installer des applis inconnues » avant d'envoyer dans les réglages. */
export function PermissionSheet() {
  const { permissionFor, openPermissionSettings, closePermission, statuses } = useStore();
  const { appById } = useCatalog();
  const insets = useSafeAreaInsets();
  const name = permissionFor ? (statuses[permissionFor]?.item.android.name ?? appById[permissionFor]?.name) : "";

  return (
    <Modal visible={!!permissionFor} transparent animationType="none" statusBarTranslucent navigationBarTranslucent onRequestClose={closePermission}>
      <Animated.View entering={FadeIn.duration(250)} exiting={FadeOut.duration(200)} style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={closePermission} accessibilityLabel="Fermer" />
      </Animated.View>
      <View style={styles.wrap} pointerEvents="box-none">
        <Animated.View
          entering={FadeInDown.duration(500).easing(ease)}
          style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, 16) + 8 }]}
        >
          <View style={styles.grip} />
          <Mono color={colors.signal}>Une seule fois</Mono>
          <Serif size={40} style={{ marginTop: 12 }}>
            Autoriser Kosmy <Em>à installer.</Em>
          </Serif>
          <Body style={{ marginTop: 14 }}>
            Pour installer {name} en dehors du Play Store, Android demande d'autoriser Kosmy comme source d'applications. Vous pourrez
            retirer cette autorisation quand vous voudrez.
          </Body>
          <View style={styles.steps}>
            {STEPS.map((s, i) => (
              <View key={i} style={styles.step}>
                <Mono color={colors.paper} style={styles.num}>
                  {String(i + 1).padStart(2, "0")}
                </Mono>
                <Body color={colors.paper} style={{ flex: 1 }}>
                  {s}
                </Body>
              </View>
            ))}
          </View>
          <Pressable onPress={openPermissionSettings} style={styles.cta} accessibilityRole="button">
            <Body weight="semi" color={colors.bg} size={15}>
              Ouvrir les réglages →
            </Body>
          </Pressable>
          <Pressable onPress={closePermission} style={styles.later} accessibilityRole="button">
            <Body weight="medium" color={colors.mute} size={15}>
              Plus tard
            </Body>
          </Pressable>
        </Animated.View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { ...StyleSheet.absoluteFill, backgroundColor: "rgba(5,5,4,0.72)" },
  wrap: { flex: 1, justifyContent: "flex-end" },
  sheet: {
    backgroundColor: colors.panel,
    borderTopLeftRadius: 28,
    borderTopRightRadius: 28,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: gutter + 4,
    paddingTop: 12,
  },
  grip: { alignSelf: "center", width: 40, height: 4, borderRadius: 2, backgroundColor: colors.lineStrong, marginBottom: 20 },
  steps: { marginTop: 20, borderBottomWidth: 1, borderBottomColor: colors.line },
  step: { flexDirection: "row", gap: 14, alignItems: "baseline", paddingVertical: 12, borderTopWidth: 1, borderTopColor: colors.line },
  num: { width: 22 },
  cta: { marginTop: 24, height: 54, borderRadius: 999, backgroundColor: colors.signal, alignItems: "center", justifyContent: "center" },
  later: { height: 48, alignItems: "center", justifyContent: "center", marginTop: 4 },
});
