import { Component, signal, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../services/data.service';

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
export class WipComponent implements OnInit {
  private dataService = inject(DataService);
  experiments = signal<Experiment[]>([]);

  ngOnInit() {
    this.dataService.getData<Experiment[]>('wip').subscribe(data => {
      this.experiments.set(data);
    });
  }
}
