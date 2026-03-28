import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sanityClient } from "@/lib/sanity";
import { format } from "date-fns";
import { FileText, FlaskConical, MessageCircle, ArrowRight } from "lucide-react";

const PublicDashboard = () => {
  const { data: posts = [], isLoading: postsLoading } = useQuery({
    queryKey: ["public-posts"],
    queryFn: () =>
      sanityClient.fetch<any[]>(
        `*[_type == "newsPost" && published == true] | order(publishedAt desc)[0...10] {
          _id, title, excerpt, category, publishedAt, authorName
        }`
      ),
  });

  const { data: articles = [], isLoading: articlesLoading } = useQuery({
    queryKey: ["public-research"],
    queryFn: () =>
      sanityClient.fetch<any[]>(
        `*[_type == "researchArticle" && published == true] | order(publishedAt desc)[0...10] {
          _id, title, abstract, authors, tags, publishedAt
        }`
      ),
  });

  const { data: tweets = [], isLoading: tweetsLoading } = useQuery({
    queryKey: ["public-tweets"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("tweets")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(20);
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

      {/* Tweets / Thinking Section */}
      <section>
        <div className="flex items-center gap-2 mb-6">
          <MessageCircle className="h-4 w-4 text-accent" />
          <h2 className="text-xs font-mono uppercase tracking-[0.25em] text-muted-foreground">
            Thinking
          </h2>
        </div>

        {tweetsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="bg-card border border-border rounded-md p-4 animate-pulse">
                <div className="h-3 bg-muted rounded w-2/3" />
              </div>
            ))}
          </div>
        ) : tweets.length === 0 ? (
          <p className="text-muted-foreground font-mono text-sm text-center py-12 border border-border border-dashed rounded-md">
            No thoughts shared yet.
          </p>
        ) : (
          <div className="relative border-l border-border ml-2 space-y-0">
            {tweets.map((tweet) => (
              <div key={tweet.id} className="relative pl-6 pb-6">
                <div className="absolute left-[-5px] top-1 h-2.5 w-2.5 rounded-full bg-accent border-2 border-background" />
                <div className="bg-card border border-border rounded-md p-4">
                  <p className="text-sm text-foreground font-sans leading-relaxed">
                    {tweet.content}
                  </p>
                  <div className="flex items-center gap-3 mt-2">
                    {tweet.author_name && (
                      <span className="text-xs font-mono text-muted-foreground">
                        {tweet.author_name}
                      </span>
                    )}
                    <span className="text-xs font-mono text-muted-foreground">
                      {format(new Date(tweet.created_at), "MMM d, yyyy · HH:mm")}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </section>

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
            {posts.map((post: any) => (
              <article
                key={post._id}
                className="group bg-card border border-border rounded-md p-5 hover:border-accent/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      {post.category && (
                        <span className="text-[10px] font-mono uppercase tracking-wider text-accent bg-accent/10 px-2 py-0.5 rounded">
                          {post.category}
                        </span>
                      )}
                      {post.publishedAt && (
                        <span className="text-xs font-mono text-muted-foreground">
                          {format(new Date(post.publishedAt), "MMM d, yyyy")}
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
            {articles.map((article: any) => (
              <article
                key={article._id}
                className="group bg-card border border-border rounded-md p-5 hover:border-accent/30 transition-colors"
              >
                <div className="flex items-start justify-between gap-4">
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-3 mb-2">
                      {article.tags?.slice(0, 3).map((tag: string) => (
                        <span
                          key={tag}
                          className="text-[10px] font-mono uppercase tracking-wider text-accent bg-accent/10 px-2 py-0.5 rounded"
                        >
                          {tag}
                        </span>
                      ))}
                      {article.publishedAt && (
                        <span className="text-xs font-mono text-muted-foreground">
                          {format(new Date(article.publishedAt), "MMM d, yyyy")}
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
                    {article.authors?.length > 0 && (
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
