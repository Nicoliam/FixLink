import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { NgOptimizedImage } from '@angular/common';
import type { HomeImageSlot } from '../home-images';

/**
 * Fixlynk homepage image slot.
 *
 * Renders a homepage photograph described by the `HOME_IMAGES` manifest,
 * which remains the single source of truth for every path, size and
 * description. The manifest supplies a `src` for every slot, so the
 * photograph always renders.
 *
 * The declared `width`/`height` are emitted as intrinsic attributes so the
 * browser reserves the approved box before the image loads, which prevents
 * layout shift. `src/styles.scss` supplies `object-fit: cover`, so a source
 * photograph with a different ratio is cropped rather than distorted, and
 * `width: 100%` keeps it responsive inside the existing containers.
 *
 * Accessibility:
 *  - A real `<img>` carries the descriptive `alt` from the manifest, so the
 *    photograph is exposed to assistive technology under that description
 *    and is never announced as an unlabelled box.
 *  - No caption, badge or overlay is layered onto the photograph; the
 *    `label` is descriptive metadata for the slot's subject, not rendered
 *    text, and all visible page copy lives in the surrounding markup.
 */
@Component({
  selector: 'app-home-image',
  imports: [NgOptimizedImage],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <img
      [ngSrc]="slot().src"
      [width]="slot().width"
      [height]="slot().height"
      [alt]="slot().alt"
      [class]="'fl-media-img is-' + slot().tone"
    />
  `,
  styles: [
    `
      :host {
        display: block;
      }
    `,
  ],
})
export class HomeImageComponent {
  /** Manifest entry to render. */
  readonly slot = input.required<HomeImageSlot>();
}
