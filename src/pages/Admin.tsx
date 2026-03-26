import { useState } from "react";
import Layout from "@/components/Layout";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { toast } from "sonner";
import { Trash2, Plus, Edit, Eye, EyeOff } from "lucide-react";

type PostForm = {
  title: string;
  content: string;
  excerpt: string;
  category: string;
  published: boolean;
};

type ResearchForm = {
  title: string;
  abstract: string;
  content: string;
  authors: string;
  tags: string;
  pdf_url: string;
  published: boolean;
};

const emptyPost: PostForm = { title: "", content: "", excerpt: "", category: "update", published: false };
const emptyResearch: ResearchForm = { title: "", abstract: "", content: "", authors: "", tags: "", pdf_url: "", published: false };

const Admin = () => {
  const { user, signOut } = useAuth();
  const queryClient = useQueryClient();
  const [editingPost, setEditingPost] = useState<string | null>(null);
  const [postForm, setPostForm] = useState<PostForm>(emptyPost);
  const [editingResearch, setEditingResearch] = useState<string | null>(null);
  const [researchForm, setResearchForm] = useState<ResearchForm>(emptyResearch);
  const [showPostForm, setShowPostForm] = useState(false);
  const [showResearchForm, setShowResearchForm] = useState(false);

  const { data: posts = [] } = useQuery({
    queryKey: ["admin-posts"],
    queryFn: async () => {
      const { data, error } = await supabase.from("posts").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const { data: articles = [] } = useQuery({
    queryKey: ["admin-research"],
    queryFn: async () => {
      const { data, error } = await supabase.from("research_articles").select("*").order("created_at", { ascending: false });
      if (error) throw error;
      return data;
    },
  });

  const savePost = useMutation({
    mutationFn: async () => {
      const payload = {
        title: postForm.title,
        content: postForm.content,
        excerpt: postForm.excerpt || null,
        category: postForm.category,
        published: postForm.published,
        published_at: postForm.published ? new Date().toISOString() : null,
        author_name: user?.user_metadata?.full_name || user?.email || null,
      };
      if (editingPost) {
        const { error } = await supabase.from("posts").update(payload).eq("id", editingPost);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("posts").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-posts"] });
      setPostForm(emptyPost);
      setEditingPost(null);
      setShowPostForm(false);
      toast.success(editingPost ? "Post updated" : "Post created");
    },
    onError: (e) => toast.error(e.message),
  });

  const deletePost = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("posts").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-posts"] });
      toast.success("Post deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const saveResearch = useMutation({
    mutationFn: async () => {
      const payload = {
        title: researchForm.title,
        abstract: researchForm.abstract || null,
        content: researchForm.content || null,
        authors: researchForm.authors ? researchForm.authors.split(",").map((a) => a.trim()) : [],
        tags: researchForm.tags ? researchForm.tags.split(",").map((t) => t.trim()) : [],
        pdf_url: researchForm.pdf_url || null,
        published: researchForm.published,
        published_at: researchForm.published ? new Date().toISOString() : null,
      };
      if (editingResearch) {
        const { error } = await supabase.from("research_articles").update(payload).eq("id", editingResearch);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("research_articles").insert(payload);
        if (error) throw error;
      }
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-research"] });
      setResearchForm(emptyResearch);
      setEditingResearch(null);
      setShowResearchForm(false);
      toast.success(editingResearch ? "Article updated" : "Article created");
    },
    onError: (e) => toast.error(e.message),
  });

  const deleteResearch = useMutation({
    mutationFn: async (id: string) => {
      const { error } = await supabase.from("research_articles").delete().eq("id", id);
      if (error) throw error;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ["admin-research"] });
      toast.success("Article deleted");
    },
    onError: (e) => toast.error(e.message),
  });

  const startEditPost = (post: typeof posts[0]) => {
    setPostForm({
      title: post.title,
      content: post.content,
      excerpt: post.excerpt || "",
      category: post.category,
      published: post.published,
    });
    setEditingPost(post.id);
    setShowPostForm(true);
  };

  const startEditResearch = (article: typeof articles[0]) => {
    setResearchForm({
      title: article.title,
      abstract: article.abstract || "",
      content: article.content || "",
      authors: article.authors.join(", "),
      tags: article.tags.join(", "),
      pdf_url: article.pdf_url || "",
      published: article.published,
    });
    setEditingResearch(article.id);
    setShowResearchForm(true);
  };

  return (
    <Layout>
      <div className="flex items-center justify-between mb-8">
        <div>
          <h1 className="text-2xl font-mono font-bold text-foreground">Admin Dashboard</h1>
          <p className="text-muted-foreground font-mono text-xs mt-1">{user?.email}</p>
        </div>
        <Button variant="ghost" onClick={signOut} className="font-mono text-xs">
          Sign Out
        </Button>
      </div>

      <Tabs defaultValue="posts" className="w-full">
        <TabsList className="bg-secondary border border-border mb-6">
          <TabsTrigger value="posts" className="font-mono text-xs">Posts</TabsTrigger>
          <TabsTrigger value="research" className="font-mono text-xs">Research</TabsTrigger>
        </TabsList>

        <TabsContent value="posts">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-mono uppercase tracking-[0.25em] text-muted-foreground">Posts</h2>
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs"
              onClick={() => { setPostForm(emptyPost); setEditingPost(null); setShowPostForm(!showPostForm); }}
            >
              <Plus className="h-3 w-3 mr-1" /> New Post
            </Button>
          </div>

          {showPostForm && (
            <div className="bg-card border border-border rounded-md p-4 mb-6 space-y-3">
              <Input
                placeholder="Title"
                value={postForm.title}
                onChange={(e) => setPostForm({ ...postForm, title: e.target.value })}
                className="font-mono text-sm bg-secondary border-border"
              />
              <Input
                placeholder="Category (e.g. update, announcement)"
                value={postForm.category}
                onChange={(e) => setPostForm({ ...postForm, category: e.target.value })}
                className="font-mono text-sm bg-secondary border-border"
              />
              <Textarea
                placeholder="Excerpt (optional short summary)"
                value={postForm.excerpt}
                onChange={(e) => setPostForm({ ...postForm, excerpt: e.target.value })}
                className="font-mono text-sm bg-secondary border-border min-h-[60px]"
              />
              <Textarea
                placeholder="Content (markdown supported)"
                value={postForm.content}
                onChange={(e) => setPostForm({ ...postForm, content: e.target.value })}
                className="font-mono text-sm bg-secondary border-border min-h-[200px]"
              />
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 font-mono text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={postForm.published}
                    onChange={(e) => setPostForm({ ...postForm, published: e.target.checked })}
                  />
                  Published
                </label>
                <div className="flex-1" />
                <Button variant="ghost" size="sm" className="font-mono text-xs" onClick={() => { setShowPostForm(false); setEditingPost(null); }}>
                  Cancel
                </Button>
                <Button size="sm" className="font-mono text-xs" onClick={() => savePost.mutate()} disabled={!postForm.title || !postForm.content}>
                  {editingPost ? "Update" : "Create"}
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {posts.map((post) => (
              <div key={post.id} className="flex items-center justify-between bg-card border border-border rounded-md px-4 py-3">
                <div className="flex items-center gap-3">
                  {post.published ? <Eye className="h-3 w-3 text-accent" /> : <EyeOff className="h-3 w-3 text-muted-foreground" />}
                  <span className="font-mono text-sm text-foreground">{post.title}</span>
                  <span className="font-mono text-xs text-muted-foreground">{post.category}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditPost(post)}>
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deletePost.mutate(post.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
            {posts.length === 0 && <p className="text-muted-foreground font-mono text-xs text-center py-8">No posts yet.</p>}
          </div>
        </TabsContent>

        <TabsContent value="research">
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-sm font-mono uppercase tracking-[0.25em] text-muted-foreground">Research Articles</h2>
            <Button
              variant="outline"
              size="sm"
              className="font-mono text-xs"
              onClick={() => { setResearchForm(emptyResearch); setEditingResearch(null); setShowResearchForm(!showResearchForm); }}
            >
              <Plus className="h-3 w-3 mr-1" /> New Article
            </Button>
          </div>

          {showResearchForm && (
            <div className="bg-card border border-border rounded-md p-4 mb-6 space-y-3">
              <Input
                placeholder="Title"
                value={researchForm.title}
                onChange={(e) => setResearchForm({ ...researchForm, title: e.target.value })}
                className="font-mono text-sm bg-secondary border-border"
              />
              <Input
                placeholder="Authors (comma-separated)"
                value={researchForm.authors}
                onChange={(e) => setResearchForm({ ...researchForm, authors: e.target.value })}
                className="font-mono text-sm bg-secondary border-border"
              />
              <Input
                placeholder="Tags (comma-separated)"
                value={researchForm.tags}
                onChange={(e) => setResearchForm({ ...researchForm, tags: e.target.value })}
                className="font-mono text-sm bg-secondary border-border"
              />
              <Input
                placeholder="PDF URL (optional)"
                value={researchForm.pdf_url}
                onChange={(e) => setResearchForm({ ...researchForm, pdf_url: e.target.value })}
                className="font-mono text-sm bg-secondary border-border"
              />
              <Textarea
                placeholder="Abstract"
                value={researchForm.abstract}
                onChange={(e) => setResearchForm({ ...researchForm, abstract: e.target.value })}
                className="font-mono text-sm bg-secondary border-border min-h-[80px]"
              />
              <Textarea
                placeholder="Content (markdown supported)"
                value={researchForm.content}
                onChange={(e) => setResearchForm({ ...researchForm, content: e.target.value })}
                className="font-mono text-sm bg-secondary border-border min-h-[200px]"
              />
              <div className="flex items-center gap-4">
                <label className="flex items-center gap-2 font-mono text-xs text-muted-foreground cursor-pointer">
                  <input
                    type="checkbox"
                    checked={researchForm.published}
                    onChange={(e) => setResearchForm({ ...researchForm, published: e.target.checked })}
                  />
                  Published
                </label>
                <div className="flex-1" />
                <Button variant="ghost" size="sm" className="font-mono text-xs" onClick={() => { setShowResearchForm(false); setEditingResearch(null); }}>
                  Cancel
                </Button>
                <Button size="sm" className="font-mono text-xs" onClick={() => saveResearch.mutate()} disabled={!researchForm.title}>
                  {editingResearch ? "Update" : "Create"}
                </Button>
              </div>
            </div>
          )}

          <div className="space-y-2">
            {articles.map((article) => (
              <div key={article.id} className="flex items-center justify-between bg-card border border-border rounded-md px-4 py-3">
                <div className="flex items-center gap-3">
                  {article.published ? <Eye className="h-3 w-3 text-accent" /> : <EyeOff className="h-3 w-3 text-muted-foreground" />}
                  <span className="font-mono text-sm text-foreground">{article.title}</span>
                  <span className="font-mono text-xs text-muted-foreground">{article.authors.join(", ")}</span>
                </div>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEditResearch(article)}>
                    <Edit className="h-3 w-3" />
                  </Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => deleteResearch.mutate(article.id)}>
                    <Trash2 className="h-3 w-3" />
                  </Button>
                </div>
              </div>
            ))}
            {articles.length === 0 && <p className="text-muted-foreground font-mono text-xs text-center py-8">No research articles yet.</p>}
          </div>
        </TabsContent>
      </Tabs>
    </Layout>
  );
};

export default Admin;
