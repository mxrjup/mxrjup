export interface BlogPost {
    id: string;
    title: string;
    excerpt: string;
    content: string; // Markdown or HTML
    date: string;
    tags: string[];
    coverImage?: string;
}
