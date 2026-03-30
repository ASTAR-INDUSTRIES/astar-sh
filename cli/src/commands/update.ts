import type { Command } from "commander";
import { execSync } from "child_process";
import { homedir } from "os";
import { join } from "path";

export function registerUpdateCommand(program: Command) {
  program
    .command("update")
    .description("Update the astar CLI to the latest version")
    .action(async () => {
      const installDir = join(homedir(), ".astar", "cli");

      try {
        console.log("  Pulling latest...");
        execSync("git pull", { cwd: installDir, stdio: "pipe" });

        console.log("  Installing dependencies...");
        execSync("bun install", { cwd: join(installDir, "cli"), stdio: "pipe" });

        console.log("  Done!");
      } catch {
        console.error("  Auto-update failed. Run the install script again:");
        console.error("  curl -fsSL https://raw.githubusercontent.com/AstarConsulting/starry-page-design/main/cli/install.sh | bash");
      }
    });
}
