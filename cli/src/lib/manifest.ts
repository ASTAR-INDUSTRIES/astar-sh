import { join } from "path";

export interface SkillManifest {
  slug: string;
  title: string;
  author?: string;
  installedAt: string;
  remoteUpdatedAt: string;
}

export async function writeManifest(skillDir: string, manifest: SkillManifest) {
  await Bun.write(join(skillDir, "manifest.json"), JSON.stringify(manifest, null, 2));
}

export async function readManifest(skillDir: string): Promise<SkillManifest | null> {
  try {
    const file = Bun.file(join(skillDir, "manifest.json"));
    if (!(await file.exists())) return null;
    const text = await file.text();
    if (!text.trim()) return null;
    return JSON.parse(text);
  } catch {
    return null;
  }
}

export function isOutdated(manifest: SkillManifest, remoteUpdatedAt: string): boolean {
  return new Date(remoteUpdatedAt) > new Date(manifest.remoteUpdatedAt);
}
