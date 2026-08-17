import {
  Notice,
  normalizePath,
  Plugin,
  TAbstractFile,
  TFile,
  TFolder,
  WorkspaceLeaf,
} from "obsidian";
import { PDFDocument } from "pdf-lib";
import {
  frontmatterText,
  getPaperFrontmatter,
  getPaperPaths,
  NOTES_FOLDER,
  PAPERS_FOLDER,
  RECORDS_FOLDER,
} from "./paper";
import { RESEARCHER_LIBRARY_VIEW_TYPE, ResearcherLibraryView } from "./view";

interface ExtractedPdfMetadata {
  title: string;
  author: string;
  subject: string;
  keywords: string;
  pdfCreatedYear: string;
}

interface ImportPaths {
  basename: string;
  pdfPath: string;
  recordPath: string;
  notePath: string;
}

export default class ResearcherLibraryPlugin extends Plugin {
  onload(): void {
    this.addCommand({
      id: "import-pdf",
      name: "Import PDF",
      callback: () => this.importPdf(),
    });

    this.registerView(
      RESEARCHER_LIBRARY_VIEW_TYPE,
      (leaf) => new ResearcherLibraryView(leaf, this),
    );

    this.addRibbonIcon("book", "Open researcher library", () => {
      void this.activateView();
    });

    this.app.workspace.onLayoutReady(() => {
      this.registerEvent(this.app.metadataCache.on("changed", (file) => {
        if (file.path.startsWith(`${RECORDS_FOLDER}/`)) {
          this.refreshLibraryViews();
        }
      }));
      this.registerEvent(this.app.vault.on("create", (file) => {
        if (isLibraryPath(file.path)) {
          this.refreshLibraryViews();
        }
      }));
      this.registerEvent(this.app.vault.on("delete", (file) => {
        if (isLibraryPath(file.path)) {
          this.refreshLibraryViews();
        }
      }));
      this.registerEvent(this.app.vault.on("rename", (file, oldPath) => {
        if (!isLibraryPath(file.path) && !isLibraryPath(oldPath)) {
          return;
        }
        if (isLinkedAssetPath(oldPath)) {
          void this.handleLinkedFileRename(file, oldPath).catch((error: unknown) => {
            this.showError("Could not update a renamed library file", error);
          });
        }
        this.refreshLibraryViews();
      }));
    });
  }

  public importPdf(): void {
    const input = createEl("input");
    input.type = "file";
    input.accept = ".pdf,application/pdf";
    input.multiple = true;
    input.addEventListener("change", () => {
      const files = Array.from(input.files ?? []);
      if (files.length > 0) {
        void this.importPdfFiles(files);
      }
    }, { once: true });
    input.click();
  }

  public async createNoteForPaper(paper: TFile): Promise<void> {
    try {
      await this.ensureFolder(NOTES_FOLDER);
      const { pdfPath, notePath } = getPaperPaths(this.app, paper);
      const existingNote = this.app.vault.getAbstractFileByPath(notePath);
      if (existingNote instanceof TFile) {
        await this.app.workspace.getLeaf(true).openFile(existingNote);
        return;
      }
      if (existingNote) {
        throw new Error(`A folder already exists at ${notePath}`);
      }

      const pdfFile = this.app.vault.getAbstractFileByPath(pdfPath);
      const pdfLink = pdfFile instanceof TFile
        ? this.app.fileManager.generateMarkdownLink(pdfFile, notePath)
        : "PDF file not found";
      const frontmatter = getPaperFrontmatter(this.app, paper);
      const title = cleanMetadataValue(frontmatterText(frontmatter.title)) || paper.basename;
      const author = cleanMetadataValue(frontmatterText(frontmatter.author)) || "N/A";
      const publicationYear = cleanMetadataValue(frontmatterText(frontmatter.publicationYear)) || "N/A";
      const category = cleanMetadataValue(frontmatterText(frontmatter.category)) || "N/A";
      const content = `# Notes — ${escapeMarkdown(title)}

**PDF:** ${pdfLink}
**Author:** ${escapeMarkdown(author)}
**Publication year:** ${escapeMarkdown(publicationYear)}
**Category:** ${escapeMarkdown(category)}

## Notes

`;
      const noteFile = await this.app.vault.create(notePath, content);
      await this.app.fileManager.processFrontMatter(paper, (properties: Record<string, unknown>) => {
        properties.notePath = notePath;
      });
      await this.app.workspace.getLeaf(true).openFile(noteFile);
    } catch (error) {
      this.showError("Could not create the paper note", error);
    }
  }

