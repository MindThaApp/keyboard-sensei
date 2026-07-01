import { createContext, useContext, useMemo, useState, type ReactNode } from "react";
import type { AuthUser } from "@keyboard-sensei/shared-types";
import * as api from "../services/api";
import { useProgressStore } from "../state/progressStore";

type AuthContextValue = { authenticated: boolean; user: AuthUser | null; login(email: string, password: string): Promise<void>; register(email: string, password: string, name: string): Promise<void>; logout(): void };
const AuthContext = createContext<AuthContextValue | null>(null);
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const reset = useProgressStore((state) => state.reset);
  const accept = (response: Awaited<ReturnType<typeof api.login>>) => { api.setToken(response.accessToken); setUser(response.user); reset(); };
  const value = useMemo<AuthContextValue>(() => ({
    authenticated: Boolean(api.getToken()), user,
    login: async (email, password) => accept(await api.login(email, password)),
    register: async (email, password, name) => accept(await api.register(email, password, name)),
    logout: () => { api.clearToken(); setUser(null); reset(); },
  }), [user, reset]);
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() { const value = useContext(AuthContext); if (!value) throw new Error("useAuth requires AuthProvider"); return value; }
