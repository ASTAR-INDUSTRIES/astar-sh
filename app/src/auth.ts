import { fetch } from "@tauri-apps/plugin-http";
import { invoke } from "@tauri-apps/api/core";

const TENANT = "d6af3688-b659-4f90-b701-35246b209b9d";
const CLIENT = "384f7660-f5e6-4f72-aa24-3be21cad67ed";
const SCOPES = "openid profile email";

export type DeviceFlow = {
  user_code: string;
  device_code: string;
  verification_uri: string;
  expires_in: number;
  interval: number;
  message?: string;
};

export type Tokens = {
  id_token: string;
  access_token?: string;
  expires_in: number;
};

export async function startDeviceFlow(): Promise<DeviceFlow> {
  const res = await fetch(
    `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/devicecode`,
    {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_id: CLIENT,
        scope: SCOPES,
      }).toString(),
    },
  );
  if (!res.ok) {
    throw new Error(`devicecode failed: ${res.status} ${await res.text()}`);
  }
  return res.json();
}

export async function pollForTokens(
  flow: DeviceFlow,
  signal: AbortSignal,
): Promise<Tokens> {
  const startedAt = Date.now();
  const expiryMs = (flow.expires_in - 5) * 1000;
  let interval = Math.max(flow.interval, 1);

  while (!signal.aborted) {
    await new Promise((r) => setTimeout(r, interval * 1000));
    if (signal.aborted) throw new Error("aborted");
    if (Date.now() - startedAt > expiryMs) {
      throw new Error("device code expired — try again");
    }

    const res = await fetch(
      `https://login.microsoftonline.com/${TENANT}/oauth2/v2.0/token`,
      {
        method: "POST",
        headers: { "Content-Type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({
          grant_type: "urn:ietf:params:oauth:grant-type:device_code",
          client_id: CLIENT,
          device_code: flow.device_code,
        }).toString(),
      },
    );

    const data = await res.json();

    if (res.ok && data.id_token) {
      return data as Tokens;
    }

    if (data.error === "authorization_pending") continue;
    if (data.error === "slow_down") {
      interval += 5;
      continue;
    }
    if (data.error === "expired_token" || data.error === "code_expired") {
      throw new Error("device code expired — try again");
    }
    throw new Error(data.error_description || data.error || "auth failed");
  }
  throw new Error("aborted");
}

export function parseJwt(token: string): {
  email?: string;
  preferred_username?: string;
  name?: string;
  exp?: number;
} {
  try {
    const payload = token.split(".")[1];
    const padded = payload + "=".repeat((4 - (payload.length % 4)) % 4);
    const json = atob(padded.replace(/-/g, "+").replace(/_/g, "/"));
    return JSON.parse(json);
  } catch {
    return {};
  }
}

export async function persistAuth(tokens: Tokens) {
  const claims = parseJwt(tokens.id_token);
  const email = claims.email || claims.preferred_username || "";
  const name = claims.name || email;
  if (!email.toLowerCase().endsWith("@astarconsulting.no")) {
    throw new Error(
      `only @astarconsulting.no accounts allowed (got "${email}")`,
    );
  }
  const expiresAt = claims.exp
    ? claims.exp * 1000
    : Date.now() + (tokens.expires_in ?? 3600) * 1000;

  await invoke("save_auth", {
    token: tokens.id_token,
    expiresAt,
    accountEmail: email,
    accountName: name,
  });

  return { email, name, expiresAt };
}

export async function openInBrowser(url: string) {
  try {
    await invoke("open_url", { url });
  } catch {
    /* best-effort */
  }
}
