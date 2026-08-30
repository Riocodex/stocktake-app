import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import * as SecureStore from "expo-secure-store";

import { api } from "./api";

const TOKEN_KEY = "tribe_session_token";
let memoryToken: string | null = null;

async function readToken() {
  try {
    return (await SecureStore.getItemAsync(TOKEN_KEY)) ?? memoryToken;
  } catch {
    return memoryToken;
  }
}

async function writeToken(token: string | null) {
  memoryToken = token;
  try {
    if (token) await SecureStore.setItemAsync(TOKEN_KEY, token);
    else await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    // Expo web has no secure store; memory is enough for that session.
  }
}

export type AppUser = {
  id: string;
  email: string;
  name: string;
  role: string;
  outletId: string | null;
  outletName: string | null;
};

type AuthContextValue = {
  ready: boolean;
  token: string | null;
  user: AppUser | null;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [ready, setReady] = useState(false);
  const [token, setToken] = useState<string | null>(null);
  const [user, setUser] = useState<AppUser | null>(null);

  useEffect(() => {
    (async () => {
      try {
        const stored = await readToken();
        if (stored) {
          const data = await api.get<{ user: AppUser }>("/api/mobile/me", stored);
          setToken(stored);
          setUser(data.user);
        }
      } catch {
        await writeToken(null);
      } finally {
        setReady(true);
      }
    })();
  }, []);

  const login = useCallback(async (email: string, password: string) => {
    const data = await api.post<{ token: string; user: AppUser }>(
      "/api/mobile/login",
      null,
      { email, password },
    );
    await writeToken(data.token);
    setToken(data.token);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    await writeToken(null);
    setToken(null);
    setUser(null);
  }, []);

  const value = useMemo(
    () => ({ ready, token, user, login, logout }),
    [ready, token, user, login, logout],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error("useAuth must be used inside AuthProvider");
  return context;
}
