import JSZip from "jszip";
import type { Project, ProjectVersion } from "@shared/types/project";

export async function exportProjectAsZip(
  project: Project,
  versions: ProjectVersion[],
): Promise<Blob> {
  const zip = new JSZip();

  const metadata = {
    id: project.id,
    name: project.name,
    description: project.description,
    type: project.type,
    createdAt: project.createdAt,
    updatedAt: project.updatedAt,
    exportedAt: new Date().toISOString(),
    versionCount: versions.length,
  };

  zip.file("metadata.json", JSON.stringify(metadata, null, 2));

  const latestVersion = versions[0];
  if (latestVersion) {
    const srcFolder = zip.folder("src");
    if (srcFolder) {
      for (const [filePath, content] of Object.entries(latestVersion.code)) {
        srcFolder.file(filePath, content);
      }
    }
  }

  const historyFolder = zip.folder("history");
  if (historyFolder) {
    for (const version of versions) {
      const versionData = {
        versionNumber: version.versionNumber,
        prompt: version.prompt,
        model: version.model,
        agentId: version.agentId,
        temperature: version.temperature,
        createdAt: version.createdAt,
        files: version.code,
      };
      historyFolder.file(`v${version.versionNumber}.json`, JSON.stringify(versionData, null, 2));
    }
  }

  return zip.generateAsync({ type: "blob" });
}

export function downloadBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  URL.revokeObjectURL(url);
}
