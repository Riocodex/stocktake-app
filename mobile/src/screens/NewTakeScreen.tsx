import { useState } from "react";
import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import type { RootStackParamList } from "../navigation";
import { useScope } from "../scope";
import { colors } from "../theme";
import { OutletPicker, PrimaryButton } from "../ui";

export function NewTakeScreen() {
  const { token, user } = useAuth();
  const { outletId, setOutletId, outlets, isSuper } = useScope();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [area, setArea] = useState<"BAR" | "KITCHEN">("BAR");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function create() {
    if (!token) return;
    setPending(true);
    setError(null);
    try {
      const result = await api.post<{ id: string }>(
        "/api/mobile/stock-takes",
        token,
        { area, outletId: isSuper ? outletId || undefined : user?.outletId },
      );
      navigation.replace("Take", { id: result.id });
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not start.");
    } finally {
      setPending(false);
    }
  }

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Which section?</Text>
      <Text style={styles.copy}>
        A count covers one side of the venue so the list stays short enough to
        walk through.
      </Text>

      {isSuper ? (
        <>
          <Text style={styles.label}>Outlet</Text>
          <OutletPicker outlets={outlets} value={outletId} onChange={setOutletId} />
        </>
      ) : (
        <View style={styles.banner}>
          <Text style={styles.copy}>{user?.outletName}</Text>
        </View>
      )}

      <Pressable
        onPress={() => setArea("BAR")}
        style={[styles.choice, area === "BAR" && styles.choiceOn]}
      >
        <Text style={styles.choiceTitle}>Bar</Text>
        <Text style={styles.copy}>
          Soft drinks, beer, wine, spirits, coffee, merch.
        </Text>
      </Pressable>
      <Pressable
        onPress={() => setArea("KITCHEN")}
        style={[styles.choice, area === "KITCHEN" && styles.choiceOn]}
      >
        <Text style={styles.choiceTitle}>Kitchen</Text>
        <Text style={styles.copy}>
          Dairy, bakery, fruit & veg, dry goods, packaging.
        </Text>
      </Pressable>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={{ marginTop: 24 }}>
        <PrimaryButton
          label={pending ? "Creating…" : "Create and start counting"}
          onPress={create}
          disabled={pending || (isSuper && !outletId)}
        />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream, padding: 20 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800" },
  copy: { color: colors.muted, marginTop: 6, fontSize: 14, lineHeight: 20 },
  label: { color: colors.muted, fontWeight: "800", marginTop: 16 },
  banner: {
    backgroundColor: colors.white,
    borderRadius: 16,
    padding: 14,
    marginTop: 14,
  },
  choice: {
    backgroundColor: colors.white,
    borderRadius: 22,
    padding: 16,
    marginTop: 14,
    borderWidth: 2,
    borderColor: "transparent",
  },
  choiceOn: { borderColor: colors.clay, backgroundColor: "#f9f2ee" },
  choiceTitle: { color: colors.ink, fontSize: 22, fontWeight: "800" },
  error: { color: colors.danger, fontWeight: "700", marginTop: 12 },
});
