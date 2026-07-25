import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { setApiKey, deleteApiKey, testConnection, checkAuth, getBalance } from "../../api/endpoints/auth";

interface AuthState {
  isAuthenticated: boolean;
  apiKey: string | null;
  balance: string | null;
  onboardingComplete: boolean;
  initialized: boolean;
}

interface AuthContextValue extends AuthState {
  login: (key: string) => Promise<{ success: boolean; balance?: string; error?: string }>;
  logout: () => void;
  completeOnboarding: () => void;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [state, setState] = useState<AuthState>({
    isAuthenticated: false,
    apiKey: null,
    balance: null,
    onboardingComplete: false,
    initialized: false,
  });

  useEffect(() => {
    checkAuth().then((hasKey) => {
      if (hasKey) {
        setState({
          isAuthenticated: true,
          apiKey: null,
          balance: null,
          onboardingComplete: true,
          initialized: true,
        });
      } else {
        setState((prev) => ({ ...prev, initialized: true }));
      }
    }).catch(() => {
      setState((prev) => ({ ...prev, initialized: true }));
    });
  }, []);

  const login = useCallback(async (key: string) => {
    try {
      await setApiKey(key);
      await testConnection();
    } catch (e) {
      console.error("[Auth] testConnection failed:", e);
      // Roll back the invalid key so the next launch doesn't skip onboarding
      try {
        await deleteApiKey();
      } catch (delErr) {
        console.error("[Auth] failed to roll back invalid key:", delErr);
      }
      return { success: false, error: String(e) };
    }

    let balance: string | null = null;
    try {
      const balanceJson = await getBalance();
      const parsed = JSON.parse(balanceJson);
      const raw = parsed?.balance ?? parsed?.data?.balance ?? parsed?.amount;
      balance = raw != null ? String(raw) : null;
    } catch (e) {
      console.warn("[Auth] getBalance failed:", e);
    }

    setState({
      isAuthenticated: true,
      apiKey: key,
      balance,
      onboardingComplete: false,
      initialized: true,
    });
    return { success: true, balance: balance ?? undefined };
  }, []);

  const logout = useCallback(() => {
    deleteApiKey().catch((e) => console.error("[Auth] deleteApiKey failed:", e));
    setState({
      isAuthenticated: false,
      apiKey: null,
      balance: null,
      onboardingComplete: false,
      initialized: true,
    });
  }, []);

  const completeOnboarding = useCallback(() => {
    setState((prev) => ({ ...prev, onboardingComplete: true }));
  }, []);

  return (
    <AuthContext.Provider value={{ ...state, login, logout, completeOnboarding }}>
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
