import { describe, it, expect } from "bun:test";
import { Command } from "commander";
import { parseSpec, eAgentPrompt, buildReviewPrompt, registerOvertimeCommands } from "./overtime";

// ── parseSpec: ## Verification section ──────────────────────────────

describe("parseSpec — ## Verification section", () => {
  const spec = `# Auth Hardening
overtime: dev

Context about the work.

## Requirements
- [ ] JWT refresh handles concurrent requests safely
- [ ] Add rate limiting to login endpoint

## Verification
- name: server health check
  run: curl -s localhost:3000/health
  expect: "ok"
- name: no errors in logs
  run: cat logs/app.log
  expect_absent: "ERROR"
- name: rate limit header present
  run: curl -sI localhost:3000/login
  expect: "X-RateLimit-Limit"

## Notes
Do not touch the OAuth flow.
`;

  it("parses 3 verification checks", () => {
    const result = parseSpec(spec, "auth-hardening.md");
    expect(result.verifications).toHaveLength(3);
  });

  it("parses names correctly", () => {
    const result = parseSpec(spec, "auth-hardening.md");
    expect(result.verifications[0].name).toBe("server health check");
    expect(result.verifications[1].name).toBe("no errors in logs");
    expect(result.verifications[2].name).toBe("rate limit header present");
  });

  it("parses run commands correctly", () => {
    const result = parseSpec(spec, "auth-hardening.md");
    expect(result.verifications[0].run).toBe("curl -s localhost:3000/health");
    expect(result.verifications[1].run).toBe("cat logs/app.log");
    expect(result.verifications[2].run).toBe("curl -sI localhost:3000/login");
  });

  it("parses expect substrings", () => {
    const result = parseSpec(spec, "auth-hardening.md");
    expect(result.verifications[0].expect).toBe("ok");
    expect(result.verifications[2].expect).toBe("X-RateLimit-Limit");
  });

  it("parses expect_absent substrings", () => {
    const result = parseSpec(spec, "auth-hardening.md");
    expect(result.verifications[1].expect_absent).toBe("ERROR");
    expect(result.verifications[1].expect).toBeUndefined();
  });

  it("still parses requirements correctly when verification is present", () => {
    const result = parseSpec(spec, "auth-hardening.md");
    expect(result.requirements).toHaveLength(2);
    expect(result.requirements[0]).toBe("JWT refresh handles concurrent requests safely");
    expect(result.requirements[1]).toBe("Add rate limiting to login endpoint");
  });

  it("still parses notes correctly when verification is present", () => {
    const result = parseSpec(spec, "auth-hardening.md");
    expect(result.notes).toBe("Do not touch the OAuth flow.");
  });

  it("returns empty verifications when section is absent", () => {
    const noVerification = `# Simple Task
overtime: dev

Some context.

## Requirements
- [ ] Do a thing
`;
    const result = parseSpec(noVerification, "simple.md");
    expect(result.verifications).toHaveLength(0);
  });

  it("flushes last check even without trailing newline", () => {
    const noTrailingNewline = `# Test
overtime: dev

## Verification
- name: last check
  run: echo hello
  expect: "hello"`;
    const result = parseSpec(noTrailingNewline, "test.md");
    expect(result.verifications).toHaveLength(1);
    expect(result.verifications[0].name).toBe("last check");
    expect(result.verifications[0].run).toBe("echo hello");
    expect(result.verifications[0].expect).toBe("hello");
  });

  it("strips surrounding quotes from expect values", () => {
    const withQuotes = `# Test
overtime: dev

## Verification
- name: quoted check
  run: echo hello
  expect: "hello world"
`;
    const result = parseSpec(withQuotes, "test.md");
    expect(result.verifications[0].expect).toBe("hello world");
  });

  it("handles verification before requirements (order independence)", () => {
    const verificationFirst = `# Test
overtime: dev

## Verification
- name: pre-check
  run: which node
  expect: "/usr/bin/node"

## Requirements
- [ ] Add feature

## Notes
None.
`;
    const result = parseSpec(verificationFirst, "test.md");
    expect(result.verifications).toHaveLength(1);
    expect(result.verifications[0].name).toBe("pre-check");
    expect(result.requirements).toHaveLength(1);
  });
});

// ── eAgentPrompt: VERIFICATION CONTRACT injection ────────────────────

