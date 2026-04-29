import { Injectable, signal } from '@angular/core';

import { ConfigStoreService } from './config-store.service';

const FILES = ['structure.json', 'processing.json', 'modes.json', 'mapping.json', 'it.json'] as const;
const CSV_FILE = 'data.csv';
const GIT_DIR = '.git';

interface FsApi {
  readTextFile: (path: string) => Promise<string>;
  writeTextFile: (path: string, content: string) => Promise<void>;
  exists: (path: string) => Promise<boolean>;
}

interface ShellCommandClass {
  create(program: string, args?: string[], options?: { cwd?: string }): {
    execute(): Promise<{ code: number | null; stdout: string; stderr: string }>;
  };
}

interface DialogApi {
  open: (opts: { directory?: boolean; multiple?: boolean }) => Promise<string | string[] | null>;
}

/**
 * Local-folder backend: reads / writes the six config files via
 * tauri-plugin-fs, and pushes through the system's `git` CLI via
 * tauri-plugin-shell. The plugin imports are dynamic so the browser
 * dev shell (npm start) doesn't crash when Tauri runtime APIs aren't
 * available — pickFolder / load / save / push throw a sensible error
 * instead, and the toolbar surfaces it.
 */
@Injectable({ providedIn: 'root' })
export class LocalBackendService {
  readonly busy = signal(false);
  readonly status = signal('');

  constructor(private store: ConfigStoreService) {}

  isAvailable(): boolean {
    return typeof window !== 'undefined' && !!(window as any).__TAURI_INTERNALS__;
  }

  /** Open the OS folder picker; returns the selected path or null. */
  async pickFolder(): Promise<string | null> {
    if (!this.isAvailable()) throw new Error('Local folder mode requires the desktop build.');
    const dialog = (await import('@tauri-apps/plugin-dialog')) as DialogApi;
    const picked = await dialog.open({ directory: true, multiple: false });
    if (!picked || Array.isArray(picked)) return null;
    return picked;
  }

  /** Load all six config files from a folder into the store. */
  async load(folder: string): Promise<void> {
    if (!this.isAvailable()) throw new Error('Local folder mode requires the desktop build.');
    this.busy.set(true);
    this.status.set(`Loading ${folder}…`);
    try {
      const fs = (await import('@tauri-apps/plugin-fs')) as FsApi;

      this.store.sourceKind.set('local');
      this.store.localPath.set(folder);

      // Detect a .git working tree.
      const isRepo = await fs.exists(join(folder, GIT_DIR)).catch(() => false);
      this.store.localIsGitRepo.set(isRepo);

      const tryRead = async (name: string): Promise<string | null> => {
        try {
          return await fs.readTextFile(join(folder, name));
        } catch {
          return null;
        }
      };

      const [structure, processing, modes, mapping, labels] = await Promise.all(
        FILES.map(async (f) => {
          const text = await tryRead(f);
          return text ? safeJson(text) : null;
        }),
      );
      const dataCsv = await tryRead(CSV_FILE);

      this.store.structure.set(structure);
      this.store.processing.set(processing);
      this.store.modes.set(modes ?? []);
      this.store.mapping.set(mapping);
      this.store.labels.set(labels);
      this.store.dataCsv.set(dataCsv);
      this.store.isLoaded.set(true);
      this.store.isDirty.set(false);

      this.status.set(`Loaded ${this.store.sourceLabel()}${isRepo ? ' (git repo)' : ''}`);
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Write every changed config file back to disk. Returns the number
   * of files written. Doesn't touch git — call gitPush separately.
   */
  async save(): Promise<number> {
    if (!this.isAvailable()) throw new Error('Local folder mode requires the desktop build.');
    const folder = this.store.localPath();
    if (!folder) throw new Error('No folder loaded.');

    this.busy.set(true);
    this.status.set(`Saving to ${folder}…`);
    try {
      const fs = (await import('@tauri-apps/plugin-fs')) as FsApi;

      const writes: Array<[string, string]> = [];
      const s = this.store.structure();
      const p = this.store.processing();
      if (s) writes.push(['structure.json', JSON.stringify(s, null, 2)]);
      if (p) writes.push(['processing.json', JSON.stringify(p, null, 2)]);
      writes.push(['modes.json', JSON.stringify(this.store.modes(), null, 2)]);
      const mapping = this.store.mapping();
      if (mapping) writes.push(['mapping.json', JSON.stringify(mapping, null, 2)]);
      const labels = this.store.labels();
      if (labels) writes.push(['it.json', JSON.stringify(labels, null, 2)]);

      for (const [name, content] of writes) {
        await fs.writeTextFile(join(folder, name), content);
      }

      this.store.isDirty.set(false);
      this.status.set(`Saved ${writes.length} file${writes.length === 1 ? '' : 's'}.`);
      return writes.length;
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Run the system `git` to stage, commit, and push every change in the
   * current local folder. Throws if any step exits non-zero — the caller
   * is expected to surface stderr to the user.
   */
  async gitPush(message: string): Promise<{ stdout: string; stderr: string }> {
    if (!this.isAvailable()) throw new Error('Local folder mode requires the desktop build.');
    const folder = this.store.localPath();
    if (!folder) throw new Error('No folder loaded.');

    this.busy.set(true);
    this.status.set('git add -A …');

    const shell = (await import('@tauri-apps/plugin-shell')) as { Command: ShellCommandClass };

    const run = async (args: string[], step: string): Promise<{ stdout: string; stderr: string }> => {
      this.status.set(`git ${args.join(' ')} …`);
      const out = await shell.Command.create('git', args, { cwd: folder }).execute();
      if (out.code !== 0) {
        throw new Error(`${step} failed: ${out.stderr.trim() || `exit ${out.code}`}`);
      }
      return { stdout: out.stdout, stderr: out.stderr };
    };

    try {
      await run(['add', '-A'], 'git add');
      // Allow empty commit to no-op rather than fail when nothing changed.
      const status = await run(['status', '--porcelain'], 'git status');
      if (!status.stdout.trim()) {
        this.status.set('Nothing to commit.');
        return { stdout: '', stderr: '' };
      }
      await run(['commit', '-m', message], 'git commit');
      const push = await run(['push'], 'git push');
      this.status.set('Pushed.');
      return push;
    } finally {
      this.busy.set(false);
    }
  }
}

function safeJson(text: string): any {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

/** Cross-platform-ish path join. Tauri returns OS-native paths from the
 *  dialog, so we preserve whichever separator was used by detecting it. */
function join(folder: string, child: string): string {
  const sep = folder.includes('\\') && !folder.includes('/') ? '\\' : '/';
  return folder.endsWith(sep) ? `${folder}${child}` : `${folder}${sep}${child}`;
}
