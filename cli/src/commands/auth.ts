import { resolve } from "path";
import type { Command } from "commander";
import { login, logout, getAuthStatus } from "../lib/auth";
import { getAuthCache } from "../lib/config";
import { c } from "../lib/ui";
import { VERSION } from "../index";
import { isBaseSkillInstalled, isBaseSkillDeclined, promptBaseSkillInstall } from "../lib/base-skill";

export function registerAuthCommands(program: Command) {
  program
    .command("login")
    .description("Sign in with your @astarconsulting.no Microsoft account")
    .action(async () => {
      try {
        const result = await login();
        console.log(`\n${c.green}✓${c.reset} Signed in as ${c.white}${result.account.name}${c.reset} ${c.dim}(${result.account.username})${c.reset}`);

        if (!await isBaseSkillInstalled() && !await isBaseSkillDeclined()) {
          await promptBaseSkillInstall();
        }
        process.exit(0);
      } catch (e: any) {
        console.error(`${c.red}✗${c.reset} ${e.message}`);
        process.exit(1);
      }
    });

  program
    .command("logout")
    .description("Sign out and clear stored credentials")
    .action(async () => {
      await logout();
      console.log(`${c.green}✓${c.reset} Signed out`);
    });

  program
    .command("whoami")
    .description("Show current auth status")
    .action(async () => {
      const status = await getAuthStatus();
      if (!status) {
        console.log(`${c.dim}Not signed in.${c.reset} Run ${c.cyan}astar login${c.reset} to authenticate.`);
        return;
      }

      const cache = await getAuthCache();
      const expired = cache && cache.expiresAt < Date.now();
      const sessionStatus = expired
        ? `${c.yellow}expired${c.reset} ${c.dim}(run astar login — or it may auto-refresh)${c.reset}`
        : `${c.green}valid${c.reset} ${c.dim}(refreshes automatically)${c.reset}`;

      let installedCount = 0;
      try {
        const glob = new Bun.Glob("*/SKILL.md");
        const skillsDir = resolve(process.cwd(), ".claude", "skills");
        for await (const _ of glob.scan({ cwd: skillsDir })) installedCount++;
      } catch {}

      console.log("");
      console.log(`  ${c.bold}${c.white}${status.name}${c.reset}`);
      console.log(`  ${c.dim}${status.email}${c.reset}`);
      console.log(`  ${c.dim}Session:${c.reset} ${sessionStatus}`);
      console.log(`  ${c.dim}Skills:${c.reset}  ${installedCount} installed`);
      console.log(`  ${c.dim}Version:${c.reset} ${VERSION}`);
      console.log("");
    });
}
