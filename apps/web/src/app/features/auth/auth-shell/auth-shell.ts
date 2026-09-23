import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import { RouterLink } from '@angular/router';

/**
 * Shared Oceanic layout for authentication screens.
 *
 * Centered Tier-1 card on the canvas background with the FixLink logo,
 * headline, projected form content and a footer navigation link.
 * Keeps login and register visually consistent without duplicating markup.
 */
@Component({
  selector: 'app-auth-shell',
  imports: [NgOptimizedImage, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './auth-shell.html',
})
export class AuthShellComponent {
  title = input.required<string>();
  subtitle = input.required<string>();
  footerPrompt = input.required<string>();
  footerLinkLabel = input.required<string>();
  footerLinkTo = input.required<string>();
}
