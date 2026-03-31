import { c } from "./ui";

type DiffOp = "equal" | "add" | "remove";

interface DiffLine {
  op: DiffOp;
  text: string;
  oldNum?: number;
  newNum?: number;
}

interface Hunk {
  oldStart: number;
  oldCount: number;
  newStart: number;
  newCount: number;
  lines: DiffLine[];
}

export interface FileDiff {
  filename: string;
  hunks: Hunk[];
  additions: number;
  removals: number;
  unchanged: boolean;
}

const MAX_LINES = 2000;

function normalize(content: string): string[] {
  return content.replace(/\r\n/g, "\n").split("\n");
}

function computeDiff(oldLines: string[], newLines: string[]): DiffLine[] {
  const m = oldLines.length;
  const n = newLines.length;

  let prefixLen = 0;
  while (prefixLen < m && prefixLen < n && oldLines[prefixLen] === newLines[prefixLen]) {
    prefixLen++;
  }

  let suffixLen = 0;
  while (
    suffixLen < m - prefixLen &&
    suffixLen < n - prefixLen &&
    oldLines[m - 1 - suffixLen] === newLines[n - 1 - suffixLen]
  ) {
    suffixLen++;
  }

  const oldCore = oldLines.slice(prefixLen, m - suffixLen);
  const newCore = newLines.slice(prefixLen, n - suffixLen);
  const cm = oldCore.length;
  const cn = newCore.length;

  const result: DiffLine[] = [];
  let oldNum = 1;
  let newNum = 1;

  for (let k = 0; k < prefixLen; k++) {
    result.push({ op: "equal", text: oldLines[k], oldNum: oldNum++, newNum: newNum++ });
  }

  if (cm > MAX_LINES || cn > MAX_LINES) {
    for (const line of oldCore) result.push({ op: "remove", text: line, oldNum: oldNum++ });
    for (const line of newCore) result.push({ op: "add", text: line, newNum: newNum++ });
  } else {
    const tbl: number[][] = Array.from({ length: cm + 1 }, () => new Array(cn + 1).fill(0));
    for (let i = cm - 1; i >= 0; i--) {
      for (let j = cn - 1; j >= 0; j--) {
        if (oldCore[i] === newCore[j]) {
          tbl[i][j] = tbl[i + 1][j + 1] + 1;
        } else {
          tbl[i][j] = Math.max(tbl[i + 1][j], tbl[i][j + 1]);
        }
      }
    }

    let i = 0, j = 0;
    while (i < cm && j < cn) {
      if (oldCore[i] === newCore[j]) {
        result.push({ op: "equal", text: oldCore[i], oldNum: oldNum++, newNum: newNum++ });
        i++; j++;
      } else if (tbl[i + 1][j] >= tbl[i][j + 1]) {
        result.push({ op: "remove", text: oldCore[i], oldNum: oldNum++ });
        i++;
      } else {
        result.push({ op: "add", text: newCore[j], newNum: newNum++ });
        j++;
      }
    }
    while (i < cm) {
      result.push({ op: "remove", text: oldCore[i], oldNum: oldNum++ });
      i++;
    }
    while (j < cn) {
      result.push({ op: "add", text: newCore[j], newNum: newNum++ });
      j++;
    }
  }

  for (let k = 0; k < suffixLen; k++) {
    result.push({ op: "equal", text: oldLines[m - suffixLen + k], oldNum: oldNum++, newNum: newNum++ });
  }

  return result;
}

function assembleHunks(diff: DiffLine[], context: number = 3): Hunk[] {
  const changes: number[] = [];
  for (let i = 0; i < diff.length; i++) {
    if (diff[i].op !== "equal") changes.push(i);
  }
  if (changes.length === 0) return [];

  const hunks: Hunk[] = [];
  let start = Math.max(0, changes[0] - context);
  let end = Math.min(diff.length - 1, changes[0] + context);

  for (let ci = 1; ci < changes.length; ci++) {
    const ns = Math.max(0, changes[ci] - context);
    const ne = Math.min(diff.length - 1, changes[ci] + context);

    if (ns <= end + 1) {
      end = ne;
    } else {
      hunks.push(buildHunk(diff, start, end));
      start = ns;
      end = ne;
    }
  }
  hunks.push(buildHunk(diff, start, end));

  return hunks;
}

