import { CdkDragDrop, moveItemInArray } from '@angular/cdk/drag-drop';
import { Component } from '@angular/core';

import { ConfigStoreService, ModeEntry } from '../core/config-store.service';

const MDI_ICONS = [
  'ab-testing',
  'vector-intersection',
  'chart-bubble',
  'chart-gantt',
  'align-horizontal-left',
  'chart-timeline-variant',
  'chart-bar',
  'chart-line',
  'map-search',
  'table-large',
];

@Component({
  standalone: false,
  selector: 'sbi-modes-editor',
  templateUrl: './modes-editor.component.html',
  styleUrls: ['./modes-editor.component.scss'],
})
export class ModesEditorComponent {
  readonly icons = MDI_ICONS;

  constructor(public store: ConfigStoreService) {}

  drop(event: CdkDragDrop<ModeEntry[]>): void {
    const modes = [...this.store.modes()];
    moveItemInArray(modes, event.previousIndex, event.currentIndex);
    this.store.modes.set(modes);
    this.store.markDirty();
  }

  update(i: number, patch: Partial<ModeEntry>): void {
    const modes = [...this.store.modes()];
    modes[i] = { ...modes[i], ...patch };
    this.store.modes.set(modes);
    this.store.markDirty();
  }

  addButton(): void {
    this.store.modes.set([
      ...this.store.modes(),
      { type: 'button', id: 'new-mode', labelKey: 'modes.newMode', icon: 'chart-line' },
    ]);
    this.store.markDirty();
  }

  addDivider(): void {
    this.store.modes.set([...this.store.modes(), { type: 'divider' }]);
    this.store.markDirty();
  }

  remove(i: number): void {
    const modes = [...this.store.modes()];
    modes.splice(i, 1);
    this.store.modes.set(modes);
    this.store.markDirty();
  }
}
