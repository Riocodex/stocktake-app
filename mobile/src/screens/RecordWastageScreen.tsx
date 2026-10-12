import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";

import { ApiError, api, money, qty } from "../api";
import { useAuth } from "../auth";
import { useScope } from "../scope";
import { colors } from "../theme";
import { OutletPicker, PrimaryButton } from "../ui";

type CatalogItem = {
  id: string;
  name: string;
  brand: string | null;
  unit: string;
  category: string;
  quantity: number;
  price: number;
};

type Reason = { id: string; label: string };

const FALLBACK_REASONS: Reason[] = [
  { id: "SPOILED", label: "Spoiled" },
  { id: "EXPIRED", label: "Expired" },
  { id: "DAMAGED", label: "Damaged" },
  { id: "PREPARATION_WASTE", label: "Preparation waste" },
  { id: "OVERPRODUCTION", label: "Overproduction" },
  { id: "STAFF_ERROR", label: "Staff error" },
  { id: "OTHER", label: "Other" },
];

export function RecordWastageScreen() {
  const { token, user } = useAuth();
  const { outletId, setOutletId, outlets, isSuper } = useScope();
  const navigation = useNavigation();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [reasons, setReasons] = useState<Reason[]>(FALLBACK_REASONS);
  const [search, setSearch] = useState("");
  const [itemId, setItemId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [reason, setReason] = useState("");
  const [note, setNote] = useState("");
  const [pending, setPending] = useState(false);

  // Outlet admins are locked to their venue; super admins must pick one before
  // we load stock. Never show a group-total quantity for wastage.
  const effectiveOutletId = isSuper ? outletId : user?.outletId ?? "";

  const loadItems = useCallback(async () => {
    if (!token || !effectiveOutletId) {
      setItems([]);
      return;
    }
    const data = await api.get<{ items: CatalogItem[] }>(
      `/api/mobile/inventory?outlet=${encodeURIComponent(effectiveOutletId)}`,
      token,
    );
    setItems(data.items);
  }, [token, effectiveOutletId]);

  useEffect(() => {
    loadItems().catch(() => setItems([]));
  }, [loadItems]);

  useEffect(() => {
    if (!token) return;
    api
      .get<{ reasons?: Reason[] }>("/api/mobile/wastage", token)
      .then((data) => {
        if (data.reasons?.length) setReasons(data.reasons);
      })
      .catch(() => undefined);
  }, [token]);

  // Clear selected product when the outlet changes so we never keep a stale qty.
  useEffect(() => {
    setItemId("");
    setQuantity("");
  }, [effectiveOutletId]);

  const selected = useMemo(
    () => items.find((item) => item.id === itemId) ?? null,
    [items, itemId],
  );

  const filtered = useMemo(() => {
    const inStock = items.filter((item) => item.quantity > 0);
    const needle = search.trim().toLowerCase();
    if (!needle) return inStock.slice(0, 40);
    return inStock
      .filter((item) => {
        const label = `${item.brand ?? ""} ${item.name}`.toLowerCase();
        return (
          label.includes(needle) || item.category.toLowerCase().includes(needle)
        );
      })
      .slice(0, 40);
  }, [items, search]);

  const qtyNum = Number(quantity);
  const estimate =
    selected && Number.isFinite(qtyNum) && qtyNum > 0
      ? Math.round(qtyNum * selected.price * 100) / 100
      : null;

  async function save() {
    if (!token) return;
    if (!effectiveOutletId) {
      Alert.alert("Choose an outlet", "Pick which venue this wastage is for.");
      return;
    }
    if (!selected) {
      Alert.alert("Choose a product", "Pick which product was wasted.");
      return;
    }
    if (!Number.isFinite(qtyNum) || qtyNum <= 0) {
      Alert.alert("Invalid quantity", "Quantity must be greater than zero.");
      return;
    }
    if (selected.quantity <= 0) {
      Alert.alert(
        "No stock",
        `Cannot record wastage. Current stock is 0 ${selected.unit}.`,
      );
      return;
    }
    if (qtyNum > selected.quantity) {
      Alert.alert(
        "Not enough stock",
        `Cannot record ${qty(qtyNum)} ${selected.unit} of wastage. Current stock is ${qty(selected.quantity)} ${selected.unit}.`,
      );
      return;
    }

    setPending(true);
    try {
      const result = await api.post<{
        ok: boolean;
        wastage: { remainingQuantity: number };
      }>("/api/mobile/wastage", token, {
        outletId: effectiveOutletId,
        itemId,
        quantity: qtyNum,
        reason,
        note: note || undefined,
      });
      const remaining = result.wastage?.remainingQuantity;
      setItems((current) =>
        current.map((item) =>
          item.id === itemId
            ? {
                ...item,
                quantity:
                  typeof remaining === "number" ? remaining : item.quantity,
              }
            : item,
        ),
      );
      Alert.alert(
        "Recorded",
        typeof remaining === "number"
          ? `Stock reduced. ${qty(remaining)} ${selected.unit} left on hand.`
          : "Stock was reduced for this wastage.",
      );
      navigation.goBack();
    } catch (caught) {
      Alert.alert(
        "Could not record",
        caught instanceof ApiError ? caught.message : "",
      );
      await loadItems().catch(() => undefined);
    } finally {
      setPending(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Record wastage</Text>
      <Text style={styles.copy}>
        On-hand figures are for one outlet only. Quantity must not exceed what
        is currently on hand.
      </Text>

      {isSuper ? (
        <OutletPicker outlets={outlets} value={outletId} onChange={setOutletId} />
      ) : null}

      {!effectiveOutletId ? (
        <Text style={styles.copy}>
          Choose an outlet above to load that venue&apos;s live stock.
        </Text>
      ) : (
        <>
          <Text style={styles.label}>Product</Text>
          <TextInput
            placeholder="Search catalogue"
            placeholderTextColor={colors.muted}
            value={search}
            onChangeText={setSearch}
            style={styles.input}
          />
          <View style={styles.list}>
            {filtered.map((item) => {
              const label = item.brand
                ? `${item.brand} ${item.name}`
                : item.name;
              const active = item.id === itemId;
              return (
                <Pressable
                  key={item.id}
                  onPress={() => setItemId(item.id)}
                  style={[styles.option, active && styles.optionActive]}
                >
                  <Text style={styles.optionTitle}>{label}</Text>
                  <Text style={styles.copy}>
                    On hand {qty(item.quantity)} {item.unit} · {money(item.price)}
                    /{item.unit}
                  </Text>
                </Pressable>
              );
            })}
            {filtered.length === 0 ? (
              <Text style={styles.copy}>
                No products currently have stock at this outlet.
              </Text>
            ) : null}
          </View>

          <Text style={styles.label}>
            Quantity{selected ? ` (${selected.unit})` : ""}
          </Text>
          <TextInput
            keyboardType="decimal-pad"
            value={quantity}
            onChangeText={setQuantity}
            style={styles.input}
          />
          {selected ? (
            <Text style={styles.copy}>
              Current stock: {qty(selected.quantity)} {selected.unit}
            </Text>
          ) : null}

          <Text style={styles.label}>Reason</Text>
          <View style={styles.reasons}>
            {reasons.map((entry) => {
              const active = reason === entry.id;
              return (
                <Pressable
                  key={entry.id}
                  onPress={() => setReason(entry.id)}
                  style={[styles.chip, active && styles.chipActive]}
                >
                  <Text
                    style={[styles.chipText, active && styles.chipTextActive]}
                  >
                    {entry.label}
                  </Text>
                </Pressable>
              );
            })}
          </View>

          <Text style={styles.label}>Note (optional)</Text>
          <TextInput
            value={note}
            onChangeText={setNote}
            placeholder="e.g. fridge failure"
            placeholderTextColor={colors.muted}
            style={[styles.input, styles.note]}
            multiline
          />

          {estimate !== null ? (
            <Text style={styles.estimate}>
              Estimated value {money(estimate)}
            </Text>
          ) : null}

          <PrimaryButton
            label={pending ? "Recording…" : "Record wastage"}
            onPress={save}
            disabled={pending || !itemId || !reason || !quantity}
          />
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20, paddingBottom: 48, gap: 10 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  copy: { color: colors.muted, fontSize: 13, lineHeight: 18 },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginTop: 8,
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(58,37,31,0.15)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
    backgroundColor: colors.white,
  },
  note: { minHeight: 72, textAlignVertical: "top" },
  list: { gap: 8, maxHeight: 220 },
  option: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  optionActive: {
    borderColor: colors.clay,
    backgroundColor: colors.creamDeep,
  },
  optionTitle: { color: colors.ink, fontWeight: "700" },
  reasons: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: "rgba(58,37,31,0.15)",
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.white,
  },
  chipActive: { backgroundColor: colors.clay, borderColor: colors.clay },
  chipText: { color: colors.ink, fontWeight: "700", fontSize: 12 },
  chipTextActive: { color: colors.white },
  estimate: { color: colors.ink, fontWeight: "700", marginTop: 4 },
});
