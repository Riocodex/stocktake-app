import { useEffect, useState } from "react";
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

import { ApiError, api } from "../api";
import { useAuth } from "../auth";
import type { RootStackParamList } from "../navigation";
import { colors } from "../theme";
import { PrimaryButton } from "../ui";

const UNITS = [
  "unit",
  "bottle",
  "can",
  "carton",
  "case",
  "keg",
  "kg",
  "g",
  "litre",
  "ml",
  "pack",
  "punnet",
  "tray",
  "box",
  "bag",
  "tin",
  "tub",
  "loaf",
  "slice",
  "block",
];

export function NewProductScreen() {
  const { token } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const [categories, setCategories] = useState<{ id: string; name: string }[]>([]);
  const [name, setName] = useState("");
  const [brand, setBrand] = useState("");
  const [unit, setUnit] = useState("bottle");
  const [price, setPrice] = useState("");
  const [categoryId, setCategoryId] = useState("");
  const [supplierPackQty, setSupplierPackQty] = useState("");
  const [packSize, setPackSize] = useState("");
  const [picture, setPicture] = useState<{ uri: string; base64: string; type: string } | null>(null);
  const [pending, setPending] = useState(false);

  useEffect(() => {
    if (!token) return;
    api
      .get<{ categories: { id: string; name: string }[] }>(
        "/api/mobile/inventory",
        token,
      )
      .then((data) => setCategories(data.categories))
      .catch(() => undefined);
  }, [token]);

  async function pickPicture() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) return;
    const result = await ImagePicker.launchImageLibraryAsync({
      quality: 0.7,
      base64: true,
      mediaTypes: ["images"],
    });
    if (result.canceled || !result.assets[0]?.base64) return;
    const asset = result.assets[0];
    setPicture({
      uri: asset.uri,
      base64: asset.base64 ?? "",
      type: asset.mimeType || "image/jpeg",
    });
  }

  async function save() {
    if (!token) return;
    setPending(true);
    try {
      const result = await api.post<{ id: string }>("/api/mobile/inventory", token, {
        name,
        brand: brand || undefined,
        unit,
        categoryId,
        price: Number(price),
        packSize: packSize || undefined,
        supplierPackQty: supplierPackQty ? Number(supplierPackQty) : null,
        imageBase64: picture?.base64,
        imageType: picture?.type,
      });
      navigation.replace("Product", { id: result.id });
    } catch (caught) {
      Alert.alert("Could not add", caught instanceof ApiError ? caught.message : "");
    } finally {
      setPending(false);
    }
  }

  return (
    <ScrollView style={styles.screen} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Add a product</Text>
      <TextInput
        placeholder="Name"
        placeholderTextColor={colors.muted}
        value={name}
        onChangeText={setName}
        style={styles.input}
      />
      <TextInput
        placeholder="Brand"
        placeholderTextColor={colors.muted}
        value={brand}
        onChangeText={setBrand}
        style={styles.input}
      />
      <TextInput
        placeholder="Price €"
        placeholderTextColor={colors.muted}
        keyboardType="decimal-pad"
        value={price}
        onChangeText={setPrice}
        style={styles.input}
      />
      <TextInput
        placeholder="Qty from supplier"
        placeholderTextColor={colors.muted}
        keyboardType="decimal-pad"
        value={supplierPackQty}
        onChangeText={setSupplierPackQty}
        style={styles.input}
      />
      <TextInput
        placeholder="Pack size, e.g. 24x200ml"
        placeholderTextColor={colors.muted}
        value={packSize}
        onChangeText={setPackSize}
        style={styles.input}
      />

      <Pressable style={styles.photo} onPress={pickPicture}>
        {picture ? (
          <Image source={{ uri: picture.uri }} style={styles.preview} />
        ) : (
          <Text style={styles.link}>Add a picture</Text>
        )}
      </Pressable>

      <Text style={styles.label}>Unit</Text>
      <View style={styles.wrap}>
        {UNITS.map((option) => (
          <Pressable
            key={option}
            onPress={() => setUnit(option)}
            style={[styles.chip, unit === option && styles.chipOn]}
          >
            <Text style={[styles.chipText, unit === option && styles.chipTextOn]}>
              {option}
            </Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.label}>Section</Text>
      <View style={styles.wrap}>
        {categories.map((category) => (
          <Pressable
            key={category.id}
            onPress={() => setCategoryId(category.id)}
            style={[styles.chip, categoryId === category.id && styles.chipOn]}
          >
            <Text
              style={[
                styles.chipText,
                categoryId === category.id && styles.chipTextOn,
              ]}
            >
              {category.name}
            </Text>
          </Pressable>
        ))}
      </View>

      <PrimaryButton
        label={pending ? "Adding…" : "Add product"}
        onPress={save}
        disabled={pending}
      />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: colors.cream },
  content: { padding: 20, paddingBottom: 40, gap: 8 },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800", marginBottom: 8 },
  input: {
    backgroundColor: colors.white,
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    color: colors.ink,
  },
  photo: {
    backgroundColor: colors.white,
    borderRadius: 16,
    minHeight: 88,
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  preview: { width: "100%", height: 160 },
  link: { color: colors.clay, fontWeight: "800" },
  label: { color: colors.muted, fontWeight: "800", marginTop: 8 },
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderWidth: 1,
    borderColor: "rgba(58,37,31,0.15)",
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.white,
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  chipText: { color: colors.ink, fontWeight: "700", fontSize: 12 },
  chipTextOn: { color: colors.cream },
});
