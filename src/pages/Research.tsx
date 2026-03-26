import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import Layout from "@/components/Layout";
import { FileText } from "lucide-react";

const Research = () => {
  const { data: articles, isLoading } = useQuery({
    queryKey: ["research"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("research_articles")
        .select("*")
        .order("published_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  return (
    <Layout>
      <h1 className="text-3xl font-mono font-bold mb-2">Research</h1>
      <p className="text-muted-foreground font-mono text-sm mb-10">
        Papers, whitepapers, and technical publications from the ASTAR team.
      </p>

      {isLoading ? (
        <div className="space-y-6">
          {[1, 2, 3].map((i) => (
            <div key={i} className="border border-border rounded-md p-6 animate-pulse">
              <div className="h-4 bg-muted rounded w-1/2 mb-3" />
              <div className="h-3 bg-muted rounded w-3/4 mb-2" />
              <div className="h-3 bg-muted rounded w-1/3" />
            </div>
          ))}
        </div>
      ) : articles && articles.length > 0 ? (
        <div className="space-y-6">
          {articles.map((article) => (
            <article
              key={article.id}
              className="border border-border rounded-md p-6 hover:border-muted-foreground/30 transition-colors"
            >
              <div className="flex items-start justify-between gap-4">
                <div className="flex-1">
                  <h2 className="text-lg font-mono font-medium mb-2">
                    {article.title}
                  </h2>
                  {article.abstract && (
                    <p className="text-sm text-muted-foreground leading-relaxed mb-3">
                      {article.abstract}
                    </p>
                  )}
                  <div className="flex items-center gap-4">
                    {article.authors.length > 0 && (
                      <span className="text-xs font-mono text-muted-foreground">
                        {article.authors.join(", ")}
                      </span>
                    )}
                    {article.published_at && (
                      <span className="text-xs font-mono text-muted-foreground">
                        {new Date(article.published_at).toLocaleDateString("en-US", {
                          year: "numeric",
                          month: "short",
                        })}
                      </span>
                    )}
                  </div>
                  {article.tags.length > 0 && (
                    <div className="flex gap-2 mt-3">
                      {article.tags.map((tag) => (
                        <span
                          key={tag}
                          className="text-xs font-mono text-accent px-2 py-0.5 bg-accent/10 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  )}
                </div>
                {article.pdf_url && (
                  <a
                    href={article.pdf_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="flex items-center gap-1.5 text-xs font-mono text-accent hover:text-accent-foreground transition-colors shrink-0"
                  >
                    <FileText className="h-4 w-4" />
                    PDF
                  </a>
                )}
              </div>
            </article>
          ))}
        </div>
      ) : (
        <div className="border border-border border-dashed rounded-md p-12 text-center">
          <p className="text-muted-foreground font-mono text-sm">
            No publications yet. Research coming soon.
          </p>
        </div>
      )}
    </Layout>
  );
};

export default Research;
