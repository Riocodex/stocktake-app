import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { useAuth } from "../auth";
import type { RootStackParamList } from "../navigation";
import { colors } from "../theme";
import { Eyebrow } from "../ui";

export function MoreScreen() {
  const insets = useSafeAreaInsets();
  const { user, logout } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isSuper = user?.role === "SUPER_ADMIN";

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <Eyebrow>{isSuper ? "Super admin" : "Outlet admin"}</Eyebrow>
      <Text style={styles.title}>{user?.name}</Text>
      <Text style={styles.copy}>
        {user?.email}
        {"\n"}
        {user?.outletName ?? "All outlets"}
      </Text>

      <Pressable style={styles.row} onPress={() => navigation.navigate("Wastage")}>
        <Text style={styles.rowTitle}>Wastage</Text>
        <Text style={styles.copy}>Record spoiled, expired or damaged stock</Text>
      </Pressable>
      <Pressable
        style={styles.row}
        onPress={() => navigation.navigate("Transfers")}
      >
        <Text style={styles.rowTitle}>Transfers</Text>
        <Text style={styles.copy}>Move stock between outlets</Text>
      </Pressable>
      <Pressable style={styles.row} onPress={() => navigation.navigate("Delivery")}>
        <Text style={styles.rowTitle}>Delivery</Text>
        <Text style={styles.copy}>Add supplier stock without a full count</Text>
      </Pressable>

      {isSuper ? (
        <>
          <Pressable style={styles.row} onPress={() => navigation.navigate("Outlets")}>
            <Text style={styles.rowTitle}>Outlets</Text>
            <Text style={styles.copy}>Group stock and who counts each venue</Text>
          </Pressable>
          <Pressable style={styles.row} onPress={() => navigation.navigate("Team")}>
            <Text style={styles.rowTitle}>Team</Text>
            <Text style={styles.copy}>Access and recent activity</Text>
          </Pressable>
        </>
      ) : null}

      <Pressable onPress={logout} style={styles.signOut}>
        <Text style={styles.signOutText}>Sign out</Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, paddingHorizontal: 20 },
  title: { color: colors.ink, fontSize: 32, fontWeight: "800", marginTop: 6 },
  copy: { color: colors.muted, marginTop: 4, lineHeight: 20 },
  row: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 16,
    marginTop: 14,
  },
  rowTitle: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  signOut: { alignItems: "center", marginTop: 32 },
  signOutText: { color: colors.muted, fontWeight: "700" },
});
