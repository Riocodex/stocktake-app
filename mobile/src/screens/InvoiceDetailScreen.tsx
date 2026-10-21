import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import {
  useFocusEffect,
  useNavigation,
  useRoute,
} from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import type { RootStackParamList } from "../navigation";
import { colors } from "../theme";
import { Eyebrow, PrimaryButton } from "../ui";

type LineEdit = {
  id: string;
  rawDescription: string;
  quantity: number | null;
  unit: string | null;
  unitPrice: number | null;
  lineTotal: number | null;
  matchStatus: string;
  itemId: string | null;
  itemName: string | null;
  receivedQty: string;
  exclude: boolean;
};

type InvoiceDetail = {
  id: string;
  status: string;
  receivingStatus: string;
  supplierTextRaw: string | null;
  invoiceNumber: string | null;
  invoiceDate: string | null;
  currency: string;
  subtotal: number | null;
  vatAmount: number | null;
  total: number | null;
  extractionProvider: string | null;
  lines: Array<{
    id: string;
    rawDescription: string;
    quantity: number | null;
    unit: string | null;
    unitPrice: number | null;
    lineTotal: number | null;
    matchStatus: string;
    itemId: string | null;
    excludeFromReceiving: boolean;
    item: { id: string; name: string } | null;
  }>;
};

type ItemOption = { id: string; name: string; sku: string; unit: string };

