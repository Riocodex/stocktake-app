import { useCallback, useState } from "react";
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
import { useFocusEffect, useRoute } from "@react-navigation/native";
import type { RouteProp } from "@react-navigation/native";

import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import type { RootStackParamList } from "../navigation";
import { colors } from "../theme";
import { Eyebrow, PrimaryButton } from "../ui";

const UNITS = [
  "unit",
  "bottle",
  "can",
  "carton",
  "case",
  "keg",
  "kg",
  "g",
  "litre",
  "ml",
  "pack",
  "punnet",
  "tray",
  "box",
  "bag",
  "tin",
  "tub",
  "loaf",
  "slice",
  "block",
];

type Ingredient = {
  id: string;
  quantity: number;
  unit: string;
  quantityInStockUnit: number | null;
  stockUnit: string;
  item: { id: string; name: string; isActive: boolean };
};

type CatalogueItem = {
  id: string;
  name: string;
  unit: string;
  category: string;
};

export function DishRecipeScreen() {
  const { token } = useAuth();
  const route = useRoute<RouteProp<RootStackParamList, "DishRecipe">>();
  const dishId = route.params.id;

  const [ingredients, setIngredients] = useState<Ingredient[]>([]);
  const [catalogue, setCatalogue] = useState<CatalogueItem[]>([]);
  const [canEdit, setCanEdit] = useState(false);
  const [loading, setLoading] = useState(true);
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [unit, setUnit] = useState("g");
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api.get<{
        ingredients: Ingredient[];
        catalogue: CatalogueItem[];
        canEdit: boolean;
      }>(`/api/mobile/dishes/${dishId}/ingredients`, token);
      setIngredients(data.ingredients);
      setCatalogue(data.catalogue);
      setCanEdit(data.canEdit);
    } catch {
      setIngredients([]);
    } finally {
      setLoading(false);
    }
  }, [token, dishId]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const used = new Set(ingredients.map((line) => line.item.id));
  const available = catalogue.filter((item) => !used.has(item.id));

  async function addIngredient() {
    if (!token) return;
    const qty = Number(quantity);
    if (!itemId) {
      Alert.alert("Choose an item");
      return;
    }
    if (!Number.isFinite(qty) || qty <= 0) {
      Alert.alert("Invalid quantity", "Quantity must be greater than zero.");
      return;
    }
    setPending(true);
    try {
      await api.post(`/api/mobile/dishes/${dishId}/ingredients`, token, {
        itemId,
        quantity: qty,
        unit,
      });
      setItemId("");
      setQuantity("");
      await load();
    } catch (error) {
      Alert.alert(
        "Could not add",
        error instanceof ApiError ? error.message : "Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  async function saveLine(line: Ingredient, nextQty: string, nextUnit: string) {
    if (!token) return;
    const qty = Number(nextQty);
    if (!Number.isFinite(qty) || qty <= 0) {
      Alert.alert("Invalid quantity", "Quantity must be greater than zero.");
      return;
    }
    try {
      await api.patch(
        `/api/mobile/dishes/${dishId}/ingredients/${line.id}`,
        token,
        { quantity: qty, unit: nextUnit },
      );
      await load();
    } catch (error) {
      Alert.alert(
        "Could not update",
        error instanceof ApiError ? error.message : "Try again.",
      );
    }
  }

  async function removeLine(line: Ingredient) {
    if (!token) return;
    Alert.alert("Remove ingredient", `Remove ${line.item.name}?`, [
      { text: "Cancel", style: "cancel" },
      {
        text: "Remove",
        style: "destructive",
        onPress: async () => {
          try {
            await api.del(
              `/api/mobile/dishes/${dishId}/ingredients/${line.id}`,
              token,
            );
            await load();
          } catch (error) {
            Alert.alert(
              "Could not remove",
              error instanceof ApiError ? error.message : "Try again.",
            );
          }
        },
      },
    ]);
  }

  if (loading) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.clay} />
      </View>
    );
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      <Eyebrow>One portion</Eyebrow>
      <Text style={styles.title}>Recipe</Text>
      <Text style={styles.copy}>
        Physical items only. Edits do not change stock.
      </Text>

      {ingredients.length === 0 ? (
        <Text style={[styles.copy, { marginTop: 20 }]}>No ingredients yet.</Text>
      ) : (
        ingredients.map((line) => (
          <IngredientEditor
            key={line.id}
            line={line}
            canEdit={canEdit}
            onSave={saveLine}
            onRemove={removeLine}
          />
        ))
      )}

      {canEdit ? (
        <View style={styles.addCard}>
          <Text style={styles.label}>Add ingredient</Text>
          <ScrollView horizontal showsHorizontalScrollIndicator={false}>
            <View style={styles.chips}>
              {available.map((item) => (
                <Pressable
                  key={item.id}
                  onPress={() => {
                    setItemId(item.id);
                    setUnit(item.unit === "kg" ? "g" : item.unit === "litre" ? "ml" : item.unit);
                  }}
                  style={[styles.chip, itemId === item.id && styles.chipOn]}
                >
                  <Text
                    style={[
                      styles.chipText,
                      itemId === item.id && styles.chipTextOn,
                    ]}
                  >
                    {item.name}
                  </Text>
                </Pressable>
              ))}
            </View>
          </ScrollView>
          {available.length === 0 ? (
            <Text style={styles.copy}>All catalogue items are already listed.</Text>
          ) : null}

          <Text style={[styles.label, { marginTop: 12 }]}>Quantity</Text>
          <TextInput
            value={quantity}
            onChangeText={setQuantity}
            keyboardType="decimal-pad"
            placeholder="e.g. 100"
            placeholderTextColor={colors.muted}
            style={styles.input}
          />

          <Text style={styles.label}>Unit</Text>
          <View style={styles.chips}>
            {UNITS.map((entry) => (
              <Pressable
                key={entry}
                onPress={() => setUnit(entry)}
                style={[styles.chip, unit === entry && styles.chipOn]}
              >
                <Text
                  style={[styles.chipText, unit === entry && styles.chipTextOn]}
                >
                  {entry}
                </Text>
              </Pressable>
            ))}
          </View>

          <PrimaryButton
            label={pending ? "Adding…" : "Add ingredient"}
            onPress={addIngredient}
            disabled={pending}
          />
        </View>
      ) : (
        <Text style={[styles.copy, { marginTop: 16 }]}>
          Only super admins can edit recipes.
        </Text>
      )}
    </ScrollView>
  );
}

