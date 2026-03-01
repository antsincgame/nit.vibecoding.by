import type { Project, CreateProjectInput } from "@shared/types/project";

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, init);
  if (!res.ok) {
    const body = await res.json().catch(() => ({ error: res.statusText }));
    throw new Error(body.error ?? `Request failed: ${res.status}`);
  }
  const json = (await res.json()) as { data: T };
  return json.data;
}

export function listProjects(): Promise<Project[]> {
  return fetchJson<Project[]>("/api/projects");
}

export function getProject(id: string): Promise<Project> {
  return fetchJson<Project>(`/api/projects?id=${encodeURIComponent(id)}`);
}

export function createProject(input: CreateProjectInput): Promise<Project> {
  return fetchJson<Project>("/api/projects", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
}

export function updateProject(
  id: string,
  data: Partial<CreateProjectInput & { agentId: string; modelUsed: string }>,
): Promise<Project> {
  return fetchJson<Project>("/api/projects", {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id, ...data }),
  });
}

export function deleteProject(id: string): Promise<void> {
  return fetchJson("/api/projects", {
    method: "DELETE",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ id }),
  });
}
