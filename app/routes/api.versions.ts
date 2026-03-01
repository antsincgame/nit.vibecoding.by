import * as versionService from "~/features/projects/service/versionService";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");

  if (!projectId) {
    return Response.json(
      { error: "Missing projectId", code: "MISSING_PROJECT_ID" },
      { status: 400 },
    );
  }

  const versions = await versionService.listVersions(projectId);
  return Response.json({ data: versions });
}

export async function action({ request }: { request: Request }) {
  const method = request.method.toUpperCase();

  if (method === "POST") {
    const body = await request.json();
    const version = await versionService.createVersion(body);
    return Response.json({ data: version }, { status: 201 });
  }

  if (method === "DELETE") {
    const body = await request.json();
    if (!body.id) {
      return Response.json(
        { error: "Missing version id", code: "MISSING_ID" },
        { status: 400 },
      );
    }
    await versionService.deleteVersion(body.id);
    return Response.json({ data: { ok: true } });
  }

  return Response.json(
    { error: "Method not allowed", code: "METHOD_NOT_ALLOWED" },
    { status: 405 },
  );
}
