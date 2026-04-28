import { Component } from '@angular/core';

import { ThemeService } from './core/theme.service';

@Component({
  standalone: false,
  selector: 'sbi-root',
  template: '<router-outlet></router-outlet>',
})
export class AppComponent {
  constructor(themeService: ThemeService) {
    themeService.init();
  }
}
