import { Component, signal, inject, OnInit, OnDestroy } from '@angular/core';
import { RouterLink } from '@angular/router';
import { UpperCasePipe } from '@angular/common';
import { DataService } from '../../services/data.service';
import { uploadImage, uploadSrcset } from '../../shared/upload-image';

export interface MediaItem {
  id: string;
  type: 'image' | 'video' | 'audio';
  url: string;
  thumbnail?: string; // Audio might not have a thumbnail
  title: string;
  // The server measures the file and sends its size along, so the grid can
  // leave the right gap before the picture arrives. Absent for audio, and for
  // anything it could not read.
  width?: number;
  height?: number;
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

  // Three columns with a 10vw gap and 5vw of padding either side leaves about
  // 23vw for a cell, at any window size.
  readonly GRID_SIZES = '23vw';

  /** The grid's picture: the poster frame for a video, the image itself. */
  private source(item: MediaItem) {
    return item.thumbnail || item.url;
  }

  /** A fallback for browsers that ignore srcset, sized for the common case. */
  thumbnail(item: MediaItem) {
    return uploadImage(this.source(item), 480);
  }

  thumbnailSet(item: MediaItem) {
    return uploadSrcset(this.source(item));
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
