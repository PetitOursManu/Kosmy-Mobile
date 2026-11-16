import { InstrumentSerif_400Regular, InstrumentSerif_400Regular_Italic } from "@expo-google-fonts/instrument-serif";
import { InterTight_400Regular, InterTight_500Medium, InterTight_600SemiBold } from "@expo-google-fonts/inter-tight";
import { JetBrainsMono_400Regular, JetBrainsMono_500Medium } from "@expo-google-fonts/jetbrains-mono";
import { useFonts } from "expo-font";
import { Stack } from "expo-router";
import * as SplashScreen from "expo-splash-screen";
import { StatusBar } from "expo-status-bar";
import { useEffect } from "react";
import { View } from "react-native";
import { SafeAreaProvider } from "react-native-safe-area-context";

import { AdminProvider } from "../admin/AdminProvider";
import { CatalogProvider } from "../catalog/CatalogProvider";
import { PermissionSheet } from "../components/PermissionSheet";
import { StoreProvider } from "../store/StoreProvider";
import { colors } from "../theme";

SplashScreen.preventAutoHideAsync().catch(() => {});
SplashScreen.setOptions({ fade: true, duration: 400 });

export default function RootLayout() {
  const [loaded] = useFonts({
    InstrumentSerif_400Regular,
    InstrumentSerif_400Regular_Italic,
    JetBrainsMono_400Regular,
    JetBrainsMono_500Medium,
    InterTight_400Regular,
    InterTight_500Medium,
    InterTight_600SemiBold,
  });

  useEffect(() => {
    if (loaded) SplashScreen.hideAsync().catch(() => {});
  }, [loaded]);

  if (!loaded) return <View style={{ flex: 1, backgroundColor: colors.bg }} />;

  return (
    <SafeAreaProvider style={{ backgroundColor: colors.bg }}>
      <CatalogProvider>
        <StoreProvider>
          <AdminProvider>
          <StatusBar style="light" />
          <Stack
            screenOptions={{
              headerShown: false,
              contentStyle: { backgroundColor: colors.bg },
              animation: "slide_from_right",
            }}
          >
            <Stack.Screen name="(tabs)" />
            <Stack.Screen name="app/[id]" options={{ animation: "fade_from_bottom" }} />
            <Stack.Screen name="espace/[id]" options={{ animation: "fade_from_bottom" }} />
            <Stack.Screen name="espace/edition" options={{ animation: "slide_from_bottom" }} />
          </Stack>
          <PermissionSheet />
          </AdminProvider>
        </StoreProvider>
      </CatalogProvider>
    </SafeAreaProvider>
  );
}
