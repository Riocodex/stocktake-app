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
import { useFocusEffect, useRoute, type RouteProp } from "@react-navigation/native";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import * as Sharing from "expo-sharing";

import { ApiError, api, money, qty } from "../api";
import { useAuth } from "../auth";
import type { RootStackParamList } from "../navigation";
import { colors } from "../theme";
import { Badge, Eyebrow, PrimaryButton, ProductThumb, ProgressRing } from "../ui";

type Item = {
  id: string;
  name: string;
  sku: string;
  unit: string;
  onRecord: number;
  unitPrice: number;
  lineId: string | null;
  countedQty: number | null;
  imageUrl: string | null;
};

type Category = { id: string; name: string; items: Item[] };

type Detail = {
  id: string;
  reference: string;
  areaLabel: string;
  isDraft: boolean;
  outletName: string;
  countedBy: string;
  canEditPrices: boolean;
  totalValue: number;
  progress: { counted: number; total: number };
  categories: Category[];
  counted: {
    id: string;
    lineId: string;
    name: string;
    category: string;
    categoryId: string;
    countedQty: number;
    unit: string;
    unitPrice: number;
    imageUrl: string | null;
  }[];
  photos: {
    id: string;
    url: string;
    status: string;
    detectedCount: number;
    provider: string | null;
  }[];
};