  public async openPdfForPaper(paper: TFile): Promise<void> {
    try {
      const { pdfPath } = getPaperPaths(this.app, paper);
      const pdfFile = this.app.vault.getAbstractFileByPath(pdfPath);
      if (!(pdfFile instanceof TFile)) {
        throw new Error(`PDF not found at ${pdfPath}`);
      }
      await this.app.workspace.getLeaf(true).openFile(pdfFile);
    } catch (error) {
      this.showError("Could not open the PDF", error);
    }
  }

  public async removePaper(paper: TFile): Promise<boolean> {
    const { pdfPath, notePath } = getPaperPaths(this.app, paper);
    try {
      for (const path of [notePath, pdfPath]) {
        const file = this.app.vault.getAbstractFileByPath(path);
        if (file instanceof TFile) {
          await this.app.fileManager.trashFile(file);
        }
      }
      await this.app.fileManager.trashFile(paper);
      new Notice(`Removed ${paper.basename}`);
      return true;
    } catch (error) {
      this.showError("Could not remove the complete paper record", error);
      return false;
    }
  }

  public async activateView(): Promise<void> {
    let leaf: WorkspaceLeaf | null = this.app.workspace.getLeavesOfType(
      RESEARCHER_LIBRARY_VIEW_TYPE,
    )[0] ?? null;

    if (!leaf) {
      leaf = this.app.workspace.getRightLeaf(false);
      if (leaf) {
        await leaf.setViewState({
          type: RESEARCHER_LIBRARY_VIEW_TYPE,
          active: true,
        });
      }
    }

    if (leaf) {
      await this.app.workspace.revealLeaf(leaf);
      if (leaf.view instanceof ResearcherLibraryView) {
        leaf.view.scheduleRender();
      }
    }
  }

  private async importPdfFiles(files: File[]): Promise<void> {
    let imported = 0;
    for (const file of files) {
      try {
        await this.importPdfFile(file);
        imported += 1;
      } catch (error) {
        this.showError(`Could not import ${file.name}`, error);
      }
    }

    if (imported > 0) {
      new Notice(`Imported ${imported} PDF${imported === 1 ? "" : "s"}`);
      await this.activateView();
    }
  }

  private async importPdfFile(file: File): Promise<void> {
    if (!file.name.toLowerCase().endsWith(".pdf")) {
      throw new Error("The selected file is not a PDF");
    }

    const content = await file.arrayBuffer();
    const metadata = await this.extractMetadata(content);
    await this.ensureFolder(RECORDS_FOLDER);
    await this.ensureFolder(NOTES_FOLDER);
    const paths = this.getAvailableImportPaths(file.name.replace(/\.pdf$/i, ""));
    const createdFiles: TFile[] = [];

    try {
      const pdfFile = await this.app.vault.createBinary(paths.pdfPath, content);
      createdFiles.push(pdfFile);
      const pdfLink = this.app.fileManager.generateMarkdownLink(pdfFile, paths.recordPath);
      const heading = escapeMarkdown(metadata.title || paths.basename);
      const record = await this.app.vault.create(
        paths.recordPath,
        `---\n---\n\n# ${heading}\n\n${pdfLink}\n`,
      );
      createdFiles.push(record);
      await this.app.fileManager.processFrontMatter(record, (properties: Record<string, unknown>) => {
        properties.paperId = createPaperId();
        properties.title = metadata.title;
        properties.author = metadata.author;
        properties.publicationYear = "";
        properties.pdfCreatedYear = metadata.pdfCreatedYear;
        properties.status = "to read";
        properties.category = "";
        properties.subject = metadata.subject;
        properties.keywords = metadata.keywords;
        properties.pdfPath = paths.pdfPath;
        properties.notePath = paths.notePath;
        properties.importedAt = new Date().toISOString();
      });
    } catch (error) {
      await this.rollbackCreatedFiles(createdFiles);
      throw error;
    }
  }

  private async extractMetadata(pdfBuffer: ArrayBuffer): Promise<ExtractedPdfMetadata> {
    const pdfDoc = await PDFDocument.load(pdfBuffer, { updateMetadata: false });
    return {
      title: readPdfMetadata(() => pdfDoc.getTitle()),
      author: readPdfMetadata(() => pdfDoc.getAuthor()),
      subject: readPdfMetadata(() => pdfDoc.getSubject()),
      keywords: readPdfMetadata(() => pdfDoc.getKeywords()),
      pdfCreatedYear: readPdfMetadata(() => pdfDoc.getCreationDate()?.getFullYear()),
    };
  }

