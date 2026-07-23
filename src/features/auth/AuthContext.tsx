import { createContext, useContext, useState, useCallback, useEffect, type ReactNode } from "react";
import { setApiKey, testConnection, checkAuth } from "../../api/endpoints/auth";

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
      const result = await testConnection();
      const parsed = JSON.parse(result);
      const balance = parsed?.balance || parsed?.data?.[0]?.balance;
      setState({
        isAuthenticated: true,
        apiKey: key,
        balance: balance?.toString() ?? null,
        onboardingComplete: false,
        initialized: true,
      });
      return { success: true, balance: balance?.toString() };
    } catch (e) {
      console.error("[Auth] testConnection failed:", e);
      return { success: false, error: String(e) };
    }
  }, []);

  const logout = useCallback(() => {
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
