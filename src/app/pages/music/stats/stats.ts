import { Component, computed, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../../services/data.service';
import { spotifySrcset } from '../../../shared/spotify-image';

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

// A record holder carries whichever figures its record is about.
interface RecordHolder {
  name: string;
  artist?: string;
  image?: string;
  cover?: string;
  weeks?: number; // weeks at #1, or weeks of a top 10 run
  tracks?: number; // different tracks played
  plays?: number;
  from?: string;
  to?: string;
  day?: string;
}

interface ByKind {
  artists: RecordHolder[];
  tracks: RecordHolder[];
  albums: RecordHolder[];
}

export interface ListeningStats {
  through?: string;
  ranges?: StatsRange[];
  records?: {
    weeksAtNumberOne: ByKind;
    longestTopTenRun: ByKind;
    biggestWeeks: { from: string; to: string; plays: number }[];
    longestStreak: { from: string; to: string; days: number }[];
    mostPlayedInAWeek: RecordHolder[];
    deepestCatalogue: RecordHolder[];
    weeksInRotation: RecordHolder[];
    onRepeat: RecordHolder[];
  };
}

// One card of the records section, whatever the record.
interface RecordCard {
  label: string;
  round: boolean; // artist photos are round, covers square
  holders: { name: string; detail?: string; picture?: string; value: number; unit: string }[];
}

// Collapsed, a grid shows exactly two rows, so these column counts must match the
// breakpoints of stats.scss; a list shows ten.
const GRID_STEPS = [
  { from: 901, artists: 8, albums: 5 },
  { from: 681, artists: 6, albums: 4 },
  { from: 461, artists: 4, albums: 3 },
  { from: 0, artists: 3, albums: 2 }
];
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
export class StatsComponent implements OnInit, OnDestroy {
  private dataService = inject(DataService);

  stats = signal<ListeningStats>({});
  // Which breakpoint the page is at, so a collapsed grid can hold whole rows.
  private width = signal(typeof window === 'undefined' ? 1024 : window.innerWidth);
  private onResize = () => this.width.set(window.innerWidth);
  private columns = computed(() => GRID_STEPS.find((step) => this.width() >= step.from) ?? GRID_STEPS.at(-1)!);
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
    const r = this.stats().records;
    if (!r) return [];
    const unit = (n: number, one: string) => (n === 1 ? one : `${one}s`);
    // Every card reads the same way: a figure, what it belongs to, and where it happened.
    const weeksAt = (kind: keyof ByKind, label: string, round: boolean) => ({
      label,
      round,
      holders: r.weeksAtNumberOne[kind].map((h) => ({
        name: h.name, detail: h.artist, picture: h.image ?? h.cover,
        value: h.weeks ?? 0, unit: unit(h.weeks ?? 0, 'week')
      }))
    });
    const topTenRun = (kind: keyof ByKind, label: string, round: boolean) => ({
      label,
      round,
      holders: r.longestTopTenRun[kind].map((h) => ({
        name: h.name,
        detail: [h.artist, this.period(h.from, h.to)].filter(Boolean).join(' · '),
        picture: h.image ?? h.cover,
        value: h.weeks ?? 0, unit: unit(h.weeks ?? 0, 'week')
      }))
    });

    const cards: RecordCard[] = [
      weeksAt('artists', 'Most weeks as #1 artist', true),
      weeksAt('tracks', 'Most weeks as #1 track', false),
      weeksAt('albums', 'Most weeks as #1 album', false),
      {
        label: 'Most tracks played · Artist',
        round: true,
        holders: r.deepestCatalogue.map((h) => ({
          name: h.name, picture: h.image, value: h.tracks ?? 0, unit: unit(h.tracks ?? 0, 'track')
        }))
      },
      topTenRun('artists', 'Longest run in the top 10 · Artist', true),
      topTenRun('tracks', 'Longest run in the top 10 · Track', false),
      topTenRun('albums', 'Longest run in the top 10 · Album', false),
      {
        label: 'Most weeks in rotation · Album',
        round: false,
        holders: r.weeksInRotation.map((h) => ({
          name: h.name, detail: h.artist, picture: h.cover,
          value: h.weeks ?? 0, unit: unit(h.weeks ?? 0, 'week')
        }))
      },
      {
        label: 'Biggest weeks',
        round: false,
        holders: r.biggestWeeks.map((w) => ({
          name: this.period(w.from, w.to), value: w.plays, unit: unit(w.plays, 'play')
        }))
      },
      {
        label: 'Longest listening streak',
        round: false,
        holders: r.longestStreak.map((streak) => ({
          name: this.period(streak.from, streak.to), value: streak.days, unit: unit(streak.days, 'day')
        }))
      },
      {
        label: 'Most plays of a track in a week',
        round: false,
        holders: r.mostPlayedInAWeek.map((h) => ({
          name: h.name,
          detail: [h.artist, this.period(h.from, h.to)].filter(Boolean).join(' · '),
          picture: h.cover,
          value: h.plays ?? 0, unit: unit(h.plays ?? 0, 'play')
        }))
      },
      {
        label: 'Played back to back',
        round: false,
        holders: r.onRepeat.map((h) => ({
          name: h.name,
          detail: [h.artist, this.day(h.day)].filter(Boolean).join(' · '),
          picture: h.cover,
          value: h.plays ?? 0, unit: 'in a row'
        }))
      }
    ];
    return cards.filter((card) => card.holders.length);
  });

  ngOnInit() {
    if (typeof window !== 'undefined') window.addEventListener('resize', this.onResize);
    this.dataService.getData<ListeningStats>('stats').subscribe({
      next: (data) => {
        this.stats.set(data ?? {});
        this.loaded.set(true);
      },
      error: () => this.loaded.set(true)
    });
  }

  ngOnDestroy() {
    if (typeof window !== 'undefined') window.removeEventListener('resize', this.onResize);
  }

  select(id: string) {
    this.selected.set(id);
  }

  /** How many entries a section shows before "See All": two whole rows, or ten in a list. */
  limit(section: string) {
    if (section === 'artists') return this.columns().artists * 2;
    if (section === 'albums') return this.columns().albums * 2;
    return COLLAPSED;
  }

  /** The first entries of a list, or all of them once its section is expanded. */
  shown<T>(list: T[], section: string, skip = 0): T[] {
    return this.expanded()[section] ? list.slice(skip) : list.slice(skip, skip + this.limit(section));
  }

  /** Whether a section holds more than it shows collapsed. */
  hasMore(list: unknown[], section: string, skip = 0) {
    return list.length - skip > this.limit(section);
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

  /**
   * Every size Spotify has of a thumbnail, for the browser to choose from. The
   * stored URL is the 300px one and these are drawn at 56: on an ordinary
   * screen that is 44 kB where 3 kB would do, and the whole page is 47 images.
   */
  srcset(url?: string) {
    return spotifySrcset(url);
  }

  plays(n: number) {
    return `${numbers.format(n)} ${n === 1 ? 'play' : 'plays'}`;
  }

  percent(share: number) {
    return `${Math.round(share * 100)}%`;
  }

  /** "20 Sep 2026", or nothing when the record carries no day. */
  day(value?: string) {
    return value ? fullDate.format(asDate(value)) : '';
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
