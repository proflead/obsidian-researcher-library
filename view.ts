import { ItemView, Setting, TFile, WorkspaceLeaf } from "obsidian";
import { EditMetadataModal } from "./modal";
import {
  frontmatterText,
  getPaperFrontmatter,
  getPaperPaths,
  isPaperRecord,
  normalizePaperStatus,
  PAPER_STATUSES,
} from "./paper";
import ResearcherLibraryPlugin from "./main";

export const RESEARCHER_LIBRARY_VIEW_TYPE = "researcher-library-view";

export class ResearcherLibraryView extends ItemView {
  private readonly plugin: ResearcherLibraryPlugin;
  private statusFilter = "all";
  private searchTerm = "";
  private sortOption = "import-desc";
  private renderFrame: number | null = null;

  constructor(leaf: WorkspaceLeaf, plugin: ResearcherLibraryPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType(): string {
    return RESEARCHER_LIBRARY_VIEW_TYPE;
  }

  getDisplayText(): string {
    return "Researcher library";
  }

  async onOpen(): Promise<void> {
    this.contentEl.empty();
    this.contentEl.addClass("researcher-library-view");
    this.contentEl.createEl("h2", { text: "Researcher library" });

    const controls = this.contentEl.createDiv({ cls: "researcher-library-controls" });
    new Setting(controls)
      .setName("Import papers")
      .setDesc("Add one or more research papers to the library.")
      .addButton((button) => {
        button
          .setButtonText("Import")
          .setIcon("upload")
          .onClick(() => this.plugin.importPdf());
      });

    const filters = this.contentEl.createDiv({ cls: "researcher-library-filters" });
    new Setting(filters)
      .setName("Filter by status")
      .addDropdown((dropdown) => {
        dropdown.addOption("all", "All");
        for (const [value, label] of PAPER_STATUSES) {
          dropdown.addOption(value, label);
        }
        dropdown
          .setValue(this.statusFilter)
          .onChange((value) => {
            this.statusFilter = value;
            this.scheduleRender();
          });
      });

    new Setting(filters)
      .setName("Search")
      .addSearch((search) => {
        search
          .setPlaceholder("Title, author, category, or year")
          .setValue(this.searchTerm)
          .onChange((value) => {
            this.searchTerm = value;
            this.scheduleRender();
          });
      });

    new Setting(filters)
      .setName("Sort by")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("none", "None")
          .addOption("import-asc", "Import date (oldest first)")
          .addOption("import-desc", "Import date (newest first)")
          .addOption("updated-asc", "Updated date (oldest first)")
          .addOption("updated-desc", "Updated date (newest first)")
          .addOption("title-asc", "Title")
          .setValue(this.sortOption)
          .onChange((value) => {
            this.sortOption = value;
            this.scheduleRender();
          });
      });

