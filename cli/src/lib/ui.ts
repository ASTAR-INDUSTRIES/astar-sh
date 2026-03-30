const isTTY = process.stdout.isTTY;

const esc = (code: string) => (isTTY ? `\x1b[${code}m` : "");

export const c = {
  reset: esc("0"),
  bold: esc("1"),
  dim: esc("2"),
  cyan: esc("36"),
  green: esc("32"),
  yellow: esc("33"),
  red: esc("31"),
  magenta: esc("35"),
  white: esc("37"),
  gray: esc("90"),
};

export function table(headers: string[], rows: string[][]) {
  const cols = headers.length;
  const widths = headers.map((h, i) =>
    Math.max(h.length, ...rows.map((r) => stripAnsi(r[i] || "").length))
  );

  const pad = (s: string, w: number) => {
    const visible = stripAnsi(s).length;
    return s + " ".repeat(Math.max(0, w - visible));
  };

  const header = headers.map((h, i) => `${c.bold}${c.white}${pad(h, widths[i])}${c.reset}`).join("  ");
  const separator = widths.map((w) => `${c.dim}${"─".repeat(w)}${c.reset}`).join("  ");

  console.log(`  ${header}`);
  console.log(`  ${separator}`);
  for (const row of rows) {
    const line = row.map((cell, i) => pad(cell || "", widths[i])).join("  ");
    console.log(`  ${line}`);
  }
}

function stripAnsi(s: string): string {
  return s.replace(/\x1b\[[0-9;]*m/g, "");
}

export function tag(text: string): string {
  return `${c.dim}${text}${c.reset}`;
}

export function badge(text: string, color: string): string {
  return `${color}${text}${c.reset}`;
}
