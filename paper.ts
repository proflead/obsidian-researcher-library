import { App, normalizePath, TFile } from "obsidian";

export const PLUGIN_FOLDER = "researcher-library";
export const PAPERS_FOLDER = `${PLUGIN_FOLDER}/papers`;
export const RECORDS_FOLDER = `${PAPERS_FOLDER}/md`;
export const NOTES_FOLDER = `${PLUGIN_FOLDER}/notes`;

export const PAPER_STATUSES = [
  ["to read", "To read"],
  ["reading", "Reading"],
  ["finished", "Finished"],
  ["re-read", "Re-read"],
] as const;

export interface PaperPaths {
  pdfPath: string;
  notePath: string;
}

type Frontmatter = Record<string, unknown>;

export function isPaperRecord(file: TFile): boolean {
  return file.extension === "md" && file.path.startsWith(`${RECORDS_FOLDER}/`);
}

export function getPaperFrontmatter(app: App, paper: TFile): Frontmatter {
  return app.metadataCache.getFileCache(paper)?.frontmatter ?? {};
}

export function getPaperPaths(app: App, paper: TFile): PaperPaths {
  const frontmatter = getPaperFrontmatter(app, paper);
  return {
    pdfPath: getSafeLinkedPath(
      frontmatter.pdfPath,
      `${PAPERS_FOLDER}/${paper.basename}.pdf`,
      PAPERS_FOLDER,
      "pdf",
    ),
    notePath: getSafeLinkedPath(
      frontmatter.notePath,
      `${NOTES_FOLDER}/${paper.basename}.md`,
      NOTES_FOLDER,
      "md",
    ),
  };
}

export function normalizePaperStatus(value: unknown): string {
  if (value === "finish") {
    return "finished";
  }
  return typeof value === "string" && PAPER_STATUSES.some(([status]) => status === value)
    ? value
    : "to read";
}

export function frontmatterText(value: unknown): string {
  if (Array.isArray(value)) {
    return value.map((item) => String(item)).join(", ");
  }
  return typeof value === "string" || typeof value === "number" ? String(value) : "";
}

function getSafeLinkedPath(
  value: unknown,
  fallback: string,
  allowedFolder: string,
  extension: string,
): string {
  if (typeof value !== "string") {
    return normalizePath(fallback);
  }

  const path = normalizePath(value);
  const normalizedFolder = normalizePath(allowedFolder);
  if (path.startsWith(`${normalizedFolder}/`) && path.toLowerCase().endsWith(`.${extension}`)) {
    return path;
  }
  return normalizePath(fallback);
}
