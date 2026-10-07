import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

interface StepItem {
  number: string;
  title: string;
  text: string;
  footer: string;
  icon: string;
  iconClass: string;
  detail: string[];
}

interface AudienceItem {
  title: string;
  text: string;
  points: string[];
  icon: string;
}

@Component({
  selector: 'app-how-it-works',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './how-it-works.html',
  styleUrl: './how-it-works.scss',
})
export class HowItWorksComponent {
  protected readonly steps = signal<StepItem[]>([
    {
      number: '01',
      title: 'Tell us what you need',
      text: 'Describe your job and upload photos so artisans can assess the scope accurately.',
      footer: 'Instant request',
      icon: 'edit_note',
      iconClass: 'primary-fixed',
      detail: [
        'Post a job in under two minutes.',
        'Add photos so scope is clear from the start.',
        'Choose your suburb or service area.',
      ],
    },
    {
      number: '02',
      title: 'Find the right professional',
      text: 'Compare experience, previous work, certificates and reviews from local clients.',
      footer: 'Verified portfolios',
      icon: 'badge',
      iconClass: 'secondary-container',
      detail: [
        'Every pro shows real before/during/after photos.',
        'Certificates and trade tests are checked.',
        'Reviews come only from confirmed clients.',
      ],
    },
    {
      number: '03',
      title: 'Get a quote',
      text: 'Review the quote in South African Rand (ZAR) and choose your preferred professional.',
      footer: 'No hidden fees',
      icon: 'receipt_long',
      iconClass: 'primary-fixed',
      detail: [
        'Quotes are itemised in ZAR.',
        'You choose who does the job - no pressure.',
        'No platform payment processing in the MVP.',
      ],
    },
    {
      number: '04',
      title: 'Get the job done',
      text: 'Communicate, complete the job safely and release payment after leaving a verified review.',
      footer: 'Satisfaction guarantee',
      icon: 'task_alt',
      iconClass: 'secondary-container',
      detail: [
        'Message your pro directly about the job.',
        'Work is documented as it happens.',
        'You pay your pro directly after completion.',
      ],
    },
  ]);

  protected readonly audiences = signal<AudienceItem[]>([
    {
      title: 'For homeowners & tenants',
      text: 'Get the job done without chasing unreliable contractors.',
      points: [
        'Compare real portfolios, not just adverts.',
        'See upfront pricing before work starts.',
        'Keep a full photo record of the job.',
      ],
      icon: 'home',
    },
    {
      title: 'For service businesses',
      text: 'Run your existing customers, jobs and technicians in one place.',
      points: [
        'Create internal jobs without leaving Fixlynk.',
        'Assign technicians and track progress.',
        'Maintain full job history for records.',
      ],
      icon: 'business',
    },
  ]);
}