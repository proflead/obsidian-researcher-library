# Researcher Library

Researcher Library is an Obsidian plugin for importing, organizing, and annotating research papers without moving the workflow outside your vault.

## Features

- Import one or more PDF files from the ribbon, command palette, or library view.
- Read embedded PDF metadata such as title and author.
- Track publication year, category, and reading status.
- Search and sort the library by common paper fields.
- Open a paper's PDF directly or create a linked note for it.
- Keep paper records connected when their managed PDF or note is renamed.
- Remove a paper record, its PDF, and its note through Obsidian's trash flow.

> PDF creation dates are stored separately from publication years. A PDF's creation date usually describes when the file was produced, not when the paper was published.

## Usage

1. Open **Researcher library** from the book icon in the ribbon.
2. Select **Import**, then choose one or more PDFs.
3. Select a paper title or its PDF button to open the document.
4. Use the note button to create or open a linked research note.
5. Use the pencil button to edit metadata or remove the paper.

If an imported filename is already in use, the plugin creates a numbered copy instead of overwriting existing vault data.

## Vault layout

The plugin keeps its managed files under `researcher-library/`:

```text
researcher-library/
├── notes/       # Research notes
└── papers/
    ├── md/      # Paper metadata records
    └── *.pdf    # Imported PDFs
```

Existing records created by earlier versions remain supported through filename-based fallback links.

## Development

Requirements: a current Node.js LTS release and npm.

```bash
npm install
npm run dev
```

The development command watches the TypeScript sources and writes `main.js` to the repository root, matching Obsidian's plugin directory layout.

Before submitting a change, run:

```bash
npm run lint
npm run build
```

## Releasing

1. Run `npm version patch`, `npm version minor`, or `npm version major` as appropriate.
2. Run `npm run build`.
3. Create a GitHub release whose tag matches `manifest.json`.
4. Attach `main.js`, `manifest.json`, and `styles.css` to the release.

## Contributing

Issues and pull requests are welcome.

## Privacy

Researcher Library does not require an account, connect to external services, collect telemetry, or send vault data over the network. Imported PDFs, metadata records, and notes remain inside the user's vault.

## License

Researcher Library is available under the [MIT License](LICENSE).

## Support

- [proflead.dev](https://proflead.dev)
- [Sponsor on GitHub](https://github.com/sponsors/proflead)
