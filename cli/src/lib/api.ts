import { getConfig } from "./config";

export interface SkillSummary {
  _id: string;
  slug: string;
  title: string;
  description: string;
  tags: string[];
}

export interface SkillReference {
  filename: string;
  content: string;
  folder?: string;
}

export interface SkillFull extends SkillSummary {
  skillMd: string;
  referenceFiles: SkillReference[] | null;
}

export class AstarAPI {
  constructor(private token: string) {}

  private async fetch<T>(path: string): Promise<T> {
    const config = await getConfig();
    const res = await fetch(`${config.apiUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
    });
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
}
