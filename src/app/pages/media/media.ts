import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
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
export class MediaComponent implements OnInit, OnDestroy {
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
    document.body.classList.add('lightbox-open');
  }

  closeLightbox() {
    this.activeItem.set(null);
    document.body.classList.remove('lightbox-open');
  }

  // Leaving the page with the lightbox open would strand the class on <body>.
  ngOnDestroy() {
    document.body.classList.remove('lightbox-open');
  }
}
