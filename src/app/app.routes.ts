import { CanActivateFn, Routes } from '@angular/router';
import { HomeComponent } from './pages/home/home';

import { BlogListComponent } from './pages/blog-list/blog-list';
import { PostDetailComponent } from './pages/post-detail/post-detail';

import { MediaComponent } from './pages/media/media';
import { MusicComponent } from './pages/music/music';
import { TimelineComponent } from './pages/music/timeline/timeline';

import { ReviewDetailComponent } from './pages/music/review-detail/review-detail';
import { CoolStuffComponent } from './pages/cool-stuff/cool-stuff';
import { WipComponent } from './pages/wip/wip';
import { CreditsComponent } from './pages/credits/credits';

// The back office is Sveltia CMS at /admin, a static page served outside the
// Angular app, so this leaves the router rather than navigating within it.
const leaveToAdmin: CanActivateFn = () => {
    window.location.href = '/admin/';
    return false;
};

export const routes: Routes = [
    { path: '', component: HomeComponent },
    { path: 'blog', component: BlogListComponent },
    { path: 'media', component: MediaComponent },
    { path: 'music', component: MusicComponent },
    { path: 'music/timeline', component: TimelineComponent },
    { path: 'music/review/:id', component: ReviewDetailComponent },
    { path: 'cool-stuff', component: CoolStuffComponent },
    { path: 'wip', component: WipComponent },
    { path: 'credits', component: CreditsComponent },

    { path: 'post/:id', component: PostDetailComponent },

    // The old back office used to live here.
    { path: 'add', canActivate: [leaveToAdmin], children: [] },
    // Anything else lands on the home page instead of throwing NG04002.
    { path: '**', redirectTo: '' },
];
