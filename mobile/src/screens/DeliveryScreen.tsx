import { useEffect, useMemo, useState } from "react";
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

import { ApiError, api } from "../api";
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
};

type Line = { itemId: string; quantity: string; expiryDate: string; search: string };

export function DeliveryScreen() {
  const { token } = useAuth();
  const { outletId, setOutletId, outlets, isSuper } = useScope();
  const navigation = useNavigation();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { itemId: "", quantity: "", expiryDate: "", search: "" },
  ]);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .get<{ items: CatalogItem[] }>("/api/mobile/inventory", token)
      .then((data) => setItems(data.items))
      .catch(() => undefined);
  }, [token]);

  async function save() {
    if (!token) return;
    setPending(true);
    try {
      await api.post("/api/mobile/deliveries", token, {
        outletId: isSuper ? outletId || undefined : undefined,
        note: note || undefined,
        lines: lines
          .filter((line) => line.itemId && Number(line.quantity) > 0)
          .map((line) => ({
            itemId: line.itemId,
            quantity: Number(line.quantity),
            expiryDate: line.expiryDate || undefined,
          })),
      });
      Alert.alert("Recorded", "Quantities were added to live inventory.");
      navigation.goBack();
    } catch (caught) {
      Alert.alert(
        "Could not record",
        caught instanceof ApiError ? caught.message : "",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Record a delivery</Text>
      <Text style={styles.copy}>
        When a supplier drops stock, add it here. No full count needed.
      </Text>
      {isSuper ? (
        <OutletPicker outlets={outlets} value={outletId} onChange={setOutletId} />
      ) : null}
      <TextInput
        placeholder="Note, e.g. Farsons van"
        placeholderTextColor={colors.muted}
        value={note}
        onChangeText={setNote}
        style={styles.input}
      />

      {lines.map((line, index) => (
        <LineCard
          key={index}
          line={line}
          items={items}
          onChange={(next) =>
            setLines((current) =>
              current.map((entry, entryIndex) =>
                entryIndex === index ? next : entry,
              ),
            )
          }
          onRemove={
            lines.length > 1
              ? () =>
                  setLines((current) =>
                    current.filter((_, entryIndex) => entryIndex !== index),
                  )
              : undefined
          }
        />
      ))}

      <Pressable
        onPress={() =>
          setLines((current) => [
            ...current,
            { itemId: "", quantity: "", expiryDate: "", search: "" },
          ])
        }
      >
        <Text style={styles.link}>+ Add another product</Text>
      </Pressable>

      <PrimaryButton
        label={pending ? "Saving…" : "Add to inventory"}
        onPress={save}
        disabled={pending || (isSuper && !outletId)}
      />
    </ScrollView>
  );
}

function LineCard({
  line,
  items,
  onChange,
  onRemove,
}: {
  line: Line;
  items: CatalogItem[];
  onChange: (line: Line) => void;
  onRemove?: () => void;
}) {
  const matches = useMemo(() => {
    const query = line.search.trim().toLowerCase();
    const pool = query
      ? items.filter((item) =>
          `${item.brand ?? ""} ${item.name} ${item.category}`
            .toLowerCase()
            .includes(query),
        )
      : items;
    return pool.slice(0, 12);
  }, [items, line.search]);
  const selected = items.find((item) => item.id === line.itemId);

  return (
    <View style={styles.card}>
      <Text style={styles.label}>Product</Text>
      <TextInput
        placeholder="Search the catalogue"
        placeholderTextColor={colors.muted}
        value={selected && !line.search ? `${selected.brand ? `${selected.brand} ` : ""}${selected.name}` : line.search}
        onChangeText={(search) => onChange({ ...line, search, itemId: "" })}
        style={styles.input}
      />
      {!line.itemId
        ? matches.map((item) => (
            <Pressable
              key={item.id}
              onPress={() =>
                onChange({
                  ...line,
                  itemId: item.id,
                  search: "",
                })
              }
              style={styles.match}
            >
              <Text style={styles.matchTitle}>
                {item.brand ? `${item.brand} ` : ""}
                {item.name}
              </Text>
              <Text style={styles.copy}>
                {item.category} · {item.unit}
              </Text>
            </Pressable>
          ))
        : (
            <Text style={styles.copy}>
              {selected?.category} · {selected?.unit}
            </Text>
          )}
      <View style={styles.row}>
        <TextInput
          keyboardType="decimal-pad"
          placeholder="Qty"
          placeholderTextColor={colors.muted}
          value={line.quantity}
          onChangeText={(quantity) => onChange({ ...line, quantity })}
          style={styles.input}
        />
        <TextInput
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.muted}
          value={line.expiryDate}
          onChangeText={(expiryDate) => onChange({ ...line, expiryDate })}
          style={styles.input}
        />
      </View>
      {onRemove ? (
        <Pressable onPress={onRemove}>
          <Text style={styles.remove}>Remove line</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20, paddingBottom: 40, gap: 12 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  copy: { color: colors.muted, marginTop: 4, lineHeight: 20 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 14,
    gap: 8,
  },
  label: { color: colors.muted, fontWeight: "800" },
  input: {
    backgroundColor: colors.paper,
    borderWidth: 1,
    borderColor: "rgba(58,37,31,0.12)",
    borderRadius: 12,
    paddingHorizontal: 10,
    paddingVertical: 10,
    color: colors.ink,
    flex: 1,
  },
  match: { paddingVertical: 8, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "rgba(58,37,31,0.08)" },
  matchTitle: { color: colors.ink, fontWeight: "700" },
  row: { flexDirection: "row", gap: 10 },
  link: { color: colors.clay, fontWeight: "800" },
  remove: { color: colors.danger, fontWeight: "700" },
});
