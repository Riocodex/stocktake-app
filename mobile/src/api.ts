import Constants from "expo-constants";
import { NativeModules, Platform } from "react-native";

const API_PORT = "3111";

function hostnameFrom(value: string | null | undefined): string | null {
  if (!value) return null;
  try {
    const url = new URL(value.includes("://") ? value : `http://${value}`);
    return url.hostname || null;
  } catch {
    const host = value.replace(/^[a-z]+:\/\//i, "").split("/")[0]?.split(":")[0];
    return host || null;
  }
}

function isLanHost(host: string) {
  return /^\d{1,3}(\.\d{1,3}){3}$/.test(host);
}

function inferredDevHost(): string | null {
  const source = NativeModules.SourceCode as { scriptURL?: string } | undefined;
  const goConfig = Constants.expoGoConfig as { debuggerHost?: string } | null;
  const candidates = [
    hostnameFrom(source?.scriptURL),
    hostnameFrom(goConfig?.debuggerHost),
    hostnameFrom(Constants.expoConfig?.hostUri),
    hostnameFrom(Constants.linkingUri),
  ];

  for (const host of candidates) {
    if (host && isLanHost(host)) return host;
  }
  return null;
}

const DEFAULT_API =
  Platform.OS === "android" ? `http://10.0.2.2:${API_PORT}` : `http://localhost:${API_PORT}`;

const lanHost = inferredDevHost();

export const API_URL = (
  process.env.EXPO_PUBLIC_API_URL ||
  (lanHost ? `http://${lanHost}:${API_PORT}` : DEFAULT_API)
).replace(/\/$/, "");

export class ApiError extends Error {
  constructor(
    public status: number,
    message: string,
  ) {
    super(message);
  }
}

async function request<T>(
  path: string,
  options: RequestInit & { token?: string | null; json?: boolean } = {},
): Promise<T> {
  const { token, headers, json = true, ...rest } = options;
  const isFormData =
    typeof FormData !== "undefined" && rest.body instanceof FormData;
  let response: Response;
  try {
    response = await fetch(`${API_URL}${path}`, {
      ...rest,
      headers: {
        Accept: json ? "application/json" : "*/*",
        // Let the runtime set multipart boundaries for FormData uploads.
        ...(rest.body && json && !isFormData
          ? { "Content-Type": "application/json" }
          : {}),
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...headers,
      },
    });
  } catch {
    throw new ApiError(
      0,
      `Cannot reach the Mac at ${API_URL}. Keep the website running with npm run dev.`,
    );
  }

  if (!json) {
    if (!response.ok) {
      throw new ApiError(response.status, "Request failed.");
    }
    return (await response.text()) as T;
  }

  const data = (await response.json().catch(() => ({}))) as {
    error?: string;
  } & T;

  if (!response.ok) {
    throw new ApiError(response.status, data.error || "Request failed.");
  }

  return data;
}

export function withQuery(path: string, params: Record<string, string | undefined | null>) {
  const search = new URLSearchParams();
  for (const [key, value] of Object.entries(params)) {
    if (value) search.set(key, value);
  }
  const suffix = search.toString();
  return suffix ? `${path}?${suffix}` : path;
}

export const api = {
  get: <T>(path: string, token: string | null) =>
    request<T>(path, { method: "GET", token }),
  post: <T>(path: string, token: string | null, body?: unknown) =>
    request<T>(path, {
      method: "POST",
      token,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  del: <T>(path: string, token: string | null, body?: unknown) =>
    request<T>(path, {
      method: "DELETE",
      token,
      body: body === undefined ? undefined : JSON.stringify(body),
    }),
  upload: <T>(path: string, token: string | null, body: FormData) =>
    request<T>(path, { method: "POST", token, body, json: true }),
  downloadText: (path: string, token: string | null) =>
    request<string>(path, { method: "GET", token, json: false }),
};

export function mediaUrl(path: string | null | undefined) {
  if (!path) return null;
  if (path.startsWith("http")) return path;
  return `${API_URL}${path}`;
}

export function money(value: number) {
  return new Intl.NumberFormat("en-MT", {
    style: "currency",
    currency: "EUR",
  }).format(value);
}

export function qty(value: number) {
  return new Intl.NumberFormat("en-MT", { maximumFractionDigits: 2 }).format(
    value,
  );
}