  private async ensureFolder(folderPath: string): Promise<void> {
    const segments = normalizePath(folderPath).split("/");
    let currentPath = "";
    for (const segment of segments) {
      currentPath = currentPath ? `${currentPath}/${segment}` : segment;
      const existing = this.app.vault.getAbstractFileByPath(currentPath);
      if (existing instanceof TFolder) {
        continue;
      }
      if (existing) {
        throw new Error(`A file already exists at ${currentPath}`);
      }
      await this.app.vault.createFolder(currentPath);
    }
  }

  private getAvailableImportPaths(requestedBasename: string): ImportPaths {
    const safeBasename = sanitizeBasename(requestedBasename) || "Untitled paper";
    let suffix = 1;
    while (true) {
      const basename = suffix === 1 ? safeBasename : `${safeBasename} (${suffix})`;
      const paths = {
        basename,
        pdfPath: normalizePath(`${PAPERS_FOLDER}/${basename}.pdf`),
        recordPath: normalizePath(`${RECORDS_FOLDER}/${basename}.md`),
        notePath: normalizePath(`${NOTES_FOLDER}/${basename}.md`),
      };
      const collision = [paths.pdfPath, paths.recordPath, paths.notePath]
        .some((path) => this.app.vault.getAbstractFileByPath(path) !== null);
      if (!collision) {
        return paths;
      }
      suffix += 1;
    }
  }

  private async rollbackCreatedFiles(files: TFile[]): Promise<void> {
    for (const file of files.reverse()) {
      try {
        if (this.app.vault.getAbstractFileByPath(file.path)) {
          await this.app.fileManager.trashFile(file);
        }
      } catch {
        // The original import error remains the most useful error to report.
      }
    }
  }

  private async handleLinkedFileRename(file: TAbstractFile, oldPath: string): Promise<void> {
    if (!(file instanceof TFile)) {
      return;
    }
    const normalizedOldPath = normalizePath(oldPath);
    const records = this.app.vault.getFiles().filter((candidate) =>
      candidate.path.startsWith(`${RECORDS_FOLDER}/`) && candidate.extension === "md"
    );

    for (const record of records) {
      const paths = getPaperPaths(this.app, record);
      if (paths.pdfPath === normalizedOldPath) {
        await this.app.fileManager.processFrontMatter(record, (properties: Record<string, unknown>) => {
          properties.pdfPath = file.path;
        });
      }
      if (paths.notePath === normalizedOldPath) {
        await this.app.fileManager.processFrontMatter(record, (properties: Record<string, unknown>) => {
          properties.notePath = file.path;
        });
      }
    }
  }

  private refreshLibraryViews(): void {
    for (const leaf of this.app.workspace.getLeavesOfType(RESEARCHER_LIBRARY_VIEW_TYPE)) {
      if (leaf.view instanceof ResearcherLibraryView) {
        leaf.view.scheduleRender();
      }
    }
  }

  private showError(context: string, error: unknown): void {
    const message = error instanceof Error ? error.message : String(error);
    new Notice(`${context}: ${message}`, 8000);
  }
}

function cleanMetadataValue(value: unknown): string {
  if (typeof value !== "string" && typeof value !== "number") {
    return "";
  }
  return String(value)
    .split("")
    .map((character) => {
      const code = character.charCodeAt(0);
      return code <= 31 || code === 127 ? " " : character;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 1000);
}

function sanitizeBasename(value: string): string {
  return value
    .replace(/[\\/:*?"<>|]/g, "-")
    .split("")
    .filter((character) => {
      const code = character.charCodeAt(0);
      return code > 31 && code !== 127;
    })
    .join("")
    .replace(/\s+/g, " ")
    .trim()
    .replace(/^\.+|\.+$/g, "");
}

function escapeMarkdown(value: string): string {
  return value.replace(/[\\`*_[\]<>#]/g, "\\$&");
}

function createPaperId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function readPdfMetadata(read: () => unknown): string {
  try {
    return cleanMetadataValue(read());
  } catch {
    return "";
  }
}

function isLibraryPath(path: string): boolean {
  return normalizePath(path).startsWith("researcher-library/");
}

function isLinkedAssetPath(path: string): boolean {
  const normalizedPath = normalizePath(path);
  return normalizedPath.startsWith(`${NOTES_FOLDER}/`)
    || (normalizedPath.startsWith(`${PAPERS_FOLDER}/`) && normalizedPath.toLowerCase().endsWith(".pdf"));
}
