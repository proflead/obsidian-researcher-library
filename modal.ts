import { App, Modal, Notice, Setting, TFile } from "obsidian";
import { frontmatterText, getPaperFrontmatter, normalizePaperStatus, PAPER_STATUSES } from "./paper";
import type ResearcherLibraryPlugin from "./main";

export class EditMetadataModal extends Modal {
  private readonly plugin: ResearcherLibraryPlugin;
  private readonly file: TFile;
  private readonly onChanged: () => void;
  private title = "";
  private author = "";
  private publicationYear = "";
  private status = "to read";
  private category = "";

  constructor(
    app: App,
    plugin: ResearcherLibraryPlugin,
    file: TFile,
    onChanged: () => void,
  ) {
    super(app);
    this.plugin = plugin;
    this.file = file;
    this.onChanged = onChanged;
  }

  onOpen(): void {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: `Edit metadata for ${this.file.name}` });

    const frontmatter = getPaperFrontmatter(this.app, this.file);
    this.title = frontmatterText(frontmatter.title);
    this.author = frontmatterText(frontmatter.author);
    this.publicationYear = frontmatterText(frontmatter.publicationYear);
    this.status = normalizePaperStatus(frontmatter.status);
    this.category = frontmatterText(frontmatter.category);

    new Setting(contentEl)
      .setName("Title")
      .addText((text) => text
        .setPlaceholder("Enter title")
        .setValue(this.title)
        .onChange((value) => {
          this.title = value;
        }));

    new Setting(contentEl)
      .setName("Author")
      .addText((text) => text
        .setPlaceholder("Enter author")
        .setValue(this.author)
        .onChange((value) => {
          this.author = value;
        }));

    new Setting(contentEl)
      .setName("Publication year")
      .setDesc("The PDF creation year is stored separately and is not assumed to be the publication year.")
      .addText((text) => text
        .setPlaceholder("For example, 2024")
        .setValue(this.publicationYear)
        .onChange((value) => {
          this.publicationYear = value.trim();
        }));

    new Setting(contentEl)
      .setName("Status")
      .addDropdown((dropdown) => {
        for (const [value, label] of PAPER_STATUSES) {
          dropdown.addOption(value, label);
        }
        dropdown.setValue(this.status).onChange((value) => {
          this.status = value;
        });
      });

    new Setting(contentEl)
      .setName("Category")
      .addText((text) => text
        .setPlaceholder("Enter category")
        .setValue(this.category)
        .onChange((value) => {
          this.category = value;
        }));

    new Setting(contentEl)
      .addButton((button) => button
        .setButtonText("Save")
        .setCta()
        .onClick(() => {
          void this.saveMetadata();
        }))
      .addButton((button) => button
        .setButtonText("Remove")
        .setWarning()
        .onClick(() => {
          void this.confirmAndRemove();
        }));
  }

  onClose(): void {
    this.contentEl.empty();
  }

  private async saveMetadata(): Promise<void> {
    try {
      await this.app.fileManager.processFrontMatter(this.file, (frontmatter: Record<string, unknown>) => {
        frontmatter.title = this.title.trim();
        frontmatter.author = this.author.trim();
        frontmatter.publicationYear = this.publicationYear;
        frontmatter.status = this.status;
        frontmatter.category = this.category.trim();
      });
      this.onChanged();
      this.close();
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      new Notice(`Could not save metadata: ${message}`, 8000);
    }
  }

  private async confirmAndRemove(): Promise<void> {
    const confirmed = await confirmRemoval(
      this.app,
      "Remove paper",
      `Move “${this.title || this.file.basename}”, its PDF, and its note to the trash?`,
    );
    if (!confirmed) {
      return;
    }

    if (await this.plugin.removePaper(this.file)) {
      this.onChanged();
      this.close();
    }
  }
}

class ConfirmationModal extends Modal {
  private readonly titleText: string;
  private readonly bodyText: string;
  private readonly resolve: (confirmed: boolean) => void;
  private resolved = false;

  constructor(app: App, titleText: string, bodyText: string, resolve: (confirmed: boolean) => void) {
    super(app);
    this.titleText = titleText;
    this.bodyText = bodyText;
    this.resolve = resolve;
  }

  onOpen(): void {
    this.contentEl.empty();
    this.contentEl.createEl("h2", { text: this.titleText });
    this.contentEl.createEl("p", { text: this.bodyText });

    new Setting(this.contentEl)
      .addButton((button) => button
        .setButtonText("Cancel")
        .onClick(() => {
          this.resolveOnce(false);
          this.close();
        }))
      .addButton((button) => button
        .setButtonText("Remove")
        .setWarning()
        .onClick(() => {
          this.resolveOnce(true);
          this.close();
        }));
  }

  onClose(): void {
    this.contentEl.empty();
    this.resolveOnce(false);
  }

  private resolveOnce(confirmed: boolean): void {
    if (!this.resolved) {
      this.resolved = true;
      this.resolve(confirmed);
    }
  }
}

function confirmRemoval(app: App, titleText: string, bodyText: string): Promise<boolean> {
  return new Promise((resolve) => {
    new ConfirmationModal(app, titleText, bodyText, resolve).open();
  });
}
