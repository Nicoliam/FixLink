import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
// signal used for static data arrays
import { FormsModule } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';

interface ServiceItem {
  name: string;
  description: string;
  price: string;
  icon: string;
  iconClass: string;
}

interface StepItem {
  number: string;
  title: string;
  text: string;
  footer: string;
  icon: string;
  iconClass: string;
}

interface Professional {
  name: string;
  location: string;
  avatar: string;
  skills: string[];
  rating: string;
  reviews: string;
  experience: string;
  portfolio: string[];
  price: string;
}

@Component({
  selector: 'app-home',
  imports: [FormsModule, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './home.html',
  styleUrls: ['./home.scss'],
})
export class HomeComponent {
  protected searchNeed = '';
  protected searchLocation = '';

  protected readonly services = signal<ServiceItem[]>([
    { name: 'General Handyman', description: 'Fixes, mounting & repairs', price: 'R350', icon: 'handyman', iconClass: 'primary-fixed' },
    { name: 'Plumbing', description: 'Leaks, geysers, pipes', price: 'R450', icon: 'plumbing', iconClass: 'secondary-container' },
    { name: 'Electrical', description: 'Wiring, DB boards, solar', price: 'R450', icon: 'bolt', iconClass: 'primary-fixed' },
    { name: 'Painting', description: 'Interior & exterior coating', price: 'R380', icon: 'format_paint', iconClass: 'secondary-container' },
    { name: 'Carpentry', description: 'Cabinets, doors & decking', price: 'R420', icon: 'carpenter', iconClass: 'primary-fixed' },
    { name: 'Tiling', description: 'Floor, wall & patio paving', price: 'R400', icon: 'grid_view', iconClass: 'secondary-container' },
    { name: 'Building', description: 'Plastering, brickwork, walls', price: 'R500', icon: 'home_repair_service', iconClass: 'primary-fixed' },
    { name: 'Home Maintenance', description: 'Gutters, waterproofing, roofs', price: 'R390', icon: 'roofing', iconClass: 'secondary-container' },
    { name: 'Gardening', description: 'Landscaping, cleanups, trees', price: 'R300', icon: 'yard', iconClass: 'primary-fixed' },
    { name: 'Appliance Repairs', description: 'Fridges, washers, ovens', price: 'R420', icon: 'kitchen', iconClass: 'secondary-container' },
  ]);

  protected readonly steps = signal<StepItem[]>([
    { number: '01', title: 'Tell us what you need', text: 'Describe your job and upload photos so artisans can assess the scope accurately.', footer: 'Instant request', icon: 'edit_note', iconClass: 'primary-fixed' },
    { number: '02', title: 'Find the right professional', text: 'Compare experience, previous work, certificates and reviews from local clients.', footer: 'Verified portfolios', icon: 'badge', iconClass: 'secondary-container' },
    { number: '03', title: 'Get a quote', text: 'Review the quote in South African Rand (ZAR) and choose your preferred professional.', footer: 'No hidden fees', icon: 'receipt_long', iconClass: 'primary-fixed' },
    { number: '04', title: 'Get the job done', text: 'Communicate, complete the job safely and release payment after leaving a verified review.', footer: 'Satisfaction guarantee', icon: 'task_alt', iconClass: 'secondary-container' },
  ]);

  protected readonly professionals = signal<Professional[]>([
    {
      name: 'Thabo Mokoena',
      location: 'Fourways, Sandton',
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuAGiq36KEEfetl6hgxAm2QV-ExdQ050_oTRbfEdBLpVZc2u51geNRLvMBQ3aHQUbMNePCZ3bRodMm0Z6IayBaIrVAXqBnxVEcbhy6FcMFNxenEa3Lw57vldRUmWcQ7DPU-KWmK7fFzyhRyJF-kOZi4JyLE2rRqFBcPQGaxnGuDXokrMtRTUGiHjQZvJfLEEqleHJk34knFiBL8X97tNuwMYeJekJejvDGv1hMVBNbFg8UKmPQ76TE2jAQ',
      skills: ['General Handyman', 'Plumbing', 'Painting'],
      rating: '4.8',
      reviews: '42',
      experience: '5+ years exp.',
      portfolio: [
        'https://lh3.googleusercontent.com/aida-public/AB6AXuD24659PbNKx-czMc-CxLbPsJYpqGWKBoiQjhbUFwG9dkMIPHQIyR0Q94gI-E9g-_YwTGiXBSjfh4_bMY016RKcph2Qb_P2-omFpiaLJ3dusIvJc7W65YGG9iCmtxwqYBaOKgTMZrhG0b8PWrAnv5sBQyBNuJ389Vy-eCRsv2k_Rh6P63WNaHYDdVKW-0Kd2SkLITlLrgmm2LwOYmKuobK8xVfUG_fPPR6v2S-fEBFklbMxPmrzyqr72Q',
        'https://lh3.googleusercontent.com/aida-public/AB6AXuCJMxk5wH3AvQLtjpwqODSvoRFXsU75B_8Ew2CQZCdDS4XOSbi3nIPGh4SR5z0NDgk1h34kvdbNeV9KkUgq4X0s21TyqXnrxUMwblfEgLglLS5pNP7OpUaublYgcQq8pervj5n2cDncmvZ-K_FADjpykNQLwJO14N_mt45K6_rVSm8a6pvdkibH35EsN15v5F9D_cfZY-ckdmwti26VK54qpbL9XwdzHwvuqUc_MGQssb34xeZ6zOuPjw',
        'https://lh3.googleusercontent.com/aida-public/AB6AXuCI7suRUn17nEP0WgIVDM5sehTyaXiBs9zNhl7cSmFIsDCuIJ_HN3uRjLZrqkk6-8H57Ub4i9hhpisHoL98uLlH0UUDcop2-0JJ__Ck8hysm15h_WuGa8wsRy2HLjZ0Q2Czgh6z6vYFGNvlJZsldIIYgTNQ1x5G5j7uFf9BCjOvN9lg-xXFmdEraGJaG0v0hRpPzszl4mvZeoh7DXaLQmIGEXS_5zLP2AwmscPDO-8iZJu7UkioZkX9uA',
      ],
      price: 'R350',
    },
    {
      name: 'Sipho Ndlovu',
      location: 'Sandton Central',
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDTMJwQe0A-yekgc01zY2QJiPYkqoxJdb6am7kflMZ_kO7XqmK12SalJZlrWPjOFxlNnG__b2LwVlhMBndoY_Cthp7axw0JZaqI7Tf3_aV5t_AND7R6vI9cug6-Ret5drNMwUMI2InrnVoNVkKAGJHdstgm0g4xCrmRq-Aq04-4uM5uN25iLnIJYNZWSDq39Fef9alVkkeUkSbTpDTlORpYptuhDp3LbrL-TQsE3MZuc0rhPbDlcavQJw',
      skills: ['Master Electrician', 'Solar Backup', 'COC Certificates'],
      rating: '4.9',
      reviews: '58',
      experience: '8+ years exp.',
      portfolio: [
        'https://lh3.googleusercontent.com/aida-public/AB6AXuBanrsw9beY2TGsfIAOsYh5zDqMK_vikNktyyjJtZKIILbaZ0_LQRgOVhVILOG91Td4I5H1VrDWO5bmI1v8cqvF66ix18gPl5_GwYO3fvevjrgIecLRcu6P5iGVdhBlQbxowwHQWKbQ17dKC4qJkIKsrp8JZVclZAi7d-Gw5_ZnbhexaT5BaEFeUJcml6TyKBTXv7dLNlW-fHWwI2NU4K2iSvfPWmGLZgVO97IVdZeHvTDvw8Idv7iP8w',
        'https://lh3.googleusercontent.com/aida-public/AB6AXuBstc00g4opQd_Pl03VNAWIGe02FYqdYNc8HsEp05ow2R44tAWwWnFKr3K2Vupbh_E_OKnUN2h7MZKtw1LPlAWCnlijRn_9lBoBEd1w88DBRj96WAtxFRawkxhDgD-oIl4Gfm1BbnhiW5a5GmZlqsgR8yKFkkEmXSoxWEgfXIdUMKdQ-oL2IIWgM0S2B997iC4vatsQXsrp6Y2bHUYBmHpisWR6GFgHj6x1jngl20lmj46SP95yZHwFAA',
        'https://lh3.googleusercontent.com/aida-public/AB6AXuDaFar5thH713b8uxFVRvaBrpgzqhYToA2X3fuq5rXUYx7cBsbL_MRsIA5JXMzE-A1TRkL4HSMbbRHam9V-u3KfMhLTh8Cs9g8DnV7QlJHqr6NX1viwH8Trm2bCQuWPfbEihj7mTSiyjd1AW44mKaVBWb7ViVNqv3izOlUxCurMUs8SzTnilZO8ti3SnzFk1nLTRaHiUjRg6w1BUexJpaPVtQaPjo50jOCmKUILMVFrGGKsp1_1s4qF8g',
      ],
      price: 'R450',
    },
    {
      name: 'Johan van der Merwe',
      location: 'Bryanston East',
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDfzD9-LJF1AYruksRnkyXx-m0Whm-W687HQBEKSAkVp-l6bOls2Ec8PTgA-SFNFLbIL89nkSYAhPJuCmWSO5TsfWBcii4sMq0yYPvIHtBeJKBt_Dv5d6UioogxlOiL8HXGYUrZ2pxjDTYsmEaskSFM_7GOyCFPUM6JmA-JXDs-dly7XivLsWF6Tcck_8V8Rn2ygpUBEfeqeSvRVgoT_jTDzW8e9Mm4UFobDkQLJOwxzIWn4HGkBWgt-w',
      skills: ['Precision Carpentry', 'Porcelain Tiling', 'Decking'],
      rating: '4.7',
      reviews: '36',
      experience: '6+ years exp.',
      portfolio: [
        'https://lh3.googleusercontent.com/aida-public/AB6AXuB-MhBmEAQzbH01rnpng4k58itOTlthA3MtmGXe2E_4LicrZaSS1Ijo6Tx2lHAU-y3Bw_-hHSmQGuB-76zkWl6FyM7jCaYemrYf20bdm7tAZAdnMWp8-H1nx1Z_5oPxPRoZALW4XAVjdZOkpNDAwSDcI0SwOonIlqGk3YdQOBR_99Qr18GWe_YeqJ5OVqIrNLW6NIyR3tLOIoSnr0E6sX4xJNHT8yILcVAj7GXiSwGciDkhwHn_vr85NQ',
        'https://lh3.googleusercontent.com/aida-public/AB6AXuCg91NUUbwGq8VQV44xF0AB-SP56DZedCVHcX0q2qAUhqXFZFJ3VmLs5opSCRuV_UNGFGTuVRqHh5CH64kdFGFARR0MOaFGOVoT__Q4NjshK9h_upEATXLfiChzP4IOSRRgyJTQ8FoPPlyansnUPeEf3XA2y1KpeacglBwqbZmjHvDZeBcMwKAxOpCYjHbTvJLqXwx46Vtf60W-eQv9NK01Ue5ZYFWvfH_uEzv6ZZfLDpm1mQ2J3JKkQ',
        'https://lh3.googleusercontent.com/aida-public/AB6AXuCqT4ucMnKiZNPtdGRlGLcpAZOmaZhnhSkeHqebuVMBivXmd_2wOuOEJsLkAWdn1XdMikiCQMTTIWIESpoFiM0cc0NSIdzBvzE7eRxatrTn-cMIHg9RA5q6DsiBprxONghnLe6OJNaIthgrj7z7uiNZOlzXxJxc91E0kAb6mW8TAPVhVOdJuc99D2P8X_-0EkWaRCZmMUlxSNO4HtLBoLF7FCAYCVnXrvHz90Nh4a1y12UrEThtMjSbg',
      ],
      price: 'R400',
    },
  ]);

  private readonly router = inject(Router);

  protected onSearch(): void {
    void this.router.navigate(['/marketplace'], {
      queryParams: {
        service: this.searchNeed || null,
        location: this.searchLocation || null,
      },
    });
  }
}