describe("eAgentPrompt — VERIFICATION CONTRACT injection", () => {
  const specWithVerifications = parseSpec(`# Auth Hardening
overtime: dev

Context about the work.

## Requirements
- [ ] JWT refresh handles concurrent requests safely
- [ ] Add rate limiting to login endpoint

## Verification
- name: server health check
  run: curl -s localhost:3000/health
  expect: "ok"
- name: no errors in logs
  run: cat logs/app.log
  expect_absent: "ERROR"
- name: rate limit header present
  run: curl -sI localhost:3000/login
  expect: "X-RateLimit-Limit"
`, "auth-hardening.md");

  const specWithoutVerifications = parseSpec(`# Simple Task
overtime: dev

Some context.

## Requirements
- [ ] Do a thing
`, "simple.md");

  const doneFile = "/tmp/.done-auth-hardening";

  it("includes VERIFICATION CONTRACT section when verifications are present", () => {
    const prompt = eAgentPrompt(42, specWithVerifications, doneFile, "e-agent:test");
    expect(prompt).toContain("VERIFICATION CONTRACT");
  });

  it("includes each verification run command", () => {
    const prompt = eAgentPrompt(42, specWithVerifications, doneFile, "e-agent:test");
    expect(prompt).toContain("curl -s localhost:3000/health");
    expect(prompt).toContain("cat logs/app.log");
    expect(prompt).toContain("curl -sI localhost:3000/login");
  });

  it("includes expect substrings in the contract", () => {
    const prompt = eAgentPrompt(42, specWithVerifications, doneFile, "e-agent:test");
    expect(prompt).toContain('"ok"');
    expect(prompt).toContain('"X-RateLimit-Limit"');
  });

  it("includes expect_absent substrings in the contract", () => {
    const prompt = eAgentPrompt(42, specWithVerifications, doneFile, "e-agent:test");
    expect(prompt).toContain('"ERROR"');
    expect(prompt).toContain("NOT to contain");
  });

  it("includes verification step in FINAL SIGN-OFF when verifications present", () => {
    const prompt = eAgentPrompt(42, specWithVerifications, doneFile, "e-agent:test");
    expect(prompt).toContain("VERIFICATION CONTRACT (below)");
  });

  it("includes verification rule in RULES when verifications present", () => {
    const prompt = eAgentPrompt(42, specWithVerifications, doneFile, "e-agent:test");
    expect(prompt).toContain("All VERIFICATION CONTRACT checks must pass before sign-off");
  });

  it("does NOT include VERIFICATION CONTRACT when verifications are absent", () => {
    const prompt = eAgentPrompt(7, specWithoutVerifications, doneFile, "e-agent:test");
    expect(prompt).not.toContain("VERIFICATION CONTRACT");
  });

  it("still includes requirements in the prompt when verifications are present", () => {
    const prompt = eAgentPrompt(42, specWithVerifications, doneFile, "e-agent:test");
    expect(prompt).toContain("JWT refresh handles concurrent requests safely");
    expect(prompt).toContain("Add rate limiting to login endpoint");
  });

  it("includes all 3 verification names in the contract", () => {
    const prompt = eAgentPrompt(42, specWithVerifications, doneFile, "e-agent:test");
    expect(prompt).toContain("server health check");
    expect(prompt).toContain("no errors in logs");
    expect(prompt).toContain("rate limit header present");
  });
});

// ── buildReviewPrompt ────────────────────────────────────────────────

describe("buildReviewPrompt", () => {
  const spec = parseSpec(`# Auth Hardening
overtime: dev

Improve auth security.

## Requirements
- [ ] JWT refresh handles concurrent requests safely
- [ ] Add rate limiting to login endpoint

## Notes
Do not touch the OAuth flow.
`, "auth-hardening.md");

  const diff = `diff --git a/src/auth.ts b/src/auth.ts
index abc1234..def5678 100644
--- a/src/auth.ts
+++ b/src/auth.ts
@@ -1,3 +1,6 @@
+export async function refreshToken(token: string) {
+  return db.tokens.find(token);
+}`;

  it("includes the diff in the prompt", () => {
    const prompt = buildReviewPrompt(spec, diff);
    expect(prompt).toContain("src/auth.ts");
    expect(prompt).toContain("refreshToken");
  });

  it("includes spec title", () => {
    const prompt = buildReviewPrompt(spec, diff);
    expect(prompt).toContain("Auth Hardening");
  });

  it("includes each requirement", () => {
    const prompt = buildReviewPrompt(spec, diff);
    expect(prompt).toContain("JWT refresh handles concurrent requests safely");
    expect(prompt).toContain("Add rate limiting to login endpoint");
  });

  it("includes notes", () => {
    const prompt = buildReviewPrompt(spec, diff);
    expect(prompt).toContain("Do not touch the OAuth flow.");
  });

  it("focuses on semantic bugs, not style", () => {
    const prompt = buildReviewPrompt(spec, diff);
    expect(prompt).toContain("semantic bugs");
    expect(prompt.toLowerCase()).toContain("not style");
  });

  it("mentions hot-path costs as a review target", () => {
    const prompt = buildReviewPrompt(spec, diff);
    expect(prompt.toLowerCase()).toContain("hot-path");
  });

  it("wraps diff in a fenced code block", () => {
    const prompt = buildReviewPrompt(spec, diff);
    expect(prompt).toContain("```diff");
  });

  it("omits NOTES line when spec has no notes", () => {
    const noNotes = parseSpec(`# Simple
overtime: dev

Some context.

## Requirements
- [ ] Do a thing
`, "simple.md");
    const prompt = buildReviewPrompt(noNotes, diff);
    expect(prompt).not.toContain("NOTES:");
  });
});

// ── review command — registration and help ───────────────────────────

