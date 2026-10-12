import { useEffect, useMemo, useState } from "react";
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
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import * as ImagePicker from "expo-image-picker";

import { ApiError, api, qty } from "../api";
import { useAuth } from "../auth";
import type { RootStackParamList } from "../navigation";
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
};

type Line = { itemId: string; quantity: string; search: string };

type PhotoSuggestion = {
  itemId: string;
  name: string;
  unit: string;
  detectedQuantity: number;
  quantity: number;
  onHand: number;
  confidence: number;
  label: string;
  canTransfer: boolean;
};

export function NewTransferScreen() {
  const { token, user } = useAuth();
  const { outletId, setOutletId, outlets, isSuper } = useScope();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [allOutlets, setAllOutlets] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [toOutletId, setToOutletId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { itemId: "", quantity: "", search: "" },
  ]);
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
  const [photoSimulated, setPhotoSimulated] = useState(false);

  const fromOutletId = isSuper ? outletId : user?.outletId ?? "";

  useEffect(() => {
    if (!token) return;
    api
      .get<{ destinations: { id: string; name: string }[] }>(
        "/api/mobile/transfers",
        token,
      )
      .then((data) => setAllOutlets(data.destinations ?? []))
      .catch(() => setAllOutlets(outlets));
  }, [token, outlets]);

  useEffect(() => {
    if (!token || !fromOutletId) {
      setItems([]);
      return;
    }
    api
      .get<{ items: CatalogItem[] }>(
        `/api/mobile/inventory?outlet=${encodeURIComponent(fromOutletId)}`,
        token,
      )
      .then((data) =>
        setItems(data.items.filter((item) => item.quantity > 0)),
      )
      .catch(() => setItems([]));
  }, [token, fromOutletId]);

  useEffect(() => {
    setPhotoSuggestions([]);
    setPhotoPreview(null);
    setPhotoUrl(null);
  }, [fromOutletId]);

  const destinations = useMemo(
    () => allOutlets.filter((outlet) => outlet.id !== fromOutletId),
    [allOutlets, fromOutletId],
  );

  async function pickPhoto(fromCamera: boolean) {
    if (!token || !fromOutletId) {
      Alert.alert("Choose source", "Pick which outlet is sending stock.");
      return;
    }
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(
        "Permission needed",
        "Allow camera or photos to identify transfer stock.",
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
      form.append("outletId", fromOutletId);
      form.append("photo", {
        uri: asset.uri,
        name: asset.fileName || "transfer.jpg",
        type: asset.mimeType || "image/jpeg",
      } as unknown as Blob);
      const analysis = await api.upload<{
        imageUrl: string;
        simulated?: boolean;
        suggestions: PhotoSuggestion[];
      }>("/api/mobile/transfers/photo", token, form);

      setPhotoUrl(analysis.imageUrl);
      setPhotoSimulated(Boolean(analysis.simulated));
      setPhotoSuggestions(analysis.suggestions ?? []);
      setPhotoSelected(
        Object.fromEntries(
          (analysis.suggestions ?? []).map((row) => [
            row.itemId,
            row.canTransfer,
          ]),
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
          "Nothing in the catalogue matched. Try another photo or add manually.",
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

  function applyPhotoLines() {
    const selected = photoSuggestions
      .filter((row) => photoSelected[row.itemId])
      .map((row) => ({
        itemId: row.itemId,
        quantity: String(photoQty[row.itemId] ?? row.quantity),
        search: row.name,
      }))
      .filter((line) => Number(line.quantity) > 0);
    if (!selected.length) {
      Alert.alert("Nothing selected", "Select at least one matched product.");
      return;
    }
    setLines(selected);
    Alert.alert(
      "Products added",
      "Review quantities below, pick a destination, then save the draft.",
    );
  }

  async function save() {
    if (!token) return;
    if (!fromOutletId) {
      Alert.alert("Choose source", "Pick which outlet is sending stock.");
      return;
    }
    if (!toOutletId) {
      Alert.alert("Choose destination", "Pick which outlet should receive stock.");
      return;
    }
    setPending(true);
    try {
      const result = await api.post<{ transfer: { id: string } }>(
        "/api/mobile/transfers",
        token,
        {
          fromOutletId,
          toOutletId,
          note: note || undefined,
          imageUrl: photoUrl || undefined,
          lines: lines
            .filter((line) => line.itemId && Number(line.quantity) > 0)
            .map((line) => ({
              itemId: line.itemId,
              quantity: Number(line.quantity),
            })),
        },
      );
      navigation.replace("Transfer", { id: result.transfer.id });
    } catch (caught) {
      Alert.alert(
        "Could not create",
        caught instanceof ApiError ? caught.message : "",
      );
    } finally {
      setPending(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>New transfer</Text>
      <Text style={styles.copy}>
        Saved as a draft. Stock only leaves the source when you send it.
      </Text>

      {isSuper ? (
        <>
          <Text style={styles.label}>From</Text>
          <OutletPicker
            outlets={outlets}
            value={outletId}
            onChange={setOutletId}
          />
        </>
      ) : (
        <Text style={styles.copy}>From {user?.outletName}</Text>
      )}

      <Text style={styles.label}>To</Text>
      <View style={styles.list}>
        {destinations.map((outlet) => (
          <Pressable
            key={outlet.id}
            onPress={() => setToOutletId(outlet.id)}
            style={[
              styles.option,
              toOutletId === outlet.id && styles.optionActive,
            ]}
          >
            <Text style={styles.optionTitle}>{outlet.name}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Photo transfer</Text>
      <Text style={styles.copy}>
        Photograph what you are sending. AI matches source stock — you confirm
        before saving the draft.
      </Text>
      <View style={styles.photoActions}>
        <Pressable
          style={styles.secondary}
          disabled={photoBusy || !fromOutletId}
          onPress={() => void pickPhoto(true)}
        >
          <Text style={styles.secondaryText}>
            {photoBusy ? "Reading…" : "Camera"}
          </Text>
        </Pressable>
        <Pressable
          style={styles.secondary}
          disabled={photoBusy || !fromOutletId}
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
                  row.canTransfer &&
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
                  Seen as “{row.label}” · on hand {qty(row.onHand)} {row.unit}
                  {!row.canTransfer ? " · no stock" : ""}
                </Text>
              </Pressable>
              {row.canTransfer ? (
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
          <PrimaryButton
            label="Use selected products"
            onPress={applyPhotoLines}
            disabled={photoBusy}
          />
        </View>
      ) : null}

      <Text style={styles.label}>Or add products manually</Text>

      {lines.map((line, index) => {
        const needle = line.search.trim().toLowerCase();
        const filtered = items
          .filter((item) => {
            if (!needle) return true;
            const label = `${item.brand ?? ""} ${item.name}`.toLowerCase();
            return label.includes(needle);
          })
          .slice(0, 20);
        const selected = items.find((item) => item.id === line.itemId);
        return (
          <View key={index} style={styles.card}>
            <Text style={styles.label}>Product</Text>
            <TextInput
              placeholder="Search"
              placeholderTextColor={colors.muted}
              value={line.search}
              onChangeText={(search) =>
                setLines((current) =>
                  current.map((entry, entryIndex) =>
                    entryIndex === index ? { ...entry, search } : entry,
                  ),
                )
              }
              style={styles.input}
            />
            {filtered.map((item) => {
              const label = item.brand
                ? `${item.brand} ${item.name}`
                : item.name;
              const active = item.id === line.itemId;
              return (
                <Pressable
                  key={item.id}
                  onPress={() =>
                    setLines((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index
                          ? { ...entry, itemId: item.id }
                          : entry,
                      ),
                    )
                  }
                  style={[styles.option, active && styles.optionActive]}
                >
                  <Text style={styles.optionTitle}>{label}</Text>
                  <Text style={styles.copy}>
                    On hand {qty(item.quantity)} {item.unit}
                  </Text>
                </Pressable>
              );
            })}
            <Text style={styles.label}>
              Quantity{selected ? ` (${selected.unit})` : ""}
            </Text>
            <TextInput
              keyboardType="decimal-pad"
              value={line.quantity}
              onChangeText={(quantity) =>
                setLines((current) =>
                  current.map((entry, entryIndex) =>
                    entryIndex === index ? { ...entry, quantity } : entry,
                  ),
                )
              }
              style={styles.input}
            />
          </View>
        );
      })}

      <Pressable
        onPress={() =>
          setLines((current) => [
            ...current,
            { itemId: "", quantity: "", search: "" },
          ])
        }
      >
        <Text style={styles.link}>+ Add product</Text>
      </Pressable>

      <TextInput
        placeholder="Note (optional)"
        placeholderTextColor={colors.muted}
        value={note}
        onChangeText={setNote}
        style={styles.input}
      />

      <PrimaryButton
        label={pending ? "Saving…" : "Save draft"}
        onPress={save}
        disabled={pending || !fromOutletId || !toOutletId}
      />
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
  list: { gap: 8 },
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 14,
    gap: 8,
  },
  option: {
    backgroundColor: colors.paper,
    borderRadius: 14,
    padding: 12,
    borderWidth: 1,
    borderColor: "transparent",
  },
  optionActive: {
    borderColor: colors.clay,
    backgroundColor: colors.creamDeep,
  },
  optionTitle: { color: colors.ink, fontWeight: "700" },
  link: { color: colors.clay, fontWeight: "800" },
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
    height: 180,
    borderRadius: 18,
    backgroundColor: colors.paper,
  },
  photoCard: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 14,
    gap: 10,
  },
  suggestion: { gap: 6 },
  warn: { color: "#92400e", fontSize: 12 },
});
