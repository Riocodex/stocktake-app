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
import { useAuth } from "./auth";

const KEY = "tribe_outlet_scope";

export type OutletOption = { id: string; name: string; city: string | null };

type ScopeValue = {
  outletId: string;
  setOutletId: (id: string) => void;
  outlets: OutletOption[];
  isSuper: boolean;
};

const ScopeContext = createContext<ScopeValue | null>(null);

export function ScopeProvider({ children }: { children: ReactNode }) {
  const { token, user } = useAuth();
  const isSuper = user?.role === "SUPER_ADMIN";
  const [outletId, setOutletIdState] = useState("");
  const [outlets, setOutlets] = useState<OutletOption[]>([]);

  useEffect(() => {
    if (!isSuper) {
      setOutletIdState(user?.outletId ?? "");
      return;
    }
    SecureStore.getItemAsync(KEY)
      .then((stored) => {
        if (stored && stored !== "all") setOutletIdState(stored);
      })
      .catch(() => undefined);
  }, [isSuper, user?.outletId]);

  useEffect(() => {
    if (!token || !isSuper) return;
    api
      .get<{ outlets: OutletOption[] }>("/api/mobile/home", token)
      .then((data) => setOutlets(data.outlets ?? []))
      .catch(() => undefined);
  }, [token, isSuper]);

  const setOutletId = useCallback(
    (id: string) => {
      setOutletIdState(id);
      if (isSuper) {
        SecureStore.setItemAsync(KEY, id || "all").catch(() => undefined);
      }
    },
    [isSuper],
  );

  const value = useMemo(
    () => ({ outletId, setOutletId, outlets, isSuper }),
    [outletId, setOutletId, outlets, isSuper],
  );

  return <ScopeContext.Provider value={value}>{children}</ScopeContext.Provider>;
}

export function useScope() {
  const context = useContext(ScopeContext);
  if (!context) throw new Error("useScope must be used inside ScopeProvider");
  return context;
}
