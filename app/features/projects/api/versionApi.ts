import type { ProjectVersion } from "@shared/types/project";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  const json = (await res.json()) as { data: T };
  return json.data;
}

export function listVersions(projectId: string): Promise<ProjectVersion[]> {
  return fetchJson<ProjectVersion[]>(
    `/api/versions?projectId=${encodeURIComponent(projectId)}`,
  );
}

export function createVersion(data: {
  projectId: string;
  code: Record<string, string>;
  prompt: string;
  model: string;
  agentId: string;
  temperature: number;
}): Promise<ProjectVersion> {
  return fetchJson<ProjectVersion>("/api/versions", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data),
  });
}

export function deleteVersion(id: string, projectId: string): Promise<void> {
  return fetchJson("/api/versions", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, projectId }),
  });
}
