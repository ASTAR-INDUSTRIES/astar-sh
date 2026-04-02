import { getConfig } from "./config";

export interface SkillSummary {
  _id: string;
  slug: string;
  title: string;
  description: string;
  tags: string[];
  downloadCount?: number;
  _updatedAt?: string;
}

export interface SkillReference {
  filename: string;
  content: string;
  folder?: string;
}

export interface SkillFull extends SkillSummary {
  skillMd: string;
  referenceFiles: SkillReference[] | null;
  author?: string;
}

export interface NewsSource {
  name: string;
  region: string;
  url: string;
  perspective?: string;
}

export interface NewsSummary {
  _id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  coverImage?: string;
  sources?: NewsSource[];
  authorName: string;
  publishedAt: string;
  _updatedAt?: string;
}

export interface NewsFull extends NewsSummary {
  content: string;
  consensus?: string[];
  divergence?: string[];
  takeaway?: string;
}

export interface Task {
  id: string;
  task_number: number;
  title: string;
  description?: string;
  status: string;
  priority: string;
  created_by: string;
  assigned_to?: string;
  completed_by?: string;
  due_date?: string;
  completed_at?: string;
  source: string;
  tags: string[];
  created_at: string;
  updated_at: string;
}

export interface TaskActivity {
  id: string;
  actor: string;
  actor_type: string;
  action: string;
  details: Record<string, any>;
  created_at: string;
}

export interface Inquiry {
  id: string;
  type: string;
  content: string;
  author_email: string;
  author_name: string;
  status: string;
  response?: string;
  processed_by?: string;
  created_at: string;
  processed_at?: string;
}

export interface Milestone {
  id: string;
  title: string;
  date: string;
  category: string;
  created_by: string;
  created_at: string;
}

export interface FeedbackItem {
  id: string;
  content: string;
  type: string;
  source: string;
  author_email: string;
  author_name: string;
  linked_skill?: string;
  linked_news?: string;
  status: string;
  created_at: string;
}

export class AstarAPI {
  constructor(private token?: string) {}

  private async fetch<T>(path: string): Promise<T> {
    const config = await getConfig();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    const res = await fetch(`${config.apiUrl}${path}`, { headers });
    if (!res.ok) {
      if (res.status === 404) throw new Error("This feature isn't available yet. The API may need to be redeployed.");
      if (res.status === 401) throw new Error("Session expired. Run 'astar login' to sign in again.");
      throw new Error(`API error ${res.status}: ${await res.text()}`);
    }
    return res.json();
  }

  async listSkills(query?: string): Promise<SkillSummary[]> {
    const params = new URLSearchParams();
    if (query) params.set("query", query);
    const qs = params.toString();
    const data = await this.fetch<{ skills: SkillSummary[] }>(`/skills${qs ? `?${qs}` : ""}`);
    return data.skills;
  }

  async getSkill(slug: string): Promise<SkillFull> {
    const data = await this.fetch<{ skill: SkillFull }>(`/skills/${slug}`);
    return data.skill;
  }

  async pushSkill(skill: {
    title: string;
    slug: string;
    description?: string;
    tags?: string[];
    content: string;
    references?: SkillReference[];
    published?: boolean;
  }): Promise<{ ok: boolean; slug: string }> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/skills`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(skill),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API error ${res.status}: ${body}`);
    }
    return res.json();
  }

  async listNews(category?: string): Promise<NewsSummary[]> {
    const params = new URLSearchParams();
    if (category) params.set("category", category);
    const qs = params.toString();
    const data = await this.fetch<{ news: NewsSummary[] }>(`/news${qs ? `?${qs}` : ""}`);
    return data.news;
  }

  async getNews(slug: string): Promise<NewsFull> {
    const data = await this.fetch<{ article: NewsFull }>(`/news/${slug}`);
    return data.article;
  }

  async listFeedback(status?: string): Promise<FeedbackItem[]> {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const qs = params.toString();
    const data = await this.fetch<{ feedback: FeedbackItem[] }>(`/feedback${qs ? `?${qs}` : ""}`);
    return data.feedback;
  }

  async submitFeedback(fb: {
    content: string;
    type?: string;
    linked_skill?: string;
    linked_news?: string;
    context?: Record<string, any>;
  }): Promise<void> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/feedback`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(fb),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API error ${res.status}: ${body}`);
    }
  }

  async listMilestones(month?: string): Promise<Milestone[]> {
    const params = new URLSearchParams();
    if (month) params.set("month", month);
    const qs = params.toString();
    const data = await this.fetch<{ milestones: Milestone[] }>(`/milestones${qs ? `?${qs}` : ""}`);
    return data.milestones;
  }

  async createMilestone(m: { title: string; category?: string; date?: string }): Promise<void> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/milestones`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(m),
    });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API error ${res.status}: ${body}`);
    }
  }

  async submitInquiry(content: string, type: string = "question"): Promise<{ ok: boolean; id: string }> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/inquiries`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ content, type }),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async listOwnInquiries(status?: string): Promise<Inquiry[]> {
    const params = new URLSearchParams();
    if (status) params.set("status", status);
    const qs = params.toString();
    const data = await this.fetch<{ inquiries: Inquiry[] }>(`/inquiries${qs ? `?${qs}` : ""}`);
    return data.inquiries;
  }

  async getInquiry(id: string): Promise<Inquiry> {
    const data = await this.fetch<{ inquiry: Inquiry }>(`/inquiries/${id}`);
    return data.inquiry;
  }

  async listTasks(filters?: { status?: string; priority?: string; assigned_to?: string; due?: string; search?: string }): Promise<Task[]> {
    const params = new URLSearchParams();
    if (filters?.status) params.set("status", filters.status);
    if (filters?.priority) params.set("priority", filters.priority);
    if (filters?.assigned_to) params.set("assigned_to", filters.assigned_to);
    if (filters?.due) params.set("due", filters.due);
    if (filters?.search) params.set("search", filters.search);
    const qs = params.toString();
    const data = await this.fetch<{ tasks: Task[] }>(`/tasks${qs ? `?${qs}` : ""}`);
    return data.tasks;
  }

  async createTask(task: { title: string; description?: string; priority?: string; assigned_to?: string; due_date?: string; tags?: string[] }): Promise<{ ok: boolean; task_number: number }> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/tasks`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(task),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async getTask(num: number): Promise<{ task: Task; activity: TaskActivity[] }> {
    return this.fetch(`/tasks/${num}`);
  }

  async updateTask(num: number, updates: Record<string, any>): Promise<{ ok: boolean }> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/tasks/${num}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async cancelTask(num: number): Promise<{ ok: boolean }> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/tasks/${num}`, {
      method: "DELETE",
      headers: { Authorization: `Bearer ${this.token}` },
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  }
}
