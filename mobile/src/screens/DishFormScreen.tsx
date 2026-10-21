import { useEffect, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation, useRoute } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import type { RootStackParamList } from "../navigation";
import { colors } from "../theme";
import { PrimaryButton } from "../ui";

const FALLBACK_CATEGORIES = [
  "Smoothies",
  "Juices",
  "Coffee",
  "Cocktails",
  "Soft drinks",
  "Starters",
  "Mains",
  "Burgers",
  "Pasta",
  "Salads",
  "Sides",
  "Desserts",
  "Breakfast",
  "Other",
];

export function NewDishScreen() {
  return <DishForm mode="create" />;
}

export function EditDishScreen() {
  return <DishForm mode="edit" />;
}

function DishForm({ mode }: { mode: "create" | "edit" }) {
  const { token } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const route = useRoute();
  const dishId =
    mode === "edit"
      ? (route.params as { id?: string } | undefined)?.id
      : undefined;

  const [categories, setCategories] = useState<string[]>(FALLBACK_CATEGORIES);
  const [name, setName] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [sellingPrice, setSellingPrice] = useState("");
  const [isActive, setIsActive] = useState(true);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .get<{ categories: string[] }>("/api/mobile/dishes", token)
      .then((data) => {
        if (data.categories?.length) setCategories(data.categories);
      })
      .catch(() => undefined);

    if (mode === "edit" && dishId) {
      api
        .get<{
          dish: {
            name: string;
            category: string;
            description: string | null;
            sellingPrice: number;
            isActive: boolean;
          };
        }>(`/api/mobile/dishes/${dishId}`, token)
        .then((data) => {
          setName(data.dish.name);
          setCategory(data.dish.category);
          setDescription(data.dish.description ?? "");
          setSellingPrice(String(data.dish.sellingPrice));
          setIsActive(data.dish.isActive);
        })
        .catch(() => undefined);
    }
  }, [token, mode, dishId]);

  async function submit() {
    if (!token) return;
    const price = Number(sellingPrice);
    if (!name.trim()) {
      Alert.alert("Name required", "Give the dish a name.");
      return;
    }
    if (!category) {
      Alert.alert("Category required", "Choose a dish category.");
      return;
    }
    if (!Number.isFinite(price) || price < 0) {
      Alert.alert("Invalid price", "Selling price must be zero or more.");
      return;
    }

    setPending(true);
    try {
      if (mode === "create") {
        const data = await api.post<{ dish: { id: string } }>(
          "/api/mobile/dishes",
          token,
          {
            name: name.trim(),
            category,
            description: description.trim() || null,
            sellingPrice: price,
            isActive,
          },
        );
        navigation.replace("Dish", { id: data.dish.id });
      } else if (dishId) {
        await api.patch(`/api/mobile/dishes/${dishId}`, token, {
          name: name.trim(),
          category,
          description: description.trim() || null,
          sellingPrice: price,
          isActive,
        });
        navigation.navigate("Dish", { id: dishId });
      }
    } catch (error) {
      Alert.alert(
        "Could not save",
        error instanceof ApiError ? error.message : "Try again.",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={{ padding: 20, paddingBottom: 48 }}
      keyboardShouldPersistTaps="handled"
    >
      <Text style={styles.label}>Name</Text>
      <TextInput
        value={name}
        onChangeText={setName}
        placeholder="e.g. Strawberry Smoothie"
        placeholderTextColor={colors.muted}
        style={styles.input}
      />

      <Text style={styles.label}>Category</Text>
      <View style={styles.chips}>
        {categories.map((entry) => (
          <Pressable
            key={entry}
            onPress={() => setCategory(entry)}
            style={[styles.chip, category === entry && styles.chipOn]}
          >
            <Text
              style={[styles.chipText, category === entry && styles.chipTextOn]}
            >
              {entry}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Selling price (€)</Text>
      <TextInput
        value={sellingPrice}
        onChangeText={setSellingPrice}
        keyboardType="decimal-pad"
        placeholder="0.00"
        placeholderTextColor={colors.muted}
        style={styles.input}
      />

      <Text style={styles.label}>Description (optional)</Text>
      <TextInput
        value={description}
        onChangeText={setDescription}
        placeholder="Short menu description"
        placeholderTextColor={colors.muted}
        multiline
        style={[styles.input, { minHeight: 80, textAlignVertical: "top" }]}
      />

      <View style={styles.switchRow}>
        <Text style={styles.switchLabel}>Active in catalogue</Text>
        <Switch
          value={isActive}
          onValueChange={setIsActive}
          trackColor={{ true: colors.clay }}
        />
      </View>
      <Text style={styles.hint}>
        Active is not the same as stock availability.
      </Text>

      <PrimaryButton
        label={
          pending
            ? "Saving…"
            : mode === "create"
              ? "Create dish"
              : "Save changes"
        }
        onPress={submit}
        disabled={pending}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
    marginTop: 16,
    marginBottom: 8,
  },
  input: {
    backgroundColor: colors.white,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.ink,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.white,
  },
  chipOn: { backgroundColor: colors.clay },
  chipText: { color: colors.ink, fontWeight: "600", fontSize: 13 },
  chipTextOn: { color: "#fff" },
  switchRow: {
    marginTop: 20,
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
  },
  switchLabel: { color: colors.ink, fontWeight: "700" },
  hint: { color: colors.muted, fontSize: 12, marginTop: 6, marginBottom: 20 },
});
