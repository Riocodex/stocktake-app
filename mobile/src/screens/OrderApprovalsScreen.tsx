import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect } from "@react-navigation/native";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api } from "../api";
import { useAuth } from "../auth";
import { colors } from "../theme";
import { Eyebrow } from "../ui";

type ApprovalRow = {
  id: string;
  status: string;
  note: string | null;
  expectedItems: string | null;
  decisionNote: string | null;
  createdAt: string;
  card: {
    title: string;
    supplier: { name: string };
  };
  outlet: { name: string };
  requestedBy: { name: string };
};

export function OrderApprovalsScreen() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const isSuper = user?.role === "SUPER_ADMIN";
  const [rows, setRows] = useState<ApprovalRow[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api.get<{ requests: ApprovalRow[] }>(
        "/api/mobile/ordering/approvals",
        token,
      );
      setRows(data.requests);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function review(requestId: string, decision: "APPROVED" | "REJECTED") {
    if (!token) return;
    try {
      await api.post("/api/mobile/ordering/approvals", token, {
        action: "review",
        requestId,
        decision,
      });
      await load();
    } catch (error) {
      Alert.alert(
        "Review failed",
        error instanceof Error ? error.message : "Could not review.",
      );
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <Eyebrow>Purchasing</Eyebrow>
      <Text style={styles.title}>
        {isSuper ? "Approvals" : "My requests"}
      </Text>
      <Text style={styles.copy}>
        Approval unlocks the ordering link. It does not send a supplier message
        or change stock.
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.clay} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => (
            <View style={styles.card}>
              <Text style={styles.cardTitle}>{item.card.title}</Text>
              <Text style={styles.copy}>
                {item.card.supplier.name} · {item.outlet.name}
              </Text>
              <Text style={styles.copy}>
                {item.requestedBy.name} · {item.status}
              </Text>
              {item.note ? (
                <Text style={styles.copy}>Note: {item.note}</Text>
              ) : null}
              {item.expectedItems ? (
                <Text style={styles.copy}>Expected: {item.expectedItems}</Text>
              ) : null}
              {isSuper && item.status === "PENDING" ? (
                <View style={styles.actions}>
                  <Pressable
                    style={styles.approve}
                    onPress={() => void review(item.id, "APPROVED")}
                  >
                    <Text style={styles.approveText}>Approve</Text>
                  </Pressable>
                  <Pressable
                    style={styles.reject}
                    onPress={() => void review(item.id, "REJECTED")}
                  >
                    <Text style={styles.rejectText}>Reject</Text>
                  </Pressable>
                </View>
              ) : null}
            </View>
          )}
          ListEmptyComponent={
            <Text style={[styles.copy, { marginTop: 20 }]}>
              No approval requests yet.
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
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 16,
    marginTop: 14,
  },
  cardTitle: { color: colors.ink, fontSize: 20, fontWeight: "800" },
  actions: { flexDirection: "row", gap: 10, marginTop: 12 },
  approve: {
    flex: 1,
    backgroundColor: colors.clay,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  approveText: { color: colors.cream, fontWeight: "800" },
  reject: {
    flex: 1,
    backgroundColor: colors.creamDeep,
    borderRadius: 14,
    paddingVertical: 12,
    alignItems: "center",
  },
  rejectText: { color: colors.ink, fontWeight: "700" },
});
