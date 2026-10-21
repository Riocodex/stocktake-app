import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Linking,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, withQuery } from "../api";
import { useAuth } from "../auth";
import type { RootStackParamList } from "../navigation";
import { useScope } from "../scope";
import { colors } from "../theme";
import { Eyebrow } from "../ui";

type OrderingCard = {
  id: string;
  title: string;
  category: string;
  method: string;
  methodLabel: string;
  instructions: string | null;
  requiresApproval: boolean;
  isSample: boolean;
  supplier: { id: string; name: string; isSample: boolean };
  canOpenExternal: boolean;
  openBlockedReason: string | null;
  approval: {
    id: string;
    status: string;
    decisionNote: string | null;
  } | null;
};

export function OrderingScreen() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const { outletId, isSuper } = useScope();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [cards, setCards] = useState<OrderingCard[]>([]);
  const [loading, setLoading] = useState(true);
  const [requestingId, setRequestingId] = useState<string | null>(null);
  const [note, setNote] = useState("");
  const [expected, setExpected] = useState("");

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api.get<{ cards: OrderingCard[] }>(
        withQuery("/api/mobile/ordering/cards", {
          outlet: isSuper ? outletId || null : null,
        }),
        token,
      );
      setCards(data.cards);
    } catch {
      setCards([]);
    } finally {
      setLoading(false);
    }
  }, [token, outletId, isSuper]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function openCard(card: OrderingCard) {
    if (!token) return;
    try {
      const result = await api.post<{
        url: string;
        notice: string;
        orderSubmitted: boolean;
        stockChanged: boolean;
      }>("/api/mobile/ordering/open", token, {
        cardId: card.id,
        outletId: outletId || user?.outletId || null,
      });

      if (result.orderSubmitted || result.stockChanged) {
        Alert.alert("Unexpected response", "Refusing to treat link open as an order.");
        return;
      }

      const supported = await Linking.canOpenURL(result.url);
      if (!supported) {
        Alert.alert("Cannot open link", result.url);
        return;
      }
      await Linking.openURL(result.url);
      Alert.alert(
        "Opened externally",
        result.notice ||
          "Place the order yourself. Opening this link does not submit an order or change stock.",
      );
    } catch (error) {
      Alert.alert(
        "Cannot open",
        error instanceof Error ? error.message : "Request failed.",
      );
    }
  }

  async function requestApproval(cardId: string) {
    if (!token) return;
    setRequestingId(cardId);
    try {
      await api.post("/api/mobile/ordering/approvals", token, {
        cardId,
        outletId: outletId || user?.outletId || null,
        note: note.trim() || undefined,
        expectedItems: expected.trim() || undefined,
      });
      setNote("");
      setExpected("");
      await load();
      Alert.alert(
        "Request sent",
        "Approval authorizes ordering but does not prove the supplier received an order.",
      );
    } catch (error) {
      Alert.alert(
        "Request failed",
        error instanceof Error ? error.message : "Could not request approval.",
      );
    } finally {
      setRequestingId(null);
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <Eyebrow>Purchasing</Eyebrow>
      <Text style={styles.title}>Order supplies</Text>
      <Text style={styles.copy}>
        Open WhatsApp or the supplier website, place the order yourself, then
        record what arrives under Delivery. Links never change stock.
      </Text>

      <Pressable
        style={styles.linkRow}
        onPress={() => navigation.navigate("OrderApprovals")}
      >
        <Text style={styles.linkTitle}>Approval requests</Text>
      </Pressable>
      <Pressable
        style={styles.linkRow}
        onPress={() => navigation.navigate("Delivery")}
      >
        <Text style={styles.linkTitle}>Record delivery</Text>
      </Pressable>

      {loading ? (
        <ActivityIndicator color={colors.clay} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={cards}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.category}>{item.category}</Text>
              <Text style={styles.cardTitle}>{item.title}</Text>
              <Text style={styles.copy}>
                {item.supplier.name}
                {item.isSample || item.supplier.isSample ? " · Sample" : ""}
                {" · "}
                {item.methodLabel}
              </Text>
              {item.instructions ? (
                <Text style={[styles.copy, { marginTop: 8 }]}>
                  {item.instructions}
                </Text>
              ) : null}
              {item.requiresApproval ? (
                <Text style={styles.badge}>
                  Approval: {item.approval?.status ?? "not requested"}
                </Text>
              ) : null}

              <Pressable
                style={[
                  styles.primary,
                  !item.canOpenExternal && styles.primaryDisabled,
                ]}
                disabled={!item.canOpenExternal}
                onPress={() => void openCard(item)}
              >
                <Text style={styles.primaryText}>
                  Open {item.methodLabel}
                </Text>
              </Pressable>
              {!item.canOpenExternal && item.openBlockedReason ? (
                <Text style={styles.blocked}>{item.openBlockedReason}</Text>
              ) : null}

              {item.requiresApproval &&
              (!item.approval || item.approval.status === "REJECTED") ? (
                <View style={styles.requestBox}>
                  <TextInput
                    style={styles.input}
                    placeholder="Notes (optional)"
                    placeholderTextColor={colors.muted}
                    value={note}
                    onChangeText={setNote}
                  />
                  <TextInput
                    style={styles.input}
                    placeholder="Expected items (optional)"
                    placeholderTextColor={colors.muted}
                    value={expected}
                    onChangeText={setExpected}
                  />
                  <Pressable
                    style={styles.secondary}
                    disabled={requestingId === item.id}
                    onPress={() => void requestApproval(item.id)}
                  >
                    <Text style={styles.secondaryText}>
                      {requestingId === item.id
                        ? "Sending…"
                        : "Request approval"}
                    </Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          )}
          ListEmptyComponent={
            <Text style={[styles.copy, { marginTop: 20 }]}>
              No ordering cards for this outlet.
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, paddingHorizontal: 20 },
  title: { color: colors.ink, fontSize: 32, fontWeight: "800", marginTop: 6 },
  copy: { color: colors.muted, marginTop: 4, lineHeight: 20 },
  linkRow: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 14,
    marginTop: 10,
  },
  linkTitle: { color: colors.ink, fontWeight: "700" },
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 16,
    marginTop: 14,
  },
  category: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    textTransform: "uppercase",
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 22,
    fontWeight: "800",
    marginTop: 4,
  },
  badge: {
    marginTop: 10,
    color: colors.ink,
    fontSize: 12,
    fontWeight: "600",
  },
  primary: {
    marginTop: 14,
    backgroundColor: colors.clay,
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryDisabled: { opacity: 0.4 },
  primaryText: { color: colors.cream, fontWeight: "800" },
  blocked: { color: colors.muted, fontSize: 12, marginTop: 8 },
  requestBox: { marginTop: 12, gap: 8 },
  input: {
    borderWidth: 1,
    borderColor: "rgba(58,37,31,0.15)",
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
    backgroundColor: colors.cream,
  },
  secondary: {
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.creamDeep,
  },
  secondaryText: { color: colors.ink, fontWeight: "700" },
});
