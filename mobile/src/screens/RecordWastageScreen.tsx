import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Alert,
  Image,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useNavigation } from "@react-navigation/native";
import * as ImagePicker from "expo-image-picker";

import { ApiError, api, money, qty } from "../api";
import { useAuth } from "../auth";
import { useScope } from "../scope";
import { colors } from "../theme";
import { OutletPicker, PrimaryButton } from "../ui";

type PhotoSuggestion = {
  itemId: string;
  name: string;
  unit: string;
  detectedQuantity: number;
  quantity: number;
  onHand: number;
  confidence: number;
  label: string;
  canWaste: boolean;
};

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
  const [photoBusy, setPhotoBusy] = useState(false);
  const [photoPreview, setPhotoPreview] = useState<string | null>(null);
  const [photoUrl, setPhotoUrl] = useState<string | null>(null);
  const [photoSuggestions, setPhotoSuggestions] = useState<PhotoSuggestion[]>(
    [],
  );
  const [photoSelected, setPhotoSelected] = useState<Record<string, boolean>>(
    {},
  );
  const [photoQty, setPhotoQty] = useState<Record<string, string>>({});
  const [photoReason, setPhotoReason] = useState("");
  const [photoNote, setPhotoNote] = useState("");
  const [photoSimulated, setPhotoSimulated] = useState(false);

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
    setPhotoSuggestions([]);
    setPhotoPreview(null);
    setPhotoUrl(null);
  }, [effectiveOutletId]);

  async function pickPhoto(fromCamera: boolean) {
    if (!token || !effectiveOutletId) {
      Alert.alert("Choose an outlet", "Pick which venue this photo is for.");
      return;
    }
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        "Allow camera or photos to identify wasted stock.",
      );
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({
          quality: 0.7,
          mediaTypes: ["images"],
        });
    if (result.canceled || !result.assets[0]) return;

    setPhotoBusy(true);
    try {
      const asset = result.assets[0];
      setPhotoPreview(asset.uri);
      const form = new FormData();
      form.append("outletId", effectiveOutletId);
      form.append("photo", {
        uri: asset.uri,
        name: asset.fileName || "wastage.jpg",
        type: asset.mimeType || "image/jpeg",
      } as unknown as Blob);
      const analysis = await api.upload<{
        imageUrl: string;
        simulated?: boolean;
        suggestions: PhotoSuggestion[];
        unmatched?: { label: string }[];
      }>("/api/mobile/wastage/photo", token, form);

      setPhotoUrl(analysis.imageUrl);
      setPhotoSimulated(Boolean(analysis.simulated));
      setPhotoSuggestions(analysis.suggestions ?? []);
      setPhotoSelected(
        Object.fromEntries(
          (analysis.suggestions ?? []).map((row) => [row.itemId, row.canWaste]),
        ),
      );
      setPhotoQty(
        Object.fromEntries(
          (analysis.suggestions ?? []).map((row) => [
            row.itemId,
            String(row.quantity),
          ]),
        ),
      );
      if (!(analysis.suggestions ?? []).length) {
        Alert.alert(
          analysis.simulated ? "Photo read (simulated)" : "No matches",
          "Nothing in the catalogue matched. Try another photo or record manually.",
        );
      }
    } catch (caught) {
      Alert.alert(
        "Photo failed",
        caught instanceof ApiError ? caught.message : "",
      );
    } finally {
      setPhotoBusy(false);
    }
  }

  async function confirmPhotoWastage() {
    if (!token || !effectiveOutletId) return;
    if (!photoReason) {
      Alert.alert("Choose a reason", "Pick why these items were wasted.");
      return;
    }
    const lines = photoSuggestions
      .filter((row) => photoSelected[row.itemId])
      .map((row) => ({
        itemId: row.itemId,
        quantity: Number(photoQty[row.itemId] ?? row.quantity),
      }))
      .filter((line) => Number.isFinite(line.quantity) && line.quantity > 0);
    if (!lines.length) {
      Alert.alert("Nothing selected", "Select at least one matched product.");
      return;
    }

    setPending(true);
    try {
      const result = await api.post<{ ok: boolean; count?: number }>(
        "/api/mobile/wastage",
        token,
        {
          outletId: effectiveOutletId,
          reason: photoReason,
          note: photoNote || undefined,
          imageUrl: photoUrl || undefined,
          lines,
        },
      );
      await loadItems().catch(() => undefined);
      Alert.alert(
        "Recorded",
        `Wastage recorded for ${result.count ?? lines.length} product(s).`,
      );
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
        imageUrl: photoUrl || undefined,
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
          <Text style={styles.label}>Photo wastage</Text>
          <Text style={styles.copy}>
            Photograph what was wasted. AI matches catalogue products — you
            confirm before stock drops.
          </Text>
          <View style={styles.photoActions}>
            <Pressable
              style={styles.secondary}
              disabled={photoBusy}
              onPress={() => void pickPhoto(true)}
            >
              <Text style={styles.secondaryText}>
                {photoBusy ? "Reading…" : "Camera"}
              </Text>
            </Pressable>
            <Pressable
              style={styles.secondary}
              disabled={photoBusy}
              onPress={() => void pickPhoto(false)}
            >
              <Text style={styles.secondaryText}>Library</Text>
            </Pressable>
          </View>
          {photoSimulated ? (
            <Text style={styles.warn}>
              Simulation mode — no OpenAI key, readings are local stand-ins.
            </Text>
          ) : null}
          {photoPreview ? (
            <Image source={{ uri: photoPreview }} style={styles.preview} />
          ) : null}

          {photoSuggestions.length > 0 ? (
            <View style={styles.photoCard}>
              {photoSuggestions.map((row) => (
                <View key={row.itemId} style={styles.suggestion}>
                  <Pressable
                    onPress={() =>
                      row.canWaste &&
                      setPhotoSelected((current) => ({
                        ...current,
                        [row.itemId]: !current[row.itemId],
                      }))
                    }
                  >
                    <Text style={styles.optionTitle}>
                      {photoSelected[row.itemId] ? "✓ " : ""}
                      {row.name}
                    </Text>
                    <Text style={styles.copy}>
                      Seen as “{row.label}” · on hand {qty(row.onHand)}{" "}
                      {row.unit}
                      {!row.canWaste ? " · no stock" : ""}
                    </Text>
                  </Pressable>
                  {row.canWaste ? (
                    <TextInput
                      keyboardType="decimal-pad"
                      value={photoQty[row.itemId] ?? ""}
                      onChangeText={(value) =>
                        setPhotoQty((current) => ({
                          ...current,
                          [row.itemId]: value,
                        }))
                      }
                      style={styles.input}
                    />
                  ) : null}
                </View>
              ))}

              <Text style={styles.label}>Reason for photo items</Text>
              <View style={styles.reasons}>
                {reasons.map((entry) => {
                  const active = photoReason === entry.id;
                  return (
                    <Pressable
                      key={entry.id}
                      onPress={() => setPhotoReason(entry.id)}
                      style={[styles.chip, active && styles.chipActive]}
                    >
                      <Text
                        style={[
                          styles.chipText,
                          active && styles.chipTextActive,
                        ]}
                      >
                        {entry.label}
                      </Text>
                    </Pressable>
                  );
                })}
              </View>
              <TextInput
                value={photoNote}
                onChangeText={setPhotoNote}
                placeholder="Note (optional)"
                placeholderTextColor={colors.muted}
                style={styles.input}
              />
              <PrimaryButton
                label={pending ? "Recording…" : "Confirm photo wastage"}
                onPress={() => void confirmPhotoWastage()}
                disabled={pending || photoBusy}
              />
            </View>
          ) : null}

          <Text style={styles.label}>Or record manually</Text>
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
  photoActions: { flexDirection: "row", gap: 10 },
  secondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(58,37,31,0.15)",
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.white,
  },
  secondaryText: { color: colors.ink, fontWeight: "800" },
  preview: {
    width: "100%",
    height: 160,
    borderRadius: 18,
    backgroundColor: colors.sand,
  },
  photoCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 14,
    gap: 10,
  },
  suggestion: { gap: 6, paddingBottom: 8 },
  warn: {
    color: "#92400e",
    backgroundColor: "#fffbeb",
    padding: 10,
    borderRadius: 12,
    fontSize: 12,
    overflow: "hidden",
  },
});
