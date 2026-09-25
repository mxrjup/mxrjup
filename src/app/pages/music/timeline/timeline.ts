import { Component, computed, signal, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../../services/data.service';
import { spotifyImage } from '../../../shared/spotify-image';

// The sync stores the 640px cover, around 150 kB each, for cards that render at
// 60px and grow to 200px under the cursor. 300 is the size that covers both:
// across the 156 albums here, 24 MB becomes 6 MB.
const CARD_WIDTH = 300;

@Component({
  selector: 'app-timeline',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './timeline.html',
  styleUrl: './timeline.scss'
})
export class TimelineComponent implements OnInit {
  private dataService = inject(DataService);

  // Data from API
  albums = signal<any[]>([]);

  ngOnInit() {
    this.dataService.getData<any[]>('timeline').subscribe(data => {
      this.albums.set((data ?? []).map(a => ({ ...a, cover: spotifyImage(a.cover, CARD_WIDTH) })));
    });
  }

  // Group by year for the layout
  groupedAlbums = computed(() => {
    const sorted = this.albums().sort((a, b) => new Date(b.date).getTime() - new Date(a.date).getTime());
    const groups: { year: string, items: any[] }[] = [];

    sorted.forEach(album => {
      const year = album.date.split('-')[0];
      let group = groups.find(g => g.year === year);
      if (!group) {
        group = { year, items: [] };
        groups.push(group);
      }
      group.items.push(album);
    });

    return groups;
  });
}
