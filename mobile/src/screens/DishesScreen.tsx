import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { api, money, withQuery } from "../api";
import { useAuth } from "../auth";
import type { RootStackParamList } from "../navigation";
import { useScope } from "../scope";
import { colors } from "../theme";
import { Eyebrow, OutletPicker } from "../ui";

type DishRow = {
  id: string;
  name: string;
  category: string;
  sellingPrice: number;
  isActive: boolean;
  costing: {
    status: string;
    statusLabel: string;
    dishCost: number | null;
    foodCostPercent: number | null;
    grossMarginPercent: number | null;
  } | null;
  availability: {
    status: string;
    statusLabel: string;
    portionsPossible: number | null;
    limitingIngredientName: string | null;
    summary: string;
    outletName: string;
  } | null;
};

function pct(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(1)}%`;
}

export function DishesScreen() {
  const insets = useSafeAreaInsets();
  const { token, user } = useAuth();
  const { outletId, setOutletId, outlets, isSuper } = useScope();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [dishes, setDishes] = useState<DishRow[]>([]);
  const [canManage, setCanManage] = useState(false);
  const [outletName, setOutletName] = useState<string | null>(null);
  const [query, setQuery] = useState("");
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api.get<{
        dishes: DishRow[];
        canManage: boolean;
        availabilityOutletName: string | null;
      }>(
        withQuery("/api/mobile/dishes", {
          active: "all",
          outlet: outletId || undefined,
        }),
        token,
      );
      setDishes(data.dishes);
      setCanManage(data.canManage);
      setOutletName(data.availabilityOutletName);
    } catch {
      setDishes([]);
      setOutletName(null);
    } finally {
      setLoading(false);
    }
  }, [token, outletId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const filtered = dishes.filter((dish) => {
    if (!query.trim()) return true;
    const q = query.trim().toLowerCase();
    return (
      dish.name.toLowerCase().includes(q) ||
      dish.category.toLowerCase().includes(q)
    );
  });

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 12 }]}>
      <View style={styles.header}>
        <View>
          <Eyebrow>Products & Dishes</Eyebrow>
          <Text style={styles.title}>Dishes</Text>
          <Text style={styles.copy}>
            Group-wide costs · availability
            {outletName ? ` at ${outletName}` : " (pick outlet)"}
          </Text>
        </View>
        <View style={{ flexDirection: "row", gap: 8 }}>
          <Pressable
            style={styles.secondaryButton}
            onPress={() => navigation.navigate("CostAlerts")}
          >
            <Text style={styles.secondaryText}>Alerts</Text>
          </Pressable>
          {canManage || user?.role === "SUPER_ADMIN" ? (
            <Pressable
              style={styles.newButton}
              onPress={() => navigation.navigate("NewDish")}
            >
              <Text style={styles.newText}>Add</Text>
            </Pressable>
          ) : null}
        </View>
      </View>

      {isSuper ? (
        <View style={{ marginTop: 12 }}>
          <OutletPicker
            outlets={outlets}
            value={outletId}
            onChange={setOutletId}
          />
        </View>
      ) : null}

      <TextInput
        placeholder="Search dishes"
        placeholderTextColor={colors.muted}
        value={query}
        onChangeText={setQuery}
        style={styles.search}
      />

      {loading ? (
        <ActivityIndicator color={colors.clay} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: 40 }}
          ListEmptyComponent={
            <Text style={styles.empty}>No dishes yet.</Text>
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.row}
              onPress={() => navigation.navigate("Dish", { id: item.id })}
            >
              <View style={{ flex: 1 }}>
                <Text style={styles.rowTitle}>{item.name}</Text>
                <Text style={styles.copy}>
                  {item.category}
                  {item.isActive ? "" : " · Inactive"}
                  {" · "}
                  {item.availability?.statusLabel ?? "No availability"}
                  {item.availability?.portionsPossible !== null &&
                  item.availability?.portionsPossible !== undefined
                    ? ` · ${item.availability.portionsPossible} portions`
                    : ""}
                </Text>
                <Text style={styles.copy}>
                  Sell {money(item.sellingPrice)}
                  {item.costing?.dishCost !== null &&
                  item.costing?.dishCost !== undefined
                    ? ` · Cost ${money(item.costing.dishCost)}`
                    : ""}
                  {item.costing?.foodCostPercent !== null &&
                  item.costing?.foodCostPercent !== undefined
                    ? ` · FC ${pct(item.costing.foodCostPercent)}`
                    : ""}
                </Text>
                {item.availability?.limitingIngredientName ? (
                  <Text style={styles.copy}>
                    Limited by {item.availability.limitingIngredientName}
                  </Text>
                ) : null}
              </View>
            </Pressable>
          )}
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, paddingHorizontal: 20 },
  header: {
    flexDirection: "row",
    alignItems: "flex-end",
    justifyContent: "space-between",
  },
  title: { color: colors.ink, fontSize: 32, fontWeight: "800", marginTop: 4 },
  newButton: {
    backgroundColor: colors.clay,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  newText: { color: "#fff", fontWeight: "700" },
  secondaryButton: {
    backgroundColor: colors.white,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 10,
  },
  secondaryText: { color: colors.ink, fontWeight: "700" },
  search: {
    marginTop: 14,
    backgroundColor: colors.white,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.ink,
  },
  row: {
    marginTop: 10,
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 14,
  },
  rowTitle: { color: colors.ink, fontSize: 17, fontWeight: "800" },
  copy: { color: colors.muted, marginTop: 2, fontSize: 13 },
  empty: { color: colors.muted, marginTop: 28, textAlign: "center" },
});
