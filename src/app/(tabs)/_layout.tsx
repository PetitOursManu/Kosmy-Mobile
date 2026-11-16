import { Tabs } from "expo-router/js-tabs";

import { TabBar } from "../../components/TabBar";
import { colors } from "../../theme";

export default function TabsLayout() {
  return (
    <Tabs
      tabBar={(props) => <TabBar {...props} />}
      screenOptions={{ headerShown: false, animation: "shift", sceneStyle: { backgroundColor: colors.bg } }}
    >
      <Tabs.Screen name="index" />
      <Tabs.Screen name="catalogue" />
      <Tabs.Screen name="mes-applis" />
      <Tabs.Screen name="admin" />
    </Tabs>
  );
}
