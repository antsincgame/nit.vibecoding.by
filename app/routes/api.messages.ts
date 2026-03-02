import {
  getProjectMessages,
  saveProjectMessages,
  deleteProjectMessages,
} from "~/features/chat/service/chatService";

export async function loader({ request }: { request: Request }) {
  const url = new URL(request.url);
  const projectId = url.searchParams.get("projectId");

  if (!projectId) {
    return Response.json(
      { error: "Missing projectId", code: "MISSING_PROJECT_ID" },
      { status: 400 },
    );
  }

  const messages = getProjectMessages(projectId);
  return Response.json({ data: messages });
}

export async function action({ request }: { request: Request }) {
  const method = request.method.toUpperCase();

  if (method === "PUT") {
    const body = await request.json();
    const { projectId, messages } = body;

    if (!projectId || !Array.isArray(messages)) {
      return Response.json(
        { error: "Invalid payload: projectId and messages[] required", code: "INVALID_PAYLOAD" },
        { status: 400 },
      );
    }

    try {
      saveProjectMessages(projectId, messages);
      return Response.json({ data: { ok: true } });
    } catch (err) {
      const message = err instanceof Error ? err.message : "Failed to save messages";
      return Response.json({ error: message, code: "SAVE_FAILED" }, { status: 500 });
    }
  }

  if (method === "DELETE") {
    const body = await request.json();
    if (!body.projectId) {
      return Response.json(
        { error: "Missing projectId", code: "MISSING_PROJECT_ID" },
        { status: 400 },
      );
    }

    deleteProjectMessages(body.projectId);
    return Response.json({ data: { ok: true } });
  }

  return Response.json(
    { error: "Method not allowed", code: "METHOD_NOT_ALLOWED" },
    { status: 405 },
  );
}
