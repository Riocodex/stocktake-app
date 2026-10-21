import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import type { RouteProp } from "@react-navigation/native";

import { ApiError, api, money, withQuery } from "../api";
import { useAuth } from "../auth";
import type { RootStackParamList } from "../navigation";
import { useScope } from "../scope";
import { colors } from "../theme";
import { Eyebrow, OutletPicker, PrimaryButton } from "../ui";

type Dish = {
  id: string;
  name: string;
  category: string;
  description: string | null;
  sellingPrice: number;
  isActive: boolean;
  recipeStatus: string;
};

type CostLine = {
  ingredientId: string;
  itemName: string;
  recipeQuantity: number;
  recipeUnit: string;
  stockUnit: string;
  quantityInStockUnit: number | null;
  unitPrice: number | null;
  ingredientCost: number | null;
  issue: string | null;
};

type Costing = {
  status: string;
  statusLabel: string;
  dishCost: number | null;
  foodCostPercent: number | null;
  grossProfit: number | null;
  grossMarginPercent: number | null;
  sellingPrice: number;
  priceScope?: string;
  ingredients: CostLine[];
};

type AlertInfo = {
  alertLevel: string;
  alertLabel: string;
  thresholds: { warningPercent: number; criticalPercent: number };
};

type AvailabilityLine = {
  ingredientId: string;
  itemName: string;
  recipeQuantity: number;
  recipeUnit: string;
  stockUnit: string;
  quantityInStock: number;
  portionsPossible: number | null;
  isLimiting: boolean;
  issue: string | null;
  stockRecordExists: boolean;
};

type Availability = {
  status: string;
  statusLabel: string;
  portionsPossible: number | null;
  limitingIngredientName: string | null;
  summary: string;
  outletName: string;
  ingredients: AvailabilityLine[];
  missingIngredients: {
    itemName: string;
    availableDisplay: string;
    requiredDisplay: string;
  }[];
};

function pct(value: number | null | undefined) {
  if (value === null || value === undefined) return "—";
  return `${value.toFixed(1)}%`;
}

