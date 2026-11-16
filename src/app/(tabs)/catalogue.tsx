import * as Haptics from "expo-haptics";
import { useState } from "react";
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCatalog } from "../../catalog/CatalogProvider";
import { AppRow } from "../../components/AppRow";
import { Body, Em, Mono, Serif } from "../../components/Typo";
import { StatusScrim } from "../../components/Decor";
import { useStore } from "../../store/StoreProvider";
import { colors, ease, gutter } from "../../theme";

const fade = (d: number) => FadeInDown.duration(800).delay(d).easing(ease);

function Chip({ label, count, active, onPress }: { label: string; count: number; active: boolean; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
      style={[styles.chip, active && styles.chipOn]}
    >
      <Mono size={11} color={active ? colors.bg : colors.text2} weight={active ? "medium" : undefined}>
        {label} <Mono size={11} color={active ? colors.bg : colors.mute}>{count}</Mono>
      </Mono>
    </Pressable>
  );
}

export default function CatalogueScreen() {
  const insets = useSafeAreaInsets();
  const { catalog, refresh, refreshing } = useCatalog();
  const store = useStore();
  const [filter, setFilter] = useState<string | null>(null);
  const apps = filter ? catalog.apps.filter((a) => a.theme === filter) : catalog.apps;

  const pick = (id: string | null) => {
    if (id === filter) return;
    Haptics.selectionAsync().catch(() => {});
    setFilter(id);
  };

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
    <ScrollView
      style={{ flex: 1, backgroundColor: colors.bg }}
      contentContainerStyle={{ paddingTop: insets.top + 24, paddingBottom: 40 }}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={() => {
            refresh();
            store.refresh(true);
          }}
          colors={[colors.bg]}
          progressBackgroundColor={colors.signal}
        />
      }
    >
      <View style={{ paddingHorizontal: gutter }}>
        <Animated.View entering={fade(0)}>
          <Mono style={{ marginBottom: 14 }}>(02) — Catalogue</Mono>
          <Serif size={58} accessibilityRole="header">
            L'index <Em color={colors.mute}>des applis</Em>
          </Serif>
        </Animated.View>
        <Animated.View entering={fade(100)}>
          <Body style={{ marginTop: 16 }}>
            {catalog.apps.length === 8 ? "Huit" : catalog.apps.length} outils, une même idée : ils tournent sur votre machine. Touchez une ligne,
            elle prend la couleur de son application et ouvre sa fiche.
          </Body>
        </Animated.View>
      </View>

      <Animated.View entering={fade(200)}>
        <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
          <Chip label="Toutes" count={catalog.apps.length} active={!filter} onPress={() => pick(null)} />
          {catalog.themes.map((t) => (
            <Chip
              key={t.id}
              label={t.name.fr}
              count={catalog.apps.filter((a) => a.theme === t.id).length}
              active={filter === t.id}
              onPress={() => pick(t.id)}
            />
          ))}
        </ScrollView>
      </Animated.View>

      <View style={{ borderBottomWidth: 1, borderBottomColor: colors.line }}>
        {apps.map((a, i) => (
          <AppRow key={a.id} app={a} index={i} />
        ))}
      </View>
    </ScrollView>
    <StatusScrim />
    </View>
  );
}

const styles = StyleSheet.create({
  chips: { gap: 8, paddingHorizontal: gutter, paddingTop: 26, paddingBottom: 22 },
  chip: { borderWidth: 1, borderColor: colors.line, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 9 },
  chipOn: { backgroundColor: colors.signal, borderColor: colors.signal },
});
