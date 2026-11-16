import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { Pressable, ScrollView, StyleSheet, Switch, View } from "react-native";
import Animated, { FadeInDown, LinearTransition } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { hostOf, isCleartext, useAdmin, type AdminSpace } from "../../admin/AdminProvider";
import { SpaceLogo } from "../../admin/SpaceLogo";
import { useCatalog } from "../../catalog/CatalogProvider";
import { AppLogo } from "../../components/AppLogo";
import { rowEntering } from "../../components/AppRow";
import { StatusScrim } from "../../components/Decor";
import { Body, Em, Mono, Serif } from "../../components/Typo";
import { colors, ease, gutter } from "../../theme";

const fade = (d: number) => FadeInDown.duration(800).delay(d).easing(ease);

export default function Admin() {
  const insets = useSafeAreaInsets();
  const { catalog } = useCatalog();
  const admin = useAdmin();
  const withAdmin = catalog.apps.filter((a) => a.admin);
  const spaces = [...admin.spaces].sort((a, b) => (b.openedAt ?? b.addedAt) - (a.openedAt ?? a.addedAt));

  const open = async (s: AdminSpace) => {
    Haptics.selectionAsync().catch(() => {});
    if (await admin.unlock()) router.push({ pathname: "/espace/[id]", params: { id: s.id } });
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: 40, paddingHorizontal: gutter }}
      >
        <Animated.View entering={fade(0)}>
          <Mono style={{ marginBottom: 14 }}>(04) — Vos instances</Mono>
          <Serif size={58} accessibilityRole="header">
            Espaces <Em color={colors.signal}>admin</Em>
          </Serif>
          <Body style={{ marginTop: 16 }}>
            Le panneau d'administration de vos applis, même celles qui n'existent que sur le web. Vous vous connectez dans la page,
            comme dans un navigateur : Kosmy garde la session ouverte, jamais votre mot de passe.
          </Body>
        </Animated.View>

        <Animated.View entering={fade(100)}>
          <Pressable
            style={({ pressed }) => [styles.cta, pressed && { opacity: 0.85 }]}
            accessibilityRole="button"
            onPress={() => router.push("/espace/edition")}
          >
            <Body weight="semi" size={15} color={colors.bg}>
              + Ajouter une instance
            </Body>
          </Pressable>
        </Animated.View>

        {spaces.length > 0 ? (
          <Animated.View entering={fade(160)} style={{ marginTop: 34 }}>
            <Mono style={{ marginBottom: 6 }}>Instances ({spaces.length})</Mono>
            <View style={{ borderBottomWidth: 1, borderBottomColor: colors.line }}>
              {spaces.map((s, i) => (
                <Animated.View key={s.id} entering={rowEntering(200 + i * 60)} layout={LinearTransition.duration(300)}>
                  <SpaceRow space={s} onOpen={() => open(s)} />
                </Animated.View>
              ))}
            </View>
          </Animated.View>
        ) : (
          admin.ready && (
            <Animated.View entering={fade(160)} style={styles.empty}>
              <Mono color={colors.paper}>Aucune instance pour l'instant</Mono>
              <Body size={14} style={{ marginTop: 8 }}>
                Choisissez une appli, puis donnez l'adresse où vous l'hébergez.
              </Body>
              <View style={styles.quick}>
                {withAdmin.map((a) => (
                  <Pressable
                    key={a.id}
                    accessibilityRole="button"
                    accessibilityLabel={`Ajouter une instance ${a.name}`}
                    onPress={() => router.push({ pathname: "/espace/edition", params: { app: a.id } })}
                    style={({ pressed }) => [styles.quickItem, pressed && { opacity: 0.6 }]}
                  >
                    <AppLogo app={a} size={44} />
                    <Mono size={9} color={colors.text2} numberOfLines={1}>
                      {a.name}
                    </Mono>
                  </Pressable>
                ))}
              </View>
            </Animated.View>
          )
        )}

        <Animated.View entering={fade(260)} style={styles.lock}>
          <View style={{ flex: 1 }}>
            <Mono color={colors.paper}>Verrouillage</Mono>
            <Body size={14} style={{ marginTop: 6 }}>
              {admin.lockAvailable
                ? "Demander l'empreinte ou le code du téléphone avant d'ouvrir un espace admin."
                : "Aucun verrouillage d'écran n'est configuré sur ce téléphone : Kosmy n'a rien à demander."}
            </Body>
          </View>
          <Switch
            value={admin.lockEnabled && admin.lockAvailable}
            disabled={!admin.lockAvailable}
            onValueChange={(v) => {
              admin.setLockEnabled(v);
            }}
            trackColor={{ false: colors.lineStrong, true: colors.signal }}
            thumbColor={admin.lockAvailable ? colors.paper : colors.mute}
            accessibilityLabel="Verrouiller les espaces admin"
          />
        </Animated.View>

        <Mono size={10} style={{ marginTop: 26, lineHeight: 16 }}>
          Supprimer une instance efface aussi sa session sur ce téléphone
        </Mono>
      </ScrollView>
      <StatusScrim />
    </View>
  );
}

function SpaceRow({ space, onOpen }: { space: AdminSpace; onOpen: () => void }) {
  const clear = isCleartext(space.base);
  return (
    <View style={styles.row}>
      <Pressable
        onPress={onOpen}
        style={({ pressed }) => [styles.rowMain, pressed && { opacity: 0.6 }]}
        accessibilityRole="button"
        accessibilityLabel={`Ouvrir ${space.name}, ${hostOf(space.base)}`}
      >
        <SpaceLogo space={space} size={48} />
        <View style={{ flex: 1 }}>
          <Serif size={26} numberOfLines={1}>
            {space.name}
          </Serif>
          <Mono size={10} numberOfLines={1} style={{ marginTop: 4 }}>
            {hostOf(space.base)}
            {clear ? <Mono size={10} color={colors.danger}>{"  ·  Non chiffré"}</Mono> : null}
          </Mono>
        </View>
        <Mono color={colors.signal} size={16}>
          →
        </Mono>
      </Pressable>
      <Pressable
        onPress={() => router.push({ pathname: "/espace/edition", params: { id: space.id } })}
        hitSlop={8}
        style={styles.edit}
        accessibilityRole="button"
        accessibilityLabel={`Modifier ${space.name}`}
      >
        <Mono size={10}>Modifier</Mono>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  cta: {
    marginTop: 24,
    height: 52,
    borderRadius: 999,
    backgroundColor: colors.signal,
    alignItems: "center",
    justifyContent: "center",
  },
  row: { flexDirection: "row", alignItems: "center", borderTopWidth: 1, borderTopColor: colors.line },
  rowMain: { flex: 1, flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 16 },
  edit: { paddingLeft: 16, paddingVertical: 16 },
  empty: { marginTop: 34, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 20, backgroundColor: colors.panel },
  quick: { flexDirection: "row", flexWrap: "wrap", gap: 14, marginTop: 18 },
  quickItem: { width: 58, alignItems: "center", gap: 6 },
  lock: {
    marginTop: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 16,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderBottomWidth: 1,
    borderColor: colors.line,
  },
});
