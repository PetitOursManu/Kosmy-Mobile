import { useState, type Ref } from "react";
import { StyleSheet, TextInput, View, type TextInputProps } from "react-native";

import { colors, fonts } from "../theme";
import { Body, Mono } from "./Typo";

/** Champ de saisie : étiquette en JetBrains Mono, trait souligné qui passe au vert citron au focus. */
export function Field({ label, hint, ref, ...p }: TextInputProps & { label: string; hint?: string; ref?: Ref<TextInput> }) {
  const [focus, setFocus] = useState(false);
  return (
    <View style={{ marginTop: 22 }}>
      <Mono color={focus ? colors.signal : colors.mute}>{label}</Mono>
      <TextInput
        ref={ref}
        placeholderTextColor="rgba(241,237,228,0.32)"
        selectionColor={colors.signal}
        cursorColor={colors.signal}
        {...p}
        onFocus={(e) => {
          setFocus(true);
          p.onFocus?.(e);
        }}
        onBlur={(e) => {
          setFocus(false);
          p.onBlur?.(e);
        }}
        style={[styles.input, focus && { borderBottomColor: colors.signal }]}
      />
      {hint ? (
        <Body size={13} color={colors.mute} style={{ marginTop: 6 }}>
          {hint}
        </Body>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  input: {
    fontFamily: fonts.sans,
    fontSize: 18,
    color: colors.paper,
    paddingVertical: 10,
    paddingHorizontal: 0,
    borderBottomWidth: 1,
    borderBottomColor: colors.lineStrong,
  },
});
