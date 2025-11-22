import { App, Notice, Plugin, TFile, WorkspaceLeaf } from 'obsidian';
import { PDFDocument } from 'pdf-lib';
import { RESEARCHER_LIBRARY_VIEW_TYPE, ResearcherLibraryView } from './view';

const PLUGIN_FOLDER = "researcher-library";

export default class ResearcherLibraryPlugin extends Plugin {
	researcherLibraryView: ResearcherLibraryView;

	async onload() {
		// This adds a simple command that can be triggered anywhere
		this.addCommand({
			id: 'import-pdf',
			name: 'Import PDF',
			callback: () => {
				this.importPdf();
			}
		});

		this.registerView(
			RESEARCHER_LIBRARY_VIEW_TYPE,
			(leaf) => {
				this.researcherLibraryView = new ResearcherLibraryView(leaf, this);
				return this.researcherLibraryView;
			}
		);

		this.addRibbonIcon("book", "Open Researcher Library", () => {
			this.activateView();
		});
	}


	public async createNoteForPaper(paperMarkdownFile: TFile) {
		const notesPath = `${PLUGIN_FOLDER}/notes`;
		if (!await this.app.vault.adapter.exists(PLUGIN_FOLDER)) {
			await this.app.vault.createFolder(PLUGIN_FOLDER);
		}
		if (!await this.app.vault.adapter.exists(notesPath)) {
			await this.app.vault.createFolder(notesPath);
		}

		const notePath = `${notesPath}/${paperMarkdownFile.basename}.md`;
		const pdfPath = `${PLUGIN_FOLDER}/papers/${paperMarkdownFile.basename}.pdf`;
		const pdfFile = this.app.vault.getAbstractFileByPath(pdfPath);
		const pdfLink = pdfFile ? this.app.fileManager.generateMarkdownLink(pdfFile as TFile, '') : '';
		const mdLink = this.app.fileManager.generateMarkdownLink(paperMarkdownFile, '');

		const frontmatter = this.app.metadataCache.getFileCache(paperMarkdownFile)?.frontmatter;

		const content = `**PDF**: ${pdfLink}
**Author**: ${frontmatter?.author || 'N/A'}
**Publication Year**: ${frontmatter?.publicationYear || 'N/A'}
**Category**: ${frontmatter?.category || 'N/A'}

## Notes

`;
		const noteFile = await this.app.vault.create(notePath, content);
		this.app.workspace.getLeaf(true).openFile(noteFile);
	}

	async activateView() {
		let leaf: WorkspaceLeaf | null = null;
		this.app.workspace.iterateAllLeaves(l => {
			if (l.view.getViewType() === RESEARCHER_LIBRARY_VIEW_TYPE) {
				leaf = l;
				return true;
			}
			return false;
		});

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
			this.app.workspace.revealLeaf(leaf);
			const view = leaf.view as ResearcherLibraryView;
			if (view && view.renderPapers) {
				view.renderPapers();
			}
		}
	}

	public async importPdf() {
		const input = document.createElement('input');
		input.type = 'file';
		input.accept = '.pdf';
		input.onchange = async (e) => {
			const target = e.target as HTMLInputElement;
			if (!target.files || target.files.length === 0) {
				return;
			}
			const file = target.files[0];

			const papersPath = `${PLUGIN_FOLDER}/papers`;
			if (!await this.app.vault.adapter.exists(PLUGIN_FOLDER)) {
				await this.app.vault.createFolder(PLUGIN_FOLDER);
			}
			if (!await this.app.vault.adapter.exists(papersPath)) {
				await this.app.vault.createFolder(papersPath);
			}

			const filePath = `${papersPath}/${file.name}`;
			const reader = new FileReader();
			reader.onload = async () => {
				const content = reader.result as ArrayBuffer;
				await this.app.vault.createBinary(filePath, content); // Create the PDF file

				// Create a markdown file for the paper
				const paperMdPath = `${papersPath}/md`;
				try {
					await this.app.vault.createFolder(paperMdPath);
				} catch (e) {
					// Folder already exists
				}
				const markdownFileName = `${file.name.replace(/\.pdf$/, '')}.md`;
				const markdownFilePath = `${paperMdPath}/${markdownFileName}`;

				const metadata = await this.extractMetadata(content);
				const markdownContent = `---
title: "${metadata.title || ""}"
author: "${metadata.author || ""}"
publicationYear: "${metadata.publicationYear || ""}"
status: "to read"
---

# [[${file.name}]]

`;
				const newMarkdownFile = await this.app.vault.create(markdownFilePath, markdownContent);
				
				if (newMarkdownFile) {
					new Notice(`Imported ${file.name} and created markdown file`);
					this.activateView();
				}
			};
			reader.readAsArrayBuffer(file);
		};
		input.click();
	}



	async extractMetadata(pdfBuffer: ArrayBuffer) {
		const pdfDoc = await PDFDocument.load(pdfBuffer);
		const metadata = {
			title: pdfDoc.getTitle(),
			author: pdfDoc.getAuthor(),
			subject: pdfDoc.getSubject(),
			keywords: pdfDoc.getKeywords(),
			publicationYear: pdfDoc.getCreationDate()?.getFullYear().toString() || "",
		};
		return metadata;
	}

	onunload() {

	}
}

