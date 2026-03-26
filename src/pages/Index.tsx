import { Copy } from "lucide-react";
import AstarLogo from "@/components/AstarLogo";
import LeaderboardTable from "@/components/LeaderboardTable";
import { useState } from "react";

const AGENTS = [
  { label: "GridBot", icon: "◆" },
  { label: "NavCore", icon: "✦" },
  { label: "RouteAI", icon: "⬡" },
  { label: "PathML", icon: "◉" },
  { label: "WayfindR", icon: "✧" },
  { label: "TraceNet", icon: "▲" },
];

const Index = () => {
  const [copied, setCopied] = useState(false);

  const handleCopy = () => {
    navigator.clipboard.writeText("npx astar update");
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="min-h-screen bg-background">
      {/* Nav */}
      <nav className="flex items-center justify-between px-6 md:px-10 py-4 border-b border-border">
        <div className="flex items-center gap-2 text-sm font-mono">
          <span className="text-accent text-lg">◆</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-foreground font-medium">astar.sh</span>
        </div>
        <div className="flex items-center gap-6 text-sm font-mono">
          <span className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors">Docs</span>
          <span className="text-muted-foreground hover:text-foreground cursor-pointer transition-colors">GitHub</span>
        </div>
      </nav>

      <main className="max-w-4xl mx-auto px-6 md:px-10 py-16 md:py-24">
        {/* Hero */}
        <div className="flex flex-col md:flex-row md:items-start gap-8 md:gap-16 mb-20">
          <AstarLogo />
          <p className="text-lg md:text-xl text-secondary-foreground leading-relaxed max-w-md font-sans">
            Pathfinding algorithms as reusable modules. Install with a single command to give your agents optimal navigation.
          </p>
        </div>

        {/* Try / Agents row */}
        <div className="flex flex-col md:flex-row gap-12 md:gap-24 mb-20">
          <div>
            <h3 className="text-xs font-mono uppercase tracking-[0.25em] text-muted-foreground mb-4">
              Try It Now
            </h3>
            <button
              onClick={handleCopy}
              className="flex items-center gap-3 bg-secondary border border-border rounded-md px-4 py-2.5 font-mono text-sm text-foreground hover:bg-muted transition-colors group"
            >
              <span className="text-muted-foreground">$</span>
              <span>npx astar update</span>
              <Copy className="h-3.5 w-3.5 text-muted-foreground group-hover:text-foreground transition-colors ml-4" />
            </button>
            {copied && (
              <span className="text-xs font-mono text-accent mt-2 block">Copied!</span>
            )}
          </div>

          <div>
            <h3 className="text-xs font-mono uppercase tracking-[0.25em] text-muted-foreground mb-4">
              Compatible Agents
            </h3>
            <div className="flex items-center gap-5">
              {AGENTS.map((agent) => (
                <div
                  key={agent.label}
                  className="text-2xl text-muted-foreground hover:text-foreground transition-colors cursor-pointer"
                  title={agent.label}
                >
                  {agent.icon}
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Leaderboard */}
        <LeaderboardTable />
      </main>
    </div>
  );
};

export default Index;
