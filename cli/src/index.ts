#!/usr/bin/env bun
import { Command } from "commander";
import { registerAuthCommands } from "./commands/auth";
import { registerSkillCommands } from "./commands/skill";
import { registerUpdateCommand } from "./commands/update";

const program = new Command()
  .name("astar")
  .description("Install Claude Code skills from astar.sh")
  .version("0.1.0");

registerAuthCommands(program);
registerSkillCommands(program);
registerUpdateCommand(program);

program.parse();
