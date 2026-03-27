import { useAuth } from "@/contexts/AuthContext";
import { Navigate } from "react-router-dom";
import Layout from "@/components/Layout";

const Login = () => {
  const { user, isStaff, signIn, loading } = useAuth();

  if (!loading && user && isStaff) {
    return <Navigate to="/" replace />;
  }

  return (
    <Layout>
      <div className="flex flex-col items-center justify-center py-20">
        <span className="text-accent text-4xl mb-6">◆</span>
        <h1 className="text-2xl font-mono font-bold text-foreground mb-2">Staff Sign In</h1>
        <p className="text-muted-foreground font-mono text-sm mb-8 text-center max-w-md">
          Sign in with your <span className="text-foreground">@astarconsulting.no</span> Microsoft account to access the admin dashboard.
        </p>
        <button
          onClick={signIn}
          disabled={loading}
          className="flex items-center gap-3 bg-secondary border border-border rounded-md px-6 py-3 font-mono text-sm text-foreground hover:bg-muted transition-colors"
        >
          <svg className="h-5 w-5" viewBox="0 0 21 21" fill="none">
            <rect x="1" y="1" width="9" height="9" fill="#F25022" />
            <rect x="11" y="1" width="9" height="9" fill="#7FBA00" />
            <rect x="1" y="11" width="9" height="9" fill="#00A4EF" />
            <rect x="11" y="11" width="9" height="9" fill="#FFB900" />
          </svg>
          Sign in with Microsoft
        </button>
        {!loading && user && !isStaff && (
          <p className="text-destructive font-mono text-xs mt-4">
            Access denied. Only @astarconsulting.no accounts are allowed.
          </p>
        )}
      </div>
    </Layout>
  );
};

export default Login;