    this.renderPapers();
  }

  public scheduleRender(): void {
    if (this.renderFrame !== null) {
      return;
    }
    this.renderFrame = window.requestAnimationFrame(() => {
      this.renderFrame = null;
      this.renderPapers();
    });
  }

  public renderPapers(): void {
    const existingList = this.contentEl.querySelector("#researcher-library-papers");
    existingList?.remove();
    const papersContainer = this.contentEl.createDiv({
      cls: "researcher-library-papers",
      attr: { id: "researcher-library-papers" },
    });

    const papers = this.app.vault.getFiles().filter(isPaperRecord);
    const query = this.searchTerm.trim().toLocaleLowerCase();
    const filteredPapers = papers.filter((paper) => {
      const frontmatter = getPaperFrontmatter(this.app, paper);
      const status = normalizePaperStatus(frontmatter.status);
      if (this.statusFilter !== "all" && status !== this.statusFilter) {
        return false;
      }
      if (!query) {
        return true;
      }
      return [
        frontmatter.title,
        frontmatter.author,
        frontmatter.category,
        frontmatter.publicationYear,
        paper.basename,
      ].some((value) => frontmatterText(value).toLocaleLowerCase().includes(query));
    });

    this.sortPapers(filteredPapers);
    if (filteredPapers.length === 0) {
      papersContainer.createEl("p", {
        cls: "researcher-library-empty",
        text: papers.length === 0
          ? "Your library is empty. Import a PDF to get started."
          : "No papers match the current filters.",
      });
      return;
    }

    for (const paper of filteredPapers) {
      this.renderPaper(papersContainer, paper);
    }
  }

  async onClose(): Promise<void> {
    if (this.renderFrame !== null) {
      window.cancelAnimationFrame(this.renderFrame);
      this.renderFrame = null;
    }
  }

  private renderPaper(container: HTMLElement, paper: TFile): void {
    const frontmatter = getPaperFrontmatter(this.app, paper);
    const paths = getPaperPaths(this.app, paper);
    const title = frontmatterText(frontmatter.title) || paper.basename;
    const author = frontmatterText(frontmatter.author);
    const publicationYear = frontmatterText(frontmatter.publicationYear);
    const category = frontmatterText(frontmatter.category);
    const status = normalizePaperStatus(frontmatter.status);
    const statusLabel = PAPER_STATUSES.find(([value]) => value === status)?.[1] ?? "To read";

    const card = container.createDiv({ cls: "researcher-library-paper" });
    const setting = new Setting(card)
      .setDesc(author || "Unknown author")
      .addExtraButton((button) => {
        button.setIcon("file-text").setTooltip("Open PDF").onClick(() => {
          void this.plugin.openPdfForPaper(paper);
        });
      })
      .addExtraButton((button) => {
        const note = this.app.vault.getAbstractFileByPath(paths.notePath);
        button
          .setIcon(note instanceof TFile ? "file-edit" : "file-plus-2")
          .setTooltip(note instanceof TFile ? "Open note" : "Create note")
          .onClick(() => {
            void this.plugin.createNoteForPaper(paper);
          });
      })
      .addExtraButton((button) => {
        button.setIcon("pencil").setTooltip("Edit metadata").onClick(() => {
          new EditMetadataModal(this.app, this.plugin, paper, () => this.scheduleRender()).open();
        });
      });

    setting.nameEl.empty();
    const titleLink = setting.nameEl.createEl("a", {
      cls: "researcher-library-title",
      text: title,
      href: paths.pdfPath,
    });
    titleLink.addEventListener("click", (event) => {
      event.preventDefault();
      void this.plugin.openPdfForPaper(paper);
    });

    const details = card.createDiv({ cls: "researcher-library-paper-details" });
    this.addDetail(details, "Status", statusLabel);
    if (publicationYear) {
      this.addDetail(details, "Published", publicationYear);
    }
    if (category) {
      this.addDetail(details, "Category", category);
    }
    this.addDetail(details, "Imported", formatDate(frontmatter.importedAt, paper.stat.ctime));
    this.addDetail(details, "Updated", formatDate(undefined, paper.stat.mtime));
  }

  private addDetail(container: HTMLElement, label: string, value: string): void {
    const detail = container.createSpan({ cls: "researcher-library-detail" });
    detail.createSpan({ cls: "researcher-library-detail-label", text: `${label}: ` });
    detail.appendText(value);
  }

  private sortPapers(papers: TFile[]): void {
    papers.sort((a, b) => {
      if (this.sortOption === "none") {
        return 0;
      }
      if (this.sortOption === "title-asc") {
        const titleA = frontmatterText(getPaperFrontmatter(this.app, a).title) || a.basename;
        const titleB = frontmatterText(getPaperFrontmatter(this.app, b).title) || b.basename;
        return titleA.localeCompare(titleB);
      }

      const useImportDate = this.sortOption.startsWith("import-");
      const dateA = useImportDate ? a.stat.ctime : a.stat.mtime;
      const dateB = useImportDate ? b.stat.ctime : b.stat.mtime;
      return this.sortOption.endsWith("-asc") ? dateA - dateB : dateB - dateA;
    });
  }
}

function formatDate(value: unknown, fallbackTimestamp: number): string {
  const parsed = typeof value === "string" ? Date.parse(value) : Number.NaN;
  const timestamp = Number.isNaN(parsed) ? fallbackTimestamp : parsed;
  return new Date(timestamp).toLocaleDateString();
}
