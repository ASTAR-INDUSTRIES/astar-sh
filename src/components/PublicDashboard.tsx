import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { format } from "date-fns";
import { FileText, FlaskConical, ArrowRight } from "lucide-react";

const PublicDashboard = () => {
  const { data: posts = [], isLoading: postsLoading } = useQuery({
    queryKey: ["public-posts"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("posts")
        .select("*")
        .eq("published", true)
        .order("published_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  const { data: articles = [], isLoading: articlesLoading } = useQuery({
    queryKey: ["public-research"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("research_articles")
        .select("*")
        .eq("published", true)
        .order("published_at", { ascending: false })
        .limit(10);
      if (error) throw error;
      return data;
    },
  });

  return (
    <div className="space-y-16">
      {/* Hero */}
      <div className="pt-4">
        <p className="text-lg text-secondary-foreground leading-relaxed max-w-xl font-sans">
          Intelligence infrastructure for the built environment. Explore our latest updates and research.
        </p>
      </div>

      {/* News Section */}
      <section>
        <div className="flex items-center gap-2 mb-6">
          <FileText className="h-4 w-4 text-accent" />
          <h2 className="text-xs font-mono uppercase tracking-[0.25em] text-muted-foreground">
            News & Updates
          </h2>
        </div>

        {postsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card border border-border rounded-md p-5 animate-pulse">
                <div className="h-4 bg-muted rounded w-1/3 mb-3" />
                <div className="h-3 bg-muted rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : posts.length === 0 ? (
          <p className="text-muted-foreground font-mono text-sm text-center py-12 border border-border border-dashed rounded-md">
            No updates published yet.
          </p>
        ) : (
          <div className="space-y-3">
            {posts.map((post) => (
              <article
                key={post.id}
                className="group bg-card border border-border rounded-md p-5 hover:border-accent/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-accent bg-accent/10 px-2 py-0.5 rounded">
                        {post.category}
                      </span>
                      {post.published_at && (
                        <span className="text-xs font-mono text-muted-foreground">
                          {format(new Date(post.published_at), "MMM d, yyyy")}
                        </span>
                      )}
                    </div>
                    <h3 className="font-mono text-sm font-medium text-foreground mb-1">
                      {post.title}
                    </h3>
                    {post.excerpt && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {post.excerpt}
                      </p>
                    )}
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors shrink-0 mt-1" />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>

      {/* Research Section */}
      <section>
        <div className="flex items-center gap-2 mb-6">
          <FlaskConical className="h-4 w-4 text-accent" />
          <h2 className="text-xs font-mono uppercase tracking-[0.25em] text-muted-foreground">
            Research
          </h2>
        </div>

        {articlesLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card border border-border rounded-md p-5 animate-pulse">
                <div className="h-4 bg-muted rounded w-1/3 mb-3" />
                <div className="h-3 bg-muted rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : articles.length === 0 ? (
          <p className="text-muted-foreground font-mono text-sm text-center py-12 border border-border border-dashed rounded-md">
            No research published yet.
          </p>
        ) : (
          <div className="space-y-3">
            {articles.map((article) => (
              <article
                key={article.id}
                className="group bg-card border border-border rounded-md p-5 hover:border-accent/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      {article.tags.slice(0, 3).map((tag) => (
                        <span
                          key={tag}
                          className="text-[10px] font-mono uppercase tracking-wider text-accent bg-accent/10 px-2 py-0.5 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                      {article.published_at && (
                        <span className="text-xs font-mono text-muted-foreground">
                          {format(new Date(article.published_at), "MMM d, yyyy")}
                        </span>
                      )}
                    </div>
                    <h3 className="font-mono text-sm font-medium text-foreground mb-1">
                      {article.title}
                    </h3>
                    {article.abstract && (
                      <p className="text-sm text-muted-foreground line-clamp-2">
                        {article.abstract}
                      </p>
                    )}
                    {article.authors.length > 0 && (
                      <p className="text-xs font-mono text-muted-foreground mt-2">
                        {article.authors.join(", ")}
                      </p>
                    )}
                  </div>
                  <ArrowRight className="h-4 w-4 text-muted-foreground group-hover:text-accent transition-colors shrink-0 mt-1" />
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
};

export default PublicDashboard;
