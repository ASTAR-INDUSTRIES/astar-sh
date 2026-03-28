import Layout from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import PublicDashboard from "@/components/PublicDashboard";
import StaffWorkspace from "@/components/StaffWorkspace";
import CrypticLanding from "@/components/CrypticLanding";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Index = () => {
  const { user, isStaff, loading } = useAuth();

  if (loading) {
    return (
      <Layout>
        <div className="flex items-center justify-center py-20">
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
    <Layout>
      {isStaff ? (
        <Tabs defaultValue="dashboard" className="w-full">
          <TabsList className="bg-secondary border border-border mb-8">
            <TabsTrigger value="dashboard" className="font-mono text-xs data-[state=active]:bg-accent/10 data-[state=active]:text-accent">
              Dashboard
            </TabsTrigger>
            <TabsTrigger value="manage" className="font-mono text-xs data-[state=active]:bg-accent/10 data-[state=active]:text-accent">
              Manage
            </TabsTrigger>
          </TabsList>
          <TabsContent value="dashboard">
            <PublicDashboard />
          </TabsContent>
          <TabsContent value="manage">
            <StaffWorkspace />
          </TabsContent>
        </Tabs>
      ) : (
        <PublicDashboard />
      )}
    </Layout>
  );
};

export default Index;
