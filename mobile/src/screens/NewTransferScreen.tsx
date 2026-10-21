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

type Line = {
  itemId: string;
  quantity: string;
  search: string;
  toOutletId: string;
};

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

async function createTransfersByDestination(
  token: string,
  input: {
    fromOutletId: string;
    note?: string;
    imageUrl?: string;
    lines: { itemId: string; quantity: number; toOutletId: string }[];
  },
) {
  const grouped = new Map<string, Map<string, number>>();
  for (const line of input.lines) {
    if (!line.toOutletId || !line.itemId || line.quantity <= 0) continue;
    if (line.toOutletId === input.fromOutletId) {
      throw new ApiError(400, "Source and destination must be different.");
    }
    const byItem = grouped.get(line.toOutletId) ?? new Map<string, number>();
    byItem.set(
      line.itemId,
      Math.round(((byItem.get(line.itemId) ?? 0) + line.quantity) * 100) / 100,
    );
    grouped.set(line.toOutletId, byItem);
  }
  if (grouped.size === 0) {
    throw new ApiError(400, "Add products with destinations and quantities.");
  }

  const created: { id: string }[] = [];
  for (const [toOutletId, byItem] of grouped) {
    const result = await api.post<{ transfer: { id: string } }>(
      "/api/mobile/transfers",
      token,
      {
        fromOutletId: input.fromOutletId,
        toOutletId,
        note: input.note,
        imageUrl: input.imageUrl,
        lines: [...byItem.entries()].map(([itemId, quantity]) => ({
          itemId,
          quantity,
        })),
      },
    );
    created.push(result.transfer);
  }
  return created;
}

