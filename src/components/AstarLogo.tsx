const AstarLogo = () => (
  <div className="flex flex-col gap-2">
    <div className="relative select-none">
      <svg viewBox="0 0 390 72" className="h-16 md:h-20 w-auto" aria-label="ASTAR">
        <g fill="hsl(var(--foreground))">
          {/* A */}
          <path d="M0,0 L60,0 L60,72 L48,72 L48,42 L12,42 L12,72 L0,72 Z M12,12 L12,30 L48,30 L48,12 Z" />
          <rect x="0" y="33" width="60" height="5" fill="hsl(var(--background))" />

          {/* S */}
          <rect x="72" y="0" width="60" height="12" />
          <rect x="72" y="12" width="12" height="18" />
          <rect x="72" y="30" width="60" height="12" />
          <rect x="120" y="42" width="12" height="18" />
          <rect x="72" y="60" width="60" height="12" />
          <rect x="72" y="33" width="60" height="5" fill="hsl(var(--background))" />

          {/* T */}
          <rect x="144" y="0" width="60" height="12" />
          <rect x="168" y="12" width="12" height="60" />
          <rect x="144" y="33" width="60" height="5" fill="hsl(var(--background))" />

          {/* A */}
          <path d="M216,0 L276,0 L276,72 L264,72 L264,42 L228,42 L228,72 L216,72 Z M228,12 L228,30 L264,30 L264,12 Z" />
          <rect x="216" y="33" width="60" height="5" fill="hsl(var(--background))" />

          {/* R */}
          <path d="M288,0 L348,0 L348,30 L336,30 L348,72 L334,72 L322,30 L300,30 L300,72 L288,72 Z M300,12 L300,18 L336,18 L336,12 Z" />
          <rect x="288" y="33" width="60" height="5" fill="hsl(var(--background))" />
        </g>
      </svg>
    </div>
    <p className="text-xs font-mono uppercase tracking-[0.3em] text-muted-foreground">
      The Open Pathfinding Ecosystem
    </p>
  </div>
);

export default AstarLogo;
