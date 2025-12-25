import { App, Modal, Setting, TFile } from "obsidian";

export class EditMetadataModal extends Modal {
  file: TFile;
  title: string;
  author: string;
  status: string;
  category: string;

  constructor(app: App, file: TFile) {
    super(app);
    this.file = file;
    this.title = "";
    this.author = "";
    this.status = "to read";
    this.category = "";
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: `Edit metadata for ${this.file.name}` });

    await this.app.fileManager.processFrontMatter(this.file, (frontmatter) => {
      this.title = frontmatter.title || "";
      this.author = frontmatter.author || "";
      this.status = frontmatter.status || "to read";
      this.category = frontmatter.category || "";
    });

    new Setting(contentEl)
      .setName("Title")
      .addText((text) =>
        text
          .setPlaceholder("Enter title")
          .setValue(this.title)
          .onChange((value) => {
            this.title = value;
          })
      );

    new Setting(contentEl)
      .setName("Author")
      .addText((text) =>
        text
          .setPlaceholder("Enter author")
          .setValue(this.author)
          .onChange((value) => {
            this.author = value;
          })
      );

    new Setting(contentEl)
      .setName("Status")
      .addDropdown((dropdown) =>
        dropdown
          .addOption("to read", "To read")
          .addOption("reading", "Reading")
          .addOption("finish", "Finished")
          .addOption("re-read", "Re-read")
          .setValue(this.status)
          .onChange((value) => {
            this.status = value;
          })
      );

    new Setting(contentEl)
      .setName("Category")
      .addText((text) =>
        text
          .setPlaceholder("Enter category")
          .setValue(this.category)
          .onChange((value) => {
            this.category = value;
          })
      );

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText("Save")
          .setCta()
          .onClick(() => {
            void this.saveMetadata();
          })
      )
      .addButton((button) =>
        button
          .setButtonText("Remove")
          .setWarning()
          .onClick(() => {
            void this.removePaper();
          })
      );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }

  private async saveMetadata() {
    await this.app.fileManager.processFrontMatter(this.file, (frontmatter) => {
      frontmatter.title = this.title;
      frontmatter.author = this.author;
      frontmatter.status = this.status;
      frontmatter.category = this.category;
    });
    this.close();
  }

  private async removePaper() {
    const confirmed = await confirmRemoval(
      this.app,
      "Remove paper",
      "Are you sure you want to remove this paper and its note?"
    );
    if (!confirmed) {
      return;
    }

    await this.app.fileManager.trashFile(this.file);

    const pdfPath = `researcher-library/papers/${this.file.basename}.pdf`;
    const pdfFile = this.app.vault.getAbstractFileByPath(pdfPath);
    if (pdfFile instanceof TFile) {
      await this.app.fileManager.trashFile(pdfFile);
    }

    const notePath = `researcher-library/notes/${this.file.basename}.md`;
    const noteFile = this.app.vault.getAbstractFileByPath(notePath);
    if (noteFile instanceof TFile) {
      await this.app.fileManager.trashFile(noteFile);
    }
    this.close();
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

  onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: this.titleText });
    contentEl.createEl("p", { text: this.bodyText });

    new Setting(contentEl)
      .addButton((button) =>
        button
          .setButtonText("Cancel")
          .onClick(() => {
            this.resolveOnce(false);
            this.close();
          })
      )
      .addButton((button) =>
        button
          .setButtonText("Remove")
          .setWarning()
          .onClick(() => {
            this.resolveOnce(true);
            this.close();
          })
      );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
    this.resolveOnce(false);
  }

  private resolveOnce(confirmed: boolean) {
    if (this.resolved) {
      return;
    }
    this.resolved = true;
    this.resolve(confirmed);
  }
}

function confirmRemoval(app: App, titleText: string, bodyText: string) {
  return new Promise<boolean>((resolve) => {
    const modal = new ConfirmationModal(app, titleText, bodyText, resolve);
    modal.open();
  });
}
