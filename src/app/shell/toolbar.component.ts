import { Component } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { ConfigStoreService } from '../core/config-store.service';
import { GithubService } from '../core/github.service';
import { LocalBackendService } from '../core/local-backend.service';
import { ThemeService } from '../core/theme.service';
import { ConnectDialogComponent } from './connect-dialog.component';

@Component({
  standalone: false,
  selector: 'sbi-toolbar',
  templateUrl: './toolbar.component.html',
  styleUrls: ['./toolbar.component.scss'],
})
export class ToolbarComponent {
  constructor(
    public store: ConfigStoreService,
    public gh: GithubService,
    public local: LocalBackendService,
    public theme: ThemeService,
    private dialog: MatDialog,
  ) {}

  busy(): boolean {
    return this.gh.busy() || this.local.busy();
  }

  status(): string {
    return this.gh.status() || this.local.status();
  }

  connect(): void {
    this.dialog.open(ConnectDialogComponent, { width: '560px' });
  }

  async push(): Promise<void> {
    const kind = this.store.sourceKind();
    if (kind === 'github') return this.pushGithub();
    if (kind === 'local') return this.pushLocal();
    this.connect();
  }

  private async pushGithub(): Promise<void> {
    if (!this.gh.token()) {
      this.connect();
      return;
    }
    const message = prompt('Commit message', 'config: update from editor');
    if (message === null) return;
    try {
      await this.gh.push(message || 'config: update from editor');
    } catch (e: any) {
      alert(`Push failed: ${e.message ?? e}`);
    }
  }

  private async pushLocal(): Promise<void> {
    try {
      const written = await this.local.save();
      if (!this.store.localIsGitRepo()) {
        // Not a git repo — files saved, leave the rest to the user.
        return;
      }
      const message = prompt(
        `Saved ${written} file${written === 1 ? '' : 's'}. Commit & push to remote?\n\nCommit message:`,
        'config: update from editor',
      );
      if (message === null) return; // user cancelled the git step; files still saved
      await this.local.gitPush(message || 'config: update from editor');
    } catch (e: any) {
      alert(`Push failed: ${e.message ?? e}`);
    }
  }

  async openPreview(): Promise<void> {
    if (this.store.sourceKind() !== 'github') {
      alert(
        'Live preview is only available for GitHub-backed repos — gestaltbi-core fetches the config from jsDelivr.',
      );
      return;
    }
    const url = this.gh.previewUrl();
    try {
      const tauri = (window as any).__TAURI_INTERNALS__;
      if (tauri) {
        const { open } = await import('@tauri-apps/plugin-shell');
        await open(url);
      } else {
        window.open(url, '_blank', 'noopener');
      }
    } catch {
      window.open(url, '_blank', 'noopener');
    }
  }

  toggleTheme(): void {
    this.theme.toggle();
  }
}
