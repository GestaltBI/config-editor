# config-editor

Tauri 2 + Angular 21 desktop editor for [GestaltBI](https://github.com/GestaltBI) configuration repos.

A GestaltBI instance is driven by six files at the root of a GitHub repo (`structure.json`, `processing.json`, `modes.json`, `mapping.json`, `it.json`, `data.csv`). This app loads them, lets you edit each one with a purpose-built UI, and pushes them back via the GitHub Contents API. The [`gestaltbi-core`](https://github.com/GestaltBI/gestaltbi-core) client picks up changes immediately at `https://gestaltbi.github.io/gestaltbi-core/gh/<your-org>/<your-repo>`.

## Status

| Editor | UI |
|---|---|
| **Structure** (`structure.json`) | ag-Grid table — column code, type, tags, multi/required flags |
| **Modes** (`modes.json`) | Reorderable list — id, label key, icon picker |
| **Processing** (`processing.json`) | Step list + per-step form, raw-JSON fallback. **rete.js graph view is the next milestone** |
| **Mapping** (`mapping.json`) | _todo_ |
| **Labels** (`it.json`) | _todo_ |
| **Data** (`data.csv`) | _todo_ — preview / inline edit |

## Run

The Angular frontend builds in any Node 20 environment; the Tauri backend needs the [Rust toolchain](https://www.rust-lang.org/tools/install) and your platform's webview prerequisites (see [Tauri prerequisites](https://v2.tauri.app/start/prerequisites/)).

```sh
npm install
npm run tauri:dev    # opens the desktop window
# or, browser-only dev (no Tauri APIs available):
npm start            # http://localhost:1420
```

## Installing a pre-built release

Grab a binary from the [Releases page](https://github.com/GestaltBI/config-editor/releases). All builds are unsigned-but-ad-hoc-stamped — proper Apple/Microsoft signing is on the roadmap.

### macOS — "the app is damaged" / *"è danneggiata"*

Misleading message: it's not damaged, it's just not notarized by Apple. Run once after installing:

```sh
xattr -cr "/Applications/GestaltBI Config Editor.app"
```

Then launch normally. The `com.apple.quarantine` xattr is only set on first download; subsequent launches don't need this. On macOS 15 (Sequoia) the alternative right-click → Open path is gone, so this is the simplest fix.

### Windows — SmartScreen warning

Click *More info → Run anyway* on the first launch. Same root cause (no code-signing certificate yet).

### Linux — no warning

Just `chmod +x` the AppImage and run it, or `dpkg -i` the .deb.

## Auth

The app uses a **GitHub personal access token** with `repo` scope, stored in `localStorage` for now. Click **Open repo** in the toolbar, paste the token, the org/repo name, optional branch (default `master`).

The token never leaves the machine — every request goes directly to `api.github.com`. In a production Tauri build, the token should move to `tauri-plugin-store` (or the OS keychain via a secure-storage plugin).

## Authoring flow

1. **Open repo** → `org/repo` resolved via the GitHub Contents API. The six files load into the in-memory store.
2. **Edit** in the relevant tab. Local edits set the dirty marker; nothing is written to GitHub until you push.
3. **Push** → one PUT-per-file via Contents API. Single commit-per-file at the moment; bundling into a single commit via the Git Data API is on the roadmap.

## Roadmap

- [ ] **rete.js processing graph** — drag op nodes from a palette; connect them; per-node panel for options. The current step-list view is a stub.
- [ ] **Labels editor** — `it.json` column-label dictionary; auto-suggests entries from `structure.json` columns.
- [ ] **Mapping editor** — visual mapping of raw CSV column → canonical column.
- [ ] **CSV preview** — read-only ag-Grid view of `data.csv`, optional small-edit support.
- [ ] **Atomic commit** — bundle all writes into one commit via the Git Data API (tree + commit + ref-update) instead of N file PUTs.
- [ ] **OAuth device flow** — replace the PAT paste with proper OAuth so the token can be scoped to just the repos the user picks.
- [ ] **Live preview** — open `gestaltbi.github.io/gestaltbi-core/gh/<org>/<repo>/<sha>` in the OS browser via Tauri shell after a successful push.
- [ ] **Icons** — run `npx tauri icon assets/gestaltbi-logo.png` to generate the bundled icon set; commit the output.

## Stack

- **Tauri 2.x** — small desktop bundle, native webview
- **Angular 21** — matches `gestaltbi-core` so design tokens and `@gestaltbi/stream` types are reusable
- **ag-Grid 33** — table editor for the structure
- **Material 21 (M3)** — form fields and dialog
- **rete.js 2** — node graph (planned)
- **`@gestaltbi/stream`** — op definitions + the runtime processor for in-app preview (planned)

The design system tokens (`src/styles/tokens.scss`, `base.scss`, `typography.scss`, `controls.scss`, `mat-overrides.scss`) are copied from `gestaltbi-core` for visual parity.

## License

MIT
