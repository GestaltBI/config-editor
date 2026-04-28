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
    const message = prompt('Commit message', 'config: update from editor') ?? 'config: update from editor';
    try {
      await this.gh.push(message);
    } catch (e: any) {
      alert(`Push failed: ${e.message ?? e}`);
    }
  }

  toggleTheme(): void {
    this.theme.toggle();
  }
}
