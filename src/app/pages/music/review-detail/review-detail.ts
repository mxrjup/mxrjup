import { Component, computed, inject, signal, OnInit, OnDestroy } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { DataService } from '../../../services/data.service';

@Component({
  selector: 'app-review-detail',
  standalone: true,
  imports: [RouterLink],
  templateUrl: './review-detail.html',
  styleUrl: './review-detail.scss'
})
export class ReviewDetailComponent implements OnInit, OnDestroy {
  private route = inject(ActivatedRoute);
  private dataService = inject(DataService);

  reviews = signal<any[]>([]);

  ngOnInit() {
    // Fetch all reviews to find the one matching ID. 
    // In a real API we would fetch /api/data/reviews/:id but our simple backend serves all.
    this.dataService.getData<any[]>('reviews').subscribe(data => {
      this.reviews.set(data);
    });
  }

  review = computed(() => {
    const id = this.route.snapshot.paramMap.get('id');
    return this.reviews().find(r => r.id === id);
  });

  activeExtract = signal<{ title: string, url: string } | null>(null);

  openLightbox(extract: { title: string, url: string }) {
    this.activeExtract.set(extract);
    document.body.classList.add('lightbox-open');
  }

  closeLightbox() {
    this.activeExtract.set(null);
    document.body.classList.remove('lightbox-open');
  }

  // Leaving the page with the lightbox open would strand the class on <body>.
  ngOnDestroy() {
    document.body.classList.remove('lightbox-open');
  }
}
