import { useState } from "react";
import {
  ActivityIndicator,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";

import { API_URL, ApiError } from "../api";
import { useAuth } from "../auth";
import { colors } from "../theme";

const DEMO_ACCOUNTS = [
  { email: "super@tribemalta.com", label: "Super admin · all outlets" },
  { email: "valletta@tribemalta.com", label: "Outlet admin · Valletta" },
  { email: "naxxar@tribemalta.com", label: "Outlet admin · Naxxar" },
];

export function LoginScreen() {
  const { login } = useAuth();
  const [email, setEmail] = useState("super@tribemalta.com");
  const [password, setPassword] = useState("tribe1234");
  const [error, setError] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  async function submit() {
    setError(null);
    setPending(true);
    try {
      await login(email.trim(), password);
    } catch (caught) {
      setError(caught instanceof ApiError ? caught.message : "Could not sign in.");
    } finally {
      setPending(false);
    }
  }

  return (
    <KeyboardAvoidingView
      style={styles.screen}
      behavior={Platform.OS === "ios" ? "padding" : undefined}
    >
      <ScrollView
        keyboardShouldPersistTaps="handled"
        contentContainerStyle={styles.scroll}
      >
      <View style={styles.card}>
        <Text style={styles.eyebrow}>Stock Take</Text>
        <Text style={styles.title}>Sign in</Text>
        <Text style={styles.copy}>
          Same accounts as the website, including super admin. Counts and
          deliveries land on the same inventory.
        </Text>

        <Text style={styles.label}>Work email</Text>
        <TextInput
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
          value={email}
          onChangeText={setEmail}
          style={styles.input}
        />

        <Text style={styles.label}>Password</Text>
        <TextInput
          secureTextEntry
          value={password}
          onChangeText={setPassword}
          style={styles.input}
        />

        {error ? <Text style={styles.error}>{error}</Text> : null}

        <Text style={styles.hint}>Talking to {API_URL}</Text>

        <Pressable
          onPress={submit}
          disabled={pending}
          style={[styles.button, pending && styles.buttonDisabled]}
        >
          {pending ? (
            <ActivityIndicator color={colors.white} />
          ) : (
            <Text style={styles.buttonText}>Sign in</Text>
          )}
        </Pressable>

        <View style={styles.demo}>
          <Text style={styles.demoTitle}>Demo accounts</Text>
          {DEMO_ACCOUNTS.map((account) => (
            <Pressable
              key={account.email}
              onPress={() => {
                setEmail(account.email);
                setPassword("tribe1234");
                setError(null);
              }}
              style={[
                styles.demoRow,
                email === account.email && styles.demoRowActive,
              ]}
            >
              <Text style={styles.demoEmail}>{account.email}</Text>
              <Text style={styles.demoLabel}>{account.label}</Text>
            </Pressable>
          ))}
          <Text style={styles.demoHint}>
            Password for every demo account: tribe1234
          </Text>
        </View>
      </View>
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.cream,
  },
  scroll: {
    flexGrow: 1,
    justifyContent: "center",
    padding: 24,
  },
  card: {
    backgroundColor: colors.white,
    borderRadius: 28,
    padding: 24,
  },
  eyebrow: {
    color: colors.clay,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 2,
    textTransform: "uppercase",
  },
  title: {
    color: colors.ink,
    fontSize: 28,
    fontWeight: "800",
    marginTop: 8,
  },
  copy: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginTop: 8,
    marginBottom: 20,
  },
  label: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: "700",
    letterSpacing: 1.2,
    textTransform: "uppercase",
    marginBottom: 6,
  },
  input: {
    borderWidth: 1,
    borderColor: "rgba(58,37,31,0.15)",
    borderRadius: 16,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
    color: colors.ink,
    marginBottom: 14,
    backgroundColor: colors.paper,
  },
  error: {
    color: colors.danger,
    fontWeight: "700",
    marginBottom: 12,
  },
  hint: {
    color: colors.muted,
    fontSize: 11,
    marginBottom: 8,
  },
  button: {
    backgroundColor: colors.clay,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 8,
  },
  buttonDisabled: { opacity: 0.6 },
  buttonText: { color: colors.white, fontWeight: "800", fontSize: 16 },
  demo: {
    marginTop: 20,
    backgroundColor: colors.paper,
    borderRadius: 18,
    padding: 14,
  },
  demoTitle: {
    color: colors.sageDark,
    fontSize: 11,
    fontWeight: "800",
    letterSpacing: 1.4,
    textTransform: "uppercase",
    marginBottom: 8,
  },
  demoRow: {
    paddingVertical: 8,
  },
  demoRowActive: {
    backgroundColor: colors.cream,
    marginHorizontal: -6,
    paddingHorizontal: 6,
    borderRadius: 10,
  },
  demoEmail: { color: colors.ink, fontWeight: "700", fontSize: 13 },
  demoLabel: { color: colors.muted, fontSize: 12, marginTop: 2 },
  demoHint: { color: colors.muted, fontSize: 11, marginTop: 10 },
});
