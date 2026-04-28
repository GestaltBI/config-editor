import { Injectable, signal } from '@angular/core';

import { ConfigStoreService } from './config-store.service';

const TOKEN_STORAGE_KEY = 'gestaltbi-config-pat';

interface ContentsResponse {
  content: string;
  encoding: 'base64';
  sha: string;
}

/**
 * Minimal GitHub REST client backed by a personal access token. The token is
 * persisted in localStorage; in a Tauri build it should be moved to the
 * tauri-plugin-store keychain for proper secure storage.
 *
 * We use the Contents API exclusively — no actual git operations — which keeps
 * the dependency surface tiny and avoids any need for git or ssh on the host.
 */
@Injectable({ providedIn: 'root' })
export class GithubService {
  readonly token = signal<string | null>(this.readToken());
  readonly busy = signal(false);
  readonly status = signal<string>('');

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
      this.status.set(`Loaded ${org}/${repo}`);
    } finally {
      this.busy.set(false);
    }
  }

  /** Push every dirty config file in a single commit-per-file pass. */
  async push(commitMessage: string): Promise<void> {
    if (!this.token()) throw new Error('GitHub token not set');
    const org = this.store.repoOrg();
    const repo = this.store.repoName();
    if (!org || !repo) throw new Error('Repo not selected');
    const ref = this.store.repoRef();

    this.busy.set(true);
    this.status.set(`Pushing to ${org}/${repo}…`);
    try {
      await this.commit(org, repo, ref, 'structure.json', JSON.stringify(this.store.structure(), null, 2), commitMessage);
      await this.commit(org, repo, ref, 'processing.json', JSON.stringify(this.store.processing(), null, 2), commitMessage);
      await this.commit(org, repo, ref, 'modes.json', JSON.stringify(this.store.modes(), null, 2), commitMessage);
      const mapping = this.store.mapping();
      if (mapping) await this.commit(org, repo, ref, 'mapping.json', JSON.stringify(mapping, null, 2), commitMessage);
      const labels = this.store.labels();
      if (labels) await this.commit(org, repo, ref, 'it.json', JSON.stringify(labels, null, 2), commitMessage);

      this.store.isDirty.set(false);
      this.status.set('Pushed.');
    } finally {
      this.busy.set(false);
    }
  }

  private headers(): HeadersInit {
    const h: Record<string, string> = {
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    };
    const t = this.token();
    if (t) h['Authorization'] = `Bearer ${t}`;
    return h;
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

  private async commit(
    org: string,
    repo: string,
    branch: string,
    path: string,
    content: string,
    message: string,
  ): Promise<void> {
    // Need the current sha of the file (if it exists) to update vs create.
    const url = `https://api.github.com/repos/${org}/${repo}/contents/${encodeURIComponent(path)}`;
    let sha: string | undefined;
    try {
      const head = await fetch(`${url}?ref=${encodeURIComponent(branch)}`, { headers: this.headers() });
      if (head.ok) {
        const j = await head.json();
        sha = j.sha;
      }
    } catch {
      /* file doesn't exist yet */
    }

    const body = {
      message,
      content: btoa(content),
      branch,
      ...(sha ? { sha } : {}),
    };

    const res = await fetch(url, {
      method: 'PUT',
      headers: { ...this.headers(), 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    });
    if (!res.ok) {
      const err = await res.text();
      throw new Error(`${res.status} ${path}: ${err}`);
    }
  }

  private readToken(): string | null {
    try {
      return localStorage.getItem(TOKEN_STORAGE_KEY);
    } catch {
      return null;
    }
  }
}
