import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const { user, isStaff, signIn, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <nav className="flex items-center justify-between px-6 md:px-10 py-4 border-b border-border">
        <Link to="/" className="flex items-center gap-2 text-sm font-mono">
          <span className="text-accent text-lg">◆</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-foreground font-medium">astar.sh</span>
        </Link>
        <div className="flex items-center gap-4 text-sm font-mono">
          {user && isStaff ? (
            <button
              onClick={signOut}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Sign Out
            </button>
          ) : (
            <button
              onClick={signIn}
              className="text-muted-foreground hover:text-foreground transition-colors"
            >
              Staff Sign In
            </button>
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
