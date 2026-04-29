import { Injectable, signal } from '@angular/core';

import { ConfigStoreService } from './config-store.service';

const TOKEN_STORAGE_KEY = 'gestaltbi-config-pat';

interface ContentsResponse {
  content: string;
  encoding: 'base64';
  sha: string;
}

interface FilePayload {
  path: string;
  content: string;
}

/**
 * Minimal GitHub REST client backed by a personal access token. The token is
 * persisted in localStorage; in a Tauri build it should move to the
 * tauri-plugin-store keychain for proper secure storage.
 *
 * Reads use the Contents API (one call per file). Writes use the Git Data
 * API to bundle every changed file into a single commit:
 *   1. resolve current ref → commit sha → tree sha
 *   2. create blobs for each new file
 *   3. create a tree referencing the prior tree + the new blobs
 *   4. create a commit pointing at the new tree
 *   5. fast-forward the ref to the new commit
 */
@Injectable({ providedIn: 'root' })
export class GithubService {
  readonly token = signal<string | null>(this.readToken());
  readonly busy = signal(false);
  readonly status = signal<string>('');
  /** sha of the most recent commit pushed by this app session, used to
   *  build a SHA-pinned preview URL after a successful push. */
  readonly lastCommitSha = signal<string | null>(null);

  constructor(private store: ConfigStoreService) {}

