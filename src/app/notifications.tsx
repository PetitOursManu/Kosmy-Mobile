import * as Haptics from "expo-haptics";
import * as Notifications from "expo-notifications";
import { router } from "expo-router";
import { useCallback, useEffect, useState } from "react";
import { Linking, Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAdmin } from "../admin/AdminProvider";
import { SpaceLogo } from "../admin/SpaceLogo";
import { StatusScrim } from "../components/Decor";
import { Body, Em, Mono, Serif } from "../components/Typo";
import { fetchNotifications, markRead, type BoardNotification } from "../notifications/board-notifications";
import { useBoardNotifications } from "../notifications/NotificationsProvider";
import { colors, ease, gutter } from "../theme";

const fade = (d: number) => FadeInDown.duration(700).delay(d).easing(ease);

function ago(ts: number) {
  const min = Math.round((Date.now() - ts) / 60_000);
  if (min < 1) return "à l'instant";
  if (min < 60) return `il y a ${min} min`;
  const h = Math.round(min / 60);
  return h < 24 ? `il y a ${h} h` : `il y a ${Math.round(h / 24)} j`;
}

/** Notifications envoyées par les applis reliées à Kosmy Board (Soundy…), les mêmes que la cloche du Board. */
export default function NotificationsScreen() {
  const insets = useSafeAreaInsets();
  const admin = useAdmin();
  const notif = useBoardNotifications();
  const [list, setList] = useState<BoardNotification[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const { setUnread } = notif;
  // Lecture de la liste ; les mises à jour de l'état se font dans les rappels de la promesse.
  const load = useCallback(
    () =>
      fetchNotifications()
        .then((r) => {
          if (!r) {
            setError("Connectez d'abord Kosmy à votre Kosmy Board (onglet Admin).");
            setList([]);
            return;
          }
          setList(r.notifications);
          setUnread(r.unread);
          setError(null);
        })
        .catch(() => setError("Le Board n'a pas pu répondre. Tirez vers le bas pour réessayer."))
        .finally(() => setLoading(false)),
    [setUnread],
  );

  useEffect(() => {
    load();
    // Les notifications affichées par Android ont été vues ici.
    Notifications.dismissAllNotificationsAsync().catch(() => {});
  }, [load]);

  const apply = (r: Awaited<ReturnType<typeof markRead>>) => {
    if (!r) return;
    setList(r.notifications);
    setUnread(r.unread);
  };

  const open = async (n: BoardNotification) => {
    Haptics.selectionAsync().catch(() => {});
    if (!n.read) markRead([n.id]).then(apply).catch(() => {});
    if (!n.url) return;
    // L'instance est dans les espaces admin : on l'ouvre dans Kosmy, où la session est déjà ouverte.
    const space = admin.spaces.find((s) => s.id === n.app.spaceId);
    if (space) {
      if (await admin.unlock()) router.push({ pathname: "/espace/[id]", params: { id: space.id, url: n.url } });
      return;
    }
    Linking.openURL(n.url).catch(() => {});
  };

  const unread = list?.filter((n) => !n.read).length ?? 0;

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        style={{ flex: 1 }}
        contentContainerStyle={{ paddingTop: insets.top + 20, paddingBottom: insets.bottom + 40, paddingHorizontal: gutter }}
        refreshControl={
          <RefreshControl
            refreshing={loading && list !== null}
            onRefresh={() => {
              setLoading(true);
              load();
            }}
            colors={[colors.bg]}
            progressBackgroundColor={colors.signal}
            progressViewOffset={insets.top}
          />
        }
      >
        <Pressable onPress={() => (router.canGoBack() ? router.back() : router.replace("/admin"))} hitSlop={10} accessibilityRole="button">
          <Mono color={colors.paper}>← Retour</Mono>
        </Pressable>

        <Animated.View entering={fade(0)} style={{ marginTop: 26 }}>
          <Mono style={{ marginBottom: 14 }}>Kosmy Board</Mono>
          <Serif size={52} accessibilityRole="header">
            Vos <Em color={colors.signal}>notifications</Em>
          </Serif>
          <Body style={{ marginTop: 14 }}>
            Ce que vos applis reliées au Board vous signalent, comme une nouvelle demande dans Soundy. Les mêmes que la cloche du Board.
          </Body>
        </Animated.View>

        {notif.permission !== "granted" && (
          <Animated.View entering={fade(80)} style={styles.notice}>
            <Mono color={colors.paper}>Notifications désactivées</Mono>
            <Body size={14} style={{ marginTop: 6 }}>
              Autorisez Kosmy à afficher des notifications pour être prévenu sans ouvrir l'appli.
            </Body>
            <Pressable onPress={notif.enable} style={({ pressed }) => [styles.outline, pressed && { opacity: 0.7 }]} accessibilityRole="button">
              <Body weight="semi" size={14} color={colors.paper}>
                {notif.permission === "denied" ? "Ouvrir les réglages →" : "Autoriser →"}
              </Body>
            </Pressable>
          </Animated.View>
        )}

        {unread > 0 && (
          <Pressable
            onPress={() => markRead().then(apply).catch(() => {})}
            hitSlop={8}
            style={{ marginTop: 26, alignSelf: "flex-start" }}
            accessibilityRole="button"
          >
            <Mono color={colors.signal}>Tout marquer comme lu</Mono>
          </Pressable>
        )}

        {error && (
          <Body size={14} color={colors.danger} style={{ marginTop: 20 }}>
            {error}
          </Body>
        )}

        {list && list.length === 0 && !error && (
          <Animated.View entering={fade(120)} style={styles.empty}>
            <Mono color={colors.paper}>Aucune notification</Mono>
            <Body size={14} style={{ marginTop: 6 }}>
              Elles arrivent ici quand une appli reliée à votre Board vous en envoie.
            </Body>
          </Animated.View>
        )}

        {list && list.length > 0 && (
          <Animated.View entering={fade(120)} style={{ marginTop: 22, borderBottomWidth: 1, borderBottomColor: colors.line }}>
            {list.map((n) => (
              <Pressable
                key={n.id}
                onPress={() => open(n)}
                style={({ pressed }) => [styles.row, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
                accessibilityLabel={`${n.read ? "" : "Non lue. "}${n.app.name} : ${n.title}`}
              >
                <SpaceLogo space={{ appId: n.app.appId, name: n.app.name }} size={44} />
                <View style={{ flex: 1 }}>
                  <View style={{ flexDirection: "row", alignItems: "center", gap: 6 }}>
                    {!n.read && <View style={styles.dot} />}
                    <Mono size={10} numberOfLines={1}>
                      {n.app.name} · {ago(n.createdAt)}
                    </Mono>
                  </View>
                  <Body size={16} weight={n.read ? undefined : "semi"} color={n.read ? colors.text2 : colors.paper} style={{ marginTop: 4 }}>
                    {n.title}
                  </Body>
                  {n.body ? (
                    <Body size={14} style={{ marginTop: 4 }}>
                      {n.body}
                    </Body>
                  ) : null}
                </View>
                {n.url ? (
                  <Mono color={colors.signal} size={16}>
                    →
                  </Mono>
                ) : null}
              </Pressable>
            ))}
          </Animated.View>
        )}
      </ScrollView>
      <StatusScrim />
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row", alignItems: "flex-start", gap: 14, paddingVertical: 16, borderTopWidth: 1, borderTopColor: colors.line },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.signal },
  empty: { marginTop: 26, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 20, backgroundColor: colors.panel },
  notice: { marginTop: 24, borderWidth: 1, borderColor: colors.line, borderRadius: 20, padding: 20, backgroundColor: colors.panel },
  outline: {
    marginTop: 14,
    height: 44,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.lineStrong,
    alignItems: "center",
    justifyContent: "center",
  },
});
