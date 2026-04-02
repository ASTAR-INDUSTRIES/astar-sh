import Layout from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import PublicDashboard from "@/components/PublicDashboard";
import StaffWorkspace from "@/components/StaffWorkspace";
import CrypticLanding from "@/components/CrypticLanding";

const Index = () => {
  const { user, isStaff, loading } = useAuth();

  if (loading) {
    return (
      <Layout fullScreen>
        <div className="flex items-center justify-center h-full">
          <span className="text-accent text-2xl animate-pulse">◆</span>
        </div>
      </Layout>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-background">
        <CrypticLanding />
      </div>
    );
  }

  return (
    <Layout fullScreen>
      <PublicDashboard />
    </Layout>
  );
};

export default Index;