export function TakeScreen() {
  const { token } = useAuth();
  const route = useRoute<RouteProp<RootStackParamList, "Take">>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [openId, setOpenId] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [photoBusy, setPhotoBusy] = useState(false);
  const [note, setNote] = useState("");
  const [confirm, setConfirm] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const data = await api.get<Detail>(
      `/api/mobile/stock-takes/${route.params.id}`,
      token,
    );
    setDetail(data);
    setOpenId((current) => {
      if (current) return current;
      const unfinished = data.categories.find((category) =>
        category.items.some((item) => !item.lineId),
      );
      return unfinished?.id ?? data.categories[0]?.id ?? null;
    });
  }, [token, route.params.id]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  async function countItem(item: Item, value: string, price?: string) {
    if (!token || !detail?.isDraft) return;
    const countedQty = Number(value);
    if (!Number.isFinite(countedQty) || value === "") return;
    try {
      await api.post(`/api/mobile/stock-takes/${route.params.id}/count`, token, {
        itemId: item.id,
        countedQty,
        ...(detail.canEditPrices && price
          ? { unitPrice: Number(price) }
          : {}),
      });
      await load();
    } catch (caught) {
      Alert.alert("Could not save", caught instanceof ApiError ? caught.message : "");
    }
  }

  async function uncount(item: Item) {
    if (!token || !item.lineId) return;
    await api.del(`/api/mobile/stock-takes/${route.params.id}/count`, token, {
      lineId: item.lineId,
    });
    await load();
  }

  async function pickPhoto(fromCamera: boolean) {
    if (!token || !detail?.isDraft) return;
    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow camera or photos to count from a shelf picture.");
      return;
    }
    const result = fromCamera
      ? await ImagePicker.launchCameraAsync({ quality: 0.7 })
      : await ImagePicker.launchImageLibraryAsync({ quality: 0.7, mediaTypes: ["images"] });
    if (result.canceled || !result.assets[0]) return;

    setPhotoBusy(true);
    try {
      const asset = result.assets[0];
      const form = new FormData();
      form.append("photo", {
        uri: asset.uri,
        name: asset.fileName || "shelf.jpg",
        type: asset.mimeType || "image/jpeg",
      } as unknown as Blob);
      const analysis = await api.upload<{
        detected: number;
        matched: number;
        unmatched: number;
        simulated?: boolean;
      }>(`/api/stock-takes/${route.params.id}/photos`, token, form);
      await load();
      Alert.alert(
        analysis.simulated ? "Photo read (simulated)" : "Photo read",
        `${analysis.matched} matched, ${analysis.unmatched} need a look on the website.`,
      );
    } catch (caught) {
      Alert.alert("Photo failed", caught instanceof ApiError ? caught.message : "");
    } finally {
      setPhotoBusy(false);
    }
  }

  async function downloadCsv() {
    if (!token || !detail) return;
    try {
      const csv = await api.downloadText(
        `/api/stock-takes/${detail.id}/export`,
        token,
      );
      const path = `${FileSystem.cacheDirectory}${detail.reference.replaceAll(" ", "-")}.csv`;
      await FileSystem.writeAsStringAsync(path, csv);
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(path, {
          mimeType: "text/csv",
          UTI: "public.comma-separated-values-text",
          dialogTitle: detail.reference,
        });
      } else {
        Alert.alert("Saved", path);
      }
    } catch (caught) {
      Alert.alert("Could not export", caught instanceof ApiError ? caught.message : "");
    }
  }

  async function submit() {
    if (!token) return;
    if (!confirm) {
      setConfirm(true);
      return;
    }
    setPending(true);
    try {
      await api.post(`/api/mobile/stock-takes/${route.params.id}/submit`, token, {
        note,
      });
      await load();
      setConfirm(false);
      Alert.alert("Filed", "Live stock was updated from this count.");
    } catch (caught) {
      Alert.alert("Could not submit", caught instanceof ApiError ? caught.message : "");
    } finally {
      setPending(false);
    }
  }

  if (!detail) {
    return (
      <View style={styles.center}>
        <ActivityIndicator color={colors.clay} />
      </View>
    );
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <View style={styles.header}>
        <View style={{ flex: 1 }}>
          <Eyebrow>{detail.areaLabel} · {detail.outletName}</Eyebrow>
          <Text style={styles.title}>{detail.reference}</Text>
          <Text style={styles.copy}>
            Counted by {detail.countedBy} · {detail.progress.counted} of{" "}
            {detail.progress.total} · {money(detail.totalValue)}
          </Text>
          <View style={{ flexDirection: "row", gap: 8, marginTop: 8 }}>
            <Badge tone={detail.isDraft ? "draft" : "filed"}>
              {detail.isDraft ? "Draft" : "Submitted"}
            </Badge>
            <Badge tone="sage">{detail.areaLabel}</Badge>
          </View>
        </View>
        <ProgressRing counted={detail.progress.counted} total={detail.progress.total} />
      </View>

      {detail.categories.map((category) => {
        const counted = category.items.filter((item) => item.lineId).length;
        const open = openId === category.id;
        const done = counted === category.items.length && counted > 0;
        return (
          <View key={category.id} style={styles.section}>
            <Pressable
              onPress={() => setOpenId(open ? null : category.id)}
              style={styles.sectionHead}
            >
              <View>
                <Text style={styles.sectionTitle}>{category.name}</Text>
                <Text style={styles.copy}>
                  {counted} of {category.items.length} counted
                </Text>
              </View>
              {done ? <Badge tone="filed">Done</Badge> : <Text style={styles.chevron}>{open ? "−" : "+"}</Text>}
            </Pressable>
            {open
              ? category.items.map((item) => (
                  <ItemRow
                    key={`${item.id}-${item.lineId ?? "new"}-${item.countedQty ?? ""}`}
                    item={item}
                    editable={detail.isDraft}
                    canEditPrices={detail.canEditPrices}
                    onCount={countItem}
                    onUncount={uncount}
                  />
                ))
              : null}
          </View>
        );
      })}

      {detail.isDraft ? (
        <View style={styles.card}>
          <Eyebrow>Optional photo</Eyebrow>
          <Text style={styles.copy}>
            Photograph a shelf and we will try to fill counts. You can still type every line.
          </Text>
          <View style={styles.photoActions}>
            <Pressable
              style={styles.secondary}
              onPress={() => pickPhoto(true)}
              disabled={photoBusy}
            >
              <Text style={styles.secondaryText}>{photoBusy ? "Reading…" : "Camera"}</Text>
            </Pressable>
            <Pressable
              style={styles.secondary}
              onPress={() => pickPhoto(false)}
              disabled={photoBusy}
            >
              <Text style={styles.secondaryText}>Library</Text>
            </Pressable>
          </View>
          {detail.photos.map((photo) => (
            <Text key={photo.id} style={styles.copy}>
              {photo.status} · {photo.detectedCount} detected
              {photo.provider ? ` · ${photo.provider}` : ""}
            </Text>
          ))}
        </View>
      ) : null}

      {detail.counted.length > 0 ? (
        <View style={styles.countedBox}>
          <Eyebrow>Counted this session</Eyebrow>
          {detail.counted.map((item) => (
            <Pressable
              key={item.id}
              style={styles.countedRow}
              onPress={() => setOpenId(item.categoryId)}
            >
              <View style={styles.check} />
              <ProductThumb uri={item.imageUrl} name={item.name} size={36} />
              <View style={{ flex: 1 }}>
                <Text style={styles.itemName}>{item.name}</Text>
                <Text style={styles.copy}>
                  {item.category} · {qty(item.countedQty)} {item.unit}
                </Text>
              </View>
              <Text style={styles.itemName}>
                {money(item.countedQty * item.unitPrice)}
              </Text>
            </Pressable>
          ))}
        </View>
      ) : null}

      {detail.isDraft ? (
        <View style={styles.submitBox}>
          <TextInput
            placeholder="Note for the next person"
            placeholderTextColor={colors.muted}
            value={note}
            onChangeText={setNote}
            style={styles.note}
            multiline
          />
          <PrimaryButton
            label={
              pending
                ? "Submitting…"
                : confirm
                  ? "Yes, update live stock"
                  : "Submit stock take"
            }
            onPress={submit}
            disabled={pending || detail.counted.length === 0}
          />
          {confirm ? (
            <Text style={styles.copy}>
              This writes the counted quantities to live inventory.
            </Text>
          ) : null}
        </View>
      ) : (
        <View style={{ marginTop: 12 }}>
          <PrimaryButton label="Download spreadsheet" onPress={downloadCsv} />
        </View>
      )}
    </ScrollView>
  );
}

