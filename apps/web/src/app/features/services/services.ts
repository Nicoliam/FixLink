import { ChangeDetectionStrategy, Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

interface ServiceItem {
  name: string;
  description: string;
  price: string;
  icon: string;
  iconClass: string;
  includes: string[];
}

@Component({
  selector: 'app-services',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './services.html',
  styleUrl: './services.scss',
})
export class ServicesComponent {
  protected readonly services = signal<ServiceItem[]>([
    {
      name: 'General Handyman',
      description: 'Fixes, mounting & repairs',
      price: 'R350',
      icon: 'handyman',
      iconClass: 'primary-fixed',
      includes: ['Furniture assembly', 'Shelf & bracket mounting', 'Minor repairs', 'Door handle replacement'],
    },
    {
      name: 'Plumbing',
      description: 'Leaks, geysers, pipes',
      price: 'R450',
      icon: 'plumbing',
      iconClass: 'secondary-container',
      includes: ['Leak detection', 'Geyser servicing', 'Pipe replacement', 'Tap & toilet installs'],
    },
    {
      name: 'Electrical',
      description: 'Wiring, DB boards, solar',
      price: 'R450',
      icon: 'bolt',
      iconClass: 'primary-fixed',
      includes: ['DB board upgrades', 'Fault finding', 'Solar backup installs', 'COC certificates'],
    },
    {
      name: 'Painting',
      description: 'Interior & exterior coating',
      price: 'R380',
      icon: 'format_paint',
      iconClass: 'secondary-container',
      includes: ['Interior walls', 'Exterior facades', 'Waterproofing paint', 'Ceiling repainting'],
    },
    {
      name: 'Carpentry',
      description: 'Cabinets, doors & decking',
      price: 'R420',
      icon: 'carpenter',
      iconClass: 'primary-fixed',
      includes: ['Built-in cupboards', 'Door fitting & repairs', 'Decking & pergolas', 'Skirting boards'],
    },
    {
      name: 'Tiling',
      description: 'Floor, wall & patio paving',
      price: 'R400',
      icon: 'grid_view',
      iconClass: 'secondary-container',
      includes: ['Floor tiling', 'Wall tiling', 'Patio paving', 'Grout & sealing'],
    },
    {
      name: 'Building',
      description: 'Plastering, brickwork, walls',
      price: 'R500',
      icon: 'home_repair_service',
      iconClass: 'primary-fixed',
      includes: ['Plastering & screeding', 'Brickwork', 'Partition walls', 'Waterproofing'],
    },
    {
      name: 'Home Maintenance',
      description: 'Gutters, waterproofing, roofs',
      price: 'R390',
      icon: 'roofing',
      iconClass: 'secondary-container',
      includes: ['Gutter cleaning', 'Roof repairs', 'Waterproofing', 'Sealants & maintenance'],
    },
    {
      name: 'Gardening',
      description: 'Landscaping, cleanups, trees',
      price: 'R300',
      icon: 'yard',
      iconClass: 'primary-fixed',
      includes: ['Lawn mowing', 'Tree trimming', 'Garden cleanups', 'Irrigation setup'],
    },
    {
      name: 'Appliance Repairs',
      description: 'Fridges, washers, ovens',
      price: 'R420',
      icon: 'kitchen',
      iconClass: 'secondary-container',
      includes: ['Fridge & freezer', 'Washing machines', 'Ovens & stoves', 'Dishwashers'],
    },
    {
      name: 'Air Conditioning',
      description: 'Servicing, installs & repairs',
      price: 'R480',
      icon: 'ac_unit',
      iconClass: 'primary-fixed',
      includes: ['Split unit servicing', 'Regassing', 'Installations', 'Fault diagnosis'],
    },
    {
      name: 'Locksmithing',
      description: 'Locks, keys & security',
      price: 'R350',
      icon: 'lock',
      iconClass: 'secondary-container',
      includes: ['Lock changes', 'Key duplication', 'Deadbolt installs', 'Emergency unlocks'],
    },
  ]);
}