export function DishDetailScreen() {
  const { token } = useAuth();
  const { outletId, setOutletId, outlets, isSuper } = useScope();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute<RouteProp<RootStackParamList, "Dish">>();
  const [dish, setDish] = useState<Dish | null>(null);
  const [costing, setCosting] = useState<Costing | null>(null);
  const [alert, setAlert] = useState<AlertInfo | null>(null);
  const [availability, setAvailability] = useState<Availability | null>(null);
  const [canManage, setCanManage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const dishData = await api.get<{
        dish: Dish;
        costing: Costing;
        alert: AlertInfo | null;
        availability: Availability | null;
        canManage: boolean;
      }>(
        withQuery(`/api/mobile/dishes/${route.params.id}`, {
          outlet: outletId || undefined,
        }),
        token,
      );
      setDish(dishData.dish);
      setCosting(dishData.costing);
      setAlert(dishData.alert);
      setAvailability(dishData.availability);
      setCanManage(dishData.canManage);
    } catch {
      setDish(null);
      setCosting(null);
      setAlert(null);
      setAvailability(null);
    } finally {
      setLoading(false);
    }
  }, [token, route.params.id, outletId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function toggleActive() {
    if (!token || !dish) return;
    setPending(true);
    try {
      const data = await api.patch<{ dish: Dish }>(
        `/api/mobile/dishes/${dish.id}`,
        token,
        { isActive: !dish.isActive },
      );
      setDish(data.dish);
    } catch (error) {
      Alert.alert(
        "Could not update",
        error instanceof ApiError ? error.message : "Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.clay} />
      </View>
    );
  }

  if (!dish) {
    return (
      <View style={styles.center}>
        <Text style={styles.copy}>Dish not found.</Text>
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
    >
      <Eyebrow>{dish.category}</Eyebrow>
      <Text style={styles.title}>{dish.name}</Text>
      <Text style={styles.price}>{money(dish.sellingPrice)}</Text>
      <Text style={styles.copy}>
        {dish.isActive ? "Active in catalogue" : "Inactive"} · group-wide
        selling price
      </Text>
      {dish.description ? (
        <Text style={[styles.copy, { marginTop: 12 }]}>{dish.description}</Text>
      ) : null}

      {isSuper ? (
        <View style={{ marginTop: 14 }}>
          <OutletPicker
            outlets={outlets}
            value={outletId}
            onChange={setOutletId}
          />
        </View>
      ) : null}

      <View style={styles.card}>
        <Text style={styles.label}>
          Availability
          {availability ? ` · ${availability.outletName}` : ""}
        </Text>
        <Text style={styles.value}>
          {availability?.statusLabel ?? "Select an outlet"}
          {availability?.portionsPossible !== null &&
          availability?.portionsPossible !== undefined
            ? ` · ${availability.portionsPossible} portions`
            : ""}
        </Text>
        <Text style={styles.copy}>
          {availability?.summary ??
            "Availability uses live stock at the selected outlet."}
        </Text>
        {availability?.limitingIngredientName ? (
          <Text style={[styles.copy, { marginTop: 6 }]}>
            Limited by {availability.limitingIngredientName}
          </Text>
        ) : null}
        {(availability?.missingIngredients ?? []).map((row) => (
          <Text key={row.itemName} style={[styles.copy, { marginTop: 4 }]}>
            Missing: {row.itemName} — {row.availableDisplay} available,{" "}
            {row.requiredDisplay} required
          </Text>
        ))}
        {(availability?.ingredients ?? []).map((line) => (
          <View key={line.ingredientId} style={styles.line}>
            <Text style={styles.lineTitle}>
              {line.itemName}
              {line.isLimiting ? " · limiting" : ""}
            </Text>
            <Text style={styles.copy}>
              Need {line.recipeQuantity} {line.recipeUnit} · In stock{" "}
              {line.quantityInStock} {line.stockUnit}
              {!line.stockRecordExists ? " (no record)" : ""}
            </Text>
            <Text style={styles.lineCost}>
              {line.portionsPossible !== null
                ? `${line.portionsPossible} portions`
                : line.issue ?? "—"}
            </Text>
          </View>
        ))}
      </View>

      <View style={styles.card}>
        <Text style={styles.label}>Dish cost (group-wide)</Text>
        <Text style={styles.value}>
          {alert ? `${alert.alertLabel} · ` : ""}
          {costing?.statusLabel ?? "—"}
        </Text>
        <Text style={styles.copy}>
          Same cost at every outlet. Alerts never change selling price.
          {alert
            ? ` Warn ${alert.thresholds.warningPercent}% / critical ${alert.thresholds.criticalPercent}%.`
            : ""}
        </Text>
        <View style={styles.metrics}>
          <View style={styles.metric}>
            <Text style={styles.copy}>Dish cost</Text>
            <Text style={styles.metricValue}>
              {costing?.dishCost !== null && costing?.dishCost !== undefined
                ? money(costing.dishCost)
                : "—"}
            </Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.copy}>Food cost</Text>
            <Text style={styles.metricValue}>
              {pct(costing?.foodCostPercent)}
            </Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.copy}>Gross profit</Text>
            <Text style={styles.metricValue}>
              {costing?.grossProfit !== null &&
              costing?.grossProfit !== undefined
                ? money(costing.grossProfit)
                : "—"}
            </Text>
          </View>
          <View style={styles.metric}>
            <Text style={styles.copy}>Margin</Text>
            <Text style={styles.metricValue}>
              {pct(costing?.grossMarginPercent)}
            </Text>
          </View>
        </View>

        {(costing?.ingredients ?? []).map((line) => (
          <View key={line.ingredientId} style={styles.line}>
            <Text style={styles.lineTitle}>{line.itemName}</Text>
            <Text style={styles.copy}>
              {line.recipeQuantity} {line.recipeUnit}
              {line.unitPrice !== null
                ? ` · ${money(line.unitPrice)}/${line.stockUnit}`
                : ""}
            </Text>
            <Text style={styles.lineCost}>
              {line.ingredientCost !== null
                ? money(line.ingredientCost)
                : line.issue ?? "—"}
            </Text>
          </View>
        ))}
      </View>

      <Pressable
        style={{ marginTop: 14 }}
        onPress={() => navigation.navigate("DishRecipe", { id: dish.id })}
      >
        <Text style={styles.link}>
          {canManage ? "Manage recipe →" : "View recipe →"}
        </Text>
      </Pressable>

      {canManage ? (
        <View style={{ gap: 10, marginTop: 16 }}>
          <PrimaryButton
            label="Edit dish"
            onPress={() => navigation.navigate("EditDish", { id: dish.id })}
          />
          <Pressable
            style={styles.secondary}
            onPress={toggleActive}
            disabled={pending}
          >
            <Text style={styles.secondaryText}>
              {pending
                ? "Updating…"
                : dish.isActive
                  ? "Deactivate"
                  : "Activate"}
            </Text>
          </Pressable>
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  center: {
    flex: 1,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: colors.cream,
  },
  title: { color: colors.ink, fontSize: 30, fontWeight: "800", marginTop: 4 },
  price: { color: colors.ink, fontSize: 22, fontWeight: "800", marginTop: 8 },
  copy: { color: colors.muted, lineHeight: 20 },
  card: {
    marginTop: 20,
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 16,
  },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  value: { color: colors.ink, fontWeight: "700", marginTop: 4 },
  metrics: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 12,
    marginTop: 14,
  },
  metric: { width: "45%" },
  metricValue: {
    color: colors.ink,
    fontWeight: "800",
    fontSize: 16,
    marginTop: 2,
  },
  line: {
    marginTop: 12,
    paddingTop: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(58,37,31,0.12)",
  },
  lineTitle: { color: colors.ink, fontWeight: "700" },
  lineCost: { color: colors.ink, fontWeight: "800", marginTop: 2 },
  link: { color: colors.clay, fontWeight: "800" },
  secondary: {
    alignItems: "center",
    paddingVertical: 12,
    borderRadius: 16,
    backgroundColor: colors.white,
  },
  secondaryText: { color: colors.ink, fontWeight: "700" },
});
