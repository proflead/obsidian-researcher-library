import { ItemView, WorkspaceLeaf, Setting, TFile } from "obsidian";
import { EditMetadataModal } from "./modal";
import ResearcherLibraryPlugin from "./main";

export const RESEARCHER_LIBRARY_VIEW_TYPE = "researcher-library-view";

export class ResearcherLibraryView extends ItemView {
  plugin: ResearcherLibraryPlugin;

  constructor(leaf: WorkspaceLeaf, plugin: ResearcherLibraryPlugin) {
    super(leaf);
    this.plugin = plugin;
  }

  getViewType() {
    return RESEARCHER_LIBRARY_VIEW_TYPE;
  }

  getDisplayText() {
    return "Researcher Library";
  }

  statusFilter: string = "All";
  searchTerm: string = "";
  sortOption: string = "None";

  async onOpen() {
    const container = this.containerEl.children[1];
    container.empty();
    container.createEl("h2", { text: "Researcher Library" });

    const actionsEl = container.createEl("div");
    actionsEl.style.marginBottom = "1em";

    new Setting(actionsEl)
      .setName("Import PDF")
      .setDesc("Import a PDF file into your library.")
      .addButton((button) => {
        button
          .setButtonText("Import")
          .setIcon("upload")
          .onClick(() => {
            this.plugin.importPdf();
          });
      });

    const filterEl = container.createEl("div");
    filterEl.style.marginBottom = "1em";
    new Setting(filterEl)
      .setName("Filter by status")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("All", "All")
          .addOption("to read", "to read")
          .addOption("reading", "reading")
          .addOption("finish", "finish")
          .addOption("re-read", "re-read")
          .setValue(this.statusFilter)
          .onChange((value) => {
            this.statusFilter = value;
            this.renderPapers();
          });
      });

    new Setting(filterEl)
      .setName("Search")
      .addSearch((search) => {
        search
          .setPlaceholder("Search by title or author")
          .setValue(this.searchTerm)
          .onChange((value) => {
            this.searchTerm = value;
            this.renderPapers();
          });
      });
    
    new Setting(filterEl)
      .setName("Sort by")
      .addDropdown((dropdown) => {
        dropdown
          .addOption("None", "None")
          .addOption("ImportDateAsc", "Import Date (Oldest First)")
          .addOption("ImportDateDesc", "Import Date (Newest First)")
          .addOption("UpdatedDateAsc", "Updated Date (Oldest First)")
          .addOption("UpdatedDateDesc", "Updated Date (Newest First)")
          .setValue(this.sortOption)
          .onChange((value) => {
            this.sortOption = value;
            this.renderPapers();
          });
      });

    this.renderPapers();
  }
  
  async renderPapers() {
    const container = this.containerEl.children[1];
    const papersEl = container.querySelector("#papers-list");
    if (papersEl) {
      papersEl.remove();
    }

    const papersDiv = container.createEl("div", { attr: { id: "papers-list" } });
    const papers = this.app.vault.getFiles().filter((file) => file.path.startsWith("researcher-library/papers/md/") && file.extension === "md");

    let filteredPapers = papers;
    if (this.statusFilter !== "All") {
      filteredPapers = [];
      for (const paper of papers) {
        const frontmatter = this.app.metadataCache.getFileCache(paper)?.frontmatter;
        if (frontmatter && frontmatter.status === this.statusFilter) {
          filteredPapers.push(paper);
        }
      }
    }

    if (this.searchTerm) {
      filteredPapers = filteredPapers.filter((paper) => {
        const frontmatter = this.app.metadataCache.getFileCache(paper)?.frontmatter;
        if (frontmatter) {
          const title = frontmatter.title || "";
          const author = frontmatter.author || "";
          const category = frontmatter.category || "";
          return (
            title.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
            author.toLowerCase().includes(this.searchTerm.toLowerCase()) ||
            category.toLowerCase().includes(this.searchTerm.toLowerCase())
          );
        }
        return false;
      });
    }

    if (this.sortOption !== "None") {
      filteredPapers.sort((a, b) => {
        let dateA: number;
        let dateB: number;

        if (this.sortOption.startsWith("ImportDate")) {
          dateA = a.stat.ctime;
          dateB = b.stat.ctime;
        } else { // UpdatedDate
          dateA = a.stat.mtime;
          dateB = b.stat.mtime;
        }

        if (this.sortOption.endsWith("Asc")) {
          return dateA - dateB;
        } else { // Desc
          return dateB - dateA;
        }
      });
    }

    if (filteredPapers.length > 0) {
      for (const paper of filteredPapers) {
        const paperDiv = papersDiv.createEl("div", { cls: "researcher-library-paper" });
        const frontmatter = this.app.metadataCache.getFileCache(paper)?.frontmatter;

        const contentDiv = paperDiv.createEl("div", { cls: "researcher-library-paper-content" });
        const setting = new Setting(contentDiv)
          .addExtraButton((btn) => {
            btn.setIcon("pencil").setTooltip("Edit metadata").onClick(() => {
              const modal = new EditMetadataModal(this.app, paper);
              modal.onClose = () => {
                setTimeout(() => {
                  this.renderPapers();
                }, 500);
              };
              modal.open();
            });
          })
                    .addExtraButton((btn) => {
                      const notePath = `researcher-library/notes/${paper.basename}.md`;
                      const noteFile = this.app.vault.getAbstractFileByPath(notePath);
                      if (noteFile) {
                        btn.setIcon("file-edit").setTooltip("Edit note").onClick(async () => {
                          console.log("Opening note for editing:", noteFile);
                          await this.app.workspace.getLeaf(true).openFile(noteFile as TFile);
                        });
                      } else {
                        btn.setIcon("file-plus-2").setTooltip("Create note for this paper").onClick(async () => {
                          console.log("Creating note for paper:", paper);
                          await this.plugin.createNoteForPaper(paper);
                        });
                      }
                    });
                  
                  setting.descEl.createEl("div", { text: `Date Imported: ${new Date(paper.stat.ctime).toLocaleDateString()}` });
                  setting.descEl.createEl("div", { text: `Last Updated: ${new Date(paper.stat.mtime).toLocaleDateString()}` });
                  
                  const nameEl = setting.nameEl;
                  nameEl.empty();
                  const link = nameEl.createEl("a", {
                    text: frontmatter?.title || paper.basename + ".pdf",
                    href: "#",
                  });
                  link.addEventListener("click", async (event) => {
                    event.preventDefault();
                    const notePath = `researcher-library/notes/${paper.basename}.md`;
                    const noteFile = this.app.vault.getAbstractFileByPath(notePath);
                    if (noteFile) {
                      await this.app.workspace.getLeaf(true).openFile(noteFile as TFile);
                    }
                    else {
                      await this.plugin.createNoteForPaper(paper);
                    }
                  });

        const detailsDiv = paperDiv.createEl("div", { cls: "researcher-library-paper-details" });
        detailsDiv.createEl("span", { text: `Status: ${frontmatter?.status || "N/A"}` });
        detailsDiv.createEl("span", { text: `Category: ${frontmatter?.category || "N/A"}` });
      }
    } else {
      papersDiv.createEl("p", { text: "No papers found." });
    }
  }

  async onClose() {
    // Nothing to clean up.
  }
}
