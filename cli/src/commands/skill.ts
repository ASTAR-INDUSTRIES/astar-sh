import { resolve, join } from "path";
import { createInterface } from "readline";
import type { Command } from "commander";
import { getToken, getAuthStatus } from "../lib/auth";
import { AstarAPI, type SkillFull, type SkillSummary } from "../lib/api";
import { c, table, badge, tag } from "../lib/ui";
import { writeManifest, readManifest, isOutdated, type SkillManifest } from "../lib/manifest";
import { diffFiles, renderDiff, type FileDiff } from "../lib/diff";

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

  await writeManifest(skillDir, {
    slug: skill.slug,
    title: skill.title,
    author: skill.author,
    installedAt: new Date().toISOString(),
    remoteUpdatedAt: skill._updatedAt ?? new Date().toISOString(),
  });

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
    console.error(`${c.red}✗${c.reset} Not authenticated. Run ${c.cyan}astar login${c.reset} first.`);
    process.exit(1);
  }
}

async function optionalAuth(): Promise<string | undefined> {
  try {
    return await getToken();
  } catch {
    return undefined;
  }
}

function truncate(s: string, max: number): string {
  if (!s) return "";
  return s.length > max ? s.slice(0, max - 1) + "…" : s;
}

function toSlug(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
}

function prompt(question: string, defaultValue?: string): Promise<string> {
  const rl = createInterface({ input: process.stdin, output: process.stdout });
  const suffix = defaultValue ? ` ${c.dim}(${defaultValue})${c.reset}` : "";
  return new Promise((resolve) => {
    rl.question(`  ${question}${suffix}: `, (answer) => {
      rl.close();
      resolve(answer.trim() || defaultValue || "");
    });
  });
}

