import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";

import { colors } from "../theme";
import { Body, Mono } from "./Typo";

type Block = { kind: "title" | "item" | "text"; text: string };

/** Mise en forme légère d'un texte Markdown de release : titres, puces et paragraphes, sans la syntaxe. */
export function parseNotes(md: string): Block[] {
  const inline = (s: string) =>
    s
      .replace(/!\[[^\]]*\]\([^)]*\)/g, "")
      .replace(/\[([^\]]+)\]\([^)]*\)/g, "$1")
      .replace(/<[^>]+>/g, "")
      .replace(/(\*\*|__|`)/g, "")
      .replace(/(^|\s)[*_]([^*_\s][^*_]*)[*_](?=\s|$|[.,;:!?])/g, "$1$2")
      .replace(/\s+/g, " ")
      .trim();

  const blocks: Block[] = [];
  // Certaines releases contiennent des « \n » littéraux au lieu de vrais retours à la ligne.
  const lines = md.replace(/\r/g, "").replace(/\\n/g, "\n").replace(/\\t/g, " ").split("\n");
  let para: string[] = [];
  const flush = () => {
    const t = inline(para.join(" "));
    if (t) blocks.push({ kind: "text", text: t });
    para = [];
  };
  for (const raw of lines) {
    const line = raw.trim();
    if (!line || /^(-{3,}|\*{3,}|_{3,})$/.test(line)) {
      flush();
      continue;
    }
    if (/^\**full changelog/i.test(line)) continue;
    const title = line.match(/^#{1,6}\s+(.*)$/) ?? line.match(/^\*\*([^*]+)\*\*:?$/);
    const item = line.match(/^(?:[-*+•·]|\d+[.)])\s+(.*)$/);
    if (title) {
      flush();
      const t = inline(title[1]);
      if (t) blocks.push({ kind: "title", text: t.replace(/:$/, "") });
    } else if (item) {
      flush();
      const t = inline(item[1]);
      if (t) blocks.push({ kind: "item", text: t });
    } else para.push(line);
  }
  flush();
  return blocks;
}

const FIRST = 6;

/** Notes de version : une puce par ligne, aérées, repliées au-delà de six éléments. */
export function ReleaseNotes({ notes }: { notes: string }) {
  const blocks = parseNotes(notes);
  const [open, setOpen] = useState(false);
  if (!blocks.length) return null;
  const shown = open ? blocks : blocks.slice(0, FIRST);
  const hidden = blocks.length - shown.length;

  return (
    <View>
      {shown.map((b, i) =>
        b.kind === "title" ? (
          <Mono key={i} color={colors.paper} style={[styles.title, i === 0 && { marginTop: 0 }]}>
            {b.text}
          </Mono>
        ) : b.kind === "item" ? (
          <View key={i} style={styles.item}>
            <View style={styles.dot} />
            <Body size={15} style={styles.text}>
              {b.text}
            </Body>
          </View>
        ) : (
          <Body key={i} size={15} style={[styles.text, styles.para]}>
            {b.text}
          </Body>
        ),
      )}
      {hidden > 0 && (
        <Pressable onPress={() => setOpen(true)} hitSlop={8} style={{ marginTop: 6, alignSelf: "flex-start" }} accessibilityRole="button">
          <Body size={14} weight="medium" color={colors.signal}>
            Tout afficher (+{hidden})
          </Body>
        </Pressable>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  title: { marginTop: 18, marginBottom: 10 },
  item: { flexDirection: "row", gap: 12, marginBottom: 12 },
  dot: { width: 5, height: 5, borderRadius: 1, backgroundColor: colors.signal, marginTop: 9 },
  text: { flex: 1, lineHeight: 23 },
  para: { marginBottom: 12 },
});
