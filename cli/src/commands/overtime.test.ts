import { describe, it, expect } from "bun:test";
import { parseSpec } from "./overtime";

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

  it("handles verification before requirements", () => {
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
