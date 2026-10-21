import { useCallback, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Pressable,
  StyleSheet,
  Text,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { useFocusEffect, useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";
import { useSafeAreaInsets } from "react-native-safe-area-context";

import { ApiError, API_URL, api, withQuery } from "../api";
import { useAuth } from "../auth";
import type { RootStackParamList } from "../navigation";
import { useScope } from "../scope";
import { colors } from "../theme";
import { Eyebrow, OutletPicker, PrimaryButton } from "../ui";

type InvoiceRow = {
  id: string;
  status: string;
  invoiceNumber: string | null;
  total: number | null;
  currency: string;
  supplierTextRaw: string | null;
  supplier: { name: string } | null;
  outlet: { name: string };
  invoiceDate: string | null;
};

export function InvoicesScreen() {
  const insets = useSafeAreaInsets();
  const { token } = useAuth();
  const { outletId, setOutletId, outlets, isSuper } = useScope();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [rows, setRows] = useState<InvoiceRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);

  const load = useCallback(async () => {
    if (!token) return;
    setLoading(true);
    try {
      const data = await api.get<{ invoices: InvoiceRow[] }>(
        withQuery("/api/mobile/invoices", {
          outlet: isSuper ? outletId || null : null,
        }),
        token,
      );
      setRows(data.invoices);
    } catch {
      setRows([]);
    } finally {
      setLoading(false);
    }
  }, [token, outletId, isSuper]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function pickAndUpload(fromCamera: boolean) {
    if (!token) return;
    if (isSuper && !outletId) {
      Alert.alert("Choose outlet", "Pick an outlet before uploading.");
      return;
    }

    const permission = fromCamera
      ? await ImagePicker.requestCameraPermissionsAsync()
      : await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert("Permission needed", "Allow camera or photo library access.");
      return;
    }

    const picked = fromCamera
      ? await ImagePicker.launchCameraAsync({
          quality: 0.85,
          allowsEditing: false,
        })
      : await ImagePicker.launchImageLibraryAsync({
          mediaTypes: ["images"],
          quality: 0.85,
        });

    if (picked.canceled || !picked.assets[0]) return;
    const asset = picked.assets[0];

    setUploading(true);
    try {
      const form = new FormData();
      if (isSuper && outletId) form.append("outletId", outletId);
      form.append("file", {
        uri: asset.uri,
        name: asset.fileName ?? "invoice.jpg",
        type: asset.mimeType ?? "image/jpeg",
      } as unknown as Blob);

      const response = await fetch(`${API_URL}/api/mobile/invoices`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: "application/json",
        },
        body: form,
      });
      const data = (await response.json().catch(() => ({}))) as {
        error?: string;
        invoice?: { id: string };
        notice?: string;
      };
      if (!response.ok) {
        throw new ApiError(response.status, data.error || "Upload failed.");
      }
      Alert.alert(
        "Uploaded",
        data.notice ??
          "Review the extraction. Confirming does not change stock.",
      );
      if (data.invoice?.id) {
        navigation.navigate("InvoiceDetail", { id: data.invoice.id });
      } else {
        await load();
      }
    } catch (caught) {
      Alert.alert(
        "Upload failed",
        caught instanceof ApiError ? caught.message : "Could not upload.",
      );
    } finally {
      setUploading(false);
    }
  }

  return (
    <View style={[styles.screen, { paddingTop: insets.top + 8 }]}>
      <Eyebrow>Purchasing</Eyebrow>
      <Text style={styles.title}>Invoices</Text>
      <Text style={styles.copy}>
        Capture or upload a supplier invoice. AI extracts a draft — you review
        and confirm the document only (no stock change).
      </Text>

      {isSuper ? (
        <OutletPicker
          outlets={outlets}
          value={outletId}
          onChange={setOutletId}
        />
      ) : null}

      <View style={styles.actions}>
        <PrimaryButton
          label={uploading ? "Uploading…" : "Take photo"}
          onPress={() => void pickAndUpload(true)}
          disabled={uploading}
        />
        <Pressable
          style={styles.secondary}
          disabled={uploading}
          onPress={() => void pickAndUpload(false)}
        >
          <Text style={styles.secondaryText}>Choose from gallery</Text>
        </Pressable>
      </View>

      {loading ? (
        <ActivityIndicator color={colors.clay} style={{ marginTop: 24 }} />
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(item) => item.id}
          contentContainerStyle={{ paddingBottom: insets.bottom + 24 }}
          renderItem={({ item }) => (
            <Pressable
              style={styles.card}
              onPress={() =>
                navigation.navigate("InvoiceDetail", { id: item.id })
              }
            >
              <Text style={styles.cardTitle}>
                {item.supplier?.name ?? item.supplierTextRaw ?? "Invoice"}
              </Text>
              <Text style={styles.copy}>
                {item.status} · {item.outlet.name}
                {item.invoiceNumber ? ` · #${item.invoiceNumber}` : ""}
              </Text>
              <Text style={styles.copy}>
                {item.total != null
                  ? `${item.currency} ${item.total.toFixed(2)}`
                  : "Total —"}
              </Text>
            </Pressable>
          )}
          ListEmptyComponent={
            <Text style={[styles.copy, { marginTop: 20 }]}>
              No invoices yet.
            </Text>
          }
        />
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, paddingHorizontal: 20 },
  title: { color: colors.ink, fontSize: 32, fontWeight: "800", marginTop: 6 },
  copy: { color: colors.muted, marginTop: 4, lineHeight: 20 },
  actions: { marginTop: 14, gap: 10 },
  secondary: {
    borderRadius: 16,
    paddingVertical: 14,
    alignItems: "center",
    backgroundColor: colors.white,
  },
  secondaryText: { color: colors.ink, fontWeight: "700" },
  card: {
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 16,
    marginTop: 12,
  },
  cardTitle: { color: colors.ink, fontSize: 18, fontWeight: "800" },
});
