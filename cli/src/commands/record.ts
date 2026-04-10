import { execSync, spawn, type ChildProcess } from "child_process";
import { homedir } from "os";
import { join } from "path";
import type { Command } from "commander";
import { c, table } from "../lib/ui";

const WHISPER_DIR = join(homedir(), ".astar", "whisper");
const WHISPER_BIN = join(WHISPER_DIR, "whisper-cli");
const STREAM_BIN = join(WHISPER_DIR, "whisper-stream");
const MODEL_FILE = join(WHISPER_DIR, "nb-whisper-medium-q5_0.bin");
const MODEL_URL = "https://huggingface.co/NbAiLab/nb-whisper-medium/resolve/main/ggml-model-q5_0.bin";
const RECORDINGS_DIR = join(homedir(), ".astar", "recordings");

function hasSox(): boolean {
  try {
    execSync("which rec", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function hasCmake(): boolean {
  try {
    execSync("which cmake", { stdio: "pipe" });
    return true;
  } catch {
    return false;
  }
}

function hasWhisper(): boolean {
  return Bun.file(STREAM_BIN).size > 0;
}

function hasModel(): boolean {
  return Bun.file(MODEL_FILE).size > 0;
}

async function ensureDir(dir: string) {
  await Bun.write(join(dir, ".keep"), "");
}

function formatDuration(seconds: number): string {
  const h = Math.floor(seconds / 3600);
  const m = Math.floor((seconds % 3600) / 60);
  const s = Math.floor(seconds % 60);
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

function formatTimestamp(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

async function setupWhisper() {
  if (!hasSox()) {
    console.log(`\n  ${c.red}✗${c.reset} sox not found. Install with: ${c.cyan}brew install sox${c.reset}\n`);
    process.exit(1);
  }

  if (!hasCmake()) {
    console.log(`\n  ${c.red}✗${c.reset} cmake not found. Install with: ${c.cyan}brew install cmake${c.reset}\n`);
    process.exit(1);
  }

  await ensureDir(WHISPER_DIR);

  if (!hasWhisper()) {
    console.log(`\n  ${c.dim}Building whisper.cpp...${c.reset}`);
    const tmpDir = join(WHISPER_DIR, "_build");
    try {
      execSync(`git clone --depth 1 https://github.com/ggml-org/whisper.cpp.git "${tmpDir}"`, { stdio: "inherit" });
      execSync(`cmake -B "${join(tmpDir, "build")}" -S "${tmpDir}" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF -DWHISPER_SDL2=ON`, { stdio: "inherit" });
      execSync(`cmake --build "${join(tmpDir, "build")}" --config Release -j$(sysctl -n hw.ncpu)`, { stdio: "inherit" });
      for (const bin of ["whisper-cli", "whisper-stream"]) {
        execSync(`cp "${join(tmpDir, "build", "bin", bin)}" "${join(WHISPER_DIR, bin)}"`);
        execSync(`chmod +x "${join(WHISPER_DIR, bin)}"`);
      }
      execSync(`rm -rf "${tmpDir}"`);
      console.log(`  ${c.green}✓${c.reset} whisper-cli + whisper-stream built (static)`);
    } catch (e: any) {
      console.error(`  ${c.red}✗${c.reset} Build failed: ${e.message}`);
      execSync(`rm -rf "${tmpDir}"`);
      process.exit(1);
    }
  } else {
    console.log(`\n  ${c.green}✓${c.reset} whisper-cli already installed`);
  }

  if (!hasModel()) {
    console.log(`  ${c.dim}Downloading NB-Whisper medium (~515 MB)...${c.reset}`);
    try {
      execSync(`curl -L --progress-bar -o "${MODEL_FILE}" "${MODEL_URL}"`, { stdio: "inherit" });
      console.log(`  ${c.green}✓${c.reset} Model downloaded`);
    } catch (e: any) {
      console.error(`  ${c.red}✗${c.reset} Download failed: ${e.message}`);
      process.exit(1);
    }
  } else {
    console.log(`  ${c.green}✓${c.reset} NB-Whisper medium already downloaded`);
  }

  console.log(`\n  ${c.green}✓${c.reset} Ready. Run ${c.cyan}astar record${c.reset} to start a session.\n`);
}

async function startRecording() {
  if (!hasWhisper() || !hasModel()) {
    console.log(`\n  ${c.yellow}!${c.reset} Whisper not set up. Run ${c.cyan}astar record --setup${c.reset} first.\n`);
    process.exit(1);
  }

  await ensureDir(RECORDINGS_DIR);

  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const filename = `${dateStr}T${timeStr}.md`;
  const filepath = join(RECORDINGS_DIR, filename);
  const audioFile = join(WHISPER_DIR, `_session.wav`);

  const lines: string[] = [];
  let currentLine = "";
  const startTime = Date.now();

  const streamProc = spawn(STREAM_BIN, [
    "-m", MODEL_FILE,
    "-l", "no",
    "--step", "3000",
    "--length", "8000",
    "--keep", "200",
    "--keep-context",
    "-sa",
    "-f", audioFile,
  ], { stdio: ["pipe", "pipe", "pipe"] });

  let streamOutput = "";

  streamProc.stdout!.on("data", (data: Buffer) => {
    const text = data.toString();
    streamOutput += text;

    for (const chunk of text.split("\n")) {
      const clean = chunk.replace(/\x1b\[2K/g, "").trim();
      if (!clean || clean === "[Start speaking]" || clean.startsWith("init:") || clean.startsWith("whisper_") || clean.startsWith("main:") || clean.startsWith("ggml_")) continue;
      if (clean.match(/^\.*$/) || clean === "!") continue;

      if (chunk.includes("\x1b[2K")) {
        currentLine = clean;
      } else if (clean) {
        if (currentLine) {
          lines.push(currentLine);
          currentLine = "";
        }
        lines.push(clean);
      }
    }
  });

  streamProc.stderr!.on("data", () => {});

  function render() {
    const elapsed = (Date.now() - startTime) / 1000;
    const cols = process.stdout.columns || 80;

    process.stdout.write("\x1b[2J\x1b[H\x1b[?25l");
    const statusRight = `${c.dim}ctrl+c stop${c.reset}`;
    const statusLeft = `  ${c.red}◆${c.reset} ${c.bold}RECORDING${c.reset}  ${c.white}${formatDuration(elapsed)}${c.reset}`;
    console.log(`${statusLeft}${" ".repeat(Math.max(0, cols - 30 - 15))}${statusRight}`);
    console.log("");

    const maxLines = (process.stdout.rows || 24) - 5;
    const allLines = [...lines];
    if (currentLine) allLines.push(currentLine);

    const visible = allLines.slice(-maxLines);
    for (const line of visible) {
      console.log(`  ${line}`);
    }

    if (!allLines.length) {
      console.log(`  ${c.dim}listening...${c.reset}`);
    }
  }

  const renderInterval = setInterval(() => render(), 200);
  render();

  async function cleanup() {
    clearInterval(renderInterval);

    streamProc.stdin!.end();
    streamProc.kill("SIGINT");
    await new Promise((r) => setTimeout(r, 500));
    if (!streamProc.killed) streamProc.kill("SIGTERM");

    const elapsed = (Date.now() - startTime) / 1000;
    const duration = formatDuration(elapsed);

    const allLines = [...lines];
    if (currentLine) allLines.push(currentLine);

    const finalLines = allLines.filter((l) => l && !l.match(/^\.*$/) && l !== "!");
    const wordCount = finalLines.reduce((sum, l) => sum + l.split(/\s+/).filter(Boolean).length, 0);

    const output = [
      "---",
      `date: ${dateStr}`,
      `start: ${timeStr.slice(0, 2)}:${timeStr.slice(2)}`,
      `duration: ${duration}`,
      `model: nb-whisper-medium-q5_0`,
      `mode: stream`,
      "---",
      "",
      ...finalLines,
      "",
    ];

    await Bun.write(filepath, output.join("\n"));
    try { execSync(`rm -f "${audioFile}"`, { stdio: "pipe" }); } catch {}

    process.stdout.write("\x1b[2J\x1b[H\x1b[?25h");
    console.log("");
    console.log(`  ${c.green}✓${c.reset} Recording saved`);
    console.log("");
    console.log(`  ${c.dim}Duration:${c.reset}  ${duration}`);
    console.log(`  ${c.dim}Words:${c.reset}     ${wordCount.toLocaleString()}`);
    console.log(`  ${c.dim}File:${c.reset}      ${c.cyan}${filename}${c.reset}`);
    console.log(`  ${c.dim}Path:${c.reset}      ${c.dim}${filepath}${c.reset}`);
    console.log("");

    process.exit(0);
  }

  if (process.stdin.isTTY) {
    process.stdin.setRawMode(true);
    process.stdin.resume();
    process.stdin.on("data", (key: Buffer) => {
      if (key[0] === 0x03) cleanup();
    });
  } else {
    process.on("SIGINT", () => cleanup());
  }
}

async function getRecordingFiles() {
  const files: { name: string; date: string; start: string; duration: string; words: number }[] = [];
  try {
    const glob = new Bun.Glob("*.md");
    for await (const path of glob.scan({ cwd: RECORDINGS_DIR })) {
      if (path === ".keep") continue;
      const content = await Bun.file(join(RECORDINGS_DIR, path)).text();
      const lines = content.split("\n");

      let date = "", start = "", duration = "";
      for (const line of lines) {
        if (line.startsWith("date:")) date = line.split(": ")[1]?.trim() || "";
        if (line.startsWith("start:")) start = line.split(": ")[1]?.trim() || "";
        if (line.startsWith("duration:")) duration = line.split(": ")[1]?.trim() || "";
      }

      const textLines = lines.filter((l) => l.startsWith("["));
      const words = textLines.reduce((sum, l) => {
        const text = l.replace(/^\[\d+:\d+\]\s*/, "");
        return sum + text.split(/\s+/).filter(Boolean).length;
      }, 0);

      files.push({ name: path, date, start, duration, words });
    }
  } catch {}
  files.sort((a, b) => b.name.localeCompare(a.name));
  return files;
}

async function listRecordings() {
  const files = await getRecordingFiles();

  if (!files.length) {
    console.log(`\n  ${c.dim}No recordings found.${c.reset} Run ${c.cyan}astar record${c.reset} to start.\n`);
    return;
  }

  console.log("");
  table(
    ["#", "Date", "Start", "Duration", "Words", "File"],
    files.map((f, i) => [
      `${c.dim}${i + 1}${c.reset}`,
      f.date,
      f.start,
      f.duration,
      f.words.toLocaleString(),
      `${c.cyan}${f.name}${c.reset}`,
    ])
  );
  console.log(`\n  ${c.dim}${files.length} recording(s)${c.reset}\n`);
}

async function resolveRecording(ref?: string): Promise<string> {
  const files = await getRecordingFiles();

  if (!files.length) {
    console.error(`${c.red}✗${c.reset} No recordings found.`);
    process.exit(1);
  }

  if (!ref) return files[0].name;

  const num = parseInt(ref);
  if (!isNaN(num) && num >= 1 && num <= files.length) return files[num - 1].name;

  if (files.some((f) => f.name === ref)) return ref;

  console.error(`${c.red}✗${c.reset} Recording not found: ${ref}`);
  process.exit(1);
}

async function showRecording(ref?: string) {
  const name = await resolveRecording(ref);
  const content = await Bun.file(join(RECORDINGS_DIR, name)).text();
  console.log("");
  console.log(content);
}

export function registerRecordCommands(program: Command) {
  const record = program
    .command("record")
    .description("Record and transcribe conversations locally")
    .option("--setup", "Download and build whisper.cpp + NB-Whisper model")
    .action(async (opts: { setup?: boolean }) => {
      if (opts.setup) {
        await setupWhisper();
        return;
      }
      await startRecording();
    });

  record
    .command("list")
    .description("Browse saved recordings")
    .action(async () => {
      await listRecordings();
    });

  record
    .command("info [ref]")
    .description("Read a transcript (number, filename, or latest by default)")
    .action(async (ref?: string) => {
      await showRecording(ref);
    });

  record
    .command("setup")
    .description("Download and build whisper.cpp + NB-Whisper model")
    .action(async () => {
      await setupWhisper();
    });
}
