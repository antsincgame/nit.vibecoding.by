import JSZip from "jszip";
import type { Project, ProjectVersion } from "@shared/types/project";
import { logger } from "~/lib/utils/logger";

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

export async function importProjectFromZip(
  file: File,
): Promise<{ metadata: Record<string, unknown>; files: Record<string, string> } | null> {
  try {
    const zip = await JSZip.loadAsync(file);
    const metaFile = zip.file("metadata.json");

    if (!metaFile) return null;

    const metaText = await metaFile.async("text");
    const metadata = JSON.parse(metaText) as Record<string, unknown>;

    const files: Record<string, string> = {};
    const srcFolder = zip.folder("src");

    if (srcFolder) {
      const entries = srcFolder.filter((_, file) => !file.dir);
      for (const entry of entries) {
        const content = await entry.async("text");
        const relativePath = entry.name.replace(/^src\//, "");
        files[relativePath] = content;
      }
    }

    return { metadata, files };
  } catch (err) {
    logger.error("importZip", "Failed to import project from ZIP", err);
    return null;
  }
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
