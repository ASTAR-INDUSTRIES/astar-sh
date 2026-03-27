import Layout from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import PublicDashboard from "@/components/PublicDashboard";
import StaffWorkspace from "@/components/StaffWorkspace";

const Index = () => {
  const { user, isStaff, loading } = useAuth();

  return (
    <Layout>
      {loading ? (
        <div className="flex items-center justify-center py-20">
          <span className="text-accent text-2xl animate-pulse">◆</span>
        </div>
      ) : user && isStaff ? (
        <StaffWorkspace />
      ) : (
        <PublicDashboard />
      )}
    </Layout>
  );
};

export default Index;
