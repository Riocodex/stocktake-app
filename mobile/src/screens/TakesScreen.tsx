import { useCallback, useMemo, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, money, withQuery } from "../api";
import { useAuth } from "../auth";
import { formatWhen } from "../format";
import type { RootStackParamList } from "../navigation";
import { useScope } from "../scope";
import { colors } from "../theme";
import { Badge, OutletPicker, ProgressRing } from "../ui";

type TakeRow = {
  id: string;
  reference: string;
  areaLabel: string;
  status: string;
  counted: number;
  total: number;
  value: number;
  countedBy: string;
  outletName: string;
  createdAt: string;
};

export function TakesScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { outletId, setOutletId, outlets, isSuper } = useScope();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [rows, setRows] = useState<TakeRow[]>([]);
  const [filter, setFilter] = useState<"ALL" | "DRAFT" | "SUBMITTED">("ALL");
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const data = await api.get<{ stockTakes: TakeRow[] }>(
      withQuery("/api/mobile/stock-takes", { outlet: outletId }),
      token,
    );
    setRows(data.stockTakes);
  }, [token, outletId]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  const drafts = rows.filter((row) => row.status === "DRAFT");
  const visible = useMemo(() => {
    if (filter === "ALL") return rows;
    return rows.filter((row) => row.status === filter);
  }, [rows, filter]);

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 4 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Stock takes</Text>
        <Pressable
          style={styles.newButton}
          onPress={() => navigation.navigate("NewTake")}
        >
          <Text style={styles.newText}>New</Text>
        </Pressable>
      </View>
      {isSuper ? (
        <View style={{ paddingHorizontal: 20 }}>
          <OutletPicker outlets={outlets} value={outletId} onChange={setOutletId} />
        </View>
      ) : null}

      {drafts.length > 0 ? (
        <FlatList
          horizontal
          data={drafts}
          keyExtractor={(item) => item.id}
          showsHorizontalScrollIndicator={false}
          contentContainerStyle={styles.activeList}
          renderItem={({ item }) => (
            <Pressable
              style={styles.active}
              onPress={() => navigation.navigate("Take", { id: item.id })}
            >
              <ProgressRing counted={item.counted} total={item.total} size={56} />
              <Text style={styles.ref}>{item.reference}</Text>
              <Text style={styles.meta}>
                {item.areaLabel} · {item.counted}/{item.total}
              </Text>
              <Text style={styles.link}>Continue</Text>
            </Pressable>
          )}
        />
      ) : null}

      <View style={styles.tabs}>
        {(["ALL", "DRAFT", "SUBMITTED"] as const).map((key) => (
          <Pressable
            key={key}
            onPress={() => setFilter(key)}
            style={[styles.tab, filter === key && styles.tabOn]}
          >
            <Text style={[styles.tabText, filter === key && styles.tabTextOn]}>
              {key === "ALL" ? "All" : key === "DRAFT" ? "Drafts" : "Submitted"}
            </Text>
          </Pressable>
        ))}
      </View>

      <FlatList
        data={visible}
        keyExtractor={(item) => item.id}
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
        contentContainerStyle={styles.list}
        renderItem={({ item }) => (
          <Pressable
            style={styles.card}
            onPress={() => navigation.navigate("Take", { id: item.id })}
          >
            <View style={styles.row}>
              <Text style={styles.ref}>{item.reference}</Text>
              <Badge tone={item.status === "DRAFT" ? "draft" : "filed"}>
                {item.status === "DRAFT" ? "Draft" : "Submitted"}
              </Badge>
            </View>
            <Text style={styles.meta}>
              {item.areaLabel} · {item.outletName} · counted by {item.countedBy}
            </Text>
            <Text style={styles.meta}>
              {item.counted}/{item.total} · {money(item.value)} · {formatWhen(item.createdAt)}
            </Text>
          </Pressable>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  header: {
    paddingHorizontal: 20,
    paddingBottom: 8,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  newButton: {
    backgroundColor: colors.clay,
    borderRadius: 999,
    paddingHorizontal: 16,
    paddingVertical: 8,
  },
  newText: { color: colors.white, fontWeight: "800" },
  activeList: { paddingHorizontal: 20, paddingVertical: 8, gap: 10 },
  active: {
    width: 170,
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 14,
    marginRight: 10,
  },
  link: { color: colors.clay, fontWeight: "800", marginTop: 8 },
  tabs: { flexDirection: "row", gap: 8, paddingHorizontal: 20, paddingVertical: 8 },
  tab: {
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    backgroundColor: colors.white,
  },
  tabOn: { backgroundColor: colors.ink },
  tabText: { color: colors.ink, fontWeight: "700", fontSize: 12 },
  tabTextOn: { color: colors.cream },
  list: { padding: 20, paddingTop: 4, gap: 10, paddingBottom: 40 },
  card: { backgroundColor: colors.white, borderRadius: 20, padding: 16 },
  row: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  ref: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  meta: { color: colors.muted, marginTop: 6, fontSize: 13 },
});
