import { execSync, spawn, type ChildProcess } from "child_process";
import { homedir } from "os";
import { join } from "path";
import type { Command } from "commander";
import { c, table } from "../lib/ui";

const WHISPER_DIR = join(homedir(), ".astar", "whisper");
const WHISPER_BIN = join(WHISPER_DIR, "whisper-cli");
const MODEL_FILE = join(WHISPER_DIR, "nb-whisper-medium-q5_0.bin");
const MODEL_URL = "https://huggingface.co/NbAiLab/nb-whisper-medium/resolve/main/ggml-model-q5_0.bin";
const RECORDINGS_DIR = join(homedir(), ".astar", "recordings");
const TRANSCRIBE_INTERVAL = 10000;

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
  return Bun.file(WHISPER_BIN).size > 0;
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
      execSync(`cmake -B "${join(tmpDir, "build")}" -S "${tmpDir}" -DCMAKE_BUILD_TYPE=Release -DBUILD_SHARED_LIBS=OFF`, { stdio: "inherit" });
      execSync(`cmake --build "${join(tmpDir, "build")}" --config Release -j$(sysctl -n hw.ncpu)`, { stdio: "inherit" });
      const builtBin = join(tmpDir, "build", "bin", "whisper-cli");
      execSync(`cp "${builtBin}" "${WHISPER_BIN}"`);
      execSync(`chmod +x "${WHISPER_BIN}"`);
      const ggmlMetal = join(tmpDir, "build", "bin", "ggml-metal.metallib");
      try { execSync(`cp "${ggmlMetal}" "${join(WHISPER_DIR, "ggml-metal.metallib")}" 2>/dev/null`); } catch {}
      execSync(`rm -rf "${tmpDir}"`);
      console.log(`  ${c.green}✓${c.reset} whisper-cli built (static)`);
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

function transcribeFile(wavPath: string): string {
  try {
    return execSync(
      `"${WHISPER_BIN}" -m "${MODEL_FILE}" -l no -f "${wavPath}" --no-prints 2>/dev/null`,
      { encoding: "utf-8", timeout: 120000 }
    ).trim();
  } catch {
    return "";
  }
}

function parseWhisperOutput(raw: string): { start: number; text: string }[] {
  const lines: { start: number; text: string }[] = [];
  for (const line of raw.split("\n")) {
    const match = line.match(/^\[(\d{2}):(\d{2}):(\d{2})\.\d+\s*-->\s*\d{2}:\d{2}:\d{2}\.\d+\]\s*(.+)/);
    if (!match) continue;
    const [, hh, mm, ss, text] = match;
    const start = parseInt(hh) * 3600 + parseInt(mm) * 60 + parseInt(ss);
    const trimmed = text.trim();
    if (trimmed && !trimmed.match(/^\.*$/)) lines.push({ start, text: trimmed });
  }
  return lines;
}

