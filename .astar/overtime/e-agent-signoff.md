# E-Agent Sign-off Hardening

overtime: dev

E-Agent currently LGTM's code that a pr-code-reviewer later finds 6 blockers in. The gap is: E-Agent trusts U-Agent's tests and doesn't independently verify. Three features to close this gap.

Key files:
- cli/src/commands/overtime.ts — eAgentPrompt(), makeAgentScript(), parseSpec()

## Requirements
- [ ] Add `## Verification` section support to the spec parser. Lines under `## Verification` are parsed as structured checks with format: `- name: <name>` / `  run: <command>` / `  expect: "<substring>"` (or `expect_absent: "<substring>"`). Store as an array on OvertimeSpec. Test the parser with a spec that has 3 verification entries and assert the parsed output.
- [ ] Inject the parsed verification checks into the E-Agent prompt as a VERIFICATION CONTRACT section. E-Agent must run EVERY check before final sign-off. Any failed check blocks the done file. Update eAgentPrompt() to include verification commands when present. Test by verifying the prompt string contains the verification commands.
- [ ] Add `astar overtime review <slug>` command that runs an independent code-review subagent over the branch diff. It spawns `claude -p` with a review-focused prompt, the full `git diff main..HEAD`, and prints findings to stdout. Does not modify anything. Test by running it against the overtime-test branch and verifying it produces output without errors.
- [ ] Update E-Agent prompt to run the full project test suite (auto-detected or from context.md) as part of final sign-off, not just touched files. E-Agent should reject if full suite fails even if touched files pass. Add this as an explicit step in the sign-off checklist. Test by verifying the prompt contains "full test suite" instructions.
- [ ] E-Agent final sign-off must include a boundary check: `git diff main..HEAD --stat` and verify no files outside the spec's scope were modified. If the spec has `## Notes` mentioning files to avoid, E-Agent must grep the diff stat for those paths and reject if found. Test by verifying the prompt contains boundary check instructions.

## Notes
The verification section is YAML-like but inside markdown. Keep the parser simple — line-by-line state machine, same approach as the existing spec parser. Don't add a YAML dependency.

For `astar overtime review`: use `claude -p` with `--max-turns 10 --dangerously-skip-permissions`. The review prompt should focus on semantic bugs (misread APIs, wrong assumptions, hot-path costs) not style. Print the output directly — this is a human-facing command, not an agent loop.

Don't restructure the E-Agent prompt — add to the existing CYCLE and RULES sections.

Test the parser and prompt generation with unit tests (create test spec strings, parse them, assert on the output). Test the review command by checking it registers correctly and produces help output.
