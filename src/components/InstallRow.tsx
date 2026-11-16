import { Image } from "expo-image";
import { router } from "expo-router";
import { Pressable, StyleSheet, View } from "react-native";
import Animated from "react-native-reanimated";

import { useCatalog } from "../catalog/CatalogProvider";
import { formatSize } from "../store/github";
import type { AppStatus } from "../store/StoreProvider";
import { colors } from "../theme";
import { ActionButton } from "./ActionButton";
import { AppLogo } from "./AppLogo";
import { rowEntering } from "./AppRow";
import { Body, Mono, Serif } from "./Typo";

const MARK = require("../../assets/brand/kosmy-mark.png");

/** Ce qu'on sait de la version : installée, disponible, en téléchargement… */
export function versionLine(s: AppStatus): string {
  const t = s.task;
  if (t?.phase === "downloading") return `${formatSize(t.written)} / ${formatSize(t.total)}`;
  if (t?.phase === "waiting_user") return "Confirmez dans la fenêtre d'Android";
  if (t?.phase === "error") return "Échec de l'installation";
  const latest = s.release?.tag;
  const current = s.installed?.versionName;
  if (s.state === "update" && current && latest) return `v${current.replace(/^v/i, "")} → ${latest}`;
  if (s.installed) return `${current ? `v${current.replace(/^v/i, "")}` : "Version inconnue"} · installée`;
  if (s.releaseError && !s.release) return s.releaseError;
  if (latest) return `${latest}${s.asset ? ` · ${formatSize(s.asset.size)}` : ""}`;
  return "Recherche de la version…";
}

/** Ligne d'une appli installable : logo, nom de la version Android, état et bouton d'action. */
export function InstallRow({ status, index = 0 }: { status: AppStatus; index?: number }) {
  const { appById } = useCatalog();
  const app = appById[status.item.id];
  const self = status.item.self;

  return (
    <Animated.View entering={rowEntering(index * 70)} style={styles.row}>
      <Pressable
        style={styles.main}
        disabled={self || !app}
        onPress={() => app && router.push({ pathname: "/app/[id]", params: { id: app.id } })}
        accessibilityRole={self ? undefined : "button"}
      >
        {app ? (
          <AppLogo app={app} size={48} />
        ) : (
          <View style={styles.self}>
            <Image source={MARK} style={{ width: 40, height: 40 }} contentFit="contain" />
          </View>
        )}
        <View style={{ flex: 1 }}>
          <Serif size={28} numberOfLines={1}>
            {status.item.android.name}
          </Serif>
          <Mono size={10} style={{ marginTop: 4 }} color={status.state === "update" && !status.task ? colors.signal : colors.mute} numberOfLines={1}>
            {versionLine(status)}
          </Mono>
        </View>
      </Pressable>
      {self && status.state !== "update" && !status.task ? (
        <Mono size={10} color={colors.mute}>
          {status.release ? "À jour" : ""}
        </Mono>
      ) : (
        <ActionButton status={status} />
      )}
      {status.task?.phase === "error" && (
        <Body size={13} color={colors.text2} style={styles.error}>
          {status.task.message}
        </Body>
      )}
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: "row",
    flexWrap: "wrap",
    alignItems: "center",
    gap: 14,
    paddingVertical: 18,
    borderTopWidth: 1,
    borderTopColor: colors.line,
  },
  main: { flex: 1, flexDirection: "row", alignItems: "center", gap: 14 },
  self: {
    width: 48,
    height: 48,
    borderRadius: 13,
    backgroundColor: "#000",
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    borderColor: "rgba(241,237,228,0.14)",
  },
  error: { width: "100%", paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: colors.signal },
});
