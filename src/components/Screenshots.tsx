import { Image } from "expo-image";
import { useState } from "react";
import { FlatList, Modal, Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useCatalog } from "../catalog/CatalogProvider";
import type { Screenshot } from "../catalog/types";
import { colors, gutter } from "../theme";
import { Body, Mono } from "./Typo";

const MAX_H = 440;
const GAP = 12;

/** Galerie horizontale des captures d'une appli ; un appui ouvre la capture en plein écran. */
export function Screenshots({ shots, name }: { shots: Screenshot[]; name: string }) {
  const { assetUrl } = useCatalog();
  const { width } = useWindowDimensions();
  const [viewer, setViewer] = useState<number | null>(null);

  // Même hauteur pour toutes : celle qui fait tenir la plus large dans l'écran, sans dépasser MAX_H.
  const maxW = width - gutter * 2;
  const height = Math.round(Math.min(MAX_H, ...shots.map((s) => (maxW * s.h) / s.w)));
  const widths = shots.map((s) => Math.round((height * s.w) / s.h));
  const offsets = widths.map((_, i) => widths.slice(0, i).reduce((sum, w) => sum + w + GAP, 0));

  return (
    <>
      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={{ paddingHorizontal: gutter, gap: GAP }}
        decelerationRate="fast"
        snapToOffsets={offsets}
      >
        {shots.map((s, i) => {
          const uri = assetUrl(s.src);
          return (
            <Pressable
              key={s.src}
              onPress={() => setViewer(i)}
              accessibilityRole="imagebutton"
              accessibilityLabel={`Capture ${i + 1} sur ${shots.length} de ${name}${s.caption ? ` : ${s.caption.fr}` : ""}`}
              style={({ pressed }) => [{ opacity: pressed ? 0.8 : 1 }]}
            >
              <Image
                source={{ uri, cacheKey: uri }}
                style={[styles.thumb, { height, width: widths[i] }]}
                contentFit="cover"
                transition={250}
                cachePolicy="memory-disk"
                recyclingKey={uri}
              />
              {s.caption ? (
                <Mono size={10} numberOfLines={1} style={{ marginTop: 10, width: widths[i] }}>
                  {s.caption.fr}
                </Mono>
              ) : null}
            </Pressable>
          );
        })}
      </ScrollView>
      <Viewer shots={shots} start={viewer} onClose={() => setViewer(null)} />
    </>
  );
}

function Viewer({ shots, start, onClose }: { shots: Screenshot[]; start: number | null; onClose: () => void }) {
  const { assetUrl } = useCatalog();
  const { width, height } = useWindowDimensions();
  const insets = useSafeAreaInsets();
  const [index, setIndex] = useState(0);
  const [opened, setOpened] = useState<number | null>(null);
  // Nouvelle ouverture : on repart de la capture touchée.
  if (start !== opened) {
    setOpened(start);
    if (start !== null) setIndex(start);
  }
  const current = shots[index];

  return (
    <Modal visible={start !== null} transparent animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <View style={styles.viewer}>
        {start !== null && (
          <FlatList
            data={shots}
            horizontal
            pagingEnabled
            initialScrollIndex={start}
            getItemLayout={(_, i) => ({ length: width, offset: width * i, index: i })}
            showsHorizontalScrollIndicator={false}
            keyExtractor={(s) => s.src}
            onMomentumScrollEnd={(e) => setIndex(Math.round(e.nativeEvent.contentOffset.x / width))}
            renderItem={({ item }) => {
              const uri = assetUrl(item.src);
              return (
                <Pressable onPress={onClose} style={{ width, height }} accessible={false}>
                  <Image
                    source={{ uri, cacheKey: uri }}
                    style={{ flex: 1, marginTop: insets.top + 56, marginBottom: insets.bottom + 64 }}
                    contentFit="contain"
                    cachePolicy="memory-disk"
                  />
                </Pressable>
              );
            }}
          />
        )}
        <View style={[styles.viewerTop, { paddingTop: insets.top + 8 }]} pointerEvents="box-none">
          <Mono color={colors.paper}>
            {index + 1} / {shots.length}
          </Mono>
          <Pressable onPress={onClose} hitSlop={10} accessibilityRole="button" accessibilityLabel="Fermer" style={styles.close}>
            <Mono color={colors.paper} size={14}>
              ✕
            </Mono>
          </Pressable>
        </View>
        {current?.caption ? (
          <View style={[styles.viewerBottom, { paddingBottom: insets.bottom + 18 }]} pointerEvents="none">
            <Body size={15} color={colors.paper} style={{ textAlign: "center" }}>
              {current.caption.fr}
            </Body>
          </View>
        ) : null}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  thumb: { borderRadius: 18, borderWidth: 1, borderColor: colors.line, backgroundColor: colors.panel },
  viewer: { flex: 1, backgroundColor: "rgba(8,8,7,0.97)" },
  viewerTop: {
    position: "absolute",
    top: 0,
    left: 0,
    right: 0,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingHorizontal: gutter,
  },
  close: { width: 40, height: 40, alignItems: "center", justifyContent: "center" },
  viewerBottom: { position: "absolute", left: gutter, right: gutter, bottom: 0 },
});