async function startRecording() {
  if (!hasWhisper() || !hasModel()) {
    console.log(`\n  ${c.yellow}!${c.reset} Whisper not set up. Run ${c.cyan}astar record --setup${c.reset} first.\n`);
    process.exit(1);
  }

  if (!hasSox()) {
    console.log(`\n  ${c.red}✗${c.reset} sox not found. Install with: ${c.cyan}brew install sox${c.reset}\n`);
    process.exit(1);
  }

  await ensureDir(RECORDINGS_DIR);

  const now = new Date();
  const dateStr = now.toISOString().split("T")[0];
  const timeStr = `${String(now.getHours()).padStart(2, "0")}${String(now.getMinutes()).padStart(2, "0")}`;
  const filename = `${dateStr}T${timeStr}.md`;
  const filepath = join(RECORDINGS_DIR, filename);
  const wavPath = join(WHISPER_DIR, `_session_${dateStr}T${timeStr}.wav`);

  let segments: { start: number; text: string }[] = [];
  const startTime = Date.now();
  let running = true;
  let transcribing = false;

  const sampleRate = 16000;

  const recProc = spawn("rec", [
    "-q", "-r", String(sampleRate), "-c", "1", "-b", "16",
    wavPath,
  ], { stdio: ["ignore", "pipe", "pipe"] });

  let pcmBuffer = Buffer.alloc(0);

  const micMonitor = spawn("sox", [
    "-q", "-d",
    "-r", String(sampleRate), "-c", "1", "-b", "16",
    "-e", "signed-integer", "-t", "raw", "-",
  ], { stdio: ["ignore", "pipe", "pipe"] });

  micMonitor.stdout!.on("data", (data: Buffer) => {
    pcmBuffer = Buffer.concat([pcmBuffer, data]);
    if (pcmBuffer.length > 32000) pcmBuffer = pcmBuffer.subarray(pcmBuffer.length - 32000);
  });

  function getAudioLevel(): number {
    if (pcmBuffer.length < 512) return 0;
    const recent = pcmBuffer.subarray(Math.max(0, pcmBuffer.length - 2048));
    let sum = 0;
    for (let i = 0; i < recent.length - 1; i += 2) {
      const sample = recent.readInt16LE(i);
      sum += Math.abs(sample);
    }
    const avg = sum / (recent.length / 2);
    return Math.min(1, avg / 4000);
  }

  function renderMeter(level: number, width: number): string {
    const filled = Math.round(level * width);
    const bars = "█".repeat(filled) + "░".repeat(width - filled);
    if (level > 0.6) return `${c.red}${bars}${c.reset}`;
    if (level > 0.3) return `${c.yellow}${bars}${c.reset}`;
    if (level > 0.05) return `${c.green}${bars}${c.reset}`;
    return `${c.dim}${bars}${c.reset}`;
  }

  function render() {
    const elapsed = (Date.now() - startTime) / 1000;
    const cols = process.stdout.columns || 80;
    const level = getAudioLevel();

    process.stdout.write("\x1b[2J\x1b[H\x1b[?25l");
    const statusRight = `${c.dim}ctrl+c stop${c.reset}`;
    const statusLeft = `  ${c.red}◆${c.reset} ${c.bold}RECORDING${c.reset}  ${c.white}${formatDuration(elapsed)}${c.reset}`;
    console.log(`${statusLeft}${" ".repeat(Math.max(0, cols - 30 - 15))}${statusRight}`);
    console.log(`  ${c.dim}mic${c.reset} ${renderMeter(level, 24)}`);
    console.log("");

    const maxLines = (process.stdout.rows || 24) - 6;
    const visible = segments.slice(-maxLines);
    for (const seg of visible) {
      console.log(`  ${c.dim}[${formatTimestamp(seg.start)}]${c.reset} ${seg.text}`);
    }

    if (transcribing) {
      console.log(`\n  ${c.dim}transcribing...${c.reset}`);
    } else if (!segments.length) {
      console.log(`  ${c.dim}listening...${c.reset}`);
    }
  }

  async function runTranscription() {
    if (transcribing) return;
    const file = Bun.file(wavPath);
    if (!(await file.exists()) || file.size < 10000) return;

    transcribing = true;
    try {
      const raw = transcribeFile(wavPath);
      const parsed = parseWhisperOutput(raw);
      if (parsed.length) segments = parsed;
    } finally {
      transcribing = false;
    }
  }

  const transcribeTimer = setInterval(() => runTranscription(), TRANSCRIBE_INTERVAL);
  const renderInterval = setInterval(() => render(), 150);
  render();

  async function cleanup() {
    running = false;
    clearInterval(transcribeTimer);
    clearInterval(renderInterval);

    if (!recProc.killed) recProc.kill("SIGTERM");
    try { if (!micMonitor.killed) micMonitor.kill("SIGTERM"); } catch {}

    await new Promise((r) => setTimeout(r, 300));

    process.stdout.write("\x1b[2J\x1b[H");
    console.log(`\n  ${c.dim}Final transcription...${c.reset}\n`);

    const raw = transcribeFile(wavPath);
    segments = parseWhisperOutput(raw);

    const elapsed = (Date.now() - startTime) / 1000;
    const duration = formatDuration(elapsed);
    const wordCount = segments.reduce((sum, s) => sum + s.text.split(/\s+/).length, 0);

    const lines = [
      "---",
      `date: ${dateStr}`,
      `start: ${timeStr.slice(0, 2)}:${timeStr.slice(2)}`,
      `duration: ${duration}`,
      `model: nb-whisper-medium-q5_0`,
      "---",
      "",
      ...segments.map((s) => `[${formatTimestamp(s.start)}] ${s.text}`),
      "",
    ];

    await Bun.write(filepath, lines.join("\n"));
    try { execSync(`rm -f "${wavPath}"`, { stdio: "pipe" }); } catch {}

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
