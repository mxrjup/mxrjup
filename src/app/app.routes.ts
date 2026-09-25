import { CanActivateFn, Routes } from '@angular/router';

// The back office is Sveltia CMS at /admin, a static page served outside the
// Angular app, so this leaves the router rather than navigating within it.
const leaveToAdmin: CanActivateFn = () => {
    window.location.href = '/admin/';
    return false;
};

// Every page is fetched when it is first opened. Importing them here directly
// put all nine in one bundle, so every visitor downloaded the home page's
// three.js - half a megabyte of it - to read the credits. The home page now
// pays one extra request for the same bytes, and the eight others carry only
// their own code.
export const routes: Routes = [
    {
        path: '',
        loadComponent: () => import('./pages/home/home').then(m => m.HomeComponent),
    },
    {
        path: 'media',
        loadComponent: () => import('./pages/media/media').then(m => m.MediaComponent),
    },
    {
        path: 'music',
        loadComponent: () => import('./pages/music/music').then(m => m.MusicComponent),
    },
    {
        path: 'music/stats',
        loadComponent: () => import('./pages/music/stats/stats').then(m => m.StatsComponent),
    },
    {
        path: 'music/timeline',
        loadComponent: () =>
            import('./pages/music/timeline/timeline').then(m => m.TimelineComponent),
    },
    {
        path: 'music/review/:id',
        loadComponent: () =>
            import('./pages/music/review-detail/review-detail').then(m => m.ReviewDetailComponent),
    },
    {
        path: 'cool-stuff',
        loadComponent: () =>
            import('./pages/cool-stuff/cool-stuff').then(m => m.CoolStuffComponent),
    },
    {
        path: 'wip',
        loadComponent: () => import('./pages/wip/wip').then(m => m.WipComponent),
    },
    {
        path: 'credits',
        loadComponent: () => import('./pages/credits/credits').then(m => m.CreditsComponent),
    },

    // The old back office used to live here.
    { path: 'add', canActivate: [leaveToAdmin], children: [] },
    // Anything else lands on the home page instead of throwing NG04002.
    { path: '**', redirectTo: '' },
];
