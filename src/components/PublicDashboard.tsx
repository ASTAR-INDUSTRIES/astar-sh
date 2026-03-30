import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { supabase } from "@/integrations/supabase/client";
import { sanityClient } from "@/lib/sanity";
import { format, formatDistanceToNow } from "date-fns";
import {
  FileText, FlaskConical, MessageCircle,
  BookOpen, Search, ChevronDown, Folder,
  Activity, Download, List, Terminal,
} from "lucide-react";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Separator } from "@/components/ui/separator";
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from "@/components/ui/collapsible";
import { ScrollArea } from "@/components/ui/scroll-area";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

const eventIcons: Record<string, typeof Download> = {
  "skill.download": Download,
  "skill.list": List,
  "user.login": Activity,
};

const eventLabels: Record<string, string> = {
  "skill.download": "downloaded",
  "skill.list": "listed skills",
  "user.login": "signed in",
};

const PublicDashboard = () => {
  const [skillSearch, setSkillSearch] = useState("");
  const [selectedSkill, setSelectedSkill] = useState<any | null>(null);
  const [projectFilter, setProjectFilter] = useState<string>("all");

  const { data: skills = [], isLoading: skillsLoading } = useQuery({
    queryKey: ["public-skills"],
    queryFn: () =>
      sanityClient.fetch<any[]>(
        `*[_type == "knowledgeSkill" && published == true] | order(_updatedAt desc) {
          _id, title, "slug": slug.current, description, tags, project, markdownContent, references, _updatedAt
        }`
      ),
  });

  const { data: posts = [] } = useQuery({
    queryKey: ["public-posts"],
    queryFn: () =>
      sanityClient.fetch<any[]>(
        `*[_type == "newsPost" && published == true] | order(publishedAt desc)[0...10] {
          _id, title, excerpt, category, publishedAt, authorName
        }`
      ),
  });

  const { data: articles = [] } = useQuery({
    queryKey: ["public-research"],
    queryFn: () =>
      sanityClient.fetch<any[]>(
        `*[_type == "researchArticle" && published == true] | order(publishedAt desc)[0...10] {
          _id, title, abstract, authors, tags, publishedAt
        }`
      ),
  });

  const { data: tweets = [] } = useQuery({
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

  const { data: cliEvents = [] } = useQuery({
    queryKey: ["cli-events"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("cli_events")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(50);
      if (error) throw error;
      return data;
    },
    refetchInterval: 30000,
  });

  // Derive download counts per skill
  const downloadCounts = cliEvents.reduce<Record<string, number>>((acc, ev: any) => {
    if (ev.event_type === "skill.download" && ev.skill_slug) {
      acc[ev.skill_slug] = (acc[ev.skill_slug] || 0) + 1;
    }
    return acc;
  }, {});

  const projects = Array.from(new Set(skills.map((s: any) => s.project || "general")));

  const filteredSkills = skills.filter((s: any) => {
    const matchesProject = projectFilter === "all" || (s.project || "general") === projectFilter;
    if (!skillSearch.trim()) return matchesProject;
    const q = skillSearch.toLowerCase();
    return matchesProject && (
      s.title?.toLowerCase().includes(q) ||
      s.description?.toLowerCase().includes(q) ||
      s.tags?.some((t: string) => t.toLowerCase().includes(q))
    );
  });

  return (
    <>
      <div className="grid grid-cols-[1fr_420px] gap-0 h-[calc(100vh-57px)] overflow-hidden">
        {/* LEFT: Skills (compact) */}
        <div className="flex flex-col border-r border-border overflow-hidden">
          <div className="flex-shrink-0 px-5 pt-4 pb-3 border-b border-border">
            <div className="flex items-center justify-between mb-3">
              <div className="flex items-center gap-2">
                <BookOpen className="h-3.5 w-3.5 text-accent" />
                <h2 className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">
                  Skills & Knowledge
                </h2>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground/50">
                {filteredSkills.length} skill{filteredSkills.length !== 1 ? "s" : ""}
              </span>
            </div>

            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 h-3 w-3 text-muted-foreground" />
                <Input
                  placeholder="Search..."
                  value={skillSearch}
                  onChange={(e) => setSkillSearch(e.target.value)}
                  className="pl-8 h-7 font-mono text-xs bg-secondary border-border"
                />
              </div>
              {projects.length > 1 && (
                <select
                  value={projectFilter}
                  onChange={(e) => setProjectFilter(e.target.value)}
                  className="h-7 px-2 text-xs font-mono bg-secondary border border-border rounded-md text-foreground focus:outline-none focus:ring-1 focus:ring-ring"
                >
                  <option value="all">All projects</option>
                  {projects.map((p) => (
                    <option key={p} value={p}>{p}</option>
                  ))}
                </select>
              )}
            </div>
          </div>

          <ScrollArea className="flex-1">
            {skillsLoading ? (
              <div className="p-5 space-y-2">
                {[1, 2, 3, 4, 5].map((i) => (
                  <div key={i} className="h-10 bg-card border border-border rounded animate-pulse" />
                ))}
              </div>
            ) : filteredSkills.length === 0 ? (
              <div className="flex items-center justify-center h-full">
                <p className="text-muted-foreground font-mono text-xs">
                  {skillSearch || projectFilter !== "all" ? "No matches." : "No skills yet."}
                </p>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow className="border-accent/20 hover:bg-transparent">
                    <TableHead className="w-8 font-mono text-[9px] uppercase tracking-wider text-muted-foreground pl-5">#</TableHead>
                    <TableHead className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground">Skill</TableHead>
                    <TableHead className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground w-16 text-center">
                      <Download className="h-3 w-3 inline-block" />
                    </TableHead>
                    <TableHead className="font-mono text-[9px] uppercase tracking-wider text-muted-foreground w-20">Project</TableHead>
                    <TableHead className="text-right font-mono text-[9px] uppercase tracking-wider text-muted-foreground w-20 pr-5">Updated</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredSkills.map((skill: any, index: number) => {
                    const slug = skill.slug || skill.title?.toLowerCase().replace(/\s+/g, "-");
                    const count = downloadCounts[slug] || 0;
                    return (
                      <TableRow
                        key={skill._id}
                        className="cursor-pointer hover:bg-accent/5 transition-colors"
                        onClick={() => setSelectedSkill(skill)}
                      >
                        <TableCell className="font-mono text-[10px] text-muted-foreground/50 pl-5 py-2">
                          {index + 1}
                        </TableCell>
                        <TableCell className="py-2">
                          <span className="font-mono text-xs font-medium text-foreground">
                            {skill.title}
                          </span>
                          {skill.description && (
                            <p className="text-[11px] text-muted-foreground mt-0.5 line-clamp-1">
                              {skill.description}
                            </p>
                          )}
                        </TableCell>
                        <TableCell className="py-2 text-center">
                          <span className="text-[10px] font-mono text-muted-foreground/60">
                            {count > 0 ? count : "—"}
                          </span>
                        </TableCell>
                        <TableCell className="py-2">
                          <span className="text-[10px] font-mono text-muted-foreground/60">
                            {skill.project || "general"}
                          </span>
                        </TableCell>
                        <TableCell className="text-right font-mono text-[10px] text-muted-foreground pr-5 py-2">
                          {skill._updatedAt ? format(new Date(skill._updatedAt), "MMM d") : "—"}
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            )}
          </ScrollArea>
        </div>

        {/* RIGHT: Thinking + Activity Log + News/Research */}
        <div className="flex flex-col overflow-hidden">
          {/* Thinking — larger */}
          <div className="flex-[3] flex flex-col overflow-hidden border-b border-border">
            <div className="flex-shrink-0 px-4 pt-4 pb-2 flex items-center gap-2">
              <MessageCircle className="h-3 w-3 text-accent" />
              <h3 className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">Thinking</h3>
            </div>
            <ScrollArea className="flex-1 px-4">
              <div className="space-y-2 pb-3">
                {tweets.length === 0 ? (
                  <p className="text-muted-foreground/50 font-mono text-[10px] py-4 text-center">—</p>
                ) : (
                  tweets.slice(0, 12).map((tweet) => (
                    <div key={tweet.id} className="border-l-2 border-accent/30 pl-3 py-1">
                      <p className="text-xs text-foreground/80 font-sans leading-relaxed line-clamp-3">
                        {tweet.content}
                      </p>
                      <span className="text-[10px] font-mono text-muted-foreground/50 mt-0.5 block">
                        {tweet.author_name && `${tweet.author_name} · `}
                        {format(new Date(tweet.created_at), "MMM d · HH:mm")}
                      </span>
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          {/* Activity Log */}
          <div className="flex-[2] flex flex-col overflow-hidden border-b border-border">
            <div className="flex-shrink-0 px-4 pt-3 pb-2 flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Terminal className="h-3 w-3 text-accent" />
                <h3 className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">CLI Activity</h3>
              </div>
              <span className="text-[10px] font-mono text-muted-foreground/50">
                {cliEvents.length} event{cliEvents.length !== 1 ? "s" : ""}
              </span>
            </div>
            <ScrollArea className="flex-1 px-4">
              <div className="space-y-1 pb-3">
                {cliEvents.length === 0 ? (
                  <p className="text-muted-foreground/50 font-mono text-[10px] py-4 text-center">No activity yet</p>
                ) : (
                  cliEvents.map((ev: any) => {
                    const Icon = eventIcons[ev.event_type] || Activity;
                    const label = eventLabels[ev.event_type] || ev.event_type;
                    return (
                      <div key={ev.id} className="flex items-start gap-2 py-1 group">
                        <Icon className="h-3 w-3 text-accent/60 mt-0.5 shrink-0" />
                        <div className="flex-1 min-w-0">
                          <p className="text-[11px] font-mono text-foreground/80 leading-tight">
                            {ev.event_type === "user.login" ? (
                              <>
                                <span className="text-accent">{ev.user_name || ev.user_email?.split("@")[0] || "user"}</span>
                                {" "}
                                <span className="text-muted-foreground">{label}</span>
                              </>
                            ) : ev.skill_slug ? (
                              <>
                                <span className="text-accent">{ev.skill_title || ev.skill_slug}</span>
                                {" "}
                                <span className="text-muted-foreground">{label}</span>
                              </>
                            ) : (
                              <span className="text-muted-foreground">{label}</span>
                            )}
                          </p>
                          <span className="text-[9px] font-mono text-muted-foreground/40">
                            {formatDistanceToNow(new Date(ev.created_at), { addSuffix: true })}
                          </span>
                        </div>
                      </div>
                    );
                  })
                )}
              </div>
            </ScrollArea>
          </div>

          {/* News + Research (compact) */}
          <div className="flex-[1] flex flex-col overflow-hidden border-b border-border">
            <div className="flex-shrink-0 px-4 pt-3 pb-2 flex items-center gap-2">
              <FileText className="h-3 w-3 text-accent" />
              <h3 className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">News</h3>
            </div>
            <ScrollArea className="flex-1 px-4">
              <div className="space-y-1 pb-2">
                {posts.length === 0 ? (
                  <p className="text-muted-foreground/50 font-mono text-[10px] py-2 text-center">—</p>
                ) : (
                  posts.slice(0, 4).map((post: any) => (
                    <div key={post._id} className="flex items-start justify-between gap-2 py-0.5">
                      <span className="font-mono text-[11px] text-foreground line-clamp-1 flex-1 min-w-0">{post.title}</span>
                      {post.publishedAt && (
                        <span className="text-[9px] font-mono text-muted-foreground/50 shrink-0">
                          {format(new Date(post.publishedAt), "MMM d")}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>

          <div className="flex-[1] flex flex-col overflow-hidden">
            <div className="flex-shrink-0 px-4 pt-3 pb-2 flex items-center gap-2">
              <FlaskConical className="h-3 w-3 text-accent" />
              <h3 className="text-[10px] font-mono uppercase tracking-[0.25em] text-muted-foreground">Research</h3>
            </div>
            <ScrollArea className="flex-1 px-4">
              <div className="space-y-1 pb-2">
                {articles.length === 0 ? (
                  <p className="text-muted-foreground/50 font-mono text-[10px] py-2 text-center">—</p>
                ) : (
                  articles.slice(0, 4).map((article: any) => (
                    <div key={article._id} className="flex items-start justify-between gap-2 py-0.5">
                      <span className="font-mono text-[11px] text-foreground line-clamp-1 flex-1 min-w-0">{article.title}</span>
                      {article.publishedAt && (
                        <span className="text-[9px] font-mono text-muted-foreground/50 shrink-0">
                          {format(new Date(article.publishedAt), "MMM d")}
                        </span>
                      )}
                    </div>
                  ))
                )}
              </div>
            </ScrollArea>
          </div>
        </div>
      </div>

      {/* Skill Detail Modal */}
      <Dialog open={!!selectedSkill} onOpenChange={(open) => !open && setSelectedSkill(null)}>
        <DialogContent className="w-[680px] max-w-[90vw] max-h-[85vh] overflow-y-auto overflow-x-hidden bg-card border-border">
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

              <div className="flex items-center justify-between mt-2 flex-wrap gap-2">
                <div className="flex items-center gap-1.5 flex-wrap">
                  {selectedSkill.project && selectedSkill.project !== "general" && (
                    <Badge variant="secondary" className="text-[10px] font-mono uppercase tracking-wider text-foreground bg-secondary border border-border">
                      <Folder className="h-2.5 w-2.5 mr-1" />
                      {selectedSkill.project}
                    </Badge>
                  )}
                  {selectedSkill.tags?.map((tag: string) => (
                    <Badge key={tag} variant="secondary" className="text-[10px] font-mono uppercase tracking-wider text-accent bg-accent/10 border-0">
                      {tag}
                    </Badge>
                  ))}
                </div>
                <div className="flex items-center gap-3">
                  {(() => {
                    const slug = selectedSkill.slug || selectedSkill.title?.toLowerCase().replace(/\s+/g, "-");
                    const count = downloadCounts[slug] || 0;
                    return count > 0 ? (
                      <span className="text-[10px] font-mono text-muted-foreground flex items-center gap-1">
                        <Download className="h-3 w-3" /> {count}
                      </span>
                    ) : null;
                  })()}
                  {selectedSkill._updatedAt && (
                    <span className="text-xs font-mono text-muted-foreground">
                      {format(new Date(selectedSkill._updatedAt), "MMM d, yyyy")}
                    </span>
                  )}
                </div>
              </div>

              {selectedSkill.markdownContent && (
                <>
                  <Separator className="my-2" />
                  <div className="flex items-center gap-1.5 mb-2">
                    <FileText className="h-3.5 w-3.5 text-accent" />
                    <span className="text-xs font-mono uppercase tracking-wider text-muted-foreground">skill.md</span>
                  </div>
                  <div className="skill-prose max-w-none break-words overflow-wrap-anywhere">
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
                          <div className="ml-5 mt-1 mb-2 skill-prose max-w-none">
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
    </>
  );
};

export default PublicDashboard;
