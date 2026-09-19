import { Component, signal } from '@angular/core';
import { RouterLink } from '@angular/router';

interface Experiment {
  id: string;
  date: string;    // was code/version
  object: string;  // was type
  subject: string; // was name
  link: string;
}

@Component({
  selector: 'app-wip',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './wip.html',
  styleUrl: './wip.scss'
})
export class WipComponent {
  experiments = signal<Experiment[]>([]);
}
