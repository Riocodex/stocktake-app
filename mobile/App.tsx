import { ActivityIndicator, StyleSheet, View } from "react-native";
import { NavigationContainer, DefaultTheme } from "@react-navigation/native";
import { createNativeStackNavigator } from "@react-navigation/native-stack";
import { createBottomTabNavigator } from "@react-navigation/bottom-tabs";
import { StatusBar } from "expo-status-bar";
import { SafeAreaProvider } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";

import { AuthProvider, useAuth } from "./src/auth";
import type { MainTabParamList, RootStackParamList } from "./src/navigation";
import { ScopeProvider } from "./src/scope";
import { DeliveryScreen } from "./src/screens/DeliveryScreen";
import { HomeScreen } from "./src/screens/HomeScreen";
import { InventoryScreen } from "./src/screens/InventoryScreen";
import { LoginScreen } from "./src/screens/LoginScreen";
import { MoreScreen } from "./src/screens/MoreScreen";
import { NewProductScreen } from "./src/screens/NewProductScreen";
import { NewTakeScreen } from "./src/screens/NewTakeScreen";
import { OutletsScreen } from "./src/screens/OutletsScreen";
import { ProductScreen } from "./src/screens/ProductScreen";
import { TakeScreen } from "./src/screens/TakeScreen";
import { TakesScreen } from "./src/screens/TakesScreen";
import { TeamScreen } from "./src/screens/TeamScreen";
import { colors } from "./src/theme";

const Stack = createNativeStackNavigator<RootStackParamList>();
const Tabs = createBottomTabNavigator<MainTabParamList>();

const navTheme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    background: colors.cream,
    card: colors.cream,
    text: colors.ink,
    primary: colors.clay,
    border: "rgba(58,37,31,0.08)",
  },
};

function tabIcon(name: keyof typeof Ionicons.glyphMap) {
  return ({ color, size }: { color: string; size: number }) => (
    <Ionicons name={name} color={color} size={size} />
  );
}

function MainTabs() {
  return (
    <Tabs.Navigator
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: colors.clay,
        tabBarInactiveTintColor: colors.muted,
        tabBarStyle: { backgroundColor: colors.creamDeep },
      }}
    >
      <Tabs.Screen
        name="Home"
        component={HomeScreen}
        options={{ tabBarIcon: tabIcon("home-outline") }}
      />
      <Tabs.Screen
        name="Takes"
        component={TakesScreen}
        options={{ title: "Takes", tabBarIcon: tabIcon("clipboard-outline") }}
      />
      <Tabs.Screen
        name="Inventory"
        component={InventoryScreen}
        options={{ tabBarIcon: tabIcon("cube-outline") }}
      />
      <Tabs.Screen
        name="More"
        component={MoreScreen}
        options={{ tabBarIcon: tabIcon("ellipsis-horizontal") }}
      />
    </Tabs.Navigator>
  );
}

function Root() {
  const { ready, token } = useAuth();

  if (!ready) {
    return (
      <View style={styles.boot}>
        <ActivityIndicator color={colors.clay} />
      </View>
    );
  }

  return (
    <NavigationContainer theme={navTheme}>
      <Stack.Navigator
        screenOptions={{
          headerTintColor: colors.ink,
          headerStyle: { backgroundColor: colors.cream },
          contentStyle: { backgroundColor: colors.cream },
        }}
      >
        {token ? (
          <>
            <Stack.Screen
              name="Main"
              component={MainTabs}
              options={{ headerShown: false }}
            />
            <Stack.Screen
              name="NewTake"
              component={NewTakeScreen}
              options={{ title: "New stock take" }}
            />
            <Stack.Screen
              name="Take"
              component={TakeScreen}
              options={{ title: "Stock take" }}
            />
            <Stack.Screen
              name="NewProduct"
              component={NewProductScreen}
              options={{ title: "Add product" }}
            />
            <Stack.Screen
              name="Product"
              component={ProductScreen}
              options={{ title: "Product" }}
            />
            <Stack.Screen
              name="Delivery"
              component={DeliveryScreen}
              options={{ title: "Delivery" }}
            />
            <Stack.Screen
              name="Outlets"
              component={OutletsScreen}
              options={{ title: "Outlets" }}
            />
            <Stack.Screen
              name="Team"
              component={TeamScreen}
              options={{ title: "Team" }}
            />
          </>
        ) : (
          <Stack.Screen
            name="Login"
            component={LoginScreen}
            options={{ headerShown: false }}
          />
        )}
      </Stack.Navigator>
    </NavigationContainer>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <AuthProvider>
        <ScopeProvider>
          <StatusBar style="dark" />
          <Root />
        </ScopeProvider>
      </AuthProvider>
    </SafeAreaProvider>
  );
}

const styles = StyleSheet.create({
  boot: {
    flex: 1,
    backgroundColor: colors.cream,
    alignItems: "center",
    justifyContent: "center",
  },
});
