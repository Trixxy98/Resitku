import { getAccessToken, getSessionGeneration, setAccessToken } from "./authToken";

const API_BASE = import.meta.env.VITE_API_URL ?? "";

interface ApiErrorBody {
  error?: { code?: string; message?: string; details?: unknown };
}

export class ApiError extends Error {
  readonly status: number;
  readonly code: string | undefined;
  readonly details: unknown;

  constructor(status: number, message: string, code?: string, details?: unknown) {
    super(message);
    this.name = "ApiError";
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

interface RequestOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  body?: unknown;
  /// Untuk login/register/refresh/logout — permintaan ini tidak membawa (dan
  /// tidak boleh cuba refresh) token akses, kerana itulah tujuannya wujud.
  skipAuth?: boolean;
}

let pendingRefresh: Promise<string | null> | null = null;

/// Dikongsi oleh semua panggilan serentak yang terkena 401 pada masa yang
/// sama, supaya satu sesi yang luput tidak mencetuskan berbilang permintaan
/// /api/auth/refresh serentak — hanya pemanggil pertama benar-benar
/// menghantar permintaan itu.
async function refreshAccessToken(): Promise<string | null> {
  pendingRefresh ??= (async () => {
    // Ditangkap sekali sahaja di sini, pada permulaan percubaan refresh yang
    // sebenar — bukan bagi setiap pemanggil yang berkongsi promise ini.
    // Sesuatu boleh menukar sesi (logout, login semula) sementara fetch di
    // bawah masih menunggu; membandingkannya selepas itu memastikan hasil
    // yang lapuk tidak menulis ganti keadaan yang lebih baharu.
    const generationAtStart = getSessionGeneration();
    const stillCurrent = () => getSessionGeneration() === generationAtStart;

    try {
      const response = await fetch(`${API_BASE}/api/auth/refresh`, {
        method: "POST",
        credentials: "include",
      });

      if (!response.ok) {
        if (stillCurrent()) {
          setAccessToken(null);
        }
        return null;
      }

      const body = (await response.json()) as { accessToken: string };

      if (!stillCurrent()) {
        return null;
      }

      setAccessToken(body.accessToken);
      return body.accessToken;
    } catch {
      if (stillCurrent()) {
        setAccessToken(null);
      }
      return null;
    }
  })().finally(() => {
    pendingRefresh = null;
  });

  return pendingRefresh;
}

async function send(path: string, options: RequestOptions): Promise<Response> {
  const headers: Record<string, string> = {};
  const token = getAccessToken();

  if (options.body !== undefined) {
    headers["content-type"] = "application/json";
  }

  if (!options.skipAuth && token !== null) {
    headers["authorization"] = `Bearer ${token}`;
  }

  return fetch(`${API_BASE}${path}`, {
    method: options.method ?? "GET",
    headers,
    credentials: "include",
    body: options.body === undefined ? undefined : JSON.stringify(options.body),
  });
}

export async function apiRequest<T = undefined>(
  path: string,
  options: RequestOptions = {},
): Promise<T> {
  let response = await send(path, options);

  if (response.status === 401 && options.skipAuth !== true) {
    const refreshedToken = await refreshAccessToken();

    if (refreshedToken !== null) {
      response = await send(path, options);
    }
  }

  if (!response.ok) {
    const payload = (await response.json().catch(() => null)) as ApiErrorBody | null;

    throw new ApiError(
      response.status,
      payload?.error?.message ?? "Something went wrong",
      payload?.error?.code,
      payload?.error?.details,
    );
  }

  if (response.status === 204) {
    return undefined as T;
  }

  return (await response.json()) as T;
}
