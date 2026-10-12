import { useCallback, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, qty, withQuery } from "../api";
import { useAuth } from "../auth";
import { formatWhen } from "../format";
import { useScope } from "../scope";
import { colors } from "../theme";
import { Badge, Eyebrow, OutletPicker } from "../ui";

type Movement = {
  id: string;
  itemName: string;
  outletName: string;
  movementType: string;
  movementTypeLabel: string;
  quantityChange: number;
  unit: string;
  quantityBefore: number | null;
  quantityAfter: number | null;
  balancesVerified: boolean;
  performedBy: string | null;
  note: string | null;
  createdAt: string;
};

const TYPES = [
  { id: "", label: "All" },
  { id: "DELIVERY", label: "Delivery" },
  { id: "WASTAGE", label: "Wastage" },
  { id: "TRANSFER_OUT", label: "Out" },
  { id: "TRANSFER_IN", label: "In" },
  { id: "STOCK_TAKE_ADJUSTMENT", label: "Take" },
];

export function StockHistoryScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { outletId, setOutletId, outlets, isSuper } = useScope();
  const [type, setType] = useState("");
  const [from, setFrom] = useState("");
  const [to, setTo] = useState("");
  const [rows, setRows] = useState<Movement[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const data = await api.get<{ movements: Movement[] }>(
      withQuery("/api/mobile/stock-movements", {
        outlet: outletId || undefined,
        type: type || undefined,
        from: from || undefined,
        to: to || undefined,
      }),
      token,
    );
    setRows(data.movements);
  }, [token, outletId, type, from, to]);

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
      <Text style={styles.title}>Movement history</Text>
      <Text style={styles.copy}>
        Read-only audit of inventory changes. Stock balances still live per
        outlet.
      </Text>

      {isSuper ? (
        <OutletPicker outlets={outlets} value={outletId} onChange={setOutletId} />
      ) : null}

      <View style={styles.tabs}>
        {TYPES.map((entry) => (
          <Pressable
            key={entry.id || "all"}
            onPress={() => setType(entry.id)}
            style={[styles.tab, type === entry.id && styles.tabActive]}
          >
            <Text
              style={[styles.tabText, type === entry.id && styles.tabTextActive]}
            >
              {entry.label}
            </Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.dates}>
        <TextInput
          placeholder="From YYYY-MM-DD"
          placeholderTextColor={colors.muted}
          value={from}
          onChangeText={setFrom}
          style={styles.input}
          autoCapitalize="none"
        />
        <TextInput
          placeholder="To YYYY-MM-DD"
          placeholderTextColor={colors.muted}
          value={to}
          onChangeText={setTo}
          style={styles.input}
          autoCapitalize="none"
        />
      </View>

      {rows.map((row) => (
        <View key={row.id} style={styles.card}>
          <View style={styles.rowTop}>
            <Text style={styles.rowTitle}>{row.itemName}</Text>
            <Badge tone={row.quantityChange >= 0 ? "filed" : "low"}>
              {row.quantityChange > 0 ? "+" : ""}
              {qty(row.quantityChange)} {row.unit}
            </Badge>
          </View>
          <Text style={styles.copy}>
            {row.movementTypeLabel} · {row.outletName}
          </Text>
          <Text style={styles.meta}>
            {row.balancesVerified
              ? `${qty(row.quantityBefore)} → ${qty(row.quantityAfter)}`
              : "Balances not verified"}
            {" · "}
            {row.performedBy ?? "Unknown"}
            {" · "}
            {formatWhen(row.createdAt)}
          </Text>
          {row.note ? <Text style={styles.meta}>{row.note}</Text> : null}
        </View>
      ))}

      {rows.length === 0 ? (
        <Text style={styles.copy}>No movements in this view.</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20, paddingBottom: 48, gap: 12 },
  title: { color: colors.ink, fontSize: 32, fontWeight: "800", marginTop: 6 },
  copy: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  tabs: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  tab: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(58,37,31,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.white,
  },
  tabActive: { backgroundColor: colors.ink, borderColor: colors.ink },
  tabText: { color: colors.ink, fontWeight: "700", fontSize: 12 },
  tabTextActive: { color: colors.white },
  dates: { flexDirection: "row", gap: 8 },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(58,37,31,0.15)",
    borderRadius: 16,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 14,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 16,
    gap: 4,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    gap: 8,
    alignItems: "center",
  },
  rowTitle: { color: colors.ink, fontWeight: "800", flex: 1, fontSize: 16 },
  meta: { color: colors.muted, fontSize: 12, marginTop: 2 },
});
