import { useAuth } from "@/contexts/AuthContext";

const CrypticLanding = () => {
  const { signIn } = useAuth();

  return (
    <div className="flex flex-col items-center justify-center min-h-[70vh] select-none">
      <div className="relative group cursor-pointer" onClick={signIn}>
        {/* Glow effect */}
        <div className="absolute inset-0 blur-2xl opacity-20 group-hover:opacity-40 transition-opacity duration-1000 bg-accent rounded-full scale-150" />

        {/* Diamond */}
        <span className="relative text-accent text-6xl group-hover:scale-110 transition-transform duration-500 inline-block">
          ◆
        </span>
      </div>

      <p className="mt-8 font-mono text-xs text-muted-foreground/40 tracking-[0.5em] uppercase">
        astar
      </p>

      <div className="mt-16 text-center space-y-2">
        <p className="font-mono text-[10px] text-muted-foreground/20 tracking-widest">
          intelligence infrastructure
        </p>
        <p className="font-mono text-[10px] text-muted-foreground/15 tracking-widest">
          for the built environment
        </p>
      </div>

      {/* Subtle hint */}
      <button
        onClick={signIn}
        className="mt-20 font-mono text-[10px] text-muted-foreground/20 hover:text-muted-foreground/50 transition-colors duration-700 tracking-[0.3em] uppercase"
      >
        authenticate →
      </button>
    </div>
  );
};

export default CrypticLanding;
