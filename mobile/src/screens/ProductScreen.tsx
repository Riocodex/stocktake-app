import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRoute, type RouteProp } from "@react-navigation/native";

import { ApiError, api, mediaUrl, money, qty } from "../api";
import { useAuth } from "../auth";
import { formatDay, formatWhen } from "../format";
import type { RootStackParamList } from "../navigation";
import { useScope } from "../scope";
import { colors } from "../theme";
import { Eyebrow, OutletPicker, PrimaryButton, StatCard } from "../ui";

type Detail = {
  name: string;
  brand: string | null;
  sku: string;
  unit: string;
  packSize: string | null;
  category: string;
  supplierPackQty: number | null;
  imageUrl: string | null;
  referencePrice: number;
  quantity: number;
  value: number;
  positions: {
    outletName: string;
    quantity: number;
    unitPrice: number;
    expiryDate: string | null;
    lastCountedAt: string | null;
  }[];
  priceHistory: {
    price: number;
    previousPrice: number | null;
    source: string;
    outletName: string;
    createdAt: string;
  }[];
  recentCounts: {
    takeId: string;
    reference: string;
    outletName: string;
    countedQty: number;
    createdAt: string;
  }[];
};

export function ProductScreen() {
  const { token } = useAuth();
  const { outletId, setOutletId, outlets, isSuper } = useScope();
  const route = useRoute<RouteProp<RootStackParamList, "Product">>();
  const [detail, setDetail] = useState<Detail | null>(null);
  const [quantity, setQuantity] = useState("");
  const [expiry, setExpiry] = useState("");
  const [pending, setPending] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    const data = await api.get<Detail>(
      `/api/mobile/inventory/${route.params.id}`,
      token,
    );
    setDetail(data);
  }, [token, route.params.id]);

  useFocusEffect(
    useCallback(() => {
      load().catch(() => undefined);
    }, [load]),
  );

  async function receive() {
    if (!token) return;
    setPending(true);
    try {
      await api.post(`/api/mobile/inventory/${route.params.id}/receive`, token, {
        quantity: Number(quantity),
        expiryDate: expiry || undefined,
        outletId: isSuper ? outletId || undefined : undefined,
      });
      setQuantity("");
      await load();
      Alert.alert("Added", "Delivery recorded on live stock.");
    } catch (caught) {
      Alert.alert("Could not add", caught instanceof ApiError ? caught.message : "");
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

  const image = mediaUrl(detail.imageUrl);

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      {image ? <Image source={{ uri: image }} style={styles.hero} /> : null}
      <Eyebrow>{detail.category}</Eyebrow>
      <Text style={styles.title}>
        {detail.brand ? `${detail.brand} ` : ""}
        {detail.name}
      </Text>
      <Text style={styles.copy}>
        {detail.sku} · {detail.unit}
        {detail.packSize ? ` · ${detail.packSize}` : ""}
        {detail.supplierPackQty
          ? ` · supplier pack ${qty(detail.supplierPackQty)}`
          : ""}
      </Text>

      <View style={styles.stats}>
        <StatCard label="On hand" value={`${qty(detail.quantity)} ${detail.unit}`} />
        <StatCard label="Value" value={money(detail.value)} />
      </View>
      <StatCard label="Reference price" value={money(detail.referencePrice)} />

      <Text style={styles.sectionTitle}>Supplier just delivered?</Text>
      {isSuper ? (
        <OutletPicker outlets={outlets} value={outletId} onChange={setOutletId} />
      ) : null}
      <View style={styles.row}>
        <TextInput
          keyboardType="decimal-pad"
          placeholder="Qty"
          placeholderTextColor={colors.muted}
          value={quantity}
          onChangeText={setQuantity}
          style={styles.input}
        />
        <TextInput
          placeholder="YYYY-MM-DD"
          placeholderTextColor={colors.muted}
          value={expiry}
          onChangeText={setExpiry}
          style={styles.input}
        />
      </View>
      <PrimaryButton
        label={pending ? "Adding…" : "Add to stock"}
        onPress={receive}
        disabled={pending || (isSuper && !outletId)}
      />

      <Text style={styles.sectionTitle}>Positions</Text>
      {detail.positions.map((row) => (
        <View key={row.outletName} style={styles.card}>
          <Text style={styles.name}>{row.outletName}</Text>
          <Text style={styles.copy}>
            {qty(row.quantity)} {detail.unit} · {money(row.unitPrice)}
            {row.expiryDate ? ` · exp ${formatDay(row.expiryDate)}` : ""}
            {row.lastCountedAt ? ` · counted ${formatWhen(row.lastCountedAt)}` : ""}
          </Text>
        </View>
      ))}

      {detail.priceHistory.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Price history</Text>
          {detail.priceHistory.map((row, index) => (
            <View key={`${row.createdAt}-${index}`} style={styles.card}>
              <Text style={styles.name}>{money(row.price)}</Text>
              <Text style={styles.copy}>
                {row.outletName} · {row.source} · {formatWhen(row.createdAt)}
              </Text>
            </View>
          ))}
        </>
      ) : null}

      {detail.recentCounts.length > 0 ? (
        <>
          <Text style={styles.sectionTitle}>Recent counts</Text>
          {detail.recentCounts.map((row) => (
            <View key={`${row.takeId}-${row.createdAt}`} style={styles.card}>
              <Text style={styles.name}>{row.reference}</Text>
              <Text style={styles.copy}>
                {row.outletName} · {qty(row.countedQty)} {detail.unit} ·{" "}
                {formatWhen(row.createdAt)}
              </Text>
            </View>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20, paddingBottom: 40, gap: 10 },
  center: { flex: 1, alignItems: "center", justifyContent: "center" },
  hero: { width: "100%", height: 180, borderRadius: 22, backgroundColor: colors.creamDeep },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  copy: { color: colors.muted, marginTop: 4 },
  stats: { flexDirection: "row", gap: 10 },
  sectionTitle: { color: colors.ink, fontWeight: "800", fontSize: 18, marginTop: 10 },
  row: { flexDirection: "row", gap: 10 },
  input: {
    flex: 1,
    backgroundColor: colors.white,
    borderRadius: 14,
    paddingHorizontal: 12,
    paddingVertical: 12,
    color: colors.ink,
  },
  card: { backgroundColor: colors.white, borderRadius: 16, padding: 14 },
  name: { color: colors.ink, fontWeight: "800" },
});
