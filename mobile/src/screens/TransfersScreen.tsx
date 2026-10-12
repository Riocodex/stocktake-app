import { useCallback, useState } from "react";
import {
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, qty, withQuery } from "../api";
import { useAuth } from "../auth";
import { formatWhen } from "../format";
import type { RootStackParamList } from "../navigation";
import { useScope } from "../scope";
import { colors } from "../theme";
import { Badge, Eyebrow, OutletPicker, PrimaryButton } from "../ui";

type TransferLine = {
  id: string;
  name: string;
  unit: string;
  sentQty: number;
  receivedQty: number | null;
};

type TransferRow = {
  id: string;
  reference: string;
  status: string;
  statusLabel: string;
  fromOutletName: string;
  toOutletName: string;
  lineCount: number;
  hasDiscrepancy: boolean;
  lineSummary?: string[];
  lines: TransferLine[];
  createdAt: string;
  sentAt: string | null;
  receivedAt: string | null;
};

type Direction = "all" | "drafts" | "outgoing" | "incoming";

export function TransfersScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { outletId, setOutletId, outlets, isSuper } = useScope();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [direction, setDirection] = useState<Direction>("all");
  const [rows, setRows] = useState<TransferRow[]>([]);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const data = await api.get<{ transfers: TransferRow[] }>(
      withQuery("/api/mobile/transfers", {
        outlet: outletId || undefined,
        direction,
      }),
      token,
    );
    setRows(data.transfers);
  }, [token, outletId, direction]);

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
      <Text style={styles.title}>Transfers</Text>
      <Text style={styles.copy}>
        Move stock between outlets. Drafts do not change inventory until sent.
      </Text>

      {isSuper ? (
        <OutletPicker outlets={outlets} value={outletId} onChange={setOutletId} />
      ) : null}

      <View style={styles.tabs}>
        {(
          [
            ["all", "All"],
            ["drafts", "Drafts"],
            ["outgoing", "Out"],
            ["incoming", "In"],
          ] as const
        ).map(([id, label]) => (
          <Pressable
            key={id}
            onPress={() => setDirection(id)}
            style={[styles.tab, direction === id && styles.tabActive]}
          >
            <Text
              style={[styles.tabText, direction === id && styles.tabTextActive]}
            >
              {label}
            </Text>
          </Pressable>
        ))}
      </View>

      <PrimaryButton
        label="New transfer"
        onPress={() => navigation.navigate("NewTransfer")}
      />

      {rows.map((row) => (
        <Pressable
          key={row.id}
          style={styles.card}
          onPress={() => navigation.navigate("Transfer", { id: row.id })}
        >
          <View style={styles.rowTop}>
            <Text style={styles.rowTitle}>{row.reference}</Text>
            <Badge
              tone={
                row.status === "DRAFT"
                  ? "draft"
                  : row.status === "RECEIVED"
                    ? "filed"
                    : row.status === "SENT"
                      ? "low"
                      : "sage"
              }
            >
              {row.statusLabel}
            </Badge>
          </View>
          <Text style={styles.copy}>
            {row.fromOutletName} → {row.toOutletName}
          </Text>
          <View style={styles.lines}>
            {(row.lines ?? []).slice(0, 4).map((line) => {
              const shown =
                line.receivedQty !== null ? line.receivedQty : line.sentQty;
              return (
                <Text key={line.id} style={styles.lineItem}>
                  <Text style={styles.lineQty}>
                    {qty(shown)} {line.unit}
                  </Text>{" "}
                  {line.name}
                  {line.receivedQty !== null &&
                  line.receivedQty !== line.sentQty
                    ? ` · sent ${qty(line.sentQty)}`
                    : ""}
                </Text>
              );
            })}
            {row.lineCount > 4 ? (
              <Text style={styles.meta}>+{row.lineCount - 4} more</Text>
            ) : null}
          </View>
          <Text style={styles.meta}>
            {formatWhen(row.receivedAt || row.sentAt || row.createdAt)}
            {row.hasDiscrepancy ? " · discrepancy" : ""}
          </Text>
        </Pressable>
      ))}

      {rows.length === 0 ? (
        <Text style={styles.copy}>No transfers in this view.</Text>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20, paddingBottom: 48, gap: 12 },
  title: { color: colors.ink, fontSize: 32, fontWeight: "800", marginTop: 6 },
  copy: { color: colors.muted, marginTop: 4, fontSize: 13, lineHeight: 18 },
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
  lines: { marginTop: 8, gap: 3 },
  lineItem: { color: colors.ink, fontSize: 13, lineHeight: 18 },
  lineQty: { fontWeight: "800" },
  meta: { color: colors.muted, fontSize: 12, marginTop: 6 },
});
