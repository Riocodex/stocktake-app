import { useCallback, useState } from "react";
import { RefreshControl, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "@react-navigation/native";

import { api, money } from "../api";
import { useAuth } from "../auth";
import { formatWhen } from "../format";
import { colors } from "../theme";
import { Eyebrow, StatCard } from "../ui";

type Payload = {
  group: { value: number; lowCount: number; takeCount: number };
  outlets: {
    id: string;
    name: string;
    city: string | null;
    address: string | null;
    value: number;
    lowCount: number;
    draftCount: number;
    takeCount: number;
    lastCountedAt: string | null;
    admins: { id: string; name: string }[];
  }[];
};

export function OutletsScreen() {
  const { token } = useAuth();
  const [data, setData] = useState<Payload | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setData(await api.get<Payload>("/api/mobile/outlets", token));
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
      <Text style={styles.title}>Outlets</Text>
      <View style={styles.stats}>
        <StatCard label="Group value" value={money(data?.group.value ?? 0)} />
        <StatCard label="Needs reorder" value={String(data?.group.lowCount ?? 0)} />
        <StatCard label="Filed" value={String(data?.group.takeCount ?? 0)} />
      </View>
      {data?.outlets.map((outlet) => (
        <View key={outlet.id} style={styles.card}>
          <Text style={styles.name}>{outlet.name}</Text>
          <Text style={styles.copy}>{outlet.address ?? outlet.city}</Text>
          <Text style={styles.copy}>
            {money(outlet.value)} · {outlet.lowCount} low · {outlet.takeCount} filed
            {outlet.draftCount ? ` · ${outlet.draftCount} open` : ""}
          </Text>
          <Text style={styles.copy}>
            Last counted {formatWhen(outlet.lastCountedAt)}
          </Text>
          <Text style={styles.copy}>
            {outlet.admins.length
              ? outlet.admins.map((admin) => admin.name).join(", ")
              : "No outlet admin assigned"}
          </Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20, paddingBottom: 40, gap: 12 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  stats: { flexDirection: "row", gap: 8 },
  card: { backgroundColor: colors.white, borderRadius: 20, padding: 16 },
  name: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  copy: { color: colors.muted, marginTop: 4 },
});