export function InvoiceDetailScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const route = useRoute<RouteProp<RootStackParamList, "InvoiceDetail">>();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [invoice, setInvoice] = useState<InvoiceDetail | null>(null);
  const [lines, setLines] = useState<LineEdit[]>([]);
  const [items, setItems] = useState<ItemOption[]>([]);
  const [issues, setIssues] = useState<string[]>([]);
  const [duplicates, setDuplicates] = useState<string[]>([]);
  const [suspectedCount, setSuspectedCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [ackDup, setAckDup] = useState(false);
  const [ackSuspect, setAckSuspect] = useState(false);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const [data, inv] = await Promise.all([
        api.get<{
          invoice: InvoiceDetail;
          reconciliation: { issues: { message: string }[] };
          duplicates: { id: string; invoiceNumber: string | null }[];
        }>(`/api/mobile/invoices/${route.params.id}`, token),
        api.get<{ items: ItemOption[] }>("/api/mobile/inventory", token),
      ]);

      setInvoice(data.invoice);
      setIssues(data.reconciliation.issues.map((i) => i.message));
      setDuplicates(data.duplicates.map((d) => d.invoiceNumber ?? d.id));
      setItems(
        (inv.items ?? []).map((row) => ({
          id: row.id,
          name: row.name,
          sku: row.sku,
          unit: row.unit,
        })),
      );
      setLines(
        data.invoice.lines.map((line) => ({
          id: line.id,
          rawDescription: line.rawDescription,
          quantity: line.quantity,
          unit: line.unit,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
          matchStatus: line.matchStatus,
          itemId: line.itemId ?? line.item?.id ?? null,
          itemName: line.item?.name ?? null,
          receivedQty:
            line.excludeFromReceiving || line.quantity == null
              ? ""
              : String(line.quantity),
          exclude: line.excludeFromReceiving,
        })),
      );

      if (data.invoice.status !== "CONFIRMED") {
        try {
          const preview = await api.get<{
            suspectedManualDeliveries: unknown[];
          }>(`/api/mobile/invoices/${route.params.id}/receive`, token);
          setSuspectedCount(preview.suspectedManualDeliveries.length);
        } catch {
          setSuspectedCount(0);
        }
      } else {
        setSuspectedCount(0);
      }
    } catch {
      setInvoice(null);
    } finally {
      setLoading(false);
    }
  }, [token, route.params.id]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const stockPreview = useMemo(
    () =>
      lines.filter(
        (line) =>
          line.itemId && !line.exclude && Number(line.receivedQty) > 0,
      ),
    [lines],
  );

  async function saveDraft() {
    if (!token || !invoice || invoice.status === "CONFIRMED") return;
    setPending(true);
    try {
      await api.patch(`/api/mobile/invoices/${invoice.id}`, token, {
        invoiceNumber: invoice.invoiceNumber,
        total: invoice.total,
        lines: lines.map((line) => ({
          rawDescription: line.rawDescription,
          itemId: line.itemId,
          quantity: line.quantity,
          unit: line.unit,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
          excludeFromReceiving: line.exclude,
        })),
      });
      Alert.alert("Saved", "Draft saved. Stock was not changed.");
      await load();
    } catch (caught) {
      Alert.alert(
        "Save failed",
        caught instanceof ApiError ? caught.message : "Could not save.",
      );
    } finally {
      setPending(false);
    }
  }

  async function confirmDelivery() {
    if (!token || !invoice) return;
    setPending(true);
    try {
      const result = await api.patch<{
        notice?: string;
        stockChanged?: boolean;
        pricesChanged?: boolean;
      }>(`/api/mobile/invoices/${invoice.id}`, token, {
        action: "confirmDeliveryAndUpdateStock",
        acknowledgeDuplicates: ackDup || duplicates.length === 0,
        acknowledgeSuspectedDuplicates: ackSuspect || suspectedCount === 0,
        invoiceNumber: invoice.invoiceNumber,
        total: invoice.total,
        lines: lines.map((line) => ({
          rawDescription: line.rawDescription,
          itemId: line.itemId,
          quantity: line.quantity,
          unit: line.unit,
          unitPrice: line.unitPrice,
          lineTotal: line.lineTotal,
          excludeFromReceiving: line.exclude,
        })),
        receiveLines: lines.map((line) => ({
          quantity: Number(line.receivedQty || 0),
          quantityInStockUnit: false,
          exclude: line.exclude,
        })),
      });
      if (result.pricesChanged) {
        Alert.alert("Unexpected", "Must not change costing prices.");
        return;
      }
      Alert.alert(
        result.stockChanged ? "Stock updated" : "Confirmed",
        result.notice ?? "Done.",
      );
      await load();
    } catch (caught) {
      Alert.alert(
        "Confirm failed",
        caught instanceof ApiError ? caught.message : "Could not confirm.",
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

  if (!invoice) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.copy}>Invoice not found.</Text>
      </View>
    );
  }

  const readOnly = invoice.status === "CONFIRMED";
  const fullyReceived = invoice.receivingStatus === "FULLY_RECEIVED";

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{
        paddingTop: insets.top + 8,
        paddingBottom: insets.bottom + 32,
        paddingHorizontal: 20,
      }}
    >
      <Eyebrow>
        {invoice.status} · {invoice.receivingStatus}
      </Eyebrow>
      <Text style={styles.title}>
        {invoice.supplierTextRaw ?? "Invoice"}
      </Text>
      <Text style={styles.copy}>
        {invoice.extractionProvider ?? "extraction"}
        {" · "}
        Upload/AI never change stock — only Confirm Delivery does.
      </Text>

      {issues.map((issue) => (
        <Text key={issue} style={styles.warn}>
          {issue}
        </Text>
      ))}
      {duplicates.length > 0 ? (
        <Text style={styles.warn}>
          Possible duplicate: {duplicates.join(", ")}
        </Text>
      ) : null}
      {suspectedCount > 0 ? (
        <Text style={styles.warn}>
          Possible prior manual delivery ({suspectedCount}). Acknowledge before
          updating stock, or link on Receive Existing Invoice.
        </Text>
      ) : null}

      <Text style={styles.label}>Invoice number</Text>
      <TextInput
        style={styles.input}
        editable={!readOnly}
        value={invoice.invoiceNumber ?? ""}
        onChangeText={(value) =>
          setInvoice({ ...invoice, invoiceNumber: value })
        }
      />

      <Text style={styles.label}>Total ({invoice.currency})</Text>
      <TextInput
        style={styles.input}
        editable={!readOnly}
        keyboardType="decimal-pad"
        value={invoice.total != null ? String(invoice.total) : ""}
        onChangeText={(value) =>
          setInvoice({
            ...invoice,
            total: value.trim() ? Number(value) : null,
          })
        }
      />

      <Text style={[styles.label, { marginTop: 16 }]}>
        Lines — match & qty actually received
      </Text>
      {lines.map((line, index) => (
        <View key={line.id} style={styles.card}>
          <Text style={styles.cardTitle}>{line.rawDescription}</Text>
          <Text style={styles.copy}>
            Invoice: {line.quantity ?? "—"} {line.unit ?? ""}
            {" · "}
            {line.lineTotal != null ? `€${line.lineTotal.toFixed(2)}` : "—"}
          </Text>

          {!readOnly ? (
            <>
              <Text style={styles.label}>Match item</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false}>
                <Pressable
                  style={[
                    styles.chip,
                    !line.itemId ? styles.chipOn : null,
                  ]}
                  onPress={() =>
                    setLines((current) =>
                      current.map((row, i) =>
                        i === index
                          ? { ...row, itemId: null, itemName: null }
                          : row,
                      ),
                    )
                  }
                >
                  <Text style={styles.chipText}>Unmatched</Text>
                </Pressable>
                {items.slice(0, 40).map((item) => (
                  <Pressable
                    key={item.id}
                    style={[
                      styles.chip,
                      line.itemId === item.id ? styles.chipOn : null,
                    ]}
                    onPress={() =>
                      setLines((current) =>
                        current.map((row, i) =>
                          i === index
                            ? {
                                ...row,
                                itemId: item.id,
                                itemName: item.name,
                              }
                            : row,
                        ),
                      )
                    }
                  >
                    <Text style={styles.chipText}>{item.name}</Text>
                  </Pressable>
                ))}
              </ScrollView>

              <Pressable
                onPress={() =>
                  setLines((current) =>
                    current.map((row, i) =>
                      i === index
                        ? {
                            ...row,
                            exclude: !row.exclude,
                            receivedQty: !row.exclude ? "" : row.receivedQty,
                          }
                        : row,
                    ),
                  )
                }
              >
                <Text style={styles.copy}>
                  {line.exclude ? "☑" : "☐"} Exclude (non-stock)
                </Text>
              </Pressable>

              <Text style={styles.label}>Received → stock</Text>
              <TextInput
                style={styles.input}
                keyboardType="decimal-pad"
                editable={!line.exclude && Boolean(line.itemId)}
                value={line.receivedQty}
                onChangeText={(value) =>
                  setLines((current) =>
                    current.map((row, i) =>
                      i === index ? { ...row, receivedQty: value } : row,
                    ),
                  )
                }
                placeholder={line.unit ? `Qty in ${line.unit}` : "Received qty"}
                placeholderTextColor={colors.muted}
              />
              {line.quantity != null &&
              line.receivedQty &&
              Number(line.receivedQty) < line.quantity ? (
                <Text style={styles.warn}>
                  Discrepancy: invoice {line.quantity} vs received{" "}
                  {line.receivedQty}
                </Text>
              ) : null}
            </>
          ) : (
            <Text style={styles.copy}>
              Match: {line.itemName ?? line.matchStatus}
            </Text>
          )}
        </View>
      ))}

      {!readOnly && stockPreview.length > 0 ? (
        <View style={styles.preview}>
          <Text style={styles.label}>Will add to stock</Text>
          {stockPreview.map((line) => (
            <Text key={line.id} style={styles.copy}>
              + {line.receivedQty} {line.unit ?? ""} ·{" "}
              {line.itemName ?? "item"}
            </Text>
          ))}
        </View>
      ) : null}

      {readOnly ? (
        <View style={{ marginTop: 16, gap: 10 }}>
          <Text style={styles.copy}>
            {fullyReceived
              ? "Delivery confirmed and stock updated. Document is locked."
              : "Invoice confirmed earlier without full stock receive."}
          </Text>
          {!fullyReceived ? (
            <PrimaryButton
              label="Receive Existing Invoice"
              onPress={() =>
                navigation.navigate("InvoiceReceive", { id: invoice.id })
              }
            />
          ) : null}
        </View>
      ) : (
        <View style={{ marginTop: 16, gap: 10 }}>
          {duplicates.length > 0 ? (
            <Pressable onPress={() => setAckDup((v) => !v)}>
              <Text style={styles.copy}>
                {ackDup ? "☑" : "☐"} Acknowledge possible duplicate invoice
              </Text>
            </Pressable>
          ) : null}
          {suspectedCount > 0 ? (
            <Pressable onPress={() => setAckSuspect((v) => !v)}>
              <Text style={styles.copy}>
                {ackSuspect ? "☑" : "☐"} Acknowledge possible prior manual
                delivery
              </Text>
            </Pressable>
          ) : null}
          <PrimaryButton
            label={pending ? "Saving…" : "Save draft"}
            onPress={() => void saveDraft()}
            disabled={pending}
          />
          <PrimaryButton
            label={
              pending ? "Updating stock…" : "Confirm Delivery & Update Stock"
            }
            onPress={() => void confirmDelivery()}
            disabled={
              pending ||
              stockPreview.length === 0 ||
              (duplicates.length > 0 && !ackDup) ||
              (suspectedCount > 0 && !ackSuspect)
            }
          />
        </View>
      )}
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
  label: {
    marginTop: 14,
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  input: {
    marginTop: 6,
    borderWidth: 1,
    borderColor: "rgba(58,37,31,0.15)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 12,
    marginTop: 10,
  },
  cardTitle: { color: colors.ink, fontWeight: "700" },
  chip: {
    marginTop: 8,
    marginRight: 8,
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(58,37,31,0.15)",
    backgroundColor: colors.cream,
  },
  chipOn: {
    borderColor: colors.clay,
    backgroundColor: "#f3e7e1",
  },
  chipText: { color: colors.ink, fontSize: 12, fontWeight: "600" },
  preview: {
    marginTop: 14,
    padding: 12,
    borderRadius: 16,
    backgroundColor: "#f3e7e1",
  },
});
