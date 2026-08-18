import type { LoginInput, RegisterInput } from "@resitku/shared";
import type { ReactNode } from "react";
import { createContext, useContext, useEffect, useMemo, useState } from "react";

import { apiRequest } from "../lib/apiClient";
import { getSessionGeneration, setAccessToken, subscribeToAccessToken } from "../lib/authToken";

interface CurrentUser {
  id: string;
  name: string;
  email: string;
}

interface AuthResponse {
  accessToken: string;
  user: CurrentUser;
}

type AuthStatus = "loading" | "authenticated" | "anonymous";

interface AuthContextValue {
  user: CurrentUser | null;
  status: AuthStatus;
  login: (input: LoginInput) => Promise<void>;
  register: (input: RegisterInput) => Promise<void>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<CurrentUser | null>(null);
  const [status, setStatus] = useState<AuthStatus>("loading");

  useEffect(
    () =>
      subscribeToAccessToken((token) => {
        // Hanya bertindak balas kepada token yang hilang secara senyap
        // (sesi luput semasa apiClient.ts cuba refresh) — login/register/
        // logout sudah mengemas kini status mereka sendiri secara terus.
        if (token === null) {
          setUser(null);
          setStatus((current) => (current === "loading" ? current : "anonymous"));
        }
      }),
    [],
  );

  useEffect(() => {
    let cancelled = false;

    // Token akses sengaja tidak disimpan merentasi muat semula halaman.
    // Cookie refresh httpOnly-lah yang berdaya tahan, jadi setiap kali app
    // dimuatkan, cuba tukarkannya kepada sesi baharu dahulu sebelum
    // mengisytiharkan pengguna "belum log masuk".
    void (async () => {
      const generationAtStart = getSessionGeneration();
      const stillCurrent = () => !cancelled && getSessionGeneration() === generationAtStart;

      try {
        const response = await apiRequest<AuthResponse>("/api/auth/refresh", {
          method: "POST",
          skipAuth: true,
        });

        if (!stillCurrent()) {
          return;
        }
        setAccessToken(response.accessToken);
        setUser(response.user);
        setStatus("authenticated");
      } catch {
        if (stillCurrent()) {
          setStatus("anonymous");
        }
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const value = useMemo<AuthContextValue>(
    () => ({
      user,
      status,
      async login(input) {
        const response = await apiRequest<AuthResponse>("/api/auth/login", {
          method: "POST",
          body: input,
          skipAuth: true,
        });

        setAccessToken(response.accessToken);
        setUser(response.user);
        setStatus("authenticated");
      },
      async register(input) {
        const response = await apiRequest<AuthResponse>("/api/auth/register", {
          method: "POST",
          body: input,
          skipAuth: true,
        });

        setAccessToken(response.accessToken);
        setUser(response.user);
        setStatus("authenticated");
      },
      async logout() {
        await apiRequest("/api/auth/logout", { method: "POST", skipAuth: true }).catch(
          () => undefined,
        );
        setAccessToken(null);
        setUser(null);
        setStatus("anonymous");
      },
    }),
    [user, status],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components -- useAuth belongs beside the provider it reads from; splitting it into its own file for this rule would hurt readability far more than the occasional slower refresh it guards against.
export function useAuth(): AuthContextValue {
  const context = useContext(AuthContext);

  if (context === null) {
    throw new Error("useAuth must be used within an AuthProvider");
  }

  return context;
}
