import { View } from "react-native";

import { useCatalog } from "../catalog/CatalogProvider";
import { AppLogo } from "../components/AppLogo";
import { Serif } from "../components/Typo";
import { colors } from "../theme";
import type { AdminSpace } from "./AdminProvider";

/** Logo de l'appli du catalogue, ou initiale en Instrument Serif pour une autre appli web. */
export function SpaceLogo({ space, size = 48 }: { space: Pick<AdminSpace, "appId" | "name">; size?: number }) {
  const { appById } = useCatalog();
  const app = space.appId ? appById[space.appId] : undefined;
  if (app) return <AppLogo app={app} size={size} />;
  return (
    <View
      style={{
        width: size,
        height: size,
        borderRadius: size * 0.27,
        backgroundColor: colors.tile,
        borderWidth: 1,
        borderColor: "rgba(241,237,228,0.14)",
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Serif size={size * 0.56} color={colors.signal} style={{ lineHeight: size * 0.66 }}>
        {(space.name.trim()[0] ?? "?").toUpperCase()}
      </Serif>
    </View>
  );
}
