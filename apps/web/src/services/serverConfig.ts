import { useEffect, useState } from "react";
import { API_URL } from "./api";

/** Deployment features from GET /config, so the UI hides what this server doesn't offer. */
export interface ServerConfig {
  publicCatalogue: boolean;
  googleSignIn: boolean;
  registrationOpen: boolean;
}

let cached: Promise<ServerConfig> | null = null;

export function getServerConfig(): Promise<ServerConfig> {
  cached ??= fetch(`${API_URL}/config`)
    .then((response) => {
      if (!response.ok) throw new Error(`config ${response.status}`);
      return response.json() as Promise<ServerConfig>;
    })
    .catch((error: unknown) => {
      cached = null;
      throw error;
    });
  return cached;
}

/** null until loaded (or if the request failed): callers treat unknown as "feature off". */
export function useServerConfig(): ServerConfig | null {
  const [config, setConfig] = useState<ServerConfig | null>(null);
  useEffect(() => {
    let cancelled = false;
    getServerConfig()
      .then((value) => !cancelled && setConfig(value))
      .catch(() => undefined);
    return () => {
      cancelled = true;
    };
  }, []);
  return config;
}
