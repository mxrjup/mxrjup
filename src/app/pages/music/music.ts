import { Component, signal, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../services/data.service';

// One entry of the CMS "reviews" collection (public/admin/config.yml).
export interface MusicReview {
  id: string;
  artist: string;
  album: string;
  genre: string;
  cover: string;
  author: string; // who wrote the review
  date: string;
  score?: string;
  text: string; // summary shown in the list
  content?: string;
  extracts?: { title: string; url: string }[];
}

@Component({
  selector: 'app-music',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './music.html',
  styleUrl: './music.scss'
})
export class MusicComponent implements OnInit {
  private dataService = inject(DataService);
  reviews = signal<MusicReview[]>([]);

  ngOnInit() {
    this.dataService.getData<MusicReview[]>('reviews').subscribe(data => {
      const sorted = (data || []).sort((a, b) => {
        return new Date(b.date).getTime() - new Date(a.date).getTime();
      });
      this.reviews.set(sorted);
    });
  }

}
