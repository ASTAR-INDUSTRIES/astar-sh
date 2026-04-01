#!/usr/bin/env bun
import { Command } from "commander";
import { registerAuthCommands } from "./commands/auth";
import { registerSkillCommands } from "./commands/skill";
import { registerNewsCommands } from "./commands/news";
import { registerFeedbackCommands } from "./commands/feedback";
import { registerShippedCommands } from "./commands/shipped";
import { registerHoursCommands } from "./commands/hours";
import { registerUpdateCommand, checkForUpdates } from "./commands/update";

const program = new Command()
  .name("astar")
  .description("The Astar Consulting CLI — skills, news, and more")
  .version("0.3.0");

registerAuthCommands(program);
registerSkillCommands(program);
registerNewsCommands(program);
registerFeedbackCommands(program);
registerShippedCommands(program);
registerHoursCommands(program);
registerUpdateCommand(program);

await checkForUpdates();
program.parse();
