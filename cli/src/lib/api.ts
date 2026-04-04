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

export interface NewsEntity {
  name: string;
  domain: string;
}

export interface NewsSummary {
  _id: string;
  slug: string;
  title: string;
  excerpt: string;
  category: string;
  coverImage?: string;
  sources?: NewsSource[];
  entities?: NewsEntity[];
  continues?: string;
  authorName: string;
  publishedAt: string;
  _updatedAt?: string;
}

export interface NewsFull extends NewsSummary {
  content: string;
  consensus?: string[];
  divergence?: string[];
  takeaway?: string;
  continuesTitle?: string;
}

export interface TaskLink {
  id: string;
  link_type: string;
  link_ref: string;
  created_at: string;
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
  parent_task_id?: string;
  confidence?: number;
  requires_triage?: boolean;
  recurring?: { interval: string };
  estimated_hours?: number;
  created_at: string;
  updated_at: string;
}

export interface VelocityStats {
  period: string;
  completed: number;
  created: number;
  avg_days_to_close: number;
  backlog: number;
  overdue: number;
}

export interface TaskSuggestion {
  task: Task;
  score: number;
  reasons: string[];
}

export interface Agent {
  id: string;
  slug: string;
  name: string;
  email?: string;
  role?: string;
  owner: string;
  skill_slug?: string;
  scopes: string[];
  status: string;
  machine?: string;
  config?: any;
  last_seen?: string;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  timestamp: string;
  actor_email?: string;
  actor_name?: string;
  actor_type: string;
  actor_agent_id?: string;
  entity_type: string;
  entity_id?: string;
  action: string;
  state_before?: any;
  state_after?: any;
  channel?: string;
  context?: any;
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

  async updateFeedback(id: string, status: string, resolution?: string): Promise<void> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/feedback/${id}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ status, resolution }),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
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

  async getTask(num: number): Promise<{ task: Task; activity: TaskActivity[]; subtasks: Task[]; links: TaskLink[] }> {
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

  async triageTasks(): Promise<Task[]> {
    const data = await this.fetch<{ tasks: Task[] }>("/tasks?triage=true&assigned_to=all");
    return data.tasks;
  }

  async triageAction(num: number, action: "accept" | "dismiss", reason?: string): Promise<{ ok: boolean }> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/tasks/${num}/triage`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ action, reason }),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async getVelocity(period?: string, assigned_to?: string): Promise<VelocityStats> {
    const params = new URLSearchParams();
    if (period) params.set("period", period);
    if (assigned_to) params.set("assigned_to", assigned_to);
    const qs = params.toString();
    return this.fetch(`/tasks/velocity${qs ? `?${qs}` : ""}`);
  }

  async suggestNextTask(): Promise<TaskSuggestion[]> {
    const data = await this.fetch<{ suggestions: TaskSuggestion[] }>("/tasks/suggest");
    return data.suggestions;
  }

  async getStatus(): Promise<any> {
    return this.fetch("/status");
  }

  async queryAudit(filters?: { entity_type?: string; entity_id?: string; actor?: string; actor_agent_id?: string; channel?: string; action?: string; since?: string; limit?: number }): Promise<AuditEvent[]> {
    const params = new URLSearchParams();
    if (filters?.entity_type) params.set("entity_type", filters.entity_type);
    if (filters?.entity_id) params.set("entity_id", filters.entity_id);
    if (filters?.actor) params.set("actor", filters.actor);
    if (filters?.actor_agent_id) params.set("actor_agent_id", filters.actor_agent_id);
    if (filters?.channel) params.set("channel", filters.channel);
    if (filters?.action) params.set("action", filters.action);
    if (filters?.since) params.set("since", filters.since);
    if (filters?.limit) params.set("limit", String(filters.limit));
    const qs = params.toString();
    const data = await this.fetch<{ events: AuditEvent[] }>(`/audit${qs ? `?${qs}` : ""}`);
    return data.events;
  }

  async listAgents(): Promise<Agent[]> {
    const data = await this.fetch<{ agents: Agent[] }>("/agents");
    return data.agents;
  }

  async getAgent(slug: string): Promise<{ agent: Agent; activity: AuditEvent[] }> {
    return this.fetch(`/agents/${slug}`);
  }

  async registerAgent(agent: { slug: string; name: string; owner?: string; email?: string; skill_slug?: string; scopes?: string[]; machine?: string }): Promise<{ ok: boolean; slug: string }> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/agents`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(agent),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async updateAgent(slug: string, updates: Record<string, any>): Promise<{ ok: boolean }> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/agents/${slug}`, {
      method: "PATCH",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify(updates),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  }

  async linkTask(num: number, linkType: string, linkRef: string): Promise<{ ok: boolean }> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}/tasks/${num}/links`, {
      method: "POST",
      headers: { Authorization: `Bearer ${this.token}`, "Content-Type": "application/json" },
      body: JSON.stringify({ link_type: linkType, link_ref: linkRef }),
    });
    if (!res.ok) throw new Error(`API error ${res.status}: ${await res.text()}`);
    return res.json();
  }
}
