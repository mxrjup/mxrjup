import { Component, signal, inject, OnInit } from '@angular/core';
import { RouterLink } from '@angular/router';
import { DataService } from '../../services/data.service';

export interface MusicReview {
  id: string;
  artist: string;
  album: string; // Wait, AdminComponent has "title", "author", "genre". 
  // Let's check AdminComponent again. 
  // Reviews Form: Author, Date, Genre, Cover, Text (summary?), Sound.
  // Missing: Album Name, Artist Name. 
  // Admin form has "Author" which might be "Review Author" or "Artist"?
  // Usually "Author" in a review context is the Reviewer.
  // So we are missing "Artist" and "Album" fields in Admin? 
  // User said: "For the reviews I should add the text, the cover, the author, the date, the genre, the sounds extraits of the album."
  // It didn't explicitly say "Artist Name" or "Album Name", but "sounds extraits of the album" implies album exists.
  // "Author" is probably the Artist? "Author of the album"?
  // Or "Author of the review"?
  // Given "For the cool stuff... author" refers to creator of the thing.
  // I will assume definitions:
  // Author -> Artist 
  // But where is Album Title?
  // Maybe "Author" = Artist, and I need to add Album Title?
  // User didn't specify Album Title in the list of things to add for reviews, strangely.
  // "add the text, the cover, the author, the date, the genre, the sounds extraits".
  // Maybe "Author" means "Artist & Album"?
  // Let's stick to what I have in Admin (Author, Genre, etc) and map it.
  // I'll genericize the interface.
  cover: string;
  genre: string;
  author: string; // Artist
  text: string;
  sound: string;
  date: string;
  // Computed or missing properties handled gracefully
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