  setToken(token: string): void {
    this.token.set(token);
    try {
      localStorage.setItem(TOKEN_STORAGE_KEY, token);
    } catch {
      /* ignore */
    }
  }
  clearToken(): void {
    this.token.set(null);
    try {
      localStorage.removeItem(TOKEN_STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }

  /** Load the six config files from a repo into the store. */
  async loadRepo(org: string, repo: string, ref = 'master'): Promise<void> {
    this.busy.set(true);
    this.status.set(`Loading ${org}/${repo}@${ref}…`);
    try {
      this.store.repoOrg.set(org);
      this.store.repoName.set(repo);
      this.store.repoRef.set(ref);

      const [structure, processing, modes, mapping, labels, dataCsv] = await Promise.all([
        this.fetchJson<any>(org, repo, ref, 'structure.json'),
        this.fetchJson<any>(org, repo, ref, 'processing.json'),
        this.fetchJson<any>(org, repo, ref, 'modes.json'),
        this.fetchJson<any>(org, repo, ref, 'mapping.json').catch(() => null),
        this.fetchJson<any>(org, repo, ref, 'it.json').catch(() => null),
        this.fetchText(org, repo, ref, 'data.csv').catch(() => null),
      ]);

      this.store.structure.set(structure);
      this.store.processing.set(processing);
      this.store.modes.set(modes);
      this.store.mapping.set(mapping);
      this.store.labels.set(labels);
      this.store.dataCsv.set(dataCsv);
      this.store.isLoaded.set(true);
      this.store.isDirty.set(false);
      this.lastCommitSha.set(null);
      this.status.set(`Loaded ${org}/${repo}`);
    } finally {
      this.busy.set(false);
    }
  }

  /**
   * Bundle every config file into a single atomic commit via Git Data API.
   * Returns the new commit sha.
   */
  async push(commitMessage: string): Promise<string> {
    if (!this.token()) throw new Error('GitHub token not set');
    const org = this.store.repoOrg();
    const repo = this.store.repoName();
    if (!org || !repo) throw new Error('Repo not selected');
    const branch = this.store.repoRef();

    this.busy.set(true);
    this.status.set(`Pushing to ${org}/${repo}…`);

    try {
      const files: FilePayload[] = [];
      const s = this.store.structure();
      const p = this.store.processing();
      if (s) files.push({ path: 'structure.json', content: JSON.stringify(s, null, 2) });
      if (p) files.push({ path: 'processing.json', content: JSON.stringify(p, null, 2) });
      files.push({ path: 'modes.json', content: JSON.stringify(this.store.modes(), null, 2) });
      const mapping = this.store.mapping();
      if (mapping) files.push({ path: 'mapping.json', content: JSON.stringify(mapping, null, 2) });
      const labels = this.store.labels();
      if (labels) files.push({ path: 'it.json', content: JSON.stringify(labels, null, 2) });

      // 1. Current ref → commit sha → tree sha.
      const refRes = await this.api(`repos/${org}/${repo}/git/ref/heads/${branch}`);
      const refJson = await refRes.json();
      const parentCommitSha: string = refJson.object.sha;

      const commitRes = await this.api(`repos/${org}/${repo}/git/commits/${parentCommitSha}`);
      const commitJson = await commitRes.json();
      const baseTreeSha: string = commitJson.tree.sha;

      // 2. Blob per file.
      const blobs = await Promise.all(
        files.map(async (f) => {
          const r = await this.api(`repos/${org}/${repo}/git/blobs`, {
            method: 'POST',
            body: JSON.stringify({ content: f.content, encoding: 'utf-8' }),
          });
          const j = await r.json();
          return { path: f.path, sha: j.sha as string };
        }),
      );

      // 3. New tree referencing prior tree + the new blobs.
      const treeRes = await this.api(`repos/${org}/${repo}/git/trees`, {
        method: 'POST',
        body: JSON.stringify({
          base_tree: baseTreeSha,
          tree: blobs.map((b) => ({ path: b.path, mode: '100644', type: 'blob', sha: b.sha })),
        }),
      });
      const treeJson = await treeRes.json();
      const newTreeSha: string = treeJson.sha;

      // 4. New commit on top of parent.
      const newCommitRes = await this.api(`repos/${org}/${repo}/git/commits`, {
        method: 'POST',
        body: JSON.stringify({
          message: commitMessage,
          tree: newTreeSha,
          parents: [parentCommitSha],
        }),
      });
      const newCommitJson = await newCommitRes.json();
      const newCommitSha: string = newCommitJson.sha;

      // 5. Fast-forward the branch.
      await this.api(`repos/${org}/${repo}/git/refs/heads/${branch}`, {
        method: 'PATCH',
        body: JSON.stringify({ sha: newCommitSha, force: false }),
      });

      this.store.isDirty.set(false);
      this.lastCommitSha.set(newCommitSha);
      this.status.set(`Pushed @${newCommitSha.substring(0, 7)}`);
      return newCommitSha;
    } finally {
      this.busy.set(false);
    }
  }

  /** Build the SHA-pinned `gh/<org>/<repo>/<sha>` preview URL on
   *  gestaltbi.github.io. Falls back to the branch ref if no commit
   *  has been pushed this session yet. */
  previewUrl(): string {
    const org = this.store.repoOrg();
    const repo = this.store.repoName();
    const ref = this.lastCommitSha() ?? this.store.repoRef();
    return `https://gestaltbi.github.io/gestaltbi-core/gh/${org}/${repo}/${ref}`;
  }

  private headers(extra: Record<string, string> = {}): HeadersInit {
    const h: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
      ...extra,
    };
    const t = this.token();
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
  }

  private async api(path: string, init: RequestInit = {}): Promise<Response> {
    const url = `https://api.github.com/${path}`;
    const headers = this.headers(
      init.body ? { 'Content-Type': 'application/json' } : {},
    );
    const res = await fetch(url, { ...init, headers });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${res.status} ${path}: ${err}`);
    }
    return res;
  }

  private async fetchJson<T>(org: string, repo: string, ref: string, path: string): Promise<T> {
    const text = await this.fetchText(org, repo, ref, path);
    return JSON.parse(text);
  }

  private async fetchText(org: string, repo: string, ref: string, path: string): Promise<string> {
    const url = `https://api.github.com/repos/${org}/${repo}/contents/${encodeURIComponent(path)}?ref=${encodeURIComponent(ref)}`;
    const res = await fetch(url, { headers: this.headers() });
    if (!res.ok) throw new Error(`${res.status} ${path}`);
    const json = (await res.json()) as ContentsResponse;
    return atob(json.content.replace(/\n/g, ''));
  }

  private readToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  }
}