describe("review command — registration and help", () => {
  it("registers as a subcommand of overtime", () => {
    const program = new Command();
    registerOvertimeCommands(program);
    const overtimeCmd = program.commands.find((cmd) => cmd.name() === "overtime");
    expect(overtimeCmd).toBeDefined();
    const reviewCmd = overtimeCmd!.commands.find((cmd) => cmd.name() === "review");
    expect(reviewCmd).toBeDefined();
  });

  it("review command accepts a <slug> argument", () => {
    const program = new Command();
    registerOvertimeCommands(program);
    const overtimeCmd = program.commands.find((cmd) => cmd.name() === "overtime")!;
    const reviewCmd = overtimeCmd.commands.find((cmd) => cmd.name() === "review")!;
    // Commander stores args in _args; check via usage or help text
    const help = reviewCmd.helpInformation();
    expect(help).toContain("slug");
  });

  it("review command description mentions code-review or review", () => {
    const program = new Command();
    registerOvertimeCommands(program);
    const overtimeCmd = program.commands.find((cmd) => cmd.name() === "overtime")!;
    const reviewCmd = overtimeCmd.commands.find((cmd) => cmd.name() === "review")!;
    expect(reviewCmd.description().toLowerCase()).toContain("review");
  });

  it("overtime help output includes review", () => {
    const program = new Command();
    registerOvertimeCommands(program);
    const overtimeCmd = program.commands.find((cmd) => cmd.name() === "overtime")!;
    const help = overtimeCmd.helpInformation();
    expect(help).toContain("review");
  });
});

// ── eAgentPrompt: full test suite sign-off instructions ──────────────

describe("eAgentPrompt — full test suite sign-off", () => {
  const spec = parseSpec(`# Simple Task
overtime: dev

Some context.

## Requirements
- [ ] Do a thing
`, "simple.md");

  const doneFile = "/tmp/.done-simple";

  it("sign-off step instructs to run the FULL project test suite", () => {
    const prompt = eAgentPrompt(10, spec, doneFile, "e-agent:test");
    expect(prompt).toContain("FULL project test suite");
  });

  it("sign-off step says not just tests for touched files", () => {
    const prompt = eAgentPrompt(10, spec, doneFile, "e-agent:test");
    expect(prompt).toContain("not just tests for touched files");
  });

  it("sign-off step includes auto-detection guidance (check ENVIRONMENT CONTEXT)", () => {
    const prompt = eAgentPrompt(10, spec, doneFile, "e-agent:test");
    expect(prompt).toContain("ENVIRONMENT CONTEXT");
  });

  it("sign-off step lists common test runners for auto-detection", () => {
    const prompt = eAgentPrompt(10, spec, doneFile, "e-agent:test");
    expect(prompt).toContain("bun test");
    expect(prompt).toContain("npm test");
  });

  it("sign-off step states touched-file passing does not allow sign-off if full suite fails", () => {
    const prompt = eAgentPrompt(10, spec, doneFile, "e-agent:test");
    expect(prompt).toContain("touched-file tests pass");
    expect(prompt).toContain("failing test elsewhere blocks sign-off");
  });

  it("RULES section contains full test suite instruction", () => {
    const prompt = eAgentPrompt(10, spec, doneFile, "e-agent:test");
    expect(prompt).toContain("FULL project test suite before sign-off");
  });
});

// ── eAgentPrompt: boundary check sign-off instructions ───────────────

describe("eAgentPrompt — boundary check sign-off", () => {
  const specNoNotes = parseSpec(`# Simple Task
overtime: dev

Some context.

## Requirements
- [ ] Do a thing
`, "simple.md");

  const specWithNotes = parseSpec(`# Auth Hardening
overtime: dev

Improve auth security.

## Requirements
- [ ] JWT refresh handles concurrent requests safely

## Notes
Do not touch the OAuth flow.
`, "auth-hardening.md");

  const doneFile = "/tmp/.done-boundary";

  it("sign-off step instructs to run git diff main..HEAD --stat", () => {
    const prompt = eAgentPrompt(10, specNoNotes, doneFile, "e-agent:test");
    expect(prompt).toContain("git diff main..HEAD --stat");
  });

  it("sign-off step labels the step as a boundary check", () => {
    const prompt = eAgentPrompt(10, specNoNotes, doneFile, "e-agent:test");
    expect(prompt).toContain("Boundary check");
  });

  it("sign-off step says to reject if unexpected files appear in stat output", () => {
    const prompt = eAgentPrompt(10, specNoNotes, doneFile, "e-agent:test");
    expect(prompt).toContain("unexpected files");
  });

  it("includes notes-based path check when spec has notes", () => {
    const prompt = eAgentPrompt(10, specWithNotes, doneFile, "e-agent:test");
    expect(prompt).toContain("Do not touch the OAuth flow.");
    expect(prompt).toContain("grep the diff stat output for those paths");
    expect(prompt).toContain("reject sign-off if any are present");
  });

  it("does NOT include notes path check when spec has no notes", () => {
    const prompt = eAgentPrompt(10, specNoNotes, doneFile, "e-agent:test");
    expect(prompt).not.toContain("grep the diff stat output for those paths");
  });
});
