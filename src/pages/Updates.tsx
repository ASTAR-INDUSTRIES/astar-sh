import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";

const Updates = () => {
  const { data: posts, isLoading } = useQuery({
    queryKey: ["posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .order("published_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <Layout>
      <h1 className="text-3xl font-mono font-bold mb-2">Updates</h1>
      <p className="text-muted-foreground font-mono text-sm mb-10">
        Latest news, releases, and announcements from ASTAR.
      </p>

      {isLoading ? (
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border border-border rounded-md p-6 animate-pulse">
              <div className="h-4 bg-muted rounded w-1/3 mb-3" />
              <div className="h-3 bg-muted rounded w-2/3 mb-2" />
              <div className="h-3 bg-muted rounded w-1/2" />
            </div>
          ))}
        </div>
      ) : posts && posts.length > 0 ? (
        <div className="space-y-6">
          {posts.map((post) => (
            <article
              key={post.id}
              className="border border-border rounded-md p-6 hover:border-muted-foreground/30 transition-colors"
            >
              <div className="flex items-center gap-3 mb-3">
                <span className="text-xs font-mono uppercase tracking-wider text-accent px-2 py-0.5 bg-accent/10 rounded">
                  {post.category}
                </span>
                {post.published_at && (
                  <span className="text-xs font-mono text-muted-foreground">
                    {new Date(post.published_at).toLocaleDateString("en-US", {
                      year: "numeric",
                      month: "short",
                      day: "numeric",
                    })}
                  </span>
                )}
              </div>
              <h2 className="text-lg font-mono font-medium mb-2">{post.title}</h2>
              {post.excerpt && (
                <p className="text-sm text-muted-foreground leading-relaxed">
                  {post.excerpt}
                </p>
              )}
              {post.author_name && (
                <p className="text-xs font-mono text-muted-foreground mt-4">
                  — {post.author_name}
                </p>
              )}
            </article>
          ))}
        </div>
      ) : (
        <div className="border border-border border-dashed rounded-md p-12 text-center">
          <p className="text-muted-foreground font-mono text-sm">
            No updates yet. Check back soon.
          </p>
        </div>
      )}
    </Layout>
  );
};

export default Updates;
