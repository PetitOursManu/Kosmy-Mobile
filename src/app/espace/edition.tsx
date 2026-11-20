import * as Haptics from "expo-haptics";
import { router, useLocalSearchParams } from "expo-router";
import { useMemo, useState } from "react";
import { Alert, KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { isCleartext, normalizeBase, spaceUrl, useAdmin } from "../../admin/AdminProvider";
import { boardMessage } from "../../admin/board";
import { SpaceLogo } from "../../admin/SpaceLogo";
import { useCatalog } from "../../catalog/CatalogProvider";
import { AppLogo } from "../../components/AppLogo";
import { Field } from "../../components/Field";
import { Body, Em, Mono, Serif } from "../../components/Typo";
import { colors, ease, gutter } from "../../theme";

const fade = (d: number) => FadeInDown.duration(600).delay(d).easing(ease);
const OTHER = "__other";

/** Kosmy arrive-t-il à joindre l'adresse ? N'importe quelle réponse HTTP suffit (même 401 ou 404). */
async function reachable(url: string) {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), 7000);
  try {
    await fetch(url, { method: "GET", signal: ctrl.signal, headers: { "Cache-Control": "no-cache" } });
    return true;
  } catch {
    return false;
  } finally {
    clearTimeout(t);
  }
}

export default function Edition() {
  const params = useLocalSearchParams<{ id?: string; app?: string }>();
  const insets = useSafeAreaInsets();
  const { catalog, appById } = useCatalog();
  const admin = useAdmin();
  const editing = params.id ? admin.spaces.find((s) => s.id === params.id) : undefined;

  const [choice, setChoice] = useState<string | null>(
    editing ? (editing.appId ?? OTHER) : params.app && appById[params.app]?.admin ? params.app : null,
  );
  const app = choice && choice !== OTHER ? appById[choice] : undefined;
  const [name, setName] = useState(editing && !editing.appId ? editing.name : "");
  const [address, setAddress] = useState(editing?.base ?? "");
  const [path, setPath] = useState(editing?.path ?? "");
  const [error, setError] = useState<string | null>(null);
  const [unreachable, setUnreachable] = useState(false);
  const [busy, setBusy] = useState<false | "check" | "save">(false);

  const adminPath = path.trim() || app?.admin?.path || "/";
  const preview = useMemo(() => {
    const n = normalizeBase(address, app?.admin?.path);
    return "base" in n ? spaceUrl({ base: n.base, path: adminPath }) : null;
  }, [address, adminPath, app?.admin?.path]);

  const pick = (id: string) => {
    Haptics.selectionAsync().catch(() => {});
    setChoice(id);
    setPath("");
    setError(null);
    setUnreachable(false);
  };

  const save = async () => {
    setError(null);
    const finalName = choice === OTHER ? name.trim() : (app?.name ?? "");
    if (!finalName) return setError("Donnez un nom à cette appli.");
    const n = normalizeBase(address, app?.admin?.path);
    if ("error" in n) return setError(n.error);
    const input = { appId: app ? app.id : null, name: finalName, base: n.base, path: adminPath.startsWith("/") ? adminPath : `/${adminPath}` };

    // Première tentative : on vérifie que l'adresse répond. La seconde enregistre quand même.
    if (!unreachable) {
      setBusy("check");
      const ok = await reachable(spaceUrl(input));
      setBusy(false);
      if (!ok) {
        setUnreachable(true);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Warning).catch(() => {});
        return;
      }
    }
    setBusy("save");
    try {
      if (editing) {
        await admin.update(editing.id, input);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        router.back();
      } else {
        const s = await admin.add(input);
        Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
        if (await admin.unlock()) router.replace({ pathname: "/espace/[id]", params: { id: s.id } });
        else router.back();
      }
    } catch (e) {
      // Téléphone relié à Kosmy Board, qui a refusé ou n'a pas répondu : rien n'est changé.
      setBusy(false);
      setError(boardMessage(e));
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
    }
  };

  const confirmRemove = () => {
    if (!editing) return;
    Alert.alert(
      `Supprimer ${editing.name} ?`,
      admin.board
        ? "L'instance disparaît de Kosmy et de votre Kosmy Board, et sa session est effacée de ce téléphone. Rien n'est supprimé sur le serveur de l'appli."
        : "L'instance disparaît de Kosmy, et sa session est effacée de ce téléphone. Rien n'est supprimé sur le serveur.",
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Supprimer",
          style: "destructive",
          onPress: async () => {
            try {
              await admin.remove(editing.id);
              router.back();
            } catch (e) {
              setError(boardMessage(e));
            }
          },
        },
      ],
    );
  };

  const confirmForget = () => {
    if (!editing) return;
    Alert.alert(
      "Se déconnecter ?",
      `Kosmy oublie la session de ${editing.name} sur ce téléphone. Il faudra vous reconnecter à la prochaine ouverture.`,
      [
        { text: "Annuler", style: "cancel" },
        {
          text: "Se déconnecter",
          onPress: async () => {
            await admin.forget(editing.id);
            Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
            router.back();
          },
        },
      ],
    );
  };

  const options = catalog.apps.filter((a) => a.admin);

  return (
    <KeyboardAvoidingView behavior="padding" style={{ flex: 1, backgroundColor: colors.bg }}>
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={{ paddingTop: insets.top + 12, paddingBottom: insets.bottom + 40, paddingHorizontal: gutter }}
      >
        <Pressable onPress={() => router.back()} hitSlop={12} accessibilityRole="button" style={styles.back}>
          <Mono color={colors.paper}>← Retour</Mono>
        </Pressable>

        <Animated.View entering={fade(0)}>
          <Mono style={{ marginBottom: 14 }}>{editing ? "Modifier l'instance" : "Nouvelle instance"}</Mono>
          <Serif size={50} accessibilityRole="header">
            {choice ? (
              <>
                Où se trouve <Em color={colors.signal}>{choice === OTHER ? "votre appli" : app?.name}</Em> ?
              </>
            ) : (
              <>
                Quelle <Em color={colors.signal}>appli</Em> ?
              </>
            )}
          </Serif>
        </Animated.View>

        {!choice ? (
          <Animated.View entering={fade(80)} style={{ marginTop: 26, borderBottomWidth: 1, borderBottomColor: colors.line }}>
            {options.map((a) => (
              <Pressable
                key={a.id}
                onPress={() => pick(a.id)}
                style={({ pressed }) => [styles.option, pressed && { opacity: 0.6 }]}
                accessibilityRole="button"
              >
                <AppLogo app={a} size={44} />
                <View style={{ flex: 1 }}>
                  <Serif size={24}>{a.name}</Serif>
                  <Body size={13} color={colors.mute} numberOfLines={1}>
                    {a.text.fr.line}
                  </Body>
                </View>
                <Mono color={colors.signal}>→</Mono>
              </Pressable>
            ))}
            <Pressable
              onPress={() => pick(OTHER)}
              style={({ pressed }) => [styles.option, pressed && { opacity: 0.6 }]}
              accessibilityRole="button"
            >
              <SpaceLogo space={{ appId: null, name: "+" }} size={44} />
              <View style={{ flex: 1 }}>
                <Serif size={24}>
                  Autre <Em>appli web</Em>
                </Serif>
                <Body size={13} color={colors.mute} numberOfLines={1}>
                  N'importe quel site avec une page d'administration
                </Body>
              </View>
              <Mono color={colors.signal}>→</Mono>
            </Pressable>
          </Animated.View>
        ) : (
          <Animated.View entering={FadeIn.duration(400)}>
            <View style={styles.chosen}>
              <SpaceLogo space={{ appId: app?.id ?? null, name: choice === OTHER ? name || "?" : (app?.name ?? "?") }} size={40} />
              <Body weight="medium" color={colors.paper} style={{ flex: 1 }}>
                {choice === OTHER ? "Autre appli web" : app?.name}
              </Body>
              {!editing && (
                <Pressable onPress={() => setChoice(null)} hitSlop={10} accessibilityRole="button">
                  <Mono>Changer</Mono>
                </Pressable>
              )}
            </View>

            {choice === OTHER && (
              <Field
                label="Nom"
                value={name}
                onChangeText={(v) => {
                  setName(v);
                  setError(null);
                }}
                placeholder="Mon appli"
                autoCapitalize="sentences"
                returnKeyType="next"
              />
            )}
            <Field
              label="Adresse de votre instance"
              value={address}
              onChangeText={(v) => {
                setAddress(v);
                setUnreachable(false);
                setError(null);
              }}
              placeholder={app ? `https://${app.id}.mondomaine.fr` : "https://monappli.mondomaine.fr"}
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="url"
              inputMode="url"
              returnKeyType="done"
              onSubmitEditing={save}
              autoFocus={!editing}
            />
            <Field
              label="Page d'administration"
              value={path}
              onChangeText={(v) => {
                setPath(v);
                setUnreachable(false);
              }}
              placeholder={app?.admin?.path ?? "/"}
              autoCapitalize="none"
              autoCorrect={false}
              hint={app ? `Déjà renseignée pour ${app.name}. À changer seulement si votre instance est différente.` : undefined}
            />

            {preview && (
              <View style={styles.preview}>
                <Mono size={10}>Kosmy ouvrira</Mono>
                <Body size={14} color={colors.paper} style={{ marginTop: 4 }} selectable>
                  {preview}
                </Body>
              </View>
            )}

            {preview && isCleartext(preview) && (
              <Body size={13} color={colors.danger} style={{ marginTop: 12 }}>
                Adresse non chiffrée (http) : à garder pour votre réseau local. Sur Internet, votre mot de passe circulerait en clair.
              </Body>
            )}
            {error && (
              <Body size={14} color={colors.danger} style={{ marginTop: 14 }}>
                {error}
              </Body>
            )}
            {unreachable && (
              <Body size={14} color={colors.danger} style={{ marginTop: 14 }}>
                Kosmy n'arrive pas à joindre cette adresse. Vérifiez-la, ou enregistrez-la quand même si le serveur n'est accessible que
                depuis un autre réseau.
              </Body>
            )}

            <Pressable
              onPress={save}
              disabled={!!busy}
              style={({ pressed }) => [styles.cta, (pressed || !!busy) && { opacity: 0.8 }]}
              accessibilityRole="button"
            >
              <Body weight="semi" size={15} color={colors.bg}>
                {busy === "save" ? "Enregistrement…" : busy ? "Vérification de l'adresse…" : unreachable ? "Enregistrer quand même" : editing ? "Enregistrer" : "Ajouter et ouvrir →"}
              </Body>
            </Pressable>

            {editing && (
              <View style={styles.danger}>
                <Pressable onPress={confirmForget} style={styles.link} accessibilityRole="button">
                  <Body weight="medium" size={15} color={colors.paper}>
                    Se déconnecter
                  </Body>
                  <Mono size={10}>Efface la session sur ce téléphone</Mono>
                </Pressable>
                <Pressable onPress={confirmRemove} style={styles.link} accessibilityRole="button">
                  <Body weight="medium" size={15} color={colors.danger}>
                    Supprimer l'instance
                  </Body>
                  <Mono size={10}>{admin.board ? "Retirée aussi de votre Kosmy Board" : "Rien n'est supprimé sur le serveur"}</Mono>
                </Pressable>
              </View>
            )}
          </Animated.View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: "flex-start", paddingVertical: 8, marginBottom: 18 },
  option: { flexDirection: "row", alignItems: "center", gap: 14, paddingVertical: 14, borderTopWidth: 1, borderTopColor: colors.line },
  chosen: {
    marginTop: 24,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    padding: 12,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.panel,
  },
  preview: { marginTop: 22, paddingLeft: 12, borderLeftWidth: 2, borderLeftColor: colors.signal },
  cta: { marginTop: 28, height: 54, borderRadius: 999, backgroundColor: colors.signal, alignItems: "center", justifyContent: "center" },
  danger: { marginTop: 30, borderTopWidth: 1, borderTopColor: colors.line },
  link: { paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.line, gap: 4 },
});
