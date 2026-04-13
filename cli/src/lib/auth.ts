import { PublicClientApplication, DeviceCodeRequest } from "@azure/msal-node";
import { execSync } from "child_process";
import { createInterface } from "readline";
import { getConfig, getAuthCache, saveAuthCache, clearAuthCache, paths, ensureAgentDir, type AuthCache } from "./config";
import { c } from "./ui";

const SCOPES = ["openid", "profile", "email"];

function getIdTokenExpiry(idToken: string): number | null {
  try {
    const payload = JSON.parse(Buffer.from(idToken.split(".")[1], "base64url").toString());
    return payload.exp ? payload.exp * 1000 : null;
  } catch {
    return null;
  }
}

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

  const token = result.idToken || result.accessToken;
  const cache: AuthCache = {
    accessToken: token,
    expiresAt: getIdTokenExpiry(token) ?? result.expiresOn?.getTime() ?? Date.now() + 3600_000,
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

  const agentToken = result.idToken || result.accessToken;
  const cache: AuthCache = {
    accessToken: agentToken,
    expiresAt: getIdTokenExpiry(agentToken) ?? result.expiresOn?.getTime() ?? Date.now() + 3600_000,
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

export async function getToken(opts?: { interactive?: boolean }): Promise<string> {
  const cache = await getAuthCache();
  if (!cache) throw new Error("Not authenticated. Run 'astar login' first.");

  if (cache.expiresAt > Date.now()) return cache.accessToken;

  // Token expired — try silent refresh first
  const refreshed = await silentRefresh(cache);
  if (refreshed) return refreshed.accessToken;

  // Silent refresh failed — try interactive re-auth if allowed
  if (opts?.interactive !== false && process.stdin.isTTY) {
    console.log(`\n  ${c.yellow}⟳${c.reset} Session expired — refreshing automatically...\n`);
    try {
      const result = await login();
      console.log(`  ${c.green}✓${c.reset} Re-authenticated as ${c.white}${result.account.name}${c.reset}\n`);
      return result.accessToken;
    } catch {
      throw new Error("Session expired and re-authentication failed. Run 'astar login' manually.");
    }
  }

  throw new Error("Session expired. Run 'astar login' to sign in again.");
}

function debugLog(msg: string) {
  if (process.env.ASTAR_DEBUG === "1") {
    console.error(`[auth:debug] ${msg}`);
  }
}

async function silentRefresh(cache: AuthCache): Promise<AuthCache | null> {
  if (!cache.homeAccountId) {
    debugLog("silentRefresh: no homeAccountId in cache, skipping");
    return null;
  }

  try {
    const cacheFile = Bun.file(paths.msalCache);
    const cacheExists = await cacheFile.exists();
    debugLog(`silentRefresh: MSAL cache file exists=${cacheExists} path=${paths.msalCache}`);

    const client = await getMsalClient();
    const accounts = await client.getTokenCache().getAllAccounts();
    debugLog(`silentRefresh: accounts in MSAL cache=${accounts.length}`);

    const account = accounts.find((a) => a.homeAccountId === cache.homeAccountId);
    debugLog(`silentRefresh: account matched=${!!account} (homeAccountId=${cache.homeAccountId})`);
    if (!account) return null;

    let result;
    try {
      result = await client.acquireTokenSilent({ scopes: SCOPES, account });
      debugLog(`silentRefresh: acquireTokenSilent succeeded idToken=${!!result?.idToken} accessToken=${!!result?.accessToken}`);
    } catch (err) {
      debugLog(`silentRefresh: acquireTokenSilent threw: ${err instanceof Error ? err.message : String(err)}`);
      return null;
    }

    if (!result) {
      debugLog("silentRefresh: acquireTokenSilent returned null");
      return null;
    }

    await persistMsalCache(client);

    const refreshToken = result.idToken || result.accessToken;
    const refreshed: AuthCache = {
      accessToken: refreshToken,
      expiresAt: getIdTokenExpiry(refreshToken) ?? result.expiresOn?.getTime() ?? Date.now() + 3600_000,
      homeAccountId: result.account?.homeAccountId,
      account: {
        name: result.account?.name ?? cache.account.name,
        username: result.account?.username ?? cache.account.username,
      },
    };
    await saveAuthCache(refreshed);
    return refreshed;
  } catch (err) {
    debugLog(`silentRefresh: unexpected error: ${err instanceof Error ? err.message : String(err)}`);
    return null;
  }
}
