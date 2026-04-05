import { PublicClientApplication, DeviceCodeRequest } from "@azure/msal-node";
import { execSync } from "child_process";
import { createInterface } from "readline";
import { getConfig, getAuthCache, saveAuthCache, clearAuthCache, paths, ensureAgentDir, type AuthCache } from "./config";

const SCOPES = ["openid", "profile", "email"];

async function getMsalClient() {
  const config = await getConfig();
  const client = new PublicClientApplication({
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
    },
  });

  const cacheFile = Bun.file(paths.msalCache);
  if (await cacheFile.exists()) {
    const data = await cacheFile.text();
    if (data.trim()) client.getTokenCache().deserialize(data);
  }

  return client;
}

async function persistMsalCache(client: PublicClientApplication) {
  const data = client.getTokenCache().serialize();
  await Bun.write(paths.msalCache, data);
}

function openBrowser(url: string) {
  try {
    execSync(`open "${url}"`);
  } catch {}
}

async function waitForEnter(): Promise<void> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  return new Promise((resolve) => {
    rl.question("", () => {
      rl.close();
      resolve();
    });
  });
}

export async function login(): Promise<AuthCache> {
  const client = await getMsalClient();

  const request: DeviceCodeRequest = {
    scopes: SCOPES,
    deviceCodeCallback: async (response) => {
      const code = response.userCode;
      const url = response.verificationUri;

      console.log("");
      console.log(`  Your code: ${code}`);
      console.log("");
      console.log(`  Press Enter to open ${url} in your browser...`);

      await waitForEnter();
      openBrowser(url);

      console.log("  Waiting for you to sign in...");
    },
  };

  const result = await client.acquireTokenByDeviceCode(request);

  if (!result) throw new Error("Authentication failed");

  const email = result.account?.username ?? "";
  if (!email.endsWith("@astarconsulting.no")) {
    throw new Error(`Access denied. Only @astarconsulting.no accounts allowed (got ${email})`);
  }

  await persistMsalCache(client);

  const cache: AuthCache = {
    accessToken: result.accessToken,
    expiresAt: result.expiresOn?.getTime() ?? Date.now() + 3600_000,
    homeAccountId: result.account?.homeAccountId,
    account: {
      name: result.account?.name ?? "Unknown",
      username: email,
    },
  };

  await saveAuthCache(cache);
  return cache;
}

export async function loginForAgent(slug: string): Promise<AuthCache> {
  await ensureAgentDir(slug);

  const msalPath = paths.agentDir(slug) + "/msal-cache.json";
  const authPath = paths.agentDir(slug) + "/auth.json";

  const config = await getConfig();
  const client = new PublicClientApplication({
    auth: {
      clientId: config.clientId,
      authority: `https://login.microsoftonline.com/${config.tenantId}`,
    },
  });

  const request: DeviceCodeRequest = {
    scopes: SCOPES,
    deviceCodeCallback: async (response) => {
      const code = response.userCode;
      const url = response.verificationUri;

      console.log("");
      console.log(`  Your code: ${code}`);
      console.log("");
      console.log(`  Press Enter to open ${url} in your browser...`);

      await waitForEnter();
      openBrowser(url);

      console.log("  Waiting for you to sign in...");
    },
  };

  const result = await client.acquireTokenByDeviceCode(request);
  if (!result) throw new Error("Authentication failed");

  const email = result.account?.username ?? "";
  if (!email.endsWith("@astarconsulting.no")) {
    throw new Error(`Access denied. Only @astarconsulting.no accounts allowed (got ${email})`);
  }

  const data = client.getTokenCache().serialize();
  await Bun.write(msalPath, data);

  const cache: AuthCache = {
    accessToken: result.accessToken,
    expiresAt: result.expiresOn?.getTime() ?? Date.now() + 3600_000,
    homeAccountId: result.account?.homeAccountId,
    account: {
      name: result.account?.name ?? "Unknown",
      username: email,
    },
  };

  await Bun.write(authPath, JSON.stringify(cache, null, 2));
  return cache;
}

export async function logout() {
  await clearAuthCache();
  const file = Bun.file(paths.msalCache);
  if (await file.exists()) await Bun.write(paths.msalCache, "");
}

export async function getAuthStatus(): Promise<{ name: string; email: string } | null> {
  const cache = await getAuthCache();
  if (!cache) return null;
  return { name: cache.account.name, email: cache.account.username };
}

export async function getToken(): Promise<string> {
  const cache = await getAuthCache();
  if (!cache) throw new Error("Not authenticated. Run 'astar login' first.");

  if (cache.expiresAt > Date.now()) return cache.accessToken;

  const refreshed = await silentRefresh(cache);
  if (refreshed) return refreshed.accessToken;

  throw new Error("Session expired. Run 'astar login' to sign in again.");
}

async function silentRefresh(cache: AuthCache): Promise<AuthCache | null> {
  if (!cache.homeAccountId) return null;

  try {
    const client = await getMsalClient();
    const accounts = await client.getTokenCache().getAllAccounts();
    const account = accounts.find((a) => a.homeAccountId === cache.homeAccountId);
    if (!account) return null;

    const result = await client.acquireTokenSilent({ scopes: SCOPES, account });
    if (!result) return null;

    await persistMsalCache(client);

    const refreshed: AuthCache = {
      accessToken: result.accessToken,
      expiresAt: result.expiresOn?.getTime() ?? Date.now() + 3600_000,
      homeAccountId: result.account?.homeAccountId,
      account: {
        name: result.account?.name ?? cache.account.name,
        username: result.account?.username ?? cache.account.username,
      },
    };
    await saveAuthCache(refreshed);
    return refreshed;
  } catch {
    return null;
  }
}
