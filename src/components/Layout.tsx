import { Link, useLocation } from "react-router-dom";
import { useAuth } from "@/contexts/AuthContext";

const NAV_ITEMS = [
  { label: "Home", path: "/" },
  { label: "Updates", path: "/updates" },
  { label: "Research", path: "/research" },
  { label: "Docs", path: "/docs" },
  { label: "About", path: "/about" },
];

const Layout = ({ children }: { children: React.ReactNode }) => {
  const location = useLocation();
  const { user, isStaff, signOut } = useAuth();

  return (
    <div className="min-h-screen bg-background">
      <nav className="flex items-center justify-between px-6 md:px-10 py-4 border-b border-border">
        <Link to="/" className="flex items-center gap-2 text-sm font-mono">
          <span className="text-accent text-lg">◆</span>
          <span className="text-muted-foreground">/</span>
          <span className="text-foreground font-medium">astar.sh</span>
        </Link>
        <div className="flex items-center gap-6 text-sm font-mono">
          {NAV_ITEMS.map((item) => (
            <Link
              key={item.path}
              to={item.path}
              className={`transition-colors ${
                location.pathname === item.path
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              {item.label}
            </Link>
          ))}
          {user && isStaff ? (
            <>
              <Link
                to="/admin"
                className={`transition-colors ${
                  location.pathname === "/admin"
                    ? "text-foreground"
                    : "text-muted-foreground hover:text-foreground"
                }`}
              >
                Admin
              </Link>
              <button
                onClick={signOut}
                className="text-muted-foreground hover:text-foreground transition-colors"
              >
                Sign Out
              </button>
            </>
          ) : (
            <Link
              to="/login"
              className={`transition-colors ${
                location.pathname === "/login"
                  ? "text-foreground"
                  : "text-muted-foreground hover:text-foreground"
              }`}
            >
              Sign In
            </Link>
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
