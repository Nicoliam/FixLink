import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { FormsModule } from '@angular/forms';

interface FilterCategory {
  name: string;
  checked: boolean;
}

interface ProfessionalResult {
  id: string;
  name: string;
  location: string;
  distance: string;
  avatar: string;
  rating: string;
  reviews: string;
  responseTime: string;
  price: string;
  badges: { icon: string; label: string; class: string }[];
  skills: string[];
  portfolio: { src: string; label: string }[];
}

@Component({
  selector: 'app-marketplace',
  imports: [FormsModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './marketplace.html',
  styleUrls: ['./marketplace.scss'],
})
export class MarketplaceComponent {
  protected searchService = 'Plumbing, painting, carpentry...';
  protected searchLocation = 'Fourways, Sandton, Johannesburg';

  protected readonly categories = signal<FilterCategory[]>([
    { name: 'General Handyman', checked: true },
    { name: 'Plumbing', checked: true },
    { name: 'Electrical', checked: true },
    { name: 'Painting', checked: false },
    { name: 'Carpentry', checked: false },
    { name: 'Tiling', checked: false },
    { name: 'Appliance Repair', checked: false },
  ]);

  protected readonly verifiedOnly = signal(true);
  protected readonly verifiedCerts = signal(true);
  protected readonly availableToday = signal(true);
  protected readonly thisWeekend = signal(false);
  protected readonly distanceRadius = signal(10);
  protected readonly minRating = signal('4.5');
  protected readonly priceRange = signal(850);

  protected readonly results = signal<ProfessionalResult[]>([
    {
      id: '1',
      name: 'Thabo Mokoena',
      location: 'Fourways, Johannesburg',
      distance: '3.2km away',
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD64U8loB4FotjpZwJDUQ0qOxYnyRyBk7X2FJLKLEUmZvNb1j_F66LPr572_lUvTVqtF57QiuZK9XcKifZp0Z-qk1iPo0mnlBLEgWWyemqtuBtECTOMFwvsqKxD2wd2L6w3EoTk5BqlZA3neh8lEd7UBKlAwYQE1VmqDH2VKM_L6UhzY7HD4FA7yurHsepC933ZWjPlr1JM5PzfFO3hCRqjbMI9B9cW82skgbVVc0-u7NJomD5VK5yOFg',
      rating: '4.8',
      reviews: '42',
      responseTime: '1 hr response',
      price: 'From R350',
      badges: [
        { icon: 'verified', label: 'Verified Professional', class: 'verified' },
        { icon: 'badge', label: 'ID Checked', class: 'neutral' },
        { icon: 'construction', label: '5+ years exp • 42 jobs', class: 'neutral' },
      ],
      skills: ['Plumbing', 'General Handyman', 'Painting'],
      portfolio: [
        { src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBvWHgFdKLTk3qq4GoJPo9zyqv8mZsKCC-ohtJCZ5iIZRJUBFJZLPJAXsBfiIvp9R-vxLQlfasA-hPbpeY6v_EiMadez5oUW79dr75Dc1PTgpohJUj3UEEL2_CGifJuXm1yHv7BKkYj92UrjU-CgAg0E9BSHRUidDrvduy26gnSDE09VH7b9_u4ljm4bIROECc5j7J6gVcQ0z0W_9QyFZJmckTh2Q5ny2nNLEJezTh33m8uP51DshSgHg', label: 'Bathroom Reno' },
        { src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBjJSfGpTwGwwk2qS7L5qWnXYNnSt60F8KCkC1h57l0lHaN7whb5DTasAZfkKnzF8k4ctxAXlj9rhDor2Eifkg1YKQ07pKwNRN2yvQR5n84L75HYirPjTSxhzLcCNCkKNtg2lsT2g0kaWNYuvAxG6-X24vOzTAJiFPELtZeJDDRbTa88qrId8vxO55Rg7c-X4Xnm09s_FCgfAf5JYYXg342sj99zu2qiTJBtLdDtR7dsxs0fIrJUQGQQQ', label: 'Pipe Replacement' },
        { src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDCj1dyeyxsIAbMUfdhzQkK9UN-HSTYEvdsuO6HW0awibXl6X0n_hNl6Be6PCeKV-CbH8dvX1M5d16W22-IiAuf9QWSXTO5HSyxJdCTdcCujtc5SjFls6MxVg6dQSGJB_FImDmwAhlwv1Tm67r6roIo40MqLSp3u0GNmkKZBlklbs4urTZouGMEe79ECwERxr7EGwGI8gqDAu-B3AAVfbNMzyAkArFA2s09ZvrFfIoWWX_jTB7wIse3rA', label: 'Wall Repair' },
      ],
    },
    {
      id: '2',
      name: 'Sipho Ndlovu',
      location: 'Sandton',
      distance: '5.8km away',
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB1Kfxa9h9ynfpUeVkEriQmhqCs18sX-jgeL0L3UfK_AfZTeoNpNGYnJLeTQtjUeXQkuqS13R-FIXVyzPb_m4TNiATrFa5pGKxpyHll2CHn8X1om-mz5Ejwht999tjRzhhLZial4mygwugc4qQ2atkXkarTDTCdMnMVhNvgEw_WNsFi1GQWU6_hRHkkuxenSyA-WMtrGEuwMpoiaVNyRz8G-MHNlx7cTfTpNPnGy1FBMQONJYcONmml4g',
      rating: '4.9',
      reviews: '58',
      responseTime: '30 min response',
      price: 'From R450',
      badges: [
        { icon: 'verified', label: 'Verified Professional', class: 'verified' },
        { icon: 'workspace_premium', label: 'Master Certificate', class: 'certificate' },
        { icon: 'bolt', label: '8+ years exp • 87 jobs', class: 'neutral' },
      ],
      skills: ['Electrical Wiring', 'Solar & Inverter', 'Fault Finding'],
      portfolio: [
        { src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuARz0hLHfz75AbaWt2GwTKMYX9fS80IPBdMB-gqdUrM6xsjFOiGq8hgvOyLsEez1K4lbuUeLEEzrOMjX3QkG8uWAA8fCLrXuqwXRIXhPoqmE1z_3jOoF8L9mwwVKZaxA_hWkR43YTfjVv6IE2k8QwmdkbLM6i6EBsm9w-dDOmMTsGMWWLVvGIAy1SFnUO52v5_jRWqaQAxe2C7PqWTgFr1CgHchguEfWimi-yvZTvEx8XyAF3elx0hfOQ', label: 'Solar Inverter' },
        { src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuB_OtnwrFD5fS0CNpvj1_XExFGGd-mYzxhZ9FIjrW5ZYFBj9B18dbImwrJ3o-kC1yBxI0WAvv7UmxG098ph2c9SgJrU32P2cKRjWaHxURNqXmQDF3RzHv8Jh2brUK_A9cBH6wi4nq0xlhu9nkGIUyZloafF-XCApE_zGXBD-tRDD-vC-xaimylGA_KvGCn7VxWoiV4xJGNLFKUDKfb1gpAgN-pZMnV24odp5mMIhsQ86154bNJ6FK4FAA', label: 'DB Board Upgrade' },
        { src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDmTdurAKDJPHvNv4QwA43TDUWhEtOHSgPbnZNeJGAElB3fDTmKm67ga2jQj7gdptzOq7VxxHIPJ8WjLVe8EmOwpOtdwwsJ3-jISq7qu0S4hIoKcARnQhArqlypznf7rTVLHpuGf3-Vc53OEhBk0jhahr9Njs-6x0z2Ix9Kd-Jl1_b9b28uIqrkEvzc664Fp6kwB-xfjd3cO_j4CdpqKXsxyx7ZivGtbf-OKqF6mEJ0wgOJFok6MRfIPA', label: 'Smart Downlights' },
      ],
    },
    {
      id: '3',
      name: 'Johan van der Merwe',
      location: 'Bryanston',
      distance: '6.1km away',
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBz8fIfPmrxmIDxl99M2FewLle2hIBO0IoKqj5lAMxOLxZ9Rc9G5lh-3M6uZcEJHiC6U0AJwPcQ0I6c17FBrt5fwodmvA3moisyjrhSEKW-kSkVZ6jsKlQJDFnLndp3gTBVLSu5b5twzj2dUZ7Tf7NuDbNEe2LMIp9SjBZI89XvScgbAbOf11zQCmqU5m2i5IRHRbs1N_Iczjkqja4EX-oElAy83JzWxn7uSHlvzGNiuCmBDHTnJTVk_Q',
      rating: '4.7',
      reviews: '36',
      responseTime: '2 hr response',
      price: 'From R400',
      badges: [
        { icon: 'verified', label: 'Verified Professional', class: 'verified' },
        { icon: 'carpenter', label: '6+ years exp • 51 jobs', class: 'neutral' },
      ],
      skills: ['Custom Carpentry', 'Cabinet Repairs', 'Tiling'],
      portfolio: [
        { src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD726NXPJXwwkxV6YtsETACuTKR5U5CsCDrSbEowB4n5bMNoBhfT35hgVy5BoJBvFEQJnYoWq93IjxsP-fJhS8AwWM24PGqfqdHUG7uNP4quuSz_VkVM1Z0XP7FORsNy6pmNKqafMiIhzLWtUyq4wn2RpoYUExv0uJNPUbDxfnMf2S-9ZjIil2mvSYUWchWAms3SznxIy5vZykUotJAH2aZXMCBpFJEYs_N3AFRIKDaO-5KxlBAoFKYUA', label: 'Oak Cabinets' },
        { src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuBcCxnqfAX82yUg5tkTHp5ZDxjyGiIva3LV-iXBGgQKxhKTrAzxEkvn1-ebd_nN0-CHISFVDcb-Ni1o1IMv_ErkDjWra0WYi9jBriS-1LLSOosWoCYI9kzAb5N3_Mmi5J0N3XIazqByKS8djOvzTTy3RsV0FT4BFQEhLYZ7S18BgurDlwljf3Idxpn1PNjkondKAkIrdjIb6mYlYCFS0Cu8Nu1mBLZyODVuSGvjqJ80wAdogbmxCXH_ZA', label: 'Porcelain Tiling' },
        { src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDy-zssQjUOTBIwT2iGXe7gmAiduZthoR376a0YnDAPFV8WNaQovfp5Qq7PgUAn74sdzw4PgFn8sxWI54hwDRMlCTDwJN3h-zymX-LJKnU3he_-Hk52UiL01kq4OKHkrNIuraS5d1S719o5ERjqtHRNUlkhz2YVqV_ZfXz_1fobP_4LXWQ9G16Zz7bRUtES9qt-Q7RfzMJfFBF3k2o0nUg76IzaKcK3PBG-U9AYpUHfhxlKPKHh-7_nLg', label: 'Table Restoration' },
      ],
    },
    {
      id: '4',
      name: 'Blessing Moyo',
      location: 'Randburg',
      distance: '8.4km away',
      avatar: 'https://lh3.googleusercontent.com/aida-public/AB6AXuD_gpuGPkSx-OjNctuCdCvrEMl-5Rx40bKr5_Ba-plXQGchAvUtEwD8Cc2DTce5gnNL1R7Q-QlcEC64ZvbLURwfteXsP62kx6-AkYRc4Rrb4dZbLYpCn6kRVA9qrRjNL3FggnC5TqqW-NXlmkvE0X0QX4U_Hdi0orUhJHn3NYOoKwmV9ZCjHtusMNACUSU0n4ivbAq8EOcbHFQ34ZOSVGHilJs4cvXVjyGYWcvzjmW_3fyIqszMt6R6fQ',
      rating: '4.8',
      reviews: '29',
      responseTime: '45 min response',
      price: 'From R320',
      badges: [
        { icon: 'verified', label: 'Verified Professional', class: 'verified' },
        { icon: 'format_paint', label: '4+ years exp • 38 jobs', class: 'neutral' },
      ],
      skills: ['Painting', 'Waterproofing', 'Plastering'],
      portfolio: [
        { src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDoC2ZozqkS2MSIz3mW9aNnm8xcpw_SRtrYIvHyxMiGkWW7B2K30S50xfMgxSxNxlt70YryRQDr3SziG231O6fE30CIJq2zD7IWyltCaao82q2KpdzjVYkDd6lbO24JLSu4vO7grRlokRHlaMwiKigcxcdTScB6eMdz3jEOphyV9Ao-r6IMUhRDwPpi9YdVVRdYRZJ5_KO4OZuw7B2H1IoPMALinLMRBXK8W8MCCmaCIi2ygqHO9IK6Pg', label: 'Exterior Painting' },
        { src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuC3OB2gKcEtFfdQKGf_jfxlTdDl6W8hkULfgdYogOPdmJA2hJlrKJY19wDcEEyHcOx7Lz8L_gp6rcPp_7bYY2IHUopQyHf9l9aLBkX8TDM8_57RE5cC5HabQKvfBvAkge_8dgBDxmCDymUDcDOuP3I0oV5r7iSxitqrFqzmDvghkrdwE-uMVAG23JDOZwEh7XCPzxqSWW5OFzkDlynUNogsVsogtft74g03uCPMtDM54DbdSYBRPnbRdw', label: 'Waterproofing' },
        { src: 'https://lh3.googleusercontent.com/aida-public/AB6AXuDspzf_W2S-cn9GB1TaeUDWzogx-miupR9sONKGuLCROlhZ7MuNHjoABqAwTAG4WzqNVRAqSXhaKJyBUsR6zldJReJBzss68JU7P-cWdF3PsrxOqZ68VhlkK7sQBPpGY-cpXA3-F04i9hKUWr_tDT3BRQZeAbWpoOnyNQj2CeW-IibE3ES1MS5LNU-sXSsB0fAYWNsqnB3eTcBJyBazm1ASV7T8zqVq6kE2ROeMKF8z6tTHzxkKpeszBA', label: 'Accent Wall' },
      ],
    },
  ]);

  protected readonly currentPage = signal(1);
  protected readonly totalPages = 5;
  protected readonly totalResults = 18;

  protected onSearch(): void {
  }

  protected resetFilters(): void {
    this.categories.update((cats) => cats.map((c) => ({ ...c, checked: false })));
    this.verifiedOnly.set(false);
    this.verifiedCerts.set(false);
    this.availableToday.set(false);
    this.thisWeekend.set(false);
    this.distanceRadius.set(10);
    this.minRating.set('4.5');
    this.priceRange.set(850);
  }

  protected toggleCategory(index: number): void {
    this.categories.update((cats) =>
      cats.map((c, i) => (i === index ? { ...c, checked: !c.checked } : c)),
    );
  }
}
