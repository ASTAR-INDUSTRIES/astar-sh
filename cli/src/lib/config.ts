import { homedir } from "os";
import { join } from "path";

const ASTAR_DIR = join(homedir(), ".astar");
const CONFIG_FILE = join(ASTAR_DIR, "config.json");
const AUTH_FILE = join(ASTAR_DIR, "auth.json");

export const paths = {
  dir: ASTAR_DIR,
  config: CONFIG_FILE,
  auth: AUTH_FILE,
};

interface Config {
  apiUrl: string;
  tenantId: string;
  clientId: string;
}

const DEFAULT_CONFIG: Config = {
  apiUrl: process.env.ASTAR_API_URL ?? "https://owerciqeeelwrqseajqq.supabase.co/functions/v1/skills-api",
  tenantId: process.env.ASTAR_TENANT_ID ?? "d6af3688-b659-4f90-b701-35246b209b9d",
  clientId: process.env.ASTAR_CLIENT_ID ?? "384f7660-f5e6-4f72-aa24-3be21cad67ed",
};

async function ensureDir() {
  await Bun.write(join(ASTAR_DIR, ".keep"), "");
}

export async function getConfig(): Promise<Config> {
  await ensureDir();
  const file = Bun.file(CONFIG_FILE);
  if (await file.exists()) {
    return { ...DEFAULT_CONFIG, ...await file.json() };
  }
  return DEFAULT_CONFIG;
}

export async function saveConfig(config: Partial<Config>) {
  await ensureDir();
  const current = await getConfig();
  const merged = { ...current, ...config };
  await Bun.write(CONFIG_FILE, JSON.stringify(merged, null, 2));
}

export interface AuthCache {
  accessToken: string;
  expiresAt: number;
  homeAccountId?: string;
  account: {
    name: string;
    username: string;
  };
}

export async function getAuthCache(): Promise<AuthCache | null> {
  const file = Bun.file(AUTH_FILE);
  if (await file.exists()) {
    const text = await file.text();
    if (!text.trim()) return null;
    return JSON.parse(text);
  }
  return null;
}

export async function saveAuthCache(cache: AuthCache) {
  await ensureDir();
  await Bun.write(AUTH_FILE, JSON.stringify(cache, null, 2));
}

export async function clearAuthCache() {
  const file = Bun.file(AUTH_FILE);
  if (await file.exists()) {
    await Bun.write(AUTH_FILE, "");
  }
}
