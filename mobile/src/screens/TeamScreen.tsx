import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { api } from "../api";
import { useAuth } from "../auth";
import { formatWhen } from "../format";
import { colors } from "../theme";
import { Badge, Eyebrow } from "../ui";

type Payload = {
  users: {
    id: string;
    name: string;
    email: string;
    role: string;
    roleLabel: string;
    outletName: string;
    takeCount: number;
    lastLoginAt: string | null;
  }[];
  activity: {
    id: string;
    label: string;
    detail: string | null;
    userName: string | null;
    createdAt: string;
  }[];
};

export function TeamScreen() {
  const { token } = useAuth();
  const [data, setData] = useState<Payload | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setData(await api.get<Payload>("/api/mobile/team", token));
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            await load().catch(() => undefined);
            setRefreshing(false);
          }}
        />
      }
    >
      <Eyebrow>Super admin</Eyebrow>
      <Text style={styles.title}>Team access</Text>
      {data?.users.map((user) => (
        <View key={user.id} style={styles.card}>
          <View style={styles.row}>
            <Text style={styles.name}>{user.name}</Text>
            <Badge tone={user.role === "SUPER_ADMIN" ? "sage" : "draft"}>
              {user.roleLabel}
            </Badge>
          </View>
          <Text style={styles.copy}>{user.email}</Text>
          <Text style={styles.copy}>
            {user.outletName} · {user.takeCount} stock takes · last in{" "}
            {formatWhen(user.lastLoginAt)}
          </Text>
        </View>
      ))}

      <Text style={styles.section}>Recent activity</Text>
      {data?.activity.map((entry) => (
        <View key={entry.id} style={styles.card}>
          <Text style={styles.name}>{entry.label}</Text>
          <Text style={styles.copy}>
            {entry.userName ?? "Unknown"}
            {entry.detail ? ` · ${entry.detail}` : ""}
          </Text>
          <Text style={styles.copy}>{formatWhen(entry.createdAt)}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20, paddingBottom: 40, gap: 10 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  section: { color: colors.ink, fontWeight: "800", fontSize: 20, marginTop: 8 },
  card: { backgroundColor: colors.white, borderRadius: 18, padding: 14 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  name: { color: colors.ink, fontWeight: "800" },
  copy: { color: colors.muted, marginTop: 4 },
});
