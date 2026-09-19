import { Component, inject, signal } from '@angular/core';
import { CommonModule } from '@angular/common';
import { RouterLink } from '@angular/router';
import { DataService } from '../../services/data.service';

interface Credit {
    artName: string;
    artistName: string;
}

@Component({
    selector: 'app-credits',
    standalone: true,
    imports: [CommonModule, RouterLink],
    templateUrl: './credits.html',
    styleUrls: ['./credits.scss']
})
export class CreditsComponent {
    dataService = inject(DataService);
    credits = signal<Credit[]>([]);

    constructor() {
        this.dataService.getData('credits').subscribe((data: unknown) => {
            this.credits.set(data as Credit[]);
        });
    }
}
