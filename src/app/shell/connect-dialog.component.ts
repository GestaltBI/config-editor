import { Component } from '@angular/core';
import { MatDialogRef } from '@angular/material/dialog';

import { GithubService } from '../core/github.service';

@Component({
  standalone: false,
  selector: 'sbi-connect-dialog',
  templateUrl: './connect-dialog.component.html',
  styleUrls: ['./connect-dialog.component.scss'],
})
export class ConnectDialogComponent {
  org = '';
  repo = '';
  ref = 'master';
  token: string;
  error = '';

  constructor(public gh: GithubService, private dialogRef: MatDialogRef<ConnectDialogComponent>) {
    this.token = gh.token() ?? '';
  }

  async load(): Promise<void> {
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

  close(): void {
    this.dialogRef.close();
  }
}
