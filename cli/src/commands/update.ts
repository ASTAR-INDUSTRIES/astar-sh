import type { Command } from "commander";
import { execSync } from "child_process";
import { homedir } from "os";
import { join } from "path";
import { c } from "../lib/ui";
import { updateBaseSkillIfInstalled } from "../lib/base-skill";
import { getConfig } from "../lib/config";

const INSTALL_DIR = join(homedir(), ".astar", "cli");

export function getLocalHash(): string | null {
  try {
    return execSync("git rev-parse --short HEAD", { cwd: INSTALL_DIR, stdio: "pipe" }).toString().trim();
  } catch {
    return null;
  }
}

export function getRemoteHash(): string | null {
  try {
    execSync("git fetch --quiet", { cwd: INSTALL_DIR, stdio: "pipe" });
    return execSync("git rev-parse --short origin/main", { cwd: INSTALL_DIR, stdio: "pipe" }).toString().trim();
  } catch {
    return null;
  }
}

export function registerUpdateCommand(program: Command) {
  program
    .command("update")
    .description("Update the astar CLI to the latest version")
    .action(async () => {
      const localBefore = getLocalHash();

      if (!localBefore) {
        console.error(`${c.red}✗${c.reset} Not installed via git. Reinstall with:`);
        console.error(`  curl -fsSL https://raw.githubusercontent.com/ASTAR-INDUSTRIES/astar-sh/main/cli/install.sh | bash`);
        process.exit(1);
      }

      try {
        console.log(`  ${c.dim}Checking for updates...${c.reset}`);
        const remote = getRemoteHash();

        if (remote && remote === localBefore) {
          console.log(`  ${c.green}✓${c.reset} Already on latest ${c.dim}(${localBefore})${c.reset}`);
          return;
        }

        console.log(`  ${c.dim}Pulling latest...${c.reset}`);
        execSync("git pull --quiet", { cwd: INSTALL_DIR, stdio: "pipe" });

        console.log(`  ${c.dim}Installing dependencies...${c.reset}`);
        execSync("bun install --silent", { cwd: join(INSTALL_DIR, "cli"), stdio: "pipe" });

        const localAfter = getLocalHash();
        console.log(`  ${c.green}✓${c.reset} Updated ${c.dim}${localBefore}${c.reset} → ${c.cyan}${localAfter}${c.reset}`);

        if (await updateBaseSkillIfInstalled()) {
          console.log(`  ${c.green}✓${c.reset} Updated ${c.cyan}astar-platform${c.reset} skill`);
        }

        try {
          const config = await getConfig();
          fetch(`${config.apiUrl}/ping`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ action: "update", version: localAfter, os: process.platform }) }).catch(() => {});
        } catch {}
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} Update failed. Reinstall with:`);
        console.error(`  curl -fsSL https://raw.githubusercontent.com/ASTAR-INDUSTRIES/astar-sh/main/cli/install.sh | bash`);
      }
    });
}

export async function checkForUpdates() {
  try {
    const lastCheckFile = Bun.file(join(homedir(), ".astar", "last-update-check"));
    const now = Date.now();

    if (await lastCheckFile.exists()) {
      const last = parseInt(await lastCheckFile.text());
      if (now - last < 86400_000) return;
    }

    await Bun.write(lastCheckFile, String(now));

    const local = getLocalHash();
    if (!local) return;

    const remote = getRemoteHash();
    if (!remote || remote === local) return;

    console.log(`  ${c.yellow}Update available!${c.reset} Run ${c.cyan}astar update${c.reset} to get the latest.`);
    console.log("");
  } catch {}
}
