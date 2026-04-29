import { DragDropModule } from '@angular/cdk/drag-drop';
import { provideHttpClient, withInterceptorsFromDi } from '@angular/common/http';
import { NgModule } from '@angular/core';
import { FormsModule, ReactiveFormsModule } from '@angular/forms';
import { MatButtonModule } from '@angular/material/button';
import { MatDialogModule } from '@angular/material/dialog';
import { MatFormFieldModule } from '@angular/material/form-field';
import { MatIconModule } from '@angular/material/icon';
import { MatInputModule } from '@angular/material/input';
import { MatSnackBarModule } from '@angular/material/snack-bar';
import { MatTabsModule } from '@angular/material/tabs';
import { BrowserModule } from '@angular/platform-browser';
import { provideAnimations } from '@angular/platform-browser/animations';
import { AgGridModule } from 'ag-grid-angular';
import { AllCommunityModule, ModuleRegistry, provideGlobalGridOptions } from 'ag-grid-community';

import { AppComponent } from './app.component';
import { AppRoutingModule } from './app-routing.module';
import { ConnectDialogComponent } from './shell/connect-dialog.component';
import { ShellComponent } from './shell/shell.component';
import { ToolbarComponent } from './shell/toolbar.component';
import { DataPreviewComponent } from './editor-data/data-preview.component';
import { LabelsEditorComponent } from './editor-labels/labels-editor.component';
import { MappingEditorComponent } from './editor-mapping/mapping-editor.component';
import { ModesEditorComponent } from './editor-modes/modes-editor.component';
import { ProcessingEditorComponent } from './editor-processing/processing-editor.component';
import { StructureEditorComponent } from './editor-structure/structure-editor.component';

ModuleRegistry.registerModules([AllCommunityModule]);
provideGlobalGridOptions({ theme: 'legacy' });

@NgModule({
  declarations: [
    AppComponent,
    ShellComponent,
    ToolbarComponent,
    ConnectDialogComponent,
    StructureEditorComponent,
    ProcessingEditorComponent,
    ModesEditorComponent,
    MappingEditorComponent,
    LabelsEditorComponent,
    DataPreviewComponent,
  ],
  imports: [
    BrowserModule,
    AppRoutingModule,
    FormsModule,
    ReactiveFormsModule,
    MatButtonModule,
    MatIconModule,
    MatTabsModule,
    MatDialogModule,
    MatFormFieldModule,
    MatInputModule,
    MatSnackBarModule,
    AgGridModule,
    DragDropModule,
  ],
  providers: [provideHttpClient(withInterceptorsFromDi()), provideAnimations()],
  bootstrap: [AppComponent],
})
export class AppModule {}
