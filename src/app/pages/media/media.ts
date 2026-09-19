import { Component, signal, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UpperCasePipe } from '@angular/common';
import { DataService } from '../../services/data.service';

export interface MediaItem {
  id: string;
  type: 'image' | 'video' | 'audio';
  url: string;
  thumbnail?: string; // Audio might not have a thumbnail
  title: string;
}

@Component({
  selector: 'app-media',
  standalone: true,
  imports: [RouterLink, UpperCasePipe],
  templateUrl: './media.html',
  styleUrl: './media.scss'
})
export class MediaComponent implements OnInit {
  private dataService = inject(DataService);

  items = signal<MediaItem[]>([]);

  ngOnInit() {
    this.dataService.getData<MediaItem[]>('media').subscribe(data => {
      this.items.set((data || []).reverse());
    });
  }

  activeItem = signal<MediaItem | null>(null);

  openLightbox(item: MediaItem) {
    this.activeItem.set(item);
  }

  closeLightbox() {
    this.activeItem.set(null);
  }
}