function IngredientEditor({
  line,
  canEdit,
  onSave,
  onRemove,
}: {
  line: Ingredient;
  canEdit: boolean;
  onSave: (line: Ingredient, qty: string, unit: string) => Promise<void>;
  onRemove: (line: Ingredient) => void;
}) {
  const [qty, setQty] = useState(String(line.quantity));
  const [unit, setUnit] = useState(line.unit);

  return (
    <View style={styles.card}>
      <Text style={styles.rowTitle}>
        {line.item.name}
        {!line.item.isActive ? " (inactive)" : ""}
      </Text>
      {!canEdit ? (
        <Text style={styles.copy}>
          {line.quantity} {line.unit}
          {line.quantityInStockUnit !== null && line.unit !== line.stockUnit
            ? ` · ${line.quantityInStockUnit} ${line.stockUnit}`
            : ""}
        </Text>
      ) : (
        <>
          <View style={styles.row}>
            <TextInput
              value={qty}
              onChangeText={setQty}
              keyboardType="decimal-pad"
              style={[styles.input, { flex: 1 }]}
            />
            <Pressable
              onPress={() => {
                const idx = UNITS.indexOf(unit);
                setUnit(UNITS[(idx + 1) % UNITS.length]);
              }}
              style={styles.unitBtn}
            >
              <Text style={styles.unitBtnText}>{unit}</Text>
            </Pressable>
          </View>
          <View style={styles.row}>
            <Pressable
              style={styles.smallBtn}
              onPress={() => onSave(line, qty, unit)}
            >
              <Text style={styles.smallBtnText}>Save</Text>
            </Pressable>
            <Pressable style={styles.smallBtn} onPress={() => onRemove(line)}>
              <Text style={[styles.smallBtnText, { color: "#b91c1c" }]}>
                Remove
              </Text>
            </Pressable>
          </View>
        </>
      )}
    </View>
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
  title: { color: colors.ink, fontSize: 28, fontWeight: "800", marginTop: 4 },
  copy: { color: colors.muted, lineHeight: 20, marginTop: 4 },
  card: {
    marginTop: 12,
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 14,
  },
  addCard: {
    marginTop: 20,
    backgroundColor: colors.white,
    borderRadius: 18,
    padding: 14,
    gap: 4,
  },
  rowTitle: { color: colors.ink, fontWeight: "800", fontSize: 16 },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: 8,
    marginBottom: 6,
  },
  input: {
    backgroundColor: colors.cream,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
    color: colors.ink,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 14,
    paddingHorizontal: 10,
    paddingVertical: 7,
    backgroundColor: colors.cream,
  },
  chipOn: { backgroundColor: colors.clay },
  chipText: { color: colors.ink, fontWeight: "600", fontSize: 12 },
  chipTextOn: { color: "#fff" },
  row: { flexDirection: "row", gap: 8, marginTop: 10, alignItems: "center" },
  unitBtn: {
    backgroundColor: colors.cream,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 10,
  },
  unitBtnText: { color: colors.ink, fontWeight: "700" },
  smallBtn: {
    backgroundColor: colors.cream,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  smallBtnText: { color: colors.ink, fontWeight: "700" },
});
