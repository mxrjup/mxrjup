import { Component, signal, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../services/data.service';

// The back office used to write this colour into each item on save; it is a
// pure function of the type, so the grid derives it instead.
const TYPE_COLORS: Record<string, string> = {
  BOOK: '#e0e0e0',
  PRODUCT: '#d1d1d1',
  ARTICLE: '#c2c2c2',
  MUSIC: '#b3b3b3',
  IMAGE: '#a4a4a4'
};

interface CoolThing {
  id: string;
  type: 'BOOK' | 'PRODUCT' | 'ARTICLE' | 'MUSIC' | 'IMAGE';
  title: string;
  subtitle?: string;
  image: string;
  link?: string;
  tagColor?: string; // hex
}

@Component({
  selector: 'app-cool-stuff',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './cool-stuff.html',
  styleUrl: './cool-stuff.scss'
})
export class CoolStuffComponent implements OnInit {
  private dataService = inject(DataService);
  hoveredItem: CoolThing | null = null;
  items = signal<CoolThing[]>([]);

  ngOnInit() {
    this.dataService.getData<CoolThing[]>('cool_stuff').subscribe(data => {
      this.items.set(data.map(item => ({ ...item, tagColor: TYPE_COLORS[item.type] ?? '#cccccc' })));
    });
  }
}
