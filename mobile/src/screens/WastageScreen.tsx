import { useCallback, useState } from "react";
import {
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, mediaUrl, money, qty, withQuery } from "../api";
import { useAuth } from "../auth";
import { formatWhen } from "../format";
import type { RootStackParamList } from "../navigation";
import { useScope } from "../scope";
import { colors } from "../theme";
import { Badge, Eyebrow, OutletPicker, PrimaryButton, StatCard } from "../ui";

type WastageRow = {
  id: string;
  createdAt: string;
  quantity: number;
  unit: string;
  value: number;
  reasonLabel: string;
  note: string | null;
  imageUrl: string | null;
  itemName: string;
  outletName: string;
  recordedBy: string;
  targetType?: string;
  targetTypeLabel?: string;
};

type Payload = {
  rows: WastageRow[];
  summary: {
    todayValue: number;
    todayCount: number;
    mostWastedName: string | null;
  };
};

export function WastageScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { outletId, setOutletId, outlets, isSuper } = useScope();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [data, setData] = useState<Payload | null>(null);
  const [query, setQuery] = useState("");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const payload = await api.get<Payload>(
      withQuery("/api/mobile/wastage", {
        outlet: outletId || undefined,
        q: query.trim() || undefined,
      }),
      token,
    );
    setData(payload);
  }, [token, outletId, query]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 12 }]}
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
      <Eyebrow>Stock & inventory</Eyebrow>
      <Text style={styles.title}>Wastage</Text>
      <Text style={styles.copy}>
        Item wastage deducts stock. Dish wastage records financial loss only —
        no recipe ingredients are deducted.
      </Text>

      {isSuper ? (
        <OutletPicker outlets={outlets} value={outletId} onChange={setOutletId} />
      ) : null}

      <View style={styles.stats}>
        <StatCard
          label="Today"
          value={money(data?.summary.todayValue ?? 0)}
        />
        <StatCard
          label="Items"
          value={String(data?.summary.todayCount ?? 0)}
        />
      </View>
      {data?.summary.mostWastedName ? (
        <Text style={styles.copy}>
          Most wasted today: {data.summary.mostWastedName}
        </Text>
      ) : null}

      <PrimaryButton
        label="Record wastage"
        onPress={() => navigation.navigate("RecordWastage")}
      />

      <TextInput
        placeholder="Search product or note"
        placeholderTextColor={colors.muted}
        value={query}
        onChangeText={setQuery}
        onSubmitEditing={() => load().catch(() => undefined)}
        style={styles.input}
      />

      {(data?.rows ?? []).map((row) => {
        const thumb = mediaUrl(row.imageUrl);
        return (
        <View key={row.id} style={styles.card}>
          <View style={styles.rowTop}>
            {thumb ? (
              <Image source={{ uri: thumb }} style={styles.thumb} />
            ) : null}
            <Text style={styles.rowTitle}>{row.itemName}</Text>
            <Badge tone="draft">
              {row.targetTypeLabel
                ? `${row.targetTypeLabel} · ${row.reasonLabel}`
                : row.reasonLabel}
            </Badge>
          </View>
          <Text style={styles.copy}>
            {qty(row.quantity)} {row.unit}
            {row.targetType === "DISH" && row.quantity !== 1 ? "s" : ""} ·{" "}
            {money(row.value)}
            {row.targetType === "DISH" ? " loss" : ""}
          </Text>
          <Text style={styles.meta}>
            {formatWhen(row.createdAt)} · {row.recordedBy}
            {isSuper ? ` · ${row.outletName}` : ""}
          </Text>
          {row.note ? <Text style={styles.note}>{row.note}</Text> : null}
        </View>
        );
      })}

      {data && data.rows.length === 0 ? (
        <Text style={styles.copy}>No wastage recorded yet.</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20, paddingBottom: 48, gap: 12 },
  title: { color: colors.ink, fontSize: 32, fontWeight: "800", marginTop: 6 },
  copy: { color: colors.muted, marginTop: 4, fontSize: 13, lineHeight: 18 },
  stats: { flexDirection: "row", gap: 10 },
  input: {
    borderWidth: 1,
    borderColor: "rgba(58,37,31,0.15)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 16,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "center",
  },
  rowTitle: { color: colors.ink, fontWeight: "800", flex: 1, fontSize: 16 },
  thumb: { width: 40, height: 40, borderRadius: 10, backgroundColor: colors.sand },
  meta: { color: colors.muted, fontSize: 12, marginTop: 6 },
  note: { color: colors.inkSoft, fontSize: 12, marginTop: 6 },
});
