import { createContext, useCallback, useContext, useEffect, useMemo, useState, type ReactNode } from "react";
import type { AuthUser } from "@keyboard-sensei/shared-types";
import * as api from "../services/api";
import { useProgressStore } from "../state/progressStore";

type AuthContextValue = {
  authenticated: boolean;
  user: AuthUser | null;
  login(email: string, password: string): Promise<void>;
  register(email: string, password: string, name: string): Promise<void>;
  logout(): void;
  setUser(user: AuthUser): void;
};
const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  // `authenticated` is real state, not derived impurely from api.getToken() inside a
  // useMemo — that version could go stale: if `user` was already null (e.g. after a
  // page reload, since nothing repopulates it from a persisted token), calling
  // setUser(null) on logout is a no-op re-render, so a memo keyed on [user] would
  // never recompute and `authenticated` would stay stuck true after logout.
  const [authenticated, setAuthenticated] = useState(() => Boolean(api.getToken()));
  const [user, setUser] = useState<AuthUser | null>(null);
  const reset = useProgressStore((state) => state.reset);

  useEffect(() => {
    if (authenticated && !user) {
      void api.getCurrentUser().then(setUser).catch(() => {
        api.clearToken();
        setAuthenticated(false);
      });
    }
  }, [authenticated, user]);

  const accept = useCallback(
    (response: { accessToken: string; user: AuthUser }) => {
      api.setToken(response.accessToken);
      setUser(response.user);
      setAuthenticated(true);
      reset();
    },
    [reset],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      authenticated,
      user,
      login: async (email, password) => accept(await api.login(email, password)),
      register: async (email, password, name) => accept(await api.register(email, password, name)),
      logout: () => {
        api.clearToken();
        setUser(null);
        setAuthenticated(false);
        reset();
      },
      setUser,
    }),
    [authenticated, user, accept, reset],
  );
  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}
export function useAuth() {
  const value = useContext(AuthContext);
  if (!value) throw new Error("useAuth requires AuthProvider");
  return value;
}
