import { describe, it, expect } from "vitest";
import { exportProjectAsZip } from "~/features/projects/service/exportService";
import type { Project, ProjectVersion } from "@shared/types/project";

function createProject(overrides: Partial<Project> = {}): Project {
  return {
    id: "proj-1",
    name: "Test App",
    description: "A test project",
    type: "react",
    agentId: "agent-1",
    modelUsed: "gpt-4",
    databaseId: "db-1",
    createdAt: "2025-01-01T00:00:00Z",
    updatedAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

function createVersion(overrides: Partial<ProjectVersion> = {}): ProjectVersion {
  return {
    id: "ver-1",
    projectId: "proj-1",
    code: { "App.tsx": "export default function App() { return <div>Hi</div>; }" },
    prompt: "Create a hello app",
    model: "gpt-4",
    agentId: "agent-1",
    temperature: 0.7,
    versionNumber: 1,
    createdAt: "2025-01-01T00:00:00Z",
    ...overrides,
  };
}

describe("exportService", () => {
  describe("exportProjectAsZip", () => {
    it("should return a Blob", async () => {
      const project = createProject();
      const versions = [createVersion()];
      const blob = await exportProjectAsZip(project, versions);
      expect(blob).toBeInstanceOf(Blob);
      expect(blob.size).toBeGreaterThan(0);
    });

    it("should include metadata.json with project info", async () => {
      const project = createProject({ name: "My App", id: "p-123" });
      const versions = [createVersion()];
      const blob = await exportProjectAsZip(project, versions);

      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const metadataFile = zip.file("metadata.json");
      expect(metadataFile).not.toBeNull();

      const metadataStr = await metadataFile!.async("string");
      const metadata = JSON.parse(metadataStr);
      expect(metadata.id).toBe("p-123");
      expect(metadata.name).toBe("My App");
      expect(metadata.versionCount).toBe(1);
      expect(metadata.exportedAt).toBeDefined();
    });

    it("should include src folder with latest version code", async () => {
      const project = createProject();
      const versions = [
        createVersion({
          versionNumber: 1,
          code: { "App.tsx": "const x = 1;", "utils.ts": "export const y = 2;" },
        }),
      ];
      const blob = await exportProjectAsZip(project, versions);

      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const appFile = zip.file("src/App.tsx");
      const utilsFile = zip.file("src/utils.ts");

      expect(appFile).not.toBeNull();
      expect(utilsFile).not.toBeNull();
      expect(await appFile!.async("string")).toBe("const x = 1;");
      expect(await utilsFile!.async("string")).toBe("export const y = 2;");
    });

    it("should include history folder with all versions", async () => {
      const project = createProject();
      const versions = [
        createVersion({ versionNumber: 1, prompt: "First" }),
        createVersion({ versionNumber: 2, prompt: "Second" }),
      ];
      const blob = await exportProjectAsZip(project, versions);

      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(await blob.arrayBuffer());
      const v1 = zip.file("history/v1.json");
      const v2 = zip.file("history/v2.json");

      expect(v1).not.toBeNull();
      expect(v2).not.toBeNull();
      const v1Data = JSON.parse(await v1!.async("string"));
      const v2Data = JSON.parse(await v2!.async("string"));
      expect(v1Data.prompt).toBe("First");
      expect(v2Data.prompt).toBe("Second");
    });

    it("should handle empty versions", async () => {
      const project = createProject();
      const blob = await exportProjectAsZip(project, []);
      const buffer = await blob.arrayBuffer();

      const JSZip = (await import("jszip")).default;
      const zip = await JSZip.loadAsync(buffer);
      expect(zip.file("metadata.json")).not.toBeNull();
      const srcFiles = Object.keys(zip.files).filter((k) => k.startsWith("src/"));
      expect(srcFiles).toHaveLength(0);
      expect(zip.folder("history")).not.toBeNull();
    });
  });
});
