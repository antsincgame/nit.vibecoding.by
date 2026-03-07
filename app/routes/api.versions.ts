import * as versionService from "~/features/projects/service/versionService";
import * as projectService from "~/features/projects/service/projectService";

async function resolveDatabaseId(projectId: string): Promise<string> {
  const project = await projectService.getProject(projectId);
  return project.databaseId;
}

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");

  if (!projectId) {
    return Response.json(
      { error: "Missing projectId", code: "MISSING_PROJECT_ID" },
      { status: 400 },
    );
  }

  const databaseId = await resolveDatabaseId(projectId);
  const versions = await versionService.listVersions(databaseId);
  return Response.json({ data: versions });
}

export async function action({ request }: { request: Request }) {
  const method = request.method.toUpperCase();

  if (method === "POST") {
    const body = await request.json();
    const projectId = body.projectId;

    if (!projectId) {
      return Response.json(
        { error: "Missing projectId", code: "MISSING_PROJECT_ID" },
        { status: 400 },
      );
    }

    const databaseId = await resolveDatabaseId(projectId);
    const version = await versionService.createVersion({
      databaseId,
      code: body.code ?? body.files ?? {},
      prompt: body.prompt ?? "",
      model: body.model ?? "",
      agentId: body.agentId ?? "",
      temperature: body.temperature ?? 0.3,
    });
    return Response.json({ data: version }, { status: 201 });
  }

  if (method === "DELETE") {
    const body = await request.json();
    if (!body.id || !body.projectId) {
      return Response.json(
        { error: "Missing version id or projectId", code: "MISSING_ID" },
        { status: 400 },
      );
    }

    const databaseId = await resolveDatabaseId(body.projectId);
    await versionService.deleteVersion(databaseId, body.id);
    return Response.json({ data: { ok: true } });
  }

  return Response.json(
    { error: "Method not allowed", code: "METHOD_NOT_ALLOWED" },
    { status: 405 },
  );
}
