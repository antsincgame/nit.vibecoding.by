import { type RouteConfig, index, route } from "@react-router/dev/routes";

export default [
  index("routes/home.tsx"),
  route("api/chat", "routes/api.chat.ts"),
  route("api/agents", "routes/api.agents.ts"),
  route("api/projects", "routes/api.projects.ts"),
  route("api/versions", "routes/api.versions.ts"),
  route("api/messages", "routes/api.messages.ts"),
] satisfies RouteConfig;
