import { createContext, useContext, useEffect, useState, ReactNode } from "react";
import { supabase } from "@/integrations/supabase/client";
import type { User, Session } from "@supabase/supabase-js";

interface AuthContextType {
  user: User | null;
  session: Session | null;
  loading: boolean;
  signIn: () => Promise<void>;
  signOut: () => Promise<void>;
  isStaff: boolean;
}

const AuthContext = createContext<AuthContextType>({} as AuthContextType);

export const useAuth = () => useContext(AuthContext);

export const AuthProvider = ({ children }: { children: ReactNode }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const { data: { subscription } } = supabase.auth.onAuthStateChange(
      (_event, session) => {
        setSession(session);
        setUser(session?.user ?? null);
        setLoading(false);
      }
    );

    supabase.auth.getSession().then(({ data: { session } }) => {
      setSession(session);
      setUser(session?.user ?? null);
      setLoading(false);
    });

    return () => subscription.unsubscribe();
  }, []);

  const signIn = async () => {
    const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
    const initiateUrl = `${supabaseUrl}/functions/v1/microsoft-auth/initiate?redirect=${encodeURIComponent(window.location.origin + "/admin")}`;
    window.location.href = initiateUrl;
  };

  const signOut = async () => {
    await supabase.auth.signOut();
  };

  const isStaff = user?.email?.endsWith("@astarconsulting.no") ?? false;

  return (
    <AuthContext.Provider value={{ user, session, loading, signIn, signOut, isStaff }}>
      {children}
    </AuthContext.Provider>
  );
};
