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
    this.status = "To Read";
    this.category = "";
  }

  async onOpen() {
    const { contentEl } = this;
    contentEl.empty();
    contentEl.createEl("h2", { text: `Edit metadata for ${this.file.name}` });

    await this.app.fileManager.processFrontMatter(this.file, (frontmatter) => {
      this.title = frontmatter.title || "";
      this.author = frontmatter.author || "";
      this.status = frontmatter.status || "To Read";
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
          .addOption("to read", "to read")
          .addOption("reading", "reading")
          .addOption("finish", "finish")
          .addOption("re-read", "re-read")
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
          .onClick(async () => {
            await this.app.fileManager.processFrontMatter(this.file, (frontmatter) => {
              frontmatter.title = this.title;
              frontmatter.author = this.author;
              frontmatter.status = this.status;
              frontmatter.category = this.category;
            });
            this.close();
          })
      )
      .addButton((button) =>
        button
          .setButtonText("Remove")
          .setWarning()
          .onClick(async () => {
            if (confirm("Are you sure you want to remove this paper and its note?")) {
              // Delete the markdown file
              await this.app.vault.delete(this.file);

              // Delete the associated PDF file
              const pdfPath = `researcher-library/papers/${this.file.basename}.pdf`;
              const pdfFile = this.app.vault.getAbstractFileByPath(pdfPath);
              if (pdfFile) {
                await this.app.vault.delete(pdfFile);
              }

              // Delete the associated note file
              const notePath = `researcher-library/notes/${this.file.basename}.md`;
              const noteFile = this.app.vault.getAbstractFileByPath(notePath);
              if (noteFile) {
                await this.app.vault.delete(noteFile);
              }
              this.close();
            }
          })
      );
  }

  onClose() {
    const { contentEl } = this;
    contentEl.empty();
  }
}
