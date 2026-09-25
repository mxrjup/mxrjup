import { Component, computed, signal, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../../services/data.service';

// Spotify publishes every cover in three sizes, chosen by a prefix on the image
// id. The weekly sync stores the 640px one, around 150 kB each, for cards that
// render at 60px and grow to 200px under the cursor. The 300px one covers both
// at a quarter of the weight: across the 156 albums here, 24 MB becomes 6 MB.
const COVER_640 = 'https://i.scdn.co/image/ab67616d0000b273';
const COVER_300 = 'https://i.scdn.co/image/ab67616d00001e02';

/** Anything that is not a 640px Spotify cover is left as it is. */
function smallerCover(url: unknown): unknown {
  return typeof url === 'string' && url.startsWith(COVER_640)
    ? COVER_300 + url.slice(COVER_640.length)
    : url;
}

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
      this.albums.set((data ?? []).map(a => ({ ...a, cover: smallerCover(a.cover) })));
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
