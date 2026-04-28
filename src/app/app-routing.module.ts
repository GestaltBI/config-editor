import { NgModule } from '@angular/core';
import { RouterModule, Routes } from '@angular/router';

import { ModesEditorComponent } from './editor-modes/modes-editor.component';
import { ProcessingEditorComponent } from './editor-processing/processing-editor.component';
import { StructureEditorComponent } from './editor-structure/structure-editor.component';
import { ShellComponent } from './shell/shell.component';

const routes: Routes = [
  {
    path: '',
    component: ShellComponent,
    children: [
      { path: '', redirectTo: 'structure', pathMatch: 'full' },
      { path: 'structure', component: StructureEditorComponent },
      { path: 'processing', component: ProcessingEditorComponent },
      { path: 'modes', component: ModesEditorComponent },
    ],
  },
];

@NgModule({
  imports: [RouterModule.forRoot(routes)],
  exports: [RouterModule],
})
export class AppRoutingModule {}
