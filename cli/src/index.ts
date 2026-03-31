#!/usr/bin/env bun
import { Command } from "commander";
import { registerAuthCommands } from "./commands/auth";
import { registerSkillCommands } from "./commands/skill";
import { registerNewsCommands } from "./commands/news";
import { registerUpdateCommand, checkForUpdates } from "./commands/update";

const program = new Command()
  .name("astar")
  .description("The Astar Consulting CLI — skills, news, and more")
  .version("0.2.0");

registerAuthCommands(program);
registerSkillCommands(program);
registerNewsCommands(program);
registerUpdateCommand(program);

await checkForUpdates();
program.parse();
