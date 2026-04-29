# config-editor

Tauri 2 + Angular 21 desktop editor for [GestaltBI](https://github.com/GestaltBI) configuration repos.

A GestaltBI instance is driven by six files at the root of a GitHub repo (`structure.json`, `processing.json`, `modes.json`, `mapping.json`, `it.json`, `data.csv`). This app loads them, lets you edit each one with a purpose-built UI, and pushes them back via the GitHub Contents API. The [`gestaltbi-core`](https://github.com/GestaltBI/gestaltbi-core) client picks up changes immediately at `https://gestaltbi.github.io/gestaltbi-core/gh/<your-org>/<your-repo>`.

## Status

| Editor | UI |
|---|---|
| **Structure** (`structure.json`) | ag-Grid table — column code, type, tags, multi/required flags |
| **Mapping** (`mapping.json`) | ag-Grid; target dropdown sourced from structure; "Scaffold from CSV" button |
| **Labels** (`it.json`) | ag-Grid; column-code dropdown sourced from structure; "Scaffold missing" auto-fills humanized labels |
| **Processing** (`processing.json`) | rete.js graph (default) · step list · raw JSON. Connections express `require[]` and round-trip with the JSON. |
| **Modes** (`modes.json`) | Reorderable list — id, label key, icon picker |
| **Data** (`data.csv`) | Read-only ag-Grid preview, first 500 rows |

The toolbar offers a **live preview** button that opens `gestaltbi.github.io/gestaltbi-core/gh/<org>/<repo>/<sha>` for the most recent pushed commit (falls back to the branch ref if you haven't pushed yet this session).

## Push semantics

A push bundles every config file into a **single atomic commit** via the GitHub Git Data API:
1. Resolve current branch ref → commit sha → tree sha
2. Create a blob per dirty file
3. Create a new tree referencing the prior tree + the new blobs
4. Create a commit on top of the parent
5. Fast-forward the ref

So one click = one commit, no matter how many files changed.

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

Done since v0.1.0:
- ✓ rete.js processing graph (graph view + bidirectional sync with `require[]`)
- ✓ Mapping editor with scaffold-from-CSV
- ✓ Labels editor with structure-driven autocomplete
- ✓ CSV preview (first 500 rows)
- ✓ Atomic commit via Git Data API
- ✓ Live preview button → opens `gh/<org>/<repo>/<sha>` via the OS browser

Still ahead:
- [ ] **OAuth device flow** — replace the PAT paste with proper OAuth so the token can be scoped to just the repos the user picks.
- [ ] **Per-op options forms** — replace the JSON textarea in the processing-step detail with op-specific forms (e.g. dropdowns sourced from structure tags for `geocode.geocoding[].col`).
- [ ] **Bigger CSV preview** — paginate / virtualize so all rows are inspectable, not just the first 500.
- [ ] **Validation** — surface broken references (mapping target not in structure, processing.require pointing at a missing step, modes.id not matching processing) as inline lints.
- [ ] **New-repo flow** — let the user scaffold a fresh config repo in their org from inside the app (via the GitHub API).
- [ ] **Real Apple/Microsoft signing** — needs a Developer Program membership; once present, no more `xattr -cr` / SmartScreen friction.

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
