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

import { api, money, qty, withQuery } from "../api";
import { useAuth } from "../auth";
import { formatWhen } from "../format";
import type { RootStackParamList } from "../navigation";
import { useScope } from "../scope";
import { colors } from "../theme";
import {
  Badge,
  Eyebrow,
  OutletPicker,
  PrimaryButton,
  ProgressRing,
  StatCard,
} from "../ui";

type HomePayload = {
  summary: {
    value: number;
    trackedItems: number;
    lowCount: number;
    outOfStock: number;
    draftCount: number;
    takeCount: number;
  };
  comparison: { id: string; name: string; value: number; lowCount: number }[];
  lowStock: {
    itemId: string;
    name: string;
    sku: string;
    unit: string;
    category: string;
    outletName: string;
    quantity: number;
    parLevel: number;
  }[];
  lowStockTotal: number;
  categories: { name: string; value: number }[];
  active: {
    id: string;
    reference: string;
    areaLabel: string;
    counted: number;
    total: number;
    outletName: string;
  }[];
  recent: {
    id: string;
    reference: string;
    areaLabel: string;
    status: string;
    outletName: string;
    countedBy: string;
    lineCount: number;
    createdAt: string;
  }[];
};

export function HomeScreen() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const { outletId, setOutletId, outlets, isSuper } = useScope();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [data, setData] = useState<HomePayload | null>(null);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const payload = await api.get<HomePayload>(
      withQuery("/api/mobile/home", { outlet: outletId }),
      token,
    );
    setData(payload);
  }, [token, outletId]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  const maxCategory = Math.max(1, ...(data?.categories.map((row) => row.value) ?? [1]));
  const scopeName =
    outlets.find((outlet) => outlet.id === outletId)?.name ??
    user?.outletName ??
    "All outlets";

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
      <Eyebrow>{scopeName}</Eyebrow>
      <Text style={styles.title}>Hi {user?.name.split(" ")[0]}</Text>
      <Text style={styles.copy}>
        Same stock, prices and counts as the website — in your pocket.
      </Text>
      {isSuper ? (
        <OutletPicker outlets={outlets} value={outletId} onChange={setOutletId} />
      ) : null}

      <View style={styles.stats}>
        <StatCard label="On hand" value={money(data?.summary.value ?? 0)} />
        <StatCard label="Needs reorder" value={String(data?.summary.lowCount ?? 0)} />
      </View>
      <View style={styles.stats}>
        <StatCard label="Open counts" value={String(data?.summary.draftCount ?? 0)} />
        <StatCard label="Filed" value={String(data?.summary.takeCount ?? 0)} />
        <StatCard label="Out of stock" value={String(data?.summary.outOfStock ?? 0)} />
      </View>

      {data?.active.map((take) => (
        <Pressable
          key={take.id}
          style={styles.active}
          onPress={() => navigation.navigate("Take", { id: take.id })}
        >
          <ProgressRing counted={take.counted} total={take.total} />
          <View style={{ flex: 1 }}>
            <Eyebrow>Active stock take</Eyebrow>
            <Text style={styles.activeTitle}>{take.reference}</Text>
            <Text style={styles.copy}>
              {take.areaLabel} · {take.outletName} · {take.counted} of {take.total}
            </Text>
            <Text style={styles.link}>Continue</Text>
          </View>
        </Pressable>
      ))}

      <PrimaryButton
        label="Start a stock take"
        onPress={() => navigation.navigate("NewTake")}
      />
      <Pressable
        style={styles.secondary}
        onPress={() => navigation.navigate("Delivery")}
      >
        <Text style={styles.secondaryText}>Record a delivery</Text>
      </Pressable>
      <Pressable
        style={styles.secondary}
        onPress={() => navigation.navigate("Wastage")}
      >
        <Text style={styles.secondaryText}>Record wastage</Text>
      </Pressable>
      <Pressable
        style={styles.secondary}
        onPress={() => navigation.navigate("Transfers")}
      >
        <Text style={styles.secondaryText}>Transfers</Text>
      </Pressable>

      {data?.comparison && data.comparison.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.section}>Outlets</Text>
          {data.comparison.map((row) => (
            <Pressable
              key={row.id}
              style={styles.row}
              onPress={() => setOutletId(row.id)}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{row.name}</Text>
                <Text style={styles.copy}>
                  {row.lowCount} low · {money(row.value)}
                </Text>
              </View>
              <Text style={styles.link}>View</Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {data?.lowStock && data.lowStock.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.section}>Running low</Text>
          {data.lowStock.map((row) => (
            <Pressable
              key={`${row.itemId}-${row.outletName}`}
              style={styles.row}
              onPress={() => navigation.navigate("Product", { id: row.itemId })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{row.name}</Text>
                <Text style={styles.copy}>
                  {row.category} · {qty(row.quantity)} {row.unit}
                  {row.parLevel ? ` / ${qty(row.parLevel)}` : ""}
                </Text>
              </View>
              <Badge tone="low">Low</Badge>
            </Pressable>
          ))}
        </View>
      ) : null}

      {data?.categories && data.categories.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.section}>Value by section</Text>
          {data.categories.map((row) => (
            <View key={row.name} style={{ marginTop: 10 }}>
              <View style={styles.barLabel}>
                <Text style={styles.rowTitle}>{row.name}</Text>
                <Text style={styles.copy}>{money(row.value)}</Text>
              </View>
              <View style={styles.barTrack}>
                <View
                  style={[
                    styles.barFill,
                    { width: `${Math.max(8, (row.value / maxCategory) * 100)}%` },
                  ]}
                />
              </View>
            </View>
          ))}
        </View>
      ) : null}

      {data?.recent && data.recent.length > 0 ? (
        <View style={styles.card}>
          <Text style={styles.section}>Recent stock takes</Text>
          {data.recent.map((take) => (
            <Pressable
              key={take.id}
              style={styles.row}
              onPress={() => navigation.navigate("Take", { id: take.id })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{take.reference}</Text>
                <Text style={styles.copy}>
                  {take.areaLabel} · {take.countedBy} · {take.lineCount} lines ·{" "}
                  {formatWhen(take.createdAt)}
                </Text>
              </View>
              <Badge tone={take.status === "DRAFT" ? "draft" : "filed"}>
                {take.status === "DRAFT" ? "Draft" : "Submitted"}
              </Badge>
            </Pressable>
          ))}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20, paddingBottom: 48, gap: 12 },
  title: { color: colors.ink, fontSize: 32, fontWeight: "800", marginTop: 6 },
  copy: { color: colors.muted, marginTop: 4, fontSize: 13 },
  stats: { flexDirection: "row", gap: 10 },
  active: {
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: 16,
    flexDirection: "row",
    gap: 14,
    alignItems: "center",
  },
  activeTitle: { color: colors.ink, fontSize: 20, fontWeight: "800", marginTop: 4 },
  link: { color: colors.clay, fontWeight: "800", marginTop: 8 },
  secondary: {
    borderWidth: 1,
    borderColor: "rgba(58,37,31,0.15)",
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.white,
  },
  secondaryText: { color: colors.ink, fontWeight: "800", fontSize: 16 },
  card: { backgroundColor: colors.white, borderRadius: 22, padding: 16 },
  section: { color: colors.ink, fontWeight: "800", fontSize: 18 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingTop: 12,
  },
  rowTitle: { color: colors.ink, fontWeight: "700" },
  barLabel: { flexDirection: "row", justifyContent: "space-between" },
  barTrack: {
    height: 8,
    backgroundColor: colors.sand,
    borderRadius: 999,
    marginTop: 6,
    overflow: "hidden",
  },
  barFill: { height: 8, backgroundColor: colors.clay, borderRadius: 999 },
});
