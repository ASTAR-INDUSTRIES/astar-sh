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

export class AstarAPI {
  constructor(private token?: string) {}

  private async fetch<T>(path: string): Promise<T> {
    const config = await getConfig();
    const headers: Record<string, string> = { "Content-Type": "application/json" };
    if (this.token) headers["Authorization"] = `Bearer ${this.token}`;
    const res = await fetch(`${config.apiUrl}${path}`, { headers });
    if (!res.ok) {
      const body = await res.text();
      throw new Error(`API error ${res.status}: ${body}`);
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
}
