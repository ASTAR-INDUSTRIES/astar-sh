import type { Command } from "commander";
import { login, logout, getAuthStatus } from "../lib/auth";

export function registerAuthCommands(program: Command) {
  program
    .command("login")
    .description("Sign in with your @astarconsulting.no Microsoft account")
    .action(async () => {
      try {
        const result = await login();
        console.log(`\n✓ Signed in as ${result.account.name} (${result.account.username})`);
      } catch (e: any) {
        console.error(`✗ ${e.message}`);
        process.exit(1);
      }
    });

  program
    .command("logout")
    .description("Sign out and clear stored credentials")
    .action(async () => {
      await logout();
      console.log("✓ Signed out");
    });

  program
    .command("whoami")
    .description("Show current auth status")
    .action(async () => {
      const status = await getAuthStatus();
      if (status) {
        console.log(`${status.name} (${status.email})`);
      } else {
        console.log("Not signed in. Run 'astar login' to authenticate.");
      }
    });
}
