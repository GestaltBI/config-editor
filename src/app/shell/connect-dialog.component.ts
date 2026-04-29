import { Component, signal } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

import { GithubService } from '../core/github.service';
import { LocalBackendService } from '../core/local-backend.service';

type Tab = 'github' | 'local';

@Component({
  standalone: false,
  selector: 'sbi-connect-dialog',
  templateUrl: './connect-dialog.component.html',
  styleUrls: ['./connect-dialog.component.scss'],
})
export class ConnectDialogComponent {
  readonly tab = signal<Tab>('github');

  // GitHub
  org = '';
  repo = '';
  ref = 'master';
  token: string;

  // Local
  localPath = '';

  error = '';

  constructor(
    public gh: GithubService,
    public local: LocalBackendService,
    private dialogRef: MatDialogRef<ConnectDialogComponent>,
  ) {
    this.token = gh.token() ?? '';
  }

  setTab(t: Tab): void {
    this.tab.set(t);
    this.error = '';
  }

  async pickFolder(): Promise<void> {
    this.error = '';
    try {
      const picked = await this.local.pickFolder();
      if (picked) this.localPath = picked;
    } catch (e: any) {
      this.error = e.message ?? String(e);
    }
  }

  async loadGithub(): Promise<void> {
    if (!this.org || !this.repo) {
      this.error = 'Org and repo are required.';
      return;
    }
    if (this.token) this.gh.setToken(this.token);
    try {
      await this.gh.loadRepo(this.org.trim(), this.repo.trim(), this.ref.trim() || 'master');
      this.dialogRef.close();
    } catch (e: any) {
      this.error = e.message ?? String(e);
    }
  }

  async loadLocal(): Promise<void> {
    if (!this.localPath) {
      this.error = 'Pick a folder first.';
      return;
    }
    try {
      await this.local.load(this.localPath);
      this.dialogRef.close();
    } catch (e: any) {
      this.error = e.message ?? String(e);
    }
  }

  close(): void {
    this.dialogRef.close();
  }
}

// Mark the github source kind explicitly — the existing GithubService didn't
// set it. Adding here so the toolbar can route push correctly.
