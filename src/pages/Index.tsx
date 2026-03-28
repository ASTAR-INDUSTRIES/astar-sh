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
      {isStaff ? (
        <Tabs defaultValue="dashboard" className="flex flex-col h-full overflow-hidden">
          <div className="flex-shrink-0 px-5 pt-2 pb-0">
            <TabsList className="bg-secondary border border-border h-7">
              <TabsTrigger value="dashboard" className="font-mono text-[10px] h-5 data-[state=active]:bg-accent/10 data-[state=active]:text-accent">
                Dashboard
              </TabsTrigger>
              <TabsTrigger value="manage" className="font-mono text-[10px] h-5 data-[state=active]:bg-accent/10 data-[state=active]:text-accent">
                Manage
              </TabsTrigger>
            </TabsList>
          </div>
          <TabsContent value="dashboard" className="flex-1 overflow-hidden mt-0">
            <PublicDashboard />
          </TabsContent>
          <TabsContent value="manage" className="flex-1 overflow-auto mt-0 px-5 py-4">
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
