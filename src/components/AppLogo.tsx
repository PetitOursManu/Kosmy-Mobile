import { Image } from "expo-image";
import { View, type ViewStyle } from "react-native";

import { useCatalog } from "../catalog/CatalogProvider";
import type { CatalogApp } from "../catalog/types";
import { colors } from "../theme";

/**
 * Tuile de logo, comme sur le site : coins à 27 %, fine bordure claire.
 * Les logos transparents (Mocky, Calendy, ClearDoc) se posent sur leur tuile claire, avec une marge.
 */
export function AppLogo({ app, size = 48, style }: { app: CatalogApp; size?: number; style?: ViewStyle }) {
  const { logo } = useCatalog();
  const { source, placeholder } = logo(app);
  const inset = app.tile ? 0.72 : 1;
  return (
    <View
      style={[
        {
          width: size,
          height: size,
          borderRadius: size * 0.27,
          overflow: "hidden",
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: app.tile ?? colors.tile,
          borderWidth: 1,
          borderColor: "rgba(241,237,228,0.14)",
        },
        style,
      ]}
    >
      <Image
        source={source}
        placeholder={placeholder}
        cachePolicy="memory-disk"
        contentFit={app.tile ? "contain" : "cover"}
        transition={0}
        style={{ width: size * inset, height: size * inset }}
        accessibilityLabel={`Logo ${app.name}`}
      />
    </View>
  );
}
