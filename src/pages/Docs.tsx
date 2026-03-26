import Layout from "@/components/Layout";
import { Copy } from "lucide-react";
import { useState } from "react";

const SECTIONS = [
  {
    title: "Getting Started",
    items: [
      {
        heading: "Installation",
        content: "Install ASTAR modules with a single command. Works with any agent framework.",
        code: "npx astar update",
      },
      {
        heading: "Quick Start",
        content: "Import and use pathfinding algorithms in your agent code.",
        code: `import { astar } from '@astar/core';\n\nconst path = astar.findPath(grid, start, end);`,
      },
    ],
  },
  {
    title: "Core API",
    items: [
      {
        heading: "astar.findPath(grid, start, end)",
        content:
          "The primary pathfinding function. Takes a 2D grid, start coordinates, and end coordinates. Returns an optimal path as an array of nodes.",
        code: `const grid = astar.createGrid(10, 10);\ngrid.setWalkable(3, 4, false);\n\nconst path = astar.findPath(grid, [0, 0], [9, 9]);\nconsole.log(path); // [[0,0], [1,1], ...]`,
      },
      {
        heading: "astar.createGrid(width, height)",
        content: "Creates a traversable grid for pathfinding. Supports weighted nodes and obstacles.",
        code: `const grid = astar.createGrid(20, 20);\ngrid.setWeight(5, 5, 3); // Higher cost\ngrid.setWalkable(2, 2, false); // Wall`,
      },
    ],
  },
  {
    title: "Configuration",
    items: [
      {
        heading: "Heuristics",
        content: "Choose between Manhattan, Euclidean, and Octile distance heuristics for different grid types.",
        code: `astar.configure({\n  heuristic: 'euclidean',\n  allowDiagonal: true,\n  weight: 1.2\n});`,
      },
    ],
  },
];

const CodeBlock = ({ code }: { code: string }) => {
  const [copied, setCopied] = useState(false);
  const handleCopy = () => {
    navigator.clipboard.writeText(code);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="relative group">
      <pre className="bg-secondary border border-border rounded-md p-4 text-sm font-mono text-foreground overflow-x-auto">
        <code>{code}</code>
      </pre>
      <button
        onClick={handleCopy}
        className="absolute top-2 right-2 p-1.5 rounded bg-muted/80 text-muted-foreground hover:text-foreground opacity-0 group-hover:opacity-100 transition-opacity"
      >
        {copied ? (
          <span className="text-xs font-mono text-accent">✓</span>
        ) : (
          <Copy className="h-3.5 w-3.5" />
        )}
      </button>
    </div>
  );
};

const Docs = () => (
  <Layout>
    <h1 className="text-3xl font-mono font-bold mb-2">Documentation</h1>
    <p className="text-muted-foreground font-mono text-sm mb-10">
      Guides, API reference, and examples for ASTAR modules.
    </p>

    <div className="space-y-12">
      {SECTIONS.map((section) => (
        <div key={section.title}>
          <h2 className="text-xs font-mono uppercase tracking-[0.25em] text-muted-foreground mb-6 border-b border-border pb-3">
            {section.title}
          </h2>
          <div className="space-y-8">
            {section.items.map((item) => (
              <div key={item.heading}>
                <h3 className="text-base font-mono font-medium mb-2">
                  {item.heading}
                </h3>
                <p className="text-sm text-muted-foreground leading-relaxed mb-4">
                  {item.content}
                </p>
                <CodeBlock code={item.code} />
              </div>
            ))}
          </div>
        </div>
      ))}
    </div>
  </Layout>
);

export default Docs;
