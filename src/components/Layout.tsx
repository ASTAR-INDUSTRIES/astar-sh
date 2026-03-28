import { Link } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const Layout = ({ children }: { children: React.ReactNode }) => {
  const { user, isStaff, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <nav className="flex items-center justify-between px-6 md:px-10 py-4 border-b border-border">
        <Link to="/" className="flex items-center gap-2 text-sm font-mono">
          <span className="text-accent text-lg">◆</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-foreground font-medium">astar.sh</span>
        </Link>
        <div className="flex items-center gap-4 text-sm font-mono">
          {user && (
            <>
              <span className="text-muted-foreground/50 text-xs hidden sm:inline">
                {user.email}
              </span>
              <button
                onClick={signOut}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Sign Out
              </button>
            </>
          )}
        </div>
      </nav>
      <main className="max-w-4xl mx-auto px-6 md:px-10 py-12 md:py-20">
        {children}
      </main>
    </div>
  );
};

export default Layout;
