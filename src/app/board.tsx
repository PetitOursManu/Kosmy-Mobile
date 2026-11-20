import * as Haptics from "expo-haptics";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View, type TextInput } from "react-native";
import Animated, { FadeIn, FadeInDown } from "react-native-reanimated";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { hostOf, isCleartext, normalizeBase, useAdmin } from "../admin/AdminProvider";
import { BoardError, boardApi, boardMessage } from "../admin/board";
import { Field } from "../components/Field";
import { Body, Em, Mono, Serif } from "../components/Typo";
import { colors, ease, gutter } from "../theme";

const fade = (d: number) => FadeInDown.duration(600).delay(d).easing(ease);
const LOCAL = /^https?:\/\/(localhost|127\.|10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|\[::1\])/i;

/** Connexion à Kosmy Board, une seule fois : le téléphone garde ensuite un jeton d'appareil. */
export default function BoardLogin() {
  const insets = useSafeAreaInsets();
  const admin = useAdmin();
  const [address, setAddress] = useState(admin.board?.url ?? "");
  const [email, setEmail] = useState(admin.board?.user.email ?? "");
  const [password, setPassword] = useState("");
  const [code, setCode] = useState("");
  // Mot de passe accepté, double authentification demandée.
  const [ticket, setTicket] = useState<{ url: string; ticket: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const emailRef = useRef<TextInput>(null);
  const passwordRef = useRef<TextInput>(null);

  const n = normalizeBase(address);
  const url = "base" in n ? n.base : null;

  const fail = (e: unknown) => {
    setBusy(false);
    setError(boardMessage(e));
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Error).catch(() => {});
  };

  const done = async (boardUrl: string, token: string, user: Parameters<typeof admin.linkBoard>[2]) => {
    await admin.linkBoard(boardUrl, token, user);
    Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success).catch(() => {});
    router.back();
  };

  const signIn = async () => {
    setError(null);
    if ("error" in n) return setError(n.error);
    if (!email.trim() || !password) return setError("Indiquez votre e-mail et votre mot de passe du Board.");
    setBusy(true);
    try {
      await boardApi.check(n.base);
      const r = await boardApi.login(n.base, email.trim(), password);
      if ("twoFactor" in r) {
        setBusy(false);
        setPassword("");
        setTicket({ url: n.base, ticket: r.ticket });
        return;
      }
      await done(n.base, r.token, r.user);
    } catch (e) {
      fail(e);
    }
  };

  const confirmCode = async () => {
    if (!ticket) return;
    setError(null);
    if (!code.trim()) return setError("Indiquez le code de votre application d'authentification.");
    setBusy(true);
    try {
      const r = await boardApi.login2fa(ticket.url, ticket.ticket, code.trim());
      await done(ticket.url, r.token, r.user);
    } catch (e) {
      // Ticket expiré ou trop d'essais : retour au mot de passe.
      if (e instanceof BoardError && e.code === "ticket") {
        setTicket(null);
        setCode("");
      }
      fail(e);
    }
  };

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
          <Mono style={{ marginBottom: 14 }}>Kosmy Board</Mono>
          <Serif size={50} accessibilityRole="header">
            {ticket ? (
              <>
                Votre <Em color={colors.signal}>code</Em>
              </>
            ) : (
              <>
                Se <Em color={colors.signal}>connecter</Em>
              </>
            )}
          </Serif>
          <Body style={{ marginTop: 16 }}>
            {ticket
              ? "La double authentification est activée sur ce compte. Saisissez le code de votre application d'authentification, ou un code de secours."
              : "Vos espaces admin sont alors les mêmes ici et sur votre Board. Vous ne vous connectez qu'une fois : Kosmy garde la connexion, jamais votre mot de passe."}
          </Body>
        </Animated.View>

        {ticket ? (
          <Animated.View entering={FadeIn.duration(400)} key="code">
            <Field
              label="Code"
              value={code}
              onChangeText={(v) => {
                setCode(v);
                setError(null);
              }}
              placeholder="123456"
              keyboardType="number-pad"
              autoComplete="one-time-code"
              textContentType="oneTimeCode"
              autoCapitalize="none"
              autoCorrect={false}
              maxLength={12}
              autoFocus
              returnKeyType="done"
              onSubmitEditing={confirmCode}
            />
            <Body size={13} color={colors.mute} style={{ marginTop: 6 }}>
              Compte {email.trim()} sur {hostOf(ticket.url)}
            </Body>
          </Animated.View>
        ) : (
          <Animated.View entering={fade(80)} key="login">
            <Field
              label="Adresse du Board"
              value={address}
              onChangeText={(v) => {
                setAddress(v);
                setError(null);
              }}
              placeholder="https://board.mondomaine.fr"
              keyboardType="url"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="url"
              inputMode="url"
              returnKeyType="next"
              onSubmitEditing={() => emailRef.current?.focus()}
              autoFocus={!admin.board}
            />
            <Field
              ref={emailRef}
              label="E-mail"
              value={email}
              onChangeText={(v) => {
                setEmail(v);
                setError(null);
              }}
              placeholder="vous@mondomaine.fr"
              keyboardType="email-address"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="email"
              textContentType="username"
              returnKeyType="next"
              onSubmitEditing={() => passwordRef.current?.focus()}
            />
            <Field
              ref={passwordRef}
              label="Mot de passe"
              value={password}
              onChangeText={(v) => {
                setPassword(v);
                setError(null);
              }}
              secureTextEntry
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="current-password"
              textContentType="password"
              returnKeyType="done"
              onSubmitEditing={signIn}
            />
            {url && isCleartext(url) && !LOCAL.test(url) && (
              <Body size={13} color={colors.danger} style={{ marginTop: 14 }}>
                Adresse non chiffrée (http) : votre mot de passe et la connexion du téléphone circuleraient en clair. Utilisez https.
              </Body>
            )}
          </Animated.View>
        )}

        {error && (
          <Body size={14} color={colors.danger} style={{ marginTop: 14 }} accessibilityLiveRegion="polite">
            {error}
          </Body>
        )}

        <Pressable
          onPress={ticket ? confirmCode : signIn}
          disabled={busy}
          style={({ pressed }) => [styles.cta, (pressed || busy) && { opacity: 0.8 }]}
          accessibilityRole="button"
        >
          <Body weight="semi" size={15} color={colors.bg}>
            {busy ? "Connexion…" : ticket ? "Valider" : "Se connecter →"}
          </Body>
        </Pressable>

        {ticket && (
          <View style={{ marginTop: 18, alignItems: "center" }}>
            <Pressable
              onPress={() => {
                setTicket(null);
                setCode("");
                setError(null);
              }}
              hitSlop={10}
              accessibilityRole="button"
            >
              <Mono>Recommencer</Mono>
            </Pressable>
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  back: { alignSelf: "flex-start", paddingVertical: 8, marginBottom: 18 },
  cta: { marginTop: 28, height: 54, borderRadius: 999, backgroundColor: colors.signal, alignItems: "center", justifyContent: "center" },
});
