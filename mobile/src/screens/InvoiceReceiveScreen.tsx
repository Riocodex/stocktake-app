import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  Pressable,
} from "react-native";
import { useFocusEffect, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import type { RootStackParamList } from "../navigation";
import { colors } from "../theme";
import { Eyebrow, PrimaryButton } from "../ui";

type Line = {
  invoiceLineId: string;
  rawDescription: string;
  itemName: string | null;
  stockUnit: string | null;
  invoicedStockQty: number | null;
  quantityReceived: number;
  remainingStockQty: number | null;
  conversionError: string | null;
  canReceive: boolean;
  excludeFromReceiving: boolean;
};

export function InvoiceReceiveScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const route = useRoute<RouteProp<RootStackParamList, "InvoiceReceive">>();
  const [lines, setLines] = useState<Line[]>([]);
  const [receivingStatus, setReceivingStatus] = useState("");
  const [qty, setQty] = useState<Record<string, string>>({});
  const [excluded, setExcluded] = useState<Record<string, boolean>>({});
  const [suspected, setSuspected] = useState<
    { id: string; risk: string; createdAt: string }[]
  >([]);
  const [ack, setAck] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api.get<{
        invoice: { receivingStatus: string };
        lines: Line[];
        suspectedManualDeliveries: {
          id: string;
          risk: string;
          createdAt: string;
        }[];
      }>(`/api/mobile/invoices/${route.params.id}/receive`, token);
      setLines(data.lines);
      setReceivingStatus(data.invoice.receivingStatus);
      setSuspected(data.suspectedManualDeliveries);
      const nextQty: Record<string, string> = {};
      const nextEx: Record<string, boolean> = {};
      for (const line of data.lines) {
        nextQty[line.invoiceLineId] =
          line.canReceive && line.remainingStockQty != null
            ? String(line.remainingStockQty)
            : "";
        nextEx[line.invoiceLineId] = line.excludeFromReceiving;
      }
      setQty(nextQty);
      setExcluded(nextEx);
    } catch {
      setLines([]);
    } finally {
      setLoading(false);
    }
  }, [token, route.params.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function confirm() {
    if (!token) return;
    setPending(true);
    try {
      const result = await api.post<{
        notice?: string;
        stockChanged?: boolean;
        pricesChanged?: boolean;
      }>(`/api/mobile/invoices/${route.params.id}/receive`, token, {
        lines: lines.map((line) => ({
          invoiceLineId: line.invoiceLineId,
          quantity: Number(qty[line.invoiceLineId] || 0),
          quantityInStockUnit: true,
          exclude: Boolean(excluded[line.invoiceLineId]),
        })),
        acknowledgeSuspectedDuplicates: ack || suspected.length === 0,
      });
      if (result.pricesChanged) {
        Alert.alert("Unexpected", "Receiving must not change costing prices.");
        return;
      }
      Alert.alert(
        "Done",
        result.notice ??
          (result.stockChanged
            ? "Stock updated for received quantities."
            : "No stock change."),
      );
      await load();
    } catch (caught) {
      Alert.alert(
        "Receive failed",
        caught instanceof ApiError ? caught.message : "Could not receive.",
      );
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return (
      <View style={[styles.screen, styles.center]}>
        <ActivityIndicator color={colors.clay} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingBottom: insets.bottom + 32,
        paddingHorizontal: 20,
      }}
    >
      <Eyebrow>Receiving · {receivingStatus}</Eyebrow>
      <Text style={styles.title}>Receive Existing Invoice</Text>
      <Text style={styles.copy}>
        For invoices already confirmed without stock. New scans use Confirm
        Delivery & Update Stock on the invoice review screen.
      </Text>

      {suspected.map((row) => (
        <Text key={row.id} style={styles.warn}>
          {row.createdAt.slice(0, 10)}: {row.risk}
        </Text>
      ))}

      {lines.map((line) => (
        <View key={line.invoiceLineId} style={styles.card}>
          <Text style={styles.cardTitle}>{line.rawDescription}</Text>
          <Text style={styles.copy}>
            {line.itemName ?? "Unmatched"}
            {line.invoicedStockQty != null
              ? ` · Invoice ≈ ${line.invoicedStockQty} ${line.stockUnit}`
              : ""}
          </Text>
          <Text style={styles.copy}>
            Received {line.quantityReceived}
            {line.remainingStockQty != null
              ? ` · Remaining ${line.remainingStockQty}`
              : ""}
          </Text>
          {line.conversionError ? (
            <Text style={styles.warn}>{line.conversionError}</Text>
          ) : null}
          <Pressable
            onPress={() =>
              setExcluded((current) => ({
                ...current,
                [line.invoiceLineId]: !current[line.invoiceLineId],
              }))
            }
          >
            <Text style={styles.copy}>
              {excluded[line.invoiceLineId] ? "☑" : "☐"} Exclude non-stock
            </Text>
          </Pressable>
          <TextInput
            style={styles.input}
            keyboardType="decimal-pad"
            editable={!excluded[line.invoiceLineId] && Boolean(line.itemName)}
            value={qty[line.invoiceLineId] ?? ""}
            onChangeText={(value) =>
              setQty((current) => ({
                ...current,
                [line.invoiceLineId]: value,
              }))
            }
            placeholder={`Qty (${line.stockUnit ?? "stock"})`}
            placeholderTextColor={colors.muted}
          />
        </View>
      ))}

      {suspected.length > 0 ? (
        <Pressable onPress={() => setAck((v) => !v)}>
          <Text style={styles.copy}>
            {ack ? "☑" : "☐"} Acknowledge suspected duplicates
          </Text>
        </Pressable>
      ) : null}

      <View style={{ marginTop: 16 }}>
        <PrimaryButton
          label={
            pending ? "Receiving…" : "Receive Existing Invoice & Update Stock"
          }
          onPress={() => void confirm()}
          disabled={pending || (suspected.length > 0 && !ack)}
        />
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  center: { alignItems: "center", justifyContent: "center", flex: 1 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800", marginTop: 6 },
  copy: { color: colors.muted, marginTop: 4, lineHeight: 20 },
  warn: {
    marginTop: 8,
    color: "#8a5a00",
    backgroundColor: "#fff6e5",
    padding: 10,
    borderRadius: 12,
    overflow: "hidden",
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 14,
    marginTop: 12,
  },
  cardTitle: { color: colors.ink, fontWeight: "700" },
  input: {
    marginTop: 8,
    borderWidth: 1,
    borderColor: "rgba(58,37,31,0.15)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    backgroundColor: colors.cream,
  },
});
