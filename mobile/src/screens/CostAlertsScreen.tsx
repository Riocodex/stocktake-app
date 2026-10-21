import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, money } from "../api";
import { useAuth } from "../auth";
import type { RootStackParamList } from "../navigation";
import { colors } from "../theme";
import { Eyebrow } from "../ui";

type AlertRow = {
  dishId: string;
  dishName: string;
  scopeLabel: string;
  sellingPrice: number;
  dishCost: number | null;
  foodCostPercent: number | null;
  alertLevel: string;
  alertLabel: string;
  thresholdExceeded: "warning" | "critical" | null;
  costingStatusLabel: string;
  thresholds: { warningPercent: number; criticalPercent: number };
};

function pct(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(1)}%`;
}

export function CostAlertsScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [summary, setSummary] = useState({
    warning: 0,
    critical: 0,
    unresolved: 0,
    healthy: 0,
  });
  const [thresholds, setThresholds] = useState({
    warningPercent: 30,
    criticalPercent: 35,
  });
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api.get<{
        alerts: AlertRow[];
        summary: typeof summary;
        thresholds: typeof thresholds;
      }>("/api/mobile/cost-alerts?attention=1", token);
      setAlerts(data.alerts);
      setSummary(data.summary);
      setThresholds(data.thresholds);
    } catch {
      setAlerts([]);
    } finally {
      setLoading(false);
    }
  }, [token]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <Eyebrow>Products & Dishes</Eyebrow>
      <Text style={styles.title}>Cost alerts</Text>
      <Text style={styles.copy}>
        Group-wide food cost · warn {thresholds.warningPercent}% / critical{" "}
        {thresholds.criticalPercent}%
      </Text>
      <Text style={styles.copy}>
        {summary.critical} critical · {summary.warning} warning ·{" "}
        {summary.unresolved} unresolved
      </Text>

      {loading ? (
        <ActivityIndicator color={colors.clay} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={alerts}
          keyExtractor={(item) => item.dishId}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={
            <Text style={styles.empty}>No dishes need attention.</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => navigation.navigate("Dish", { id: item.dishId })}
            >
              <View style={styles.rowTop}>
                <Text style={styles.rowTitle}>{item.dishName}</Text>
                <Text
                  style={[
                    styles.badge,
                    item.alertLevel === "CRITICAL" && styles.badgeCritical,
                    item.alertLevel === "WARNING" && styles.badgeWarning,
                  ]}
                >
                  {item.alertLabel}
                </Text>
              </View>
              <Text style={styles.copy}>
                {item.scopeLabel} · Sell {money(item.sellingPrice)}
                {item.dishCost !== null ? ` · Cost ${money(item.dishCost)}` : ""}
                {" · FC "}
                {pct(item.foodCostPercent)}
              </Text>
              <Text style={styles.copy}>{item.costingStatusLabel}</Text>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, paddingHorizontal: 20 },
  title: { color: colors.ink, fontSize: 32, fontWeight: "800", marginTop: 4 },
  copy: { color: colors.muted, marginTop: 4, lineHeight: 20, fontSize: 13 },
  empty: { color: colors.muted, marginTop: 28, textAlign: "center" },
  row: {
    marginTop: 10,
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 14,
  },
  rowTop: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    gap: 8,
  },
  rowTitle: { color: colors.ink, fontSize: 17, fontWeight: "800", flex: 1 },
  badge: {
    color: colors.muted,
    fontWeight: "800",
    fontSize: 12,
  },
  badgeWarning: { color: "#b45309" },
  badgeCritical: { color: "#b91c1c" },
});