function buildHunk(diff: DiffLine[], start: number, end: number): Hunk {
  const lines = diff.slice(start, end + 1);
  const oldStart = lines.find((l) => l.oldNum !== undefined)?.oldNum ?? 1;
  const newStart = lines.find((l) => l.newNum !== undefined)?.newNum ?? 1;
  const oldCount = lines.filter((l) => l.op === "equal" || l.op === "remove").length;
  const newCount = lines.filter((l) => l.op === "equal" || l.op === "add").length;
  return { oldStart, oldCount, newStart, newCount, lines };
}

export function diffFiles(filename: string, oldContent: string, newContent: string): FileDiff {
  const oldLines = normalize(oldContent);
  const newLines = normalize(newContent);

  if (oldContent === newContent) {
    return { filename, hunks: [], additions: 0, removals: 0, unchanged: true };
  }

  const diff = computeDiff(oldLines, newLines);
  const hunks = assembleHunks(diff);
  const additions = diff.filter((d) => d.op === "add").length;
  const removals = diff.filter((d) => d.op === "remove").length;

  return { filename, hunks, additions, removals, unchanged: false };
}

export function renderDiff(
  title: string,
  localDate: string,
  remoteDate: string,
  files: FileDiff[]
): void {
  const changedFiles = files.filter((f) => !f.unchanged);
  const totalAdd = files.reduce((sum, f) => sum + f.additions, 0);
  const totalRem = files.reduce((sum, f) => sum + f.removals, 0);

  console.log("");
  console.log(`  ${c.dim}┌──────────────────────────────────────────────────┐${c.reset}`);
  console.log(`  ${c.dim}│${c.reset} ${c.bold}${c.white}${title}${c.reset}${" ".repeat(Math.max(1, 49 - title.length))}${c.dim}│${c.reset}`);
  console.log(`  ${c.dim}│${c.reset} ${c.dim}Local:${c.reset}  ${localDate}${" ".repeat(Math.max(1, 12 - localDate.length))}${c.dim}Remote:${c.reset} ${remoteDate}${" ".repeat(Math.max(1, 49 - 22 - localDate.length - remoteDate.length))}${c.dim}│${c.reset}`);
  console.log(`  ${c.dim}└──────────────────────────────────────────────────┘${c.reset}`);

  if (changedFiles.length === 0) {
    console.log("");
    console.log(`  ${c.green}✓${c.reset} No differences — skill is up to date.`);
    console.log("");
    return;
  }

  for (const file of changedFiles) {
    console.log("");
    const label = ` ${file.filename} `;
    const pad = Math.max(0, 50 - label.length - 2);
    console.log(`  ${c.bold}${c.white}──${label}${"─".repeat(pad)}${c.reset}`);

    for (const hunk of file.hunks) {
      console.log("");
      console.log(`  ${c.cyan}@@ -${hunk.oldStart},${hunk.oldCount} +${hunk.newStart},${hunk.newCount} @@${c.reset}`);
      console.log("");

      for (const line of hunk.lines) {
        const num = String(line.oldNum ?? line.newNum ?? 0).padStart(4);

        switch (line.op) {
          case "equal":
            console.log(`  ${c.dim}${num} │   ${line.text}${c.reset}`);
            break;
          case "add":
            console.log(`  ${c.green}${num} │ + ${line.text}${c.reset}`);
            break;
          case "remove":
            console.log(`  ${c.red}${num} │ - ${line.text}${c.reset}`);
            break;
        }
      }
    }
  }

  console.log("");
  const fs = `${changedFiles.length} file(s) changed`;
  const as = `${c.green}${totalAdd} addition${totalAdd !== 1 ? "s" : ""}${c.reset}`;
  const rs = `${c.red}${totalRem} removal${totalRem !== 1 ? "s" : ""}${c.reset}`;
  console.log(`  ${c.bold}${fs}${c.reset}, ${as}, ${rs}`);
  console.log("");
}
