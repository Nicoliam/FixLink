import { ChangeDetectionStrategy, Component } from '@angular/core';

@Component({
  selector: 'app-admin-settings',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<section class="admin-page admin-page-narrow"><p class="admin-eyebrow">Administration</p><h1>Settings</h1><div class="admin-state"><h2>Settings are not yet configured</h2><p>Platform settings controls are not available in this release. No settings changes can be made here.</p></div></section>`,
})
export class AdminSettingsComponent {}
