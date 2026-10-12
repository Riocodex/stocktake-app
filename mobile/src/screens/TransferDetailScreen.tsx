import { useCallback, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, api, qty } from "../api";
import { useAuth } from "../auth";
import { formatWhen } from "../format";
import type { RootStackParamList } from "../navigation";
import { colors } from "../theme";
import { Badge, Eyebrow, PrimaryButton } from "../ui";

type TransferDetail = {
  id: string;
  reference: string;
  status: string;
  statusLabel: string;
  note: string | null;
  imageUrl: string | null;
  fromOutletId: string;
  fromOutletName: string;
  toOutletId: string;
  toOutletName: string;
  createdBy: string;
  sentBy: string | null;
  receivedBy: string | null;
  createdAt: string;
  sentAt: string | null;
  receivedAt: string | null;
  lines: {
    id: string;
    itemId: string;
    name: string;
    unit: string;
    sentQty: number;
    receivedQty: number | null;
    discrepancy: number | null;
    discrepancyNote: string | null;
  }[];
};

export function TransferDetailScreen() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const route = useRoute<RouteProp<RootStackParamList, "Transfer">>();
  const [transfer, setTransfer] = useState<TransferDetail | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [pending, setPending] = useState(false);
  const [received, setReceived] = useState<Record<string, string>>({});
  const [notes, setNotes] = useState<Record<string, string>>({});
  const [receiveNote, setReceiveNote] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    const data = await api.get<{ transfer: TransferDetail }>(
      `/api/mobile/transfers/${route.params.id}`,
      token,
    );
    setTransfer(data.transfer);
    setReceived(
      Object.fromEntries(
        data.transfer.lines.map((line) => [
          line.itemId,
          String(line.receivedQty ?? line.sentQty),
        ]),
      ),
    );
  }, [token, route.params.id]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  const isSuper = user?.role === "SUPER_ADMIN";
  const canSend =
    transfer?.status === "DRAFT" &&
    (isSuper || user?.outletId === transfer.fromOutletId);
  const canReceive =
    transfer?.status === "SENT" &&
    (isSuper || user?.outletId === transfer.toOutletId);

  async function send() {
    if (!token || !transfer) return;
    setPending(true);
    try {
      await api.post(`/api/mobile/transfers/${transfer.id}/send`, token, {});
      Alert.alert("Sent", "Source stock was deducted.");
      await load();
    } catch (caught) {
      Alert.alert(
        "Could not send",
        caught instanceof ApiError ? caught.message : "",
      );
    } finally {
      setPending(false);
    }
  }

  async function cancel() {
    if (!token || !transfer) return;
    setPending(true);
    try {
      await api.post(`/api/mobile/transfers/${transfer.id}/cancel`, token, {});
      Alert.alert("Cancelled", "Draft cancelled. Stock was not changed.");
      await load();
    } catch (caught) {
      Alert.alert(
        "Could not cancel",
        caught instanceof ApiError ? caught.message : "",
      );
    } finally {
      setPending(false);
    }
  }

  async function receive() {
    if (!token || !transfer) return;
    setPending(true);
    try {
      await api.post(`/api/mobile/transfers/${transfer.id}/receive`, token, {
        note: receiveNote || undefined,
        lines: transfer.lines.map((line) => ({
          itemId: line.itemId,
          receivedQty: Number(received[line.itemId] ?? line.sentQty),
          discrepancyNote: notes[line.itemId] || undefined,
        })),
      });
      Alert.alert("Received", "Destination stock was updated.");
      await load();
    } catch (caught) {
      Alert.alert(
        "Could not receive",
        caught instanceof ApiError ? caught.message : "",
      );
    } finally {
      setPending(false);
    }
  }

  if (!transfer) {
    return (
      <View style={[styles.screen, styles.center]}>
        <Text style={styles.copy}>Loading…</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + 8 }]}
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
      <Eyebrow>
        {transfer.fromOutletName} → {transfer.toOutletName}
      </Eyebrow>
      <View style={styles.rowTop}>
        <Text style={styles.title}>{transfer.reference}</Text>
        <Badge
          tone={
            transfer.status === "DRAFT"
              ? "draft"
              : transfer.status === "RECEIVED"
                ? "filed"
                : transfer.status === "SENT"
                  ? "low"
                  : "sage"
          }
        >
          {transfer.statusLabel}
        </Badge>
      </View>
      <Text style={styles.copy}>
        Created by {transfer.createdBy} · {formatWhen(transfer.createdAt)}
      </Text>
      {transfer.note ? <Text style={styles.copy}>{transfer.note}</Text> : null}
      {transfer.imageUrl ? (
        <Image source={{ uri: transfer.imageUrl }} style={styles.preview} />
      ) : null}

      {transfer.lines.map((line) => (
        <View key={line.id} style={styles.card}>
          <Text style={styles.rowTitle}>{line.name}</Text>
          <Text style={styles.copy}>
            Sent {qty(line.sentQty)} {line.unit}
            {line.receivedQty !== null
              ? ` · received ${qty(line.receivedQty)} ${line.unit}`
              : ""}
            {line.discrepancy
              ? ` · diff ${line.discrepancy > 0 ? "+" : ""}${qty(line.discrepancy)}`
              : ""}
          </Text>
          {line.discrepancyNote ? (
            <Text style={styles.warn}>{line.discrepancyNote}</Text>
          ) : null}

          {canReceive ? (
            <>
              <Text style={styles.label}>Received qty</Text>
              <TextInput
                keyboardType="decimal-pad"
                value={received[line.itemId] ?? ""}
                onChangeText={(value) =>
                  setReceived((current) => ({
                    ...current,
                    [line.itemId]: value,
                  }))
                }
                style={styles.input}
              />
              <Text style={styles.label}>Discrepancy note</Text>
              <TextInput
                value={notes[line.itemId] ?? ""}
                onChangeText={(value) =>
                  setNotes((current) => ({
                    ...current,
                    [line.itemId]: value,
                  }))
                }
                placeholder="Required if qty differs"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
            </>
          ) : null}
        </View>
      ))}

      {canSend ? (
        <View style={styles.actions}>
          <PrimaryButton
            label={pending ? "Working…" : "Send transfer"}
            onPress={send}
            disabled={pending}
          />
          <Pressable onPress={cancel} disabled={pending} style={styles.secondary}>
            <Text style={styles.secondaryText}>Cancel draft</Text>
          </Pressable>
        </View>
      ) : null}

      {canReceive ? (
        <View style={styles.actions}>
          <TextInput
            value={receiveNote}
            onChangeText={setReceiveNote}
            placeholder="Receive note (optional)"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />
          <PrimaryButton
            label={pending ? "Working…" : "Confirm receipt"}
            onPress={receive}
            disabled={pending}
          />
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  center: { alignItems: "center", justifyContent: "center" },
  content: { padding: 20, paddingBottom: 48, gap: 12 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800", flex: 1 },
  copy: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 10 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 16,
    gap: 6,
  },
  rowTitle: { color: colors.ink, fontWeight: "800", fontSize: 16 },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(58,37,31,0.15)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.paper,
  },
  actions: { gap: 10 },
  secondary: {
    borderWidth: 1,
    borderColor: "rgba(58,37,31,0.15)",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.white,
  },
  secondaryText: { color: colors.ink, fontWeight: "800" },
  warn: { color: "#92400e", fontSize: 12, marginTop: 4 },
  preview: {
    width: "100%",
    height: 180,
    borderRadius: 18,
    backgroundColor: colors.paper,
  },
});