function ItemRow({
  item,
  editable,
  canEditPrices,
  onCount,
  onUncount,
}: {
  item: Item;
  editable: boolean;
  canEditPrices: boolean;
  onCount: (item: Item, value: string, price?: string) => void;
  onUncount: (item: Item) => void;
}) {
  const [value, setValue] = useState(
    item.countedQty !== null ? String(item.countedQty) : "",
  );
  const [price, setPrice] = useState(String(item.unitPrice));
  const counted = item.lineId !== null;
  const variance = item.countedQty !== null ? item.countedQty - item.onRecord : null;

  return (
    <View style={styles.item}>
      <Pressable
        onPress={() => (counted && editable ? onUncount(item) : undefined)}
        style={[styles.bubble, counted && styles.bubbleOn]}
      />
      <ProductThumb uri={item.imageUrl} name={item.name} size={40} />
      <View style={{ flex: 1 }}>
        <Text style={styles.itemName}>{item.name}</Text>
        <Text style={styles.copy}>
          on record {qty(item.onRecord)} {item.unit}
          {canEditPrices ? ` · ${money(item.unitPrice)}` : ""}
          {variance !== null && variance !== 0
            ? ` · ${variance > 0 ? "+" : ""}${qty(variance)}`
            : ""}
        </Text>
      </View>
      {editable ? (
        <View>
          <TextInput
            keyboardType="decimal-pad"
            value={value}
            onChangeText={setValue}
            onEndEditing={() => onCount(item, value, price)}
            placeholder="0"
            placeholderTextColor={colors.muted}
            style={styles.qty}
          />
          {canEditPrices ? (
            <TextInput
              keyboardType="decimal-pad"
              value={price}
              onChangeText={setPrice}
              onEndEditing={() => onCount(item, value, price)}
              style={[styles.qty, { marginTop: 6 }]}
            />
          ) : null}
        </View>
      ) : (
        <Text style={styles.itemName}>
          {item.countedQty !== null ? qty(item.countedQty) : "—"}
        </Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20, paddingBottom: 48 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  header: { flexDirection: "row", gap: 12, alignItems: "center" },
  title: { color: colors.ink, fontSize: 26, fontWeight: "800", marginTop: 4 },
  copy: { color: colors.muted, fontSize: 13, marginTop: 4 },
  section: {
    backgroundColor: colors.white,
    borderRadius: 22,
    marginTop: 14,
    overflow: "hidden",
  },
  sectionHead: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    padding: 16,
  },
  sectionTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
  chevron: { color: colors.muted, fontSize: 22, fontWeight: "700" },
  item: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: "rgba(58,37,31,0.08)",
  },
  bubble: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    borderColor: "rgba(58,37,31,0.25)",
    backgroundColor: colors.white,
  },
  bubbleOn: { backgroundColor: colors.ok, borderColor: colors.ok },
  itemName: { color: colors.ink, fontWeight: "700" },
  qty: {
    width: 72,
    borderWidth: 1,
    borderColor: "rgba(58,37,31,0.15)",
    borderRadius: 12,
    paddingHorizontal: 8,
    paddingVertical: 8,
    textAlign: "right",
    color: colors.ink,
    fontWeight: "700",
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: 16,
    marginTop: 16,
  },
  photoActions: { flexDirection: "row", gap: 10, marginTop: 12 },
  secondary: {
    flex: 1,
    borderWidth: 1,
    borderColor: "rgba(58,37,31,0.15)",
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
  },
  secondaryText: { color: colors.ink, fontWeight: "800" },
  countedBox: {
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: 16,
    marginTop: 18,
    maxHeight: 360,
  },
  countedRow: { flexDirection: "row", alignItems: "center", gap: 10, marginTop: 12 },
  check: {
    width: 18,
    height: 18,
    borderRadius: 9,
    backgroundColor: colors.ok,
  },
  submitBox: { marginTop: 18, gap: 12 },
  note: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 12,
    minHeight: 72,
    color: colors.ink,
  },
});