function fmtDate(iso: string): string {
  return new Date(iso).toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

async function displaySkillList(skills: SkillSummary[], query?: string) {
  const installed = await getInstalledSlugs().catch(() => []);

  const manifests = new Map<string, SkillManifest>();
  for (const slug of installed) {
    const m = await readManifest(join(getSkillsDir(), slug));
    if (m) manifests.set(slug, m);
  }

  if (!skills.length) {
    console.log(query
      ? `${c.dim}No skills matching "${query}".${c.reset}`
      : `${c.dim}No skills found.${c.reset}`);
    return;
  }

  console.log("");
  table(
    ["#", "Skill", "Description", "DLs", "Tags", ""],
    skills.map((s, i) => {
      let statusBadge = "";
      if (installed.includes(s.slug)) {
        const manifest = manifests.get(s.slug);
        if (manifest && s._updatedAt && isOutdated(manifest, s._updatedAt)) {
          statusBadge = badge("update ↑", c.yellow);
        } else {
          statusBadge = badge("installed", c.green);
        }
      }
      return [
        `${c.dim}${i + 1}${c.reset}`,
        `${c.cyan}${s.slug}${c.reset}`,
        `${c.dim}${truncate(s.description, 44)}${c.reset}`,
        s.downloadCount ? `${c.yellow}${s.downloadCount}${c.reset}` : `${c.dim}—${c.reset}`,
        s.tags?.length ? s.tags.slice(0, 3).map((t) => tag(t)).join(` ${c.dim}·${c.reset} `) : "",
        statusBadge,
      ];
    })
  );
  console.log("");
  console.log(`  ${c.dim}${skills.length} skill(s)${query ? ` matching "${query}"` : " available"}${c.reset}`);
  console.log(`  ${c.dim}Install with:${c.reset} ${c.cyan}astar skill install <slug>${c.reset}`);
  console.log("");
}

export function registerSkillCommands(program: Command) {
  const skill = program
    .command("skill")
    .description("Manage Claude Code skills from astar.sh")
    .action(async () => {
      await skill.commands.find((cmd) => cmd.name() === "list")!.parseAsync([], { from: "user" });
    });

  skill
    .command("list")
    .description("List available skills")
    .option("-q, --query <query>", "Search by title/tag")
    .action(async (opts) => {
      const token = await optionalAuth();
      const api = new AstarAPI(token);
      const skills = await api.listSkills(opts.query);
      await displaySkillList(skills, opts.query);
    });

  skill
    .command("search <query>")
    .description("Search skills by title, description, or tag")
    .action(async (query: string) => {
      const token = await optionalAuth();
      const api = new AstarAPI(token);
      const skills = await api.listSkills(query);
      await displaySkillList(skills, query);
    });

  skill
    .command("info <slug>")
    .description("Show detailed info about a skill")
    .action(async (slug: string) => {
      const token = await optionalAuth();
      const api = new AstarAPI(token);

      try {
        const s = await api.getSkill(slug);
        const installed = await getInstalledSlugs().catch(() => []);
        const isInst = installed.includes(s.slug);
        const manifest = isInst ? await readManifest(join(getSkillsDir(), s.slug)) : null;
        const outdated = manifest && s._updatedAt && isOutdated(manifest, s._updatedAt);

        console.log("");
        let statusStr = "";
        if (isInst && outdated) statusStr = ` ${c.yellow}[update available]${c.reset}`;
        else if (isInst) statusStr = ` ${c.green}[installed]${c.reset}`;
        console.log(`  ${c.bold}${c.white}${s.title}${c.reset}${statusStr}`);
        console.log(`  ${c.dim}slug:${c.reset}   ${c.cyan}${s.slug}${c.reset}`);
        if (s.author) console.log(`  ${c.dim}author:${c.reset} ${s.author}`);
        if (s._updatedAt) console.log(`  ${c.dim}updated:${c.reset} ${fmtDate(s._updatedAt)}`);
        if (manifest) console.log(`  ${c.dim}installed:${c.reset} ${fmtDate(manifest.installedAt)}`);
        console.log("");
        if (s.description) console.log(`  ${c.dim}${s.description}${c.reset}`);
        console.log("");

        if (s.tags?.length) {
          console.log(`  ${c.dim}tags:${c.reset}   ${s.tags.map((t) => tag(t)).join(` ${c.dim}·${c.reset} `)}`);
          console.log("");
        }

        if (s.referenceFiles?.length) {
          console.log(`  ${c.dim}references:${c.reset}`);
          for (const ref of s.referenceFiles) {
            const path = ref.folder ? `${ref.folder}/${ref.filename}` : ref.filename;
            console.log(`    ${c.dim}${path}${c.reset}`);
          }
          console.log("");
        }

        if (s.skillMd) {
          const lines = s.skillMd.split("\n").slice(0, 12);
          console.log(`  ${c.dim}── preview ──${c.reset}`);
          for (const line of lines) {
            console.log(`  ${c.dim}${line}${c.reset}`);
          }
          if (s.skillMd.split("\n").length > 12) console.log(`  ${c.dim}...${c.reset}`);
          console.log("");
        }

        if (outdated) {
          console.log(`  ${c.yellow}Update available!${c.reset} Run: ${c.cyan}astar skill diff ${s.slug}${c.reset}`);
          console.log("");
        } else if (!isInst) {
          console.log(`  ${c.dim}Install with:${c.reset} ${c.cyan}astar skill install ${s.slug}${c.reset}`);
          console.log("");
        }
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  skill
    .command("diff <slug>")
    .description("Show changes between local and remote skill")
    .action(async (slug: string) => {
      const token = await optionalAuth();
      const api = new AstarAPI(token);
      const skillDir = join(getSkillsDir(), slug);

      if (!(await Bun.file(join(skillDir, "SKILL.md")).exists())) {
        console.error(`${c.red}✗${c.reset} Skill "${slug}" is not installed.`);
        process.exit(1);
      }

      try {
        const remote = await api.getSkill(slug);
        const manifest = await readManifest(skillDir);

        const localSkillMd = await Bun.file(join(skillDir, "SKILL.md")).text();

        const files: FileDiff[] = [];
        files.push(diffFiles("SKILL.md", localSkillMd, remote.skillMd || ""));

        if (remote.referenceFiles?.length) {
          for (const ref of remote.referenceFiles) {
            const refDir = ref.folder ? join(skillDir, ref.folder) : skillDir;
            const localPath = join(refDir, ref.filename);
            const localFile = Bun.file(localPath);
            const localContent = await localFile.exists() ? await localFile.text() : "";
            const displayName = ref.folder ? `${ref.folder}/${ref.filename}` : ref.filename;
            files.push(diffFiles(displayName, localContent, ref.content));
          }
        }

        const refsDir = join(skillDir, "references");
        const remoteNames = new Set((remote.referenceFiles || []).map((r) => r.filename));
        try {
          const glob = new Bun.Glob("*");
          for await (const path of glob.scan({ cwd: refsDir })) {
            if (path === ".gitkeep" || remoteNames.has(path)) continue;
            const content = await Bun.file(join(refsDir, path)).text();
            files.push(diffFiles(`references/${path}`, content, ""));
          }
        } catch {}

        const localDate = manifest?.remoteUpdatedAt ? fmtDate(manifest.remoteUpdatedAt) : "unknown";
        const remoteDate = remote._updatedAt ? fmtDate(remote._updatedAt) : "latest";

        renderDiff(remote.title || slug, localDate, remoteDate, files);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  skill
    .command("init")
    .description("Scaffold a new skill")
    .action(async () => {
      console.log("");
      console.log(`  ${c.bold}${c.white}Create a new skill${c.reset}`);
      console.log("");

      const name = await prompt(`${c.white}Name${c.reset}`);
      if (!name) {
        console.error(`${c.red}✗${c.reset} Name is required.`);
        process.exit(1);
      }

      const defaultSlug = toSlug(name);
      const slug = await prompt(`${c.white}Slug${c.reset}`, defaultSlug);
      const description = await prompt(`${c.white}Description${c.reset}`);
      const tagsRaw = await prompt(`${c.white}Tags${c.reset} ${c.dim}(comma-separated)${c.reset}`);

      const skillDir = join(getSkillsDir(), slug);
      const skillFile = join(skillDir, "SKILL.md");

      if (await Bun.file(skillFile).exists()) {
        console.error(`\n${c.red}✗${c.reset} Skill "${slug}" already exists at ${c.dim}.claude/skills/${slug}/${c.reset}`);
        process.exit(1);
      }

      const template = `# ${name}

${description || ""}

## When to Use

<!-- When should Claude Code activate this skill? -->

## Instructions

<!-- What should Claude Code do when this skill is active? -->
`;

      await Bun.write(skillFile, template);
      await Bun.write(join(skillDir, "references", ".gitkeep"), "");

      console.log("");
      console.log(`${c.green}✓${c.reset} Created ${c.cyan}${slug}${c.reset} at ${c.dim}.claude/skills/${slug}/${c.reset}`);
      console.log(`  Edit ${c.white}SKILL.md${c.reset}, then publish with: ${c.cyan}astar skill push ${slug} --publish${c.reset}`);
      console.log("");
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
        console.log(`${c.green}✓${c.reset} Installed ${c.cyan}${data.title}${c.reset} → ${c.dim}${dir}${c.reset}`);
        if (refCount) console.log(`  ${c.dim}${refCount} reference file(s) included${c.reset}`);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} Failed to install "${slug}": ${e.message}`);
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
        console.error(`${c.red}✗${c.reset} Skill "${slug}" is not installed.`);
        process.exit(1);
      }

      const { execSync } = await import("child_process");
      execSync(`rm -rf "${dir}"`);
      console.log(`${c.green}✓${c.reset} Removed ${c.cyan}${slug}${c.reset}`);
    });

  skill
    .command("installed")
    .description("List locally installed skills")
    .action(async () => {
      try {
        const slugs = await getInstalledSlugs();
        if (!slugs.length) {
          console.log(`${c.dim}No skills installed.${c.reset}`);
          console.log(`  Run ${c.cyan}astar skill install <slug>${c.reset} to get started.`);
          return;
        }

        const rows: string[][] = [];
        for (const slug of slugs) {
          const manifest = await readManifest(join(getSkillsDir(), slug));
          const installed = manifest?.installedAt ? fmtDate(manifest.installedAt) : `${c.dim}—${c.reset}`;
          rows.push([
            `${c.dim}${rows.length + 1}${c.reset}`,
            `${c.cyan}${slug}${c.reset}`,
            `${c.dim}${installed}${c.reset}`,
            `${c.dim}.claude/skills/${slug}/${c.reset}`,
          ]);
        }

        console.log("");
        table(["#", "Skill", "Installed", "Path"], rows);
        console.log("");
      } catch {
        console.log(`${c.dim}No skills installed.${c.reset}`);
      }
    });

  skill
    .command("push <slug>")
    .description("Publish a local skill to astar.sh")
    .option("--publish", "Publish immediately")
    .action(async (slug: string, opts: { publish?: boolean }) => {
      const token = await requireAuth();
      const api = new AstarAPI(token);
      const dir = join(getSkillsDir(), slug);
      const skillFile = Bun.file(join(dir, "SKILL.md"));

      if (!(await skillFile.exists())) {
        console.error(`${c.red}✗${c.reset} No skill found at ${c.dim}.claude/skills/${slug}/${c.reset}`);
        process.exit(1);
      }

      const content = await skillFile.text();

      const refs: { filename: string; folder: string; content: string }[] = [];
      const refsDir = join(dir, "references");
      const refsGlob = new Bun.Glob("**/*");
      try {
        for await (const path of refsGlob.scan({ cwd: refsDir })) {
          if (path === ".gitkeep") continue;
          const file = Bun.file(join(refsDir, path));
          refs.push({ filename: path, folder: "references", content: await file.text() });
        }
      } catch {}

      try {
        await api.pushSkill({
          title: slug.replace(/-/g, " ").replace(/\b\w/g, (ch) => ch.toUpperCase()),
          slug,
          content,
          references: refs.length ? refs : undefined,
          published: opts.publish ?? false,
        });
        console.log(`${c.green}✓${c.reset} Pushed ${c.cyan}${slug}${c.reset} to astar.sh`);
        if (!opts.publish) console.log(`  ${c.dim}Use ${c.reset}${c.yellow}--publish${c.reset}${c.dim} to make it visible${c.reset}`);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} Failed to push: ${e.message}`);
        process.exit(1);
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
        console.log(`${c.dim}No skills to update.${c.reset}`);
        return;
      }

      let updated = 0;
      let skipped = 0;

      for (const s of slugs) {
        try {
          const skillDir = join(getSkillsDir(), s);
          const manifest = await readManifest(skillDir);
          const data = await api.getSkill(s);

          if (manifest && data._updatedAt && !isOutdated(manifest, data._updatedAt)) {
            console.log(`  ${c.dim}─ ${s} already up to date${c.reset}`);
            skipped++;
            continue;
          }

          const oldSkillMd = await Bun.file(join(skillDir, "SKILL.md")).text().catch(() => "");
          await writeSkillToDisk(data);
          updated++;

          const diff = diffFiles("SKILL.md", oldSkillMd, data.skillMd || "");
          if (diff.additions || diff.removals) {
            console.log(`  ${c.green}✓${c.reset} Updated ${c.cyan}${s}${c.reset} (${c.green}+${diff.additions}${c.reset} ${c.red}-${diff.removals}${c.reset})`);
          } else {
            console.log(`  ${c.green}✓${c.reset} Updated ${c.cyan}${s}${c.reset} ${c.dim}(metadata only)${c.reset}`);
          }
        } catch (e: any) {
          console.error(`  ${c.red}✗${c.reset} Failed to update "${s}": ${e.message}`);
        }
      }

      console.log("");
      if (updated === 0 && skipped > 0) {
        console.log(`  ${c.green}✓${c.reset} All ${skipped} skill(s) already up to date.`);
      } else {
        console.log(`  ${c.dim}${updated} updated, ${skipped} already current${c.reset}`);
      }
      console.log("");
    });
}
