import { Injectable, signal } from '@angular/core';

export type Theme = 'light' | 'dark';

const STORAGE_KEY = 'gestaltbi-config-theme';

@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly _theme = signal<Theme>('light');
  readonly theme = this._theme.asReadonly();

  init(): void {
    const stored = this.read();
    const initial: Theme =
      stored ??
      (window.matchMedia?.('(prefers-color-scheme: dark)').matches ? 'dark' : 'light');
    this.apply(initial, false);
  }
  toggle(): void {
    this.apply(this._theme() === 'dark' ? 'light' : 'dark', true);
  }

  private apply(theme: Theme, persist: boolean): void {
    this._theme.set(theme);
    document.documentElement.dataset['theme'] = theme;
    if (persist) {
      try {
        localStorage.setItem(STORAGE_KEY, theme);
      } catch {
        /* ignore */
      }
    }
  }
  private read(): Theme | null {
    try {
      const v = localStorage.getItem(STORAGE_KEY);
      return v === 'dark' || v === 'light' ? v : null;
    } catch {
      return null;
    }
  }
}
