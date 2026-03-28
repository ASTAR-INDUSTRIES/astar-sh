import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sanityClient } from "@/lib/sanity";
import { format } from "date-fns";
import {
  FileText, FlaskConical, MessageCircle, ArrowRight,
  BookOpen, Search, Tag, ChevronDown, ChevronUp,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const PublicDashboard = () => {
  const [skillSearch, setSkillSearch] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<any | null>(null);

  const { data: skills = [], isLoading: skillsLoading } = useQuery({
    queryKey: ["public-skills"],
    queryFn: () =>
      sanityClient.fetch<any[]>(
        `*[_type == "knowledgeSkill" && published == true] | order(_updatedAt desc) {
          _id, title, "slug": slug.current, description, tags, markdownContent, references, _updatedAt
        }`
      ),
  });

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

  const filteredSkills = skills.filter((s: any) => {
    if (!skillSearch.trim()) return true;
    const q = skillSearch.toLowerCase();
    return (
      s.title?.toLowerCase().includes(q) ||
      s.description?.toLowerCase().includes(q) ||
      s.tags?.some((t: string) => t.toLowerCase().includes(q))
    );
  });

  return (
    <div className="space-y-16">
      {/* Hero */}
      <div className="pt-4">
        <p className="text-lg text-secondary-foreground leading-relaxed max-w-xl font-sans">
          Intelligence infrastructure for the built environment. Explore our latest updates and research.
        </p>
      </div>

      {/* Skills Section */}
      <section>
        <div className="flex items-center gap-2 mb-6">
          <BookOpen className="h-4 w-4 text-accent" />
          <h2 className="text-xs font-mono uppercase tracking-[0.25em] text-muted-foreground">
            Skills & Knowledge
          </h2>
        </div>

        <div className="relative mb-4">
          <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-muted-foreground" />
          <Input
            placeholder="Search skills..."
            value={skillSearch}
            onChange={(e) => setSkillSearch(e.target.value)}
            className="pl-9 font-mono text-sm bg-secondary border-border"
          />
        </div>

        {skillsLoading ? (
          <div className="space-y-3">
            {[1, 2, 3].map((i) => (
              <div key={i} className="h-12 bg-card border border-border rounded-md animate-pulse" />
            ))}
          </div>
        ) : filteredSkills.length === 0 ? (
          <p className="text-muted-foreground font-mono text-sm text-center py-12 border border-border border-dashed rounded-md">
            {skillSearch ? "No skills match your search." : "No skills published yet."}
          </p>
        ) : (
          <Table>
            <TableHeader>
              <TableRow className="border-accent/30 hover:bg-transparent">
                <TableHead className="w-12 font-mono text-[10px] uppercase tracking-wider text-muted-foreground">#</TableHead>
                <TableHead className="font-mono text-[10px] uppercase tracking-wider text-muted-foreground">Skill</TableHead>
                <TableHead className="text-right font-mono text-[10px] uppercase tracking-wider text-muted-foreground w-28">Updated</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredSkills.map((skill: any, index: number) => (
                <TableRow
                  key={skill._id}
                  className="cursor-pointer hover:bg-accent/5 transition-colors"
                  onClick={() => setSelectedSkill(skill)}
                >
                  <TableCell className="font-mono text-xs text-muted-foreground align-top pt-4">
                    {index + 1}
                  </TableCell>
                  <TableCell className="py-3">
                    <div>
                      <span className="font-mono text-sm font-medium text-foreground">
                        {skill.title}
                      </span>
                      {skill.description && (
                        <p className="text-xs text-muted-foreground mt-0.5 line-clamp-1">
                          {skill.description}
                        </p>
                      )}
                      {skill.tags?.length > 0 && (
                        <div className="flex flex-wrap gap-1 mt-1.5">
                          {skill.tags.map((tag: string) => (
                            <span
                              key={tag}
                              className="text-[10px] font-mono uppercase tracking-wider text-accent bg-accent/10 px-1.5 py-0.5 rounded"
                            >
                              {tag}
                            </span>
                          ))}
                        </div>
                      )}
                    </div>
                  </TableCell>
                  <TableCell className="text-right font-mono text-xs text-muted-foreground align-top pt-4">
                    {skill._updatedAt ? format(new Date(skill._updatedAt), "MMM d") : "—"}
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}

        {/* Skill Detail Modal */}
        <Dialog open={!!selectedSkill} onOpenChange={(open) => !open && setSelectedSkill(null)}>
          <DialogContent className="max-w-2xl max-h-[85vh] overflow-y-auto bg-card border-border">
            {selectedSkill && (
              <>
                <DialogHeader>
                  <p className="text-xs font-mono text-muted-foreground mb-1">
                    skills / <span className="text-accent">{selectedSkill.slug || selectedSkill.title?.toLowerCase().replace(/\s+/g, "-")}</span>
                  </p>
                  <DialogTitle className="font-mono text-lg font-medium text-foreground">
                    {selectedSkill.title}
                  </DialogTitle>
                </DialogHeader>

                {selectedSkill.description && (
                  <div className="bg-secondary/50 border border-border rounded-md p-4 mt-2">
                    <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Summary</p>
                    <p className="text-sm text-foreground/80 leading-relaxed">{selectedSkill.description}</p>
                  </div>
                )}

                <div className="flex items-center justify-between mt-2">
                  {selectedSkill.tags?.length > 0 && (
                    <div className="flex items-center gap-1.5">
                      <span className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mr-1">Tags:</span>
                      {selectedSkill.tags.map((tag: string) => (
                        <Badge key={tag} variant="secondary" className="text-[10px] font-mono uppercase tracking-wider text-accent bg-accent/10 border-0">
                          {tag}
                        </Badge>
                      ))}
                    </div>
                  )}
                  {selectedSkill._updatedAt && (
                    <span className="text-xs font-mono text-muted-foreground">
                      {format(new Date(selectedSkill._updatedAt), "MMM d, yyyy")}
                    </span>
                  )}
                </div>

                {selectedSkill.markdownContent && (
                  <>
                    <Separator className="my-2" />
                    <div className="flex items-center gap-1.5 mb-2">
                      <FileText className="h-3.5 w-3.5 text-accent" />
                      <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">skill.md</span>
                    </div>
                    <div className="prose prose-sm dark:prose-invert max-w-none font-sans">
                      <ReactMarkdown remarkPlugins={[remarkGfm]}>
                        {selectedSkill.markdownContent}
                      </ReactMarkdown>
                    </div>
                  </>
                )}

                {selectedSkill.references?.length > 0 && (
                  <>
                    <Separator className="my-2" />
                    <p className="text-[10px] font-mono uppercase tracking-wider text-muted-foreground mb-2">Reference Files</p>
                    <div className="space-y-1">
                      {selectedSkill.references.map((ref: any, i: number) => (
                        <Collapsible key={ref._key || i}>
                          <CollapsibleTrigger className="flex items-center gap-1.5 w-full text-left py-1.5 px-2 rounded hover:bg-accent/5 transition-colors group">
                            <FileText className="h-3 w-3 text-accent" />
                            <span className="text-xs font-mono text-foreground group-hover:text-accent transition-colors">
                              {ref.folder ? `${ref.folder}/` : ""}{ref.filename}
                            </span>
                            <ChevronDown className="h-3 w-3 text-muted-foreground ml-auto group-data-[state=open]:rotate-180 transition-transform" />
                          </CollapsibleTrigger>
                          <CollapsibleContent>
                            <div className="ml-5 mt-1 mb-2 prose prose-xs dark:prose-invert max-w-none">
                              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                                {ref.content || ""}
                              </ReactMarkdown>
                            </div>
                          </CollapsibleContent>
                        </Collapsible>
                      ))}
                    </div>
                  </>
                )}
              </>
            )}
          </DialogContent>
        </Dialog>
      </section>

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
