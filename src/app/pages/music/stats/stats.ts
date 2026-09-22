import { Component, computed, signal, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../../services/data.service';

// data/stats.json of the content repository, written every Monday by the private
// mxrjup-listening repository - its README says how each number is counted. Every list
// holds only what there is, up to 50; an entry without a picture has no image/cover key.
export interface ChartEntry {
  rank: number;
  name: string;
  artist?: string; // tracks and albums
  plays: number;
  image?: string; // artist photo
  cover?: string; // album cover
  was?: number; // rank in the same range a week earlier
  new?: boolean; // not in that week's top 50
}

export interface StatsRange {
  id: string;
  label: string;
  from: string;
  to: string;
  plays: number;
  previousPlays?: number; // the range just before, when the history covers it all
  artists: ChartEntry[];
  tracks: ChartEntry[];
  albums: ChartEntry[];
  genres: { rank: number; name: string; share: number }[];
}

interface RecordHolder {
  name: string;
  artist?: string;
  image?: string;
  cover?: string;
  weeks: number;
  from?: string;
  to?: string;
}

export interface ListeningStats {
  through?: string;
  ranges?: StatsRange[];
  records?: {
    weeksAtNumberOne: { artists: RecordHolder[]; tracks: RecordHolder[] };
    longestTopTenRun: { artists: RecordHolder[]; tracks: RecordHolder[] };
    biggestWeeks: { from: string; to: string; plays: number }[];
  };
}

// One card of the records section, whatever the record.
interface RecordCard {
  label: string;
  round: boolean; // artist photos are round, covers square
  holders: { name: string; detail?: string; picture?: string; value: number; unit: string }[];
}

const COLLAPSED = 10;
const COMPARED_WITH: Record<string, string> = {
  '4w': 'previous 4 weeks',
  '6m': 'previous 6 months',
  '1y': 'previous year'
};

const numbers = new Intl.NumberFormat('en-US');
// The file's dates are calendar days: read and printed in UTC so no time zone shifts them.
const dayMonth = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', timeZone: 'UTC' });
const fullDate = new Intl.DateTimeFormat('en-GB', { day: 'numeric', month: 'short', year: 'numeric', timeZone: 'UTC' });
const weekday = new Intl.DateTimeFormat('en-GB', { weekday: 'long', timeZone: 'UTC' });
const asDate = (day: string) => new Date(`${day}T00:00:00Z`);

@Component({
  selector: 'app-stats',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './stats.html',
  styleUrl: './stats.scss'
})
export class StatsComponent implements OnInit {
  private dataService = inject(DataService);

  stats = signal<ListeningStats>({});
  loaded = signal(false);
  selected = signal<string | null>(null);
  // Sections opened with "See All", by name.
  expanded = signal<Record<string, boolean>>({});

  ranges = computed(() => this.stats().ranges ?? []);
  range = computed(() => this.ranges().find((r) => r.id === this.selected()) ?? this.ranges()[0]);

  delta = computed(() => {
    const range = this.range();
    if (!range?.previousPlays) return null;
    const change = Math.round(((range.plays - range.previousPlays) / range.previousPlays) * 100);
    const against = COMPARED_WITH[range.id] ?? 'previous period';
    if (change === 0) return { cls: 'same', text: `Same as the ${against}` };
    return { cls: change > 0 ? 'up' : 'down', text: `${change > 0 ? '▲' : '▼'} ${Math.abs(change)}% vs ${against}` };
  });

  updated = computed(() => {
    const through = this.stats().through;
    if (!through) return '';
    const monday = new Date(asDate(through).getTime() + 86_400_000);
    return `${weekday.format(monday)} ${fullDate.format(monday)}`;
  });

  recordCards = computed<RecordCard[]>(() => {
    const records = this.stats().records;
    if (!records) return [];
    const weeks = (n: number) => (n === 1 ? 'week' : 'weeks');
    const cards: RecordCard[] = [
      {
        label: 'Most weeks as #1 artist',
        round: true,
        holders: records.weeksAtNumberOne.artists.map((h) => ({ name: h.name, picture: h.image, value: h.weeks, unit: weeks(h.weeks) }))
      },
      {
        label: 'Most weeks as #1 track',
        round: false,
        holders: records.weeksAtNumberOne.tracks.map((h) => ({ name: h.name, detail: h.artist, picture: h.cover, value: h.weeks, unit: weeks(h.weeks) }))
      },
      {
        label: 'Longest run in the top 10 · Artist',
        round: true,
        holders: records.longestTopTenRun.artists.map((h) => ({ name: h.name, detail: this.period(h.from, h.to), picture: h.image, value: h.weeks, unit: weeks(h.weeks) }))
      },
      {
        label: 'Longest run in the top 10 · Track',
        round: false,
        holders: records.longestTopTenRun.tracks.map((h) => ({ name: h.name, detail: `${h.artist} · ${this.period(h.from, h.to)}`, picture: h.cover, value: h.weeks, unit: weeks(h.weeks) }))
      },
      {
        label: 'Biggest weeks',
        round: false,
        holders: records.biggestWeeks.map((w) => ({ name: this.period(w.from, w.to), value: w.plays, unit: w.plays === 1 ? 'play' : 'plays' }))
      }
    ];
    return cards.filter((card) => card.holders.length);
  });

  ngOnInit() {
    this.dataService.getData<ListeningStats>('stats').subscribe({
      next: (data) => {
        this.stats.set(data ?? {});
        this.loaded.set(true);
      },
      error: () => this.loaded.set(true)
    });
  }

  select(id: string) {
    this.selected.set(id);
  }

  /** The first entries of a list, or all of them once its section is expanded. */
  shown<T>(list: T[], section: string, skip = 0): T[] {
    return this.expanded()[section] ? list.slice(skip) : list.slice(skip, COLLAPSED);
  }

  toggle(section: string) {
    this.expanded.update((open) => ({ ...open, [section]: !open[section] }));
  }

  /** The badge beside an entry: where it moved since last week. Unchanged: none. */
  movement(entry: ChartEntry) {
    if (entry.new) return { cls: 'new', text: 'NEW', label: 'New this week' };
    if (!entry.was || entry.was === entry.rank) return null;
    const up = entry.was > entry.rank;
    const places = Math.abs(entry.was - entry.rank);
    return { cls: up ? 'up' : 'down', text: `${up ? '▲' : '▼'}${places}`, label: `${up ? 'Up' : 'Down'} ${places} since last week` };
  }

  count(n: number) {
    return numbers.format(n);
  }

  plays(n: number) {
    return `${numbers.format(n)} ${n === 1 ? 'play' : 'plays'}`;
  }

  percent(share: number) {
    return `${Math.round(share * 100)}%`;
  }

  /** "25 Aug – 20 Sep 2026", the year given once when both ends share it. */
  period(from?: string, to?: string) {
    if (!from || !to) return '';
    const start = asDate(from);
    const end = asDate(to);
    const sameYear = start.getUTCFullYear() === end.getUTCFullYear();
    return `${sameYear ? dayMonth.format(start) : fullDate.format(start)} – ${fullDate.format(end)}`;
  }

  /** Spotify's genres are lower case: "r&b" becomes "R&B", "hip hop" "Hip Hop". */
  titleCase(name: string) {
    return name.replace(/\b\p{L}/gu, (letter) => letter.toUpperCase());
  }

  initial(name: string) {
    return Array.from(name.trim())[0]?.toUpperCase() ?? '';
  }
}
