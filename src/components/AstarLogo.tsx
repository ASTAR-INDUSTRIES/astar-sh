const AstarLogo = () => (
  <div className="flex flex-col gap-2">
    <div className="relative select-none">
      {/* Stencil-style block letters */}
      <div className="flex items-center">
        <svg viewBox="0 0 380 72" className="h-16 md:h-20 w-auto" aria-label="ASTAR">
          {/* A */}
          <g fill="hsl(var(--foreground))">
            {/* A */}
            <path d="M0,72 L0,0 L60,0 L60,72 L48,72 L48,42 L12,42 L12,72 Z M12,12 L12,30 L48,30 L48,12 Z" />
            {/* Horizontal stencil cuts */}
            <rect x="0" y="33" width="60" height="5" fill="hsl(var(--background))" />

            {/* S */}
            <path d="M72,0 L132,0 L132,30 L84,30 L84,42 L132,42 L132,72 L72,72 L72,42 L120,42 L120,30 L72,30 Z
                     M84,12 L84,18 L120,18 L120,12 Z
                     M84,54 L84,60 L120,60 L120,54 Z" />
            <rect x="72" y="33" width="60" height="5" fill="hsl(var(--background))" />

            {/* T */}
            <path d="M144,0 L204,0 L204,12 L180,12 L180,72 L168,72 L168,12 L144,12 Z" />
            <rect x="144" y="33" width="60" height="5" fill="hsl(var(--background))" />

            {/* A */}
            <path d="M216,72 L216,0 L276,0 L276,72 L264,72 L264,42 L228,42 L228,72 Z M228,12 L228,30 L264,30 L264,12 Z" />
            <rect x="216" y="33" width="60" height="5" fill="hsl(var(--background))" />

            {/* R */}
            <path d="M288,0 L348,0 L348,30 L312,30 L348,72 L334,72 L300,30 L300,72 L288,72 Z M300,12 L300,18 L336,18 L336,12 Z" />
            <rect x="288" y="33" width="60" height="5" fill="hsl(var(--background))" />
          </g>
        </svg>
      </div>
    </div>
    <p className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">
      The Open Pathfinding Ecosystem
    </p>
  </div>
);

export default AstarLogo;
