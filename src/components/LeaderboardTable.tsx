import { useState } from "react";
import { Search } from "lucide-react";

const ALGORITHMS = [
  { name: "dijkstra", author: "core/pathfinding", installs: "841.2K" },
  { name: "a-star-weighted", author: "core/pathfinding", installs: "623.4K" },
  { name: "bfs-grid", author: "graphlib/search", installs: "412.8K" },
  { name: "jump-point-search", author: "harabor/jps", installs: "389.1K" },
  { name: "theta-star", author: "any-angle/pathfinding", installs: "301.7K" },
  { name: "d-star-lite", author: "incremental/replan", installs: "276.3K" },
  { name: "bidirectional-astar", author: "core/pathfinding", installs: "254.9K" },
  { name: "rrt-star", author: "sampling/motion", installs: "198.4K" },
  { name: "navmesh-query", author: "recast/detour", installs: "187.6K" },
  { name: "flow-field", author: "rts/navigation", installs: "165.2K" },
  { name: "hierarchical-astar", author: "hpa/pathfinding", installs: "143.8K" },
  { name: "contraction-hierarchy", author: "routing/preprocess", installs: "132.1K" },
];

const TABS = ["All Time (12,847)", "Trending (24h)", "New"];

const LeaderboardTable = () => {
  const [activeTab, setActiveTab] = useState(0);
  const [search, setSearch] = useState("");

  const filtered = ALGORITHMS.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.author.toLowerCase().includes(search.toLowerCase())
  );

  return (
    <div className="w-full">
      <h2 className="text-xs font-mono uppercase tracking-[0.25em] text-muted-foreground mb-6">
        Algorithm Leaderboard
      </h2>

      {/* Search */}
      <div className="relative mb-6">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <input
          type="text"
          placeholder="Search algorithms ..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="w-full bg-secondary border border-border rounded-md py-2.5 pl-10 pr-10 text-sm font-mono text-foreground placeholder:text-muted-foreground focus:outline-none focus:ring-1 focus:ring-ring"
        />
        <span className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground text-xs font-mono border border-border rounded px-1.5 py-0.5">
          /
        </span>
      </div>

      {/* Tabs */}
      <div className="flex gap-4 mb-6 text-sm font-mono">
        {TABS.map((tab, i) => (
          <button
            key={tab}
            onClick={() => setActiveTab(i)}
            className={`pb-1 transition-colors ${
              i === activeTab
                ? "text-foreground border-b border-foreground"
                : "text-muted-foreground hover:text-secondary-foreground"
            }`}
          >
            {tab}
          </button>
        ))}
      </div>

      {/* Table Header */}
      <div className="grid grid-cols-[3rem_1fr_5rem] gap-4 text-xs font-mono uppercase tracking-wider text-muted-foreground mb-2 px-2">
        <span>#</span>
        <span>Algorithm</span>
        <span className="text-right">Installs</span>
      </div>

      <div className="border-t border-border" />

      {/* Rows */}
      {filtered.map((algo, i) => (
        <div
          key={algo.name}
          className="grid grid-cols-[3rem_1fr_5rem] gap-4 items-center px-2 py-3.5 border-b border-border hover:bg-secondary/50 transition-colors cursor-pointer group"
        >
          <span className="text-sm font-mono text-muted-foreground">{i + 1}</span>
          <div className="flex items-center gap-3 min-w-0">
            <span className="text-sm font-mono font-bold text-foreground group-hover:text-accent transition-colors">
              {algo.name}
            </span>
            <span className="text-xs font-mono text-muted-foreground truncate">
              {algo.author}
            </span>
          </div>
          <span className="text-sm font-mono text-muted-foreground text-right">
            {algo.installs}
          </span>
        </div>
      ))}
    </div>
  );
};

export default LeaderboardTable;
