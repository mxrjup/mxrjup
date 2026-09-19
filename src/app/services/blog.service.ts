import { Injectable, signal } from '@angular/core';
import { BlogPost } from '../models/blog-post';

@Injectable({
    providedIn: 'root'
})
export class BlogService {
    // Mock data for now
    private posts = signal<BlogPost[]>([
        {
            id: '1',
            title: 'THE DEATH OF UX',
            excerpt: 'Why boring interfaces are taking over and how to fight back.',
            content: 'This is the full content of the post...',
            date: '2026-01-15',
            tags: ['Design', 'Rant']
        },
        {
            id: '2',
            title: 'DOCKERIZING MY BRAIN',
            excerpt: 'A technical deep dive into this website structure.',
            content: 'How I built this...',
            date: '2026-02-01',
            tags: ['DevOps', 'Angular']
        },
        {
            id: '3',
            title: 'AESTHETIC OF CHAOS',
            excerpt: 'Exploring the new wave of brutalist web design.',
            content: 'Chaos is order yet undecoded...',
            date: '2026-02-10',
            tags: ['Art', 'Design']
        }
    ]);

    getPosts() {
        return this.posts.asReadonly();
    }

    getPost(id: string) {
        return this.posts().find(p => p.id === id);
    }
}
