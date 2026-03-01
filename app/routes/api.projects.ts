import * as projectService from "~/features/projects/service/projectService";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const id = url.searchParams.get("id");

  if (id) {
    const project = await projectService.getProject(id);
    return Response.json({ data: project });
  }

  const projects = await projectService.listProjects();
  return Response.json({ data: projects });
}

export async function action({ request }: { request: Request }) {
  const method = request.method.toUpperCase();

  if (method === "POST") {
    const body = await request.json();
    const project = await projectService.createProject(body);
    return Response.json({ data: project }, { status: 201 });
  }

  if (method === "PUT") {
    const body = await request.json();
    const { id, ...data } = body;
    if (!id) {
      return Response.json(
        { error: "Missing project id", code: "MISSING_ID" },
        { status: 400 },
      );
    }
    const project = await projectService.updateProject(id, data);
    return Response.json({ data: project });
  }

  if (method === "DELETE") {
    const body = await request.json();
    if (!body.id) {
      return Response.json(
        { error: "Missing project id", code: "MISSING_ID" },
        { status: 400 },
      );
    }
    await projectService.deleteProject(body.id);
    return Response.json({ data: { ok: true } });
  }

  return Response.json(
    { error: "Method not allowed", code: "METHOD_NOT_ALLOWED" },
    { status: 405 },
  );
}
