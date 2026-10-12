import { useCallback, useState } from "react";
import {
  FlatList,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, money, qty, withQuery } from "../api";
import { useAuth } from "../auth";
import { formatDay } from "../format";
import type { RootStackParamList } from "../navigation";
import { useScope } from "../scope";
import { colors } from "../theme";
import { Badge, OutletPicker, ProductThumb, StatCard } from "../ui";

type Category = { id: string; name: string };
type Item = {
  id: string;
  name: string;
  brand: string | null;
  sku: string;
  unit: string;
  category: string;
  categoryId: string;
  quantity: number;
  price: number;
  value: number;
  isLow: boolean;
  imageUrl: string | null;
  supplierPackQty: number | null;
  expiryDate: string | null;
};

export function InventoryScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { outletId, setOutletId, outlets, isSuper } = useScope();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [categories, setCategories] = useState<Category[]>([]);
  const [items, setItems] = useState<Item[]>([]);
  const [stats, setStats] = useState({ value: 0, count: 0, lowCount: 0, outOfStock: 0 });
  const [categoryId, setCategoryId] = useState("");
  const [query, setQuery] = useState("");
  const [lowOnly, setLowOnly] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const data = await api.get<{
      categories: Category[];
      items: Item[];
      stats: typeof stats;
    }>(
      withQuery("/api/mobile/inventory", {
        outlet: outletId,
        category: categoryId,
        q: query.trim(),
        filter: lowOnly ? "low" : undefined,
      }),
      token,
    );
    setCategories(data.categories);
    setItems(data.items);
    if (data.stats) setStats(data.stats);
  }, [token, outletId, categoryId, query, lowOnly]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 4 }]}>
      <View style={styles.header}>
        <Text style={styles.title}>Inventory</Text>
        <View style={styles.headerActions}>
          <Pressable onPress={() => navigation.navigate("Wastage")}>
            <Text style={styles.link}>Wastage</Text>
          </Pressable>
          <Pressable onPress={() => navigation.navigate("Delivery")}>
            <Text style={styles.link}>Delivery</Text>
          </Pressable>
          <Pressable
            style={styles.newButton}
            onPress={() => navigation.navigate("NewProduct")}
          >
            <Text style={styles.newText}>Add</Text>
          </Pressable>
        </View>
      </View>

      {isSuper ? (
        <View style={{ paddingHorizontal: 20 }}>
          <OutletPicker outlets={outlets} value={outletId} onChange={setOutletId} />
        </View>
      ) : null}

      <View style={styles.stats}>
        <StatCard label="Value" value={money(stats.value)} />
        <StatCard label="Products" value={String(stats.count)} />
        <StatCard label="Low" value={String(stats.lowCount)} />
      </View>

      <TextInput
        placeholder="Search name, SKU, brand"
        placeholderTextColor={colors.muted}
        value={query}
        onChangeText={setQuery}
        style={styles.search}
      />

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        contentContainerStyle={styles.pills}
      >
        <Pressable
          onPress={() => setLowOnly((value) => !value)}
          style={[styles.pill, lowOnly && styles.pillOn]}
        >
          <Text style={[styles.pillText, lowOnly && styles.pillTextOn]}>Low only</Text>
        </Pressable>
        <Pressable
          onPress={() => setCategoryId("")}
          style={[styles.pill, !categoryId && styles.pillOn]}
        >
          <Text style={[styles.pillText, !categoryId && styles.pillTextOn]}>All</Text>
        </Pressable>
        {categories.map((category) => (
          <Pressable
            key={category.id}
            onPress={() => setCategoryId(category.id)}
            style={[styles.pill, categoryId === category.id && styles.pillOn]}
          >
            <Text
              style={[
                styles.pillText,
                categoryId === category.id && styles.pillTextOn,
              ]}
            >
              {category.name}
            </Text>
          </Pressable>
        ))}
      </ScrollView>

      <FlatList
        data={items}
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
            onPress={() => navigation.navigate("Product", { id: item.id })}
          >
            <ProductThumb
              uri={item.imageUrl}
              name={item.brand ? `${item.brand} ${item.name}` : item.name}
            />
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>
                {item.brand ? `${item.brand} ` : ""}
                {item.name}
              </Text>
              <Text style={styles.meta}>
                {item.category} · {qty(item.quantity)} {item.unit} · {money(item.price)}
                {item.supplierPackQty ? ` · pack ${qty(item.supplierPackQty)}` : ""}
                {item.expiryDate ? ` · exp ${formatDay(item.expiryDate)}` : ""}
              </Text>
            </View>
            {item.isLow ? <Badge tone="low">Low</Badge> : null}
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
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
  },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 12 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  link: { color: colors.clay, fontWeight: "800" },
  newButton: {
    backgroundColor: colors.clay,
    borderRadius: 999,
    paddingHorizontal: 14,
    paddingVertical: 8,
  },
  newText: { color: colors.white, fontWeight: "800" },
  stats: { flexDirection: "row", gap: 8, paddingHorizontal: 20, marginTop: 12 },
  search: {
    marginHorizontal: 20,
    marginTop: 12,
    backgroundColor: colors.white,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
    color: colors.ink,
  },
  pills: { paddingHorizontal: 20, paddingVertical: 12, gap: 8 },
  pill: {
    borderWidth: 1,
    borderColor: "rgba(58,37,31,0.15)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    marginRight: 8,
    backgroundColor: colors.white,
  },
  pillOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  pillText: { color: colors.ink, fontWeight: "700", fontSize: 12 },
  pillTextOn: { color: colors.cream },
  list: { padding: 20, paddingTop: 0, gap: 10, paddingBottom: 40 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 12,
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
  },
  name: { color: colors.ink, fontWeight: "800" },
  meta: { color: colors.muted, marginTop: 4, fontSize: 12 },
});
