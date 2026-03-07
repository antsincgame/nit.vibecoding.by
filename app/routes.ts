import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("api/agents", "routes/api.agents.ts"),
  route("api/projects", "routes/api.projects.ts"),
  route("api/versions", "routes/api.versions.ts"),
  route("api/messages", "routes/api.messages.ts"),
  // Agent roles & pipeline
  route("api/roles", "routes/api.roles.ts"),
  route("api/roles/seed", "routes/api.roles.seed.ts"),
  route("api/roles/:id", "routes/api.roles.$id.ts"),
  route("api/pipeline/execute", "routes/api.pipeline.execute.ts"),
  // Settings
  route("settings/agents", "routes/settings.agents.tsx"),
] satisfies RouteConfig;
