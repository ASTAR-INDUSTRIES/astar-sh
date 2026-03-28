import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

interface LayoutProps {
  children: React.ReactNode;
  fullScreen?: boolean;
}

const Layout = ({ children, fullScreen }: LayoutProps) => {
  const { user, signOut } = useAuth();

  return (
    <div className={`bg-background ${fullScreen ? "h-screen flex flex-col overflow-hidden" : "min-h-screen"}`}>
      <nav className="flex-shrink-0 flex items-center justify-between px-5 py-2.5 border-b border-border">
        <Link to="/" className="flex items-center gap-2 text-sm font-mono">
          <span className="text-accent text-base">◆</span>
          <span className="text-muted-foreground/40">/</span>
          <span className="text-foreground font-medium text-xs">astar.sh</span>
        </Link>
        <div className="flex items-center gap-4 text-xs font-mono">
          {user && (
            <>
              <span className="text-muted-foreground/30 text-[10px] hidden sm:inline">
                {user.email}
              </span>
              <button
                onClick={signOut}
                className="text-muted-foreground/50 hover:text-foreground transition-colors text-[10px]"
              >
                sign out
              </button>
            </>
          )}
        </div>
      </nav>
      {fullScreen ? (
        <div className="flex-1 overflow-hidden">
          {children}
        </div>
      ) : (
        <main className="max-w-4xl mx-auto px-6 md:px-10 py-12 md:py-20">
          {children}
        </main>
      )}
    </div>
  );
};

export default Layout;
