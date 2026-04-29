import { Component } from '@angular/core';
import { MatDialog } from '@angular/material/dialog';

import { ConfigStoreService } from '../core/config-store.service';
import { GithubService } from '../core/github.service';
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
    public theme: ThemeService,
    private dialog: MatDialog,
  ) {}

  connect(): void {
    this.dialog.open(ConnectDialogComponent, { width: '480px' });
  }

  async push(): Promise<void> {
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

  /**
   * Open the deployed gestaltbi-core preview for the current repo at the
   * latest pushed commit. If running inside Tauri, route through the shell
   * plugin so the URL opens in the user's default browser; in the browser
   * dev shell, fall back to window.open.
   */
  async openPreview(): Promise<void> {
    const url = this.gh.previewUrl();
    try {
      // Lazy import so the browser dev build doesn't try to evaluate the
      // Tauri plugin module when the runtime APIs aren't available.
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
