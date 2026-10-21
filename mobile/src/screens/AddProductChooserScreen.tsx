import { Pressable, StyleSheet, Text, View } from "react-native";
import { useNavigation } from "@react-navigation/native";
import type { NativeStackNavigationProp } from "@react-navigation/native-stack";

import { useAuth } from "../auth";
import type { RootStackParamList } from "../navigation";
import { colors } from "../theme";
import { Eyebrow } from "../ui";

export function AddProductChooserScreen() {
  const { user } = useAuth();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const isSuper = user?.role === "SUPER_ADMIN";

  return (
    <View style={styles.screen}>
      <Eyebrow>Add product</Eyebrow>
      <Text style={styles.title}>What would you like to add?</Text>
      <Text style={styles.copy}>
        Items are physical stock. Dishes are prepared menu products.
      </Text>

      <Pressable
        style={styles.card}
        onPress={() => navigation.navigate("NewItem")}
      >
        <Text style={styles.cardEyebrow}>Item</Text>
        <Text style={styles.cardTitle}>Physical product</Text>
        <Text style={styles.copy}>
          Purchased, counted and transferred inventory.
        </Text>
      </Pressable>

      {isSuper ? (
        <Pressable
          style={styles.card}
          onPress={() => navigation.navigate("NewDish")}
        >
          <Text style={styles.cardEyebrow}>Dish</Text>
          <Text style={styles.cardTitle}>Prepared product</Text>
          <Text style={styles.copy}>
            Selling price now; recipes and costing later.
          </Text>
        </Pressable>
      ) : (
        <View style={[styles.card, { opacity: 0.7 }]}>
          <Text style={styles.cardEyebrow}>Dish</Text>
          <Text style={styles.cardTitle}>Prepared product</Text>
          <Text style={styles.copy}>Only super admins can create dishes.</Text>
        </View>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.cream,
    padding: 20,
  },
  title: { color: colors.ink, fontSize: 28, fontWeight: "800", marginTop: 6 },
  copy: { color: colors.muted, marginTop: 6, lineHeight: 20 },
  card: {
    marginTop: 16,
    backgroundColor: colors.white,
    borderRadius: 20,
    padding: 16,
  },
  cardEyebrow: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 0.6,
    textTransform: "uppercase",
  },
  cardTitle: {
    color: colors.ink,
    fontSize: 20,
    fontWeight: "800",
    marginTop: 6,
  },
});