export function NewTransferScreen() {
  const { token, user } = useAuth();
  const { outletId, setOutletId, outlets, isSuper } = useScope();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [items, setItems] = useState<CatalogItem[]>([]);
  const [allOutlets, setAllOutlets] = useState<{ id: string; name: string }[]>(
    [],
  );
  const [defaultToOutletId, setDefaultToOutletId] = useState("");
  const [note, setNote] = useState("");
  const [lines, setLines] = useState<Line[]>([
    { itemId: "", quantity: "", search: "", toOutletId: "" },
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
  const [photoDest, setPhotoDest] = useState<Record<string, string>>({});
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
    setDefaultToOutletId("");
    setLines([{ itemId: "", quantity: "", search: "", toOutletId: "" }]);
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
      setPhotoDest(
        Object.fromEntries(
          (analysis.suggestions ?? []).map((row) => [
            row.itemId,
            defaultToOutletId,
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

  async function finishCreated(created: { id: string }[]) {
    if (created.length === 1) {
      navigation.replace("Transfer", { id: created[0].id });
      return;
    }
    Alert.alert(
      "Drafts saved",
      `${created.length} transfer drafts created (one per destination).`,
    );
    navigation.navigate("Transfers");
  }

  async function confirmPhotoTransfer() {
    if (!token) return;
    if (!fromOutletId) {
      Alert.alert("Choose source", "Pick which outlet is sending stock.");
      return;
    }
    const selected = photoSuggestions
      .filter((row) => photoSelected[row.itemId])
      .map((row) => ({
        itemId: row.itemId,
        quantity: Number(photoQty[row.itemId] ?? row.quantity),
        toOutletId: photoDest[row.itemId] || defaultToOutletId,
      }))
      .filter((line) => Number.isFinite(line.quantity) && line.quantity > 0);
    if (!selected.length) {
      Alert.alert(
        "Nothing selected",
        "Select at least one matched product and enter a quantity.",
      );
      return;
    }
    if (selected.some((line) => !line.toOutletId)) {
      Alert.alert(
        "Choose destinations",
        "Pick where each selected product should go.",
      );
      return;
    }

    setPending(true);
    try {
      const created = await createTransfersByDestination(token, {
        fromOutletId,
        note: note || undefined,
        imageUrl: photoUrl || undefined,
        lines: selected,
      });
      await finishCreated(created);
    } catch (caught) {
      Alert.alert(
        "Could not create",
        caught instanceof ApiError ? caught.message : "",
      );
    } finally {
      setPending(false);
    }
  }

  async function save() {
    if (!token) return;
    if (!fromOutletId) {
      Alert.alert("Choose source", "Pick which outlet is sending stock.");
      return;
    }
    const payload = lines
      .filter((line) => line.itemId && Number(line.quantity) > 0)
      .map((line) => ({
        itemId: line.itemId,
        quantity: Number(line.quantity),
        toOutletId: line.toOutletId || defaultToOutletId,
      }));
    if (!payload.length) {
      Alert.alert("Add products", "Choose products and quantities to transfer.");
      return;
    }
    if (payload.some((line) => !line.toOutletId)) {
      Alert.alert(
        "Choose destinations",
        "Pick where each product should go.",
      );
      return;
    }

    setPending(true);
    try {
      const created = await createTransfersByDestination(token, {
        fromOutletId,
        note: note || undefined,
        imageUrl: photoUrl || undefined,
        lines: payload,
      });
      await finishCreated(created);
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
        Send multiple products to different outlets in one go. Each destination
        gets its own draft.
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

      <Text style={styles.label}>Default destination (optional)</Text>
      <View style={styles.list}>
        {destinations.map((outlet) => (
          <Pressable
            key={outlet.id}
            onPress={() => {
              setDefaultToOutletId(outlet.id);
              setLines((current) =>
                current.map((line) =>
                  line.toOutletId ? line : { ...line, toOutletId: outlet.id },
                ),
              );
              setPhotoDest((current) => {
                const next = { ...current };
                for (const row of photoSuggestions) {
                  if (!next[row.itemId]) next[row.itemId] = outlet.id;
                }
                return next;
              });
            }}
            style={[
              styles.option,
              defaultToOutletId === outlet.id && styles.optionActive,
            ]}
          >
            <Text style={styles.optionTitle}>{outlet.name}</Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.copy}>
        You can still override destination on each product.
      </Text>

      <Text style={styles.label}>Photo transfer</Text>
      <Text style={styles.copy}>
        Photograph what you are sending. Set quantity and destination per
        product, then confirm.
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
                <>
                  <TextInput
                    keyboardType="decimal-pad"
                    value={photoQty[row.itemId] ?? ""}
                    onChangeText={(value) =>
                      setPhotoQty((current) => ({
                        ...current,
                        [row.itemId]: value,
                      }))
                    }
                    placeholder="Quantity"
                    placeholderTextColor={colors.muted}
                    style={styles.input}
                  />
                  <Text style={styles.label}>Send to</Text>
                  <View style={styles.list}>
                    {destinations.map((outlet) => (
                      <Pressable
                        key={outlet.id}
                        onPress={() =>
                          setPhotoDest((current) => ({
                            ...current,
                            [row.itemId]: outlet.id,
                          }))
                        }
                        style={[
                          styles.option,
                          (photoDest[row.itemId] || defaultToOutletId) ===
                            outlet.id && styles.optionActive,
                        ]}
                      >
                        <Text style={styles.optionTitle}>{outlet.name}</Text>
                      </Pressable>
                    ))}
                  </View>
                </>
              ) : null}
            </View>
          ))}
          <PrimaryButton
            label={pending ? "Saving drafts…" : "Confirm photo transfer"}
            onPress={() => void confirmPhotoTransfer()}
            disabled={photoBusy || pending}
          />
        </View>
      ) : null}

      <Text style={styles.label}>Or add products manually</Text>
      {!fromOutletId ? (
        <Text style={styles.copy}>
          Choose a source outlet above to load products with stock.
        </Text>
      ) : items.length === 0 ? (
        <Text style={styles.copy}>
          No products currently have stock at this outlet.
        </Text>
      ) : null}

      {lines.map((line, index) => {
        const needle = line.search.trim().toLowerCase();
        const matches = (
          needle
            ? items.filter((item) => {
                const label =
                  `${item.brand ?? ""} ${item.name} ${item.category}`.toLowerCase();
                return label.includes(needle);
              })
            : items
        ).slice(0, 12);
        const selected = items.find((item) => item.id === line.itemId);
        const selectedLabel = selected
          ? selected.brand
            ? `${selected.brand} ${selected.name}`
            : selected.name
          : "";
        return (
          <View key={index} style={styles.card}>
            <Text style={styles.label}>Product</Text>
            <TextInput
              placeholder="Search the catalogue"
              placeholderTextColor={colors.muted}
              value={selected && !line.search ? selectedLabel : line.search}
              onChangeText={(search) =>
                setLines((current) =>
                  current.map((entry, entryIndex) =>
                    entryIndex === index
                      ? { ...entry, search, itemId: "" }
                      : entry,
                  ),
                )
              }
              style={styles.input}
              editable={Boolean(fromOutletId)}
            />
            {!line.itemId
              ? matches.map((item) => {
                  const label = item.brand
                    ? `${item.brand} ${item.name}`
                    : item.name;
                  return (
                    <Pressable
                      key={item.id}
                      onPress={() =>
                        setLines((current) =>
                          current.map((entry, entryIndex) =>
                            entryIndex === index
                              ? {
                                  ...entry,
                                  itemId: item.id,
                                  search: "",
                                }
                              : entry,
                          ),
                        )
                      }
                      style={styles.option}
                    >
                      <Text style={styles.optionTitle}>{label}</Text>
                      <Text style={styles.copy}>
                        On hand {qty(item.quantity)} {item.unit}
                      </Text>
                    </Pressable>
                  );
                })
              : (
                  <Text style={styles.copy}>
                    On hand {qty(selected?.quantity ?? 0)} {selected?.unit}
                  </Text>
                )}
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
            <Text style={styles.label}>Send to</Text>
            <View style={styles.list}>
              {destinations.map((outlet) => (
                <Pressable
                  key={outlet.id}
                  onPress={() =>
                    setLines((current) =>
                      current.map((entry, entryIndex) =>
                        entryIndex === index
                          ? { ...entry, toOutletId: outlet.id }
                          : entry,
                      ),
                    )
                  }
                  style={[
                    styles.option,
                    (line.toOutletId || defaultToOutletId) === outlet.id &&
                      styles.optionActive,
                  ]}
                >
                  <Text style={styles.optionTitle}>{outlet.name}</Text>
                </Pressable>
              ))}
            </View>
          </View>
        );
      })}

      <Pressable
        onPress={() =>
          setLines((current) => [
            ...current,
            {
              itemId: "",
              quantity: "",
              search: "",
              toOutletId: defaultToOutletId,
            },
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
        label={pending ? "Saving…" : "Save manual draft(s)"}
        onPress={save}
        disabled={pending || !fromOutletId}
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
