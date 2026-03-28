import { useAuth } from "@/contexts/AuthContext";
import { useState, useEffect, useRef } from "react";

const BOOT_LINES = [
  { text: "> initializing astar kernel...", delay: 0 },
  { text: "> loading knowledge modules     [OK]", delay: 600 },
  { text: "> mounting intelligence graph    [OK]", delay: 1100 },
  { text: "> neural mesh sync              [OK]", delay: 1600 },
  { text: "> encryption layer active        [OK]", delay: 2000 },
  { text: "PROGRESS", delay: 2400 },
  { text: "", delay: 3200 },
  { text: "ASTAR INTELLIGENCE SYSTEM v4.2.1", delay: 3400 },
  { text: "────────────────────────────────", delay: 3500 },
  { text: "STATUS:  OPERATIONAL", delay: 3700 },
  { text: `UPTIME:  ${Math.floor(Math.random() * 900 + 100)}d ${Math.floor(Math.random() * 24)}h ${Math.floor(Math.random() * 60)}m`, delay: 3900 },
  { text: "NODES:   ██ CLASSIFIED", delay: 4100 },
  { text: "", delay: 4300 },
  { text: "PROMPT", delay: 4500 },
];

const CrypticLanding = () => {
  const { signIn } = useAuth();
  const [visibleLines, setVisibleLines] = useState<number>(0);
  const [progress, setProgress] = useState(0);
  const [cursorVisible, setCursorVisible] = useState(true);
  const bootComplete = useRef(false);

  useEffect(() => {
    BOOT_LINES.forEach((line, i) => {
      setTimeout(() => {
        setVisibleLines(i + 1);
      }, line.delay);
    });

    // Progress bar animation
    const progressStart = BOOT_LINES[5].delay;
    const progressEnd = BOOT_LINES[6].delay;
    const steps = 20;
    const stepTime = (progressEnd - progressStart) / steps;
    for (let s = 0; s <= steps; s++) {
      setTimeout(() => setProgress(s), progressStart + s * stepTime);
    }

    // Cursor blink
    const blink = setInterval(() => setCursorVisible(v => !v), 530);
    return () => clearInterval(blink);
  }, []);

  const renderLine = (line: typeof BOOT_LINES[0], index: number) => {
    if (line.text === "PROGRESS") {
      const filled = "█".repeat(progress);
      const empty = "░".repeat(20 - progress);
      const pct = Math.round((progress / 20) * 100);
      return (
        <div key={index} className="font-mono text-xs text-accent/70">
          {"  > ["}{filled}{empty}{`] ${pct}%`}
        </div>
      );
    }

    if (line.text === "PROMPT") {
      return (
        <div key={index} className="mt-2">
          <button
            onClick={signIn}
            className="font-mono text-xs text-muted-foreground/60 hover:text-accent transition-colors duration-500 text-left"
          >
            {"  > enter credentials: "} 
            <span className={`inline-block w-[7px] h-[14px] align-middle bg-accent/70 ${cursorVisible ? "opacity-100" : "opacity-0"} transition-opacity duration-100`} />
          </button>
        </div>
      );
    }

    if (line.text === "") {
      return <div key={index} className="h-3" />;
    }

    const isHeader = line.text.startsWith("ASTAR");
    const isDivider = line.text.startsWith("────");
    const isStatus = line.text.startsWith("STATUS") || line.text.startsWith("UPTIME") || line.text.startsWith("NODES");
    const isOk = line.text.includes("[OK]");

    return (
      <div key={index} className={`font-mono text-xs ${
        isHeader ? "text-foreground font-bold text-sm mt-2" :
        isDivider ? "text-border" :
        isStatus ? "text-muted-foreground/50" :
        "text-muted-foreground/40"
      }`}>
        {isOk ? (
          <>
            {line.text.replace("[OK]", "")}
            <span className="text-accent">[OK]</span>
          </>
        ) : isStatus ? (
          <>
            {"  "}{line.text.split(":")[0]}:
            <span className={line.text.includes("CLASSIFIED") ? "text-destructive/60" : "text-accent/50"}>
              {line.text.split(":").slice(1).join(":")}
            </span>
          </>
        ) : (
          <>{"  "}{line.text}</>
        )}
      </div>
    );
  };

  return (
    <div className="flex items-center justify-center min-h-[80vh] select-none">
      <div className="w-full max-w-md p-6">
        <div className="space-y-0.5">
          {BOOT_LINES.slice(0, visibleLines).map((line, i) => renderLine(line, i))}
        </div>
      </div>
    </div>
  );
};

export default CrypticLanding;
