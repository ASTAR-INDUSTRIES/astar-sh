import { resolve, join } from "path";
import type { Command } from "commander";
import { getToken } from "../lib/auth";
import { AstarAPI, type SkillFull } from "../lib/api";

function getSkillsDir(): string {
  return resolve(process.cwd(), ".claude", "skills");
}

async function writeSkillToDisk(skill: SkillFull) {
  if (!skill.skillMd) {
    throw new Error(`Skill "${skill.slug}" has no content`);
  }

  const skillDir = join(getSkillsDir(), skill.slug);
  const skillFile = join(skillDir, "SKILL.md");

  await Bun.write(skillFile, skill.skillMd);

  if (skill.referenceFiles?.length) {
    for (const ref of skill.referenceFiles) {
      const refDir = ref.folder ? join(skillDir, ref.folder) : skillDir;
      const refPath = join(refDir, ref.filename);
      await Bun.write(refPath, ref.content);
    }
  }

  return skillDir;
}

async function getInstalledSlugs(): Promise<string[]> {
  const dir = getSkillsDir();
  const glob = new Bun.Glob("*/SKILL.md");
  const results: string[] = [];
  for await (const path of glob.scan({ cwd: dir })) {
    results.push(path.replace("/SKILL.md", ""));
  }
  return results;
}

async function requireAuth(): Promise<string> {
  try {
    return await getToken();
  } catch {
    console.error("✗ Not authenticated. Run 'astar login' first.");
    process.exit(1);
  }
}

export function registerSkillCommands(program: Command) {
  const skill = program
    .command("skill")
    .description("Manage Claude Code skills from astar.sh");

  skill
    .command("list")
    .description("List available skills")
    .option("-q, --query <query>", "Search by title/tag")
    .action(async (opts) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      const skills = await api.listSkills(opts.query);
      const installed = await getInstalledSlugs().catch(() => []);

      if (!skills.length) {
        console.log("No skills found.");
        return;
      }

      console.log("");
      for (const s of skills) {
        const marker = installed.includes(s.slug) ? " [installed]" : "";
        console.log(`  ${s.slug}${marker}`);
        console.log(`    ${s.description}`);
        if (s.tags.length) console.log(`    tags: ${s.tags.join(", ")}`);
        console.log("");
      }
    });

  skill
    .command("install <slug>")
    .description("Install a skill into .claude/skills/<slug>/")
    .action(async (slug: string) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);

      try {
        const data = await api.getSkill(slug);
        const dir = await writeSkillToDisk(data);
        const refCount = data.referenceFiles?.length ?? 0;
        console.log(`✓ Installed "${data.title}" → ${dir}`);
        if (refCount) console.log(`  ${refCount} reference file(s) included`);
      } catch (e: any) {
        console.error(`✗ Failed to install "${slug}": ${e.message}`);
        process.exit(1);
      }
    });

  skill
    .command("remove <slug>")
    .description("Remove an installed skill")
    .action(async (slug: string) => {
      const dir = join(getSkillsDir(), slug);
      const skillFile = Bun.file(join(dir, "SKILL.md"));

      if (!(await skillFile.exists())) {
        console.error(`✗ Skill "${slug}" is not installed.`);
        process.exit(1);
      }

      const { execSync } = await import("child_process");
      execSync(`rm -rf "${dir}"`);
      console.log(`✓ Removed "${slug}"`);
    });

  skill
    .command("installed")
    .description("List locally installed skills")
    .action(async () => {
      try {
        const slugs = await getInstalledSlugs();
        if (!slugs.length) {
          console.log("No skills installed. Run 'astar skill install <slug>' to get started.");
          return;
        }
        console.log("\nInstalled skills:\n");
        for (const slug of slugs) {
          console.log(`  ${slug}`);
        }
        console.log("");
      } catch {
        console.log("No skills installed.");
      }
    });

  skill
    .command("update [slug]")
    .description("Update installed skill(s) from astar.sh")
    .action(async (slug?: string) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      const slugs = slug ? [slug] : await getInstalledSlugs().catch(() => []);

      if (!slugs.length) {
        console.log("No skills to update.");
        return;
      }

      for (const s of slugs) {
        try {
          const data = await api.getSkill(s);
          await writeSkillToDisk(data);
          console.log(`✓ Updated "${s}"`);
        } catch (e: any) {
          console.error(`✗ Failed to update "${s}": ${e.message}`);
        }
      }
    });
}
