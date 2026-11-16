import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCatalog } from "../../catalog/CatalogProvider";
import { InstallRow } from "../../components/InstallRow";
import { Body, Em, Mono, Serif } from "../../components/Typo";
import { StatusScrim } from "../../components/Decor";
import { useStore } from "../../store/StoreProvider";
import { colors, ease, gutter } from "../../theme";

const fade = (d: number) => FadeInDown.duration(800).delay(d).easing(ease);

export default function MesApplis() {
  const insets = useSafeAreaInsets();
  const { catalog, refresh: refreshCatalog } = useCatalog();
  const store = useStore();

  const all = catalog.apps.filter((a) => a.android).map((a) => store.statuses[a.id]).filter(Boolean);
  const updates = all.filter((s) => s.state === "update");
  const installed = all.filter((s) => s.installed && s.state !== "update");
  const available = all.filter((s) => !s.installed);
  const self = store.statuses.kosmy;

  const section = (title: string, list: typeof all, delay: number) =>
    list.length > 0 && (
      <Animated.View entering={fade(delay)} style={{ marginTop: 34 }}>
        <Mono style={{ marginBottom: 6 }}>
          {title} ({list.length})
        </Mono>
        <View style={{ borderBottomWidth: 1, borderBottomColor: colors.line }}>
          {list.map((s, i) => (
            <InstallRow key={s.item.id} status={s} index={i} />
          ))}
        </View>
      </Animated.View>
    );

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: 40, paddingHorizontal: gutter }}
      refreshControl={
        <RefreshControl
          refreshing={store.loadingReleases}
          onRefresh={() => {
            refreshCatalog();
            store.refresh(true);
          }}
          colors={[colors.bg]}
          progressBackgroundColor={colors.signal}
        />
      }
    >
      <Animated.View entering={fade(0)}>
        <Mono style={{ marginBottom: 14 }}>(03) — Sur cet appareil</Mono>
        <Serif size={58} accessibilityRole="header">
          Mes <Em color={colors.signal}>applis</Em>
        </Serif>
        <Body style={{ marginTop: 16 }}>
          Kosmy installe les versions Android publiées dans les releases GitHub de chaque dépôt, et vous prévient quand une nouvelle version
          sort.
        </Body>
      </Animated.View>

      {updates.length > 1 && (
        <Animated.View entering={fade(100)}>
          <Pressable
            style={styles.all}
            accessibilityRole="button"
            onPress={() => updates.forEach((s) => !s.task && store.install(s.item.id))}
          >
            <Body weight="semi" size={15} color={colors.bg}>
              Tout mettre à jour ({updates.length})
            </Body>
          </Pressable>
        </Animated.View>
      )}

      {section("Mises à jour", updates, 150)}
      {section("Installées", installed, 220)}
      {section("À installer", available, 290)}

      {self && (
        <Animated.View entering={fade(360)} style={{ marginTop: 34 }}>
          <Mono style={{ marginBottom: 6 }}>Kosmy</Mono>
          <View style={{ borderBottomWidth: 1, borderBottomColor: colors.line }}>
            <InstallRow status={self} />
          </View>
          {!self.release && (
            <Body size={13} color={colors.mute} style={{ marginTop: 10 }}>
              {self.releaseError === "Aucune release publiée"
                ? "Aucune release de Kosmy n'est encore publiée sur GitHub."
                : "Impossible de vérifier la version de Kosmy pour le moment."}
            </Body>
          )}
        </Animated.View>
      )}

      <Mono size={10} style={{ marginTop: 34, lineHeight: 16 }}>
        Tirez vers le bas pour vérifier les mises à jour
      </Mono>
    </ScrollView>
    <StatusScrim />
    </View>
  );
}

const styles = StyleSheet.create({
  all: {
    marginTop: 24,
    height: 52,
    borderRadius: 999,
    backgroundColor: colors.signal,
    alignItems: "center",
    justifyContent: "center",
  },
});
