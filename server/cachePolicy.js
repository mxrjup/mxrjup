const path = require('path');

// How long a browser may keep what this server sends.
//
// The app shells must never be cached: their filename is stable while the
// hashed bundles they point at change on every build, so a cached copy keeps
// loading the previous release. nginx set this before it was removed.
const NO_STORE = 'no-store, no-cache, must-revalidate';

// A build puts a content hash in the name of every file it emits, so such a URL
// can only ever mean one file and a browser never has to ask about it again.
// Express otherwise sends max-age=0, which cost a round trip per bundle on
// every navigation.
const IMMUTABLE = 'public, max-age=31536000, immutable';

// Only what a build named qualifies. favicon.png, the icons copied from public/
// and the CMS page under /admin keep their names from one release to the next:
// an immutable year on one of those could not be taken back, so the rules below
// name what the builds emit rather than guessing from the shape of a filename.

// Everything the Angular build hashes lands in the root of the browser
// directory under one of these names. Only the root: assets/ below it is a
// verbatim copy of public/, where a file named like a bundle would not be one.
const ANGULAR_BUNDLE = /^(?:main|chunk|polyfills|scripts|styles)-[A-Za-z0-9_-]+\.(?:js|css)$/;

// Vite hashes what it writes to assets/ and nothing outside it.
const VITE_ASSETS = `assets${path.sep}`;

/**
 * The Cache-Control for a file of the Angular build, or null to leave the
 * default (max-age=0, revalidated against the ETag).
 */
function angularCacheControl(dir, filePath) {
    if (filePath.endsWith('.html')) return NO_STORE;
    const name = path.relative(dir, filePath);
    // Anything in a subdirectory, or outside `dir` entirely, is not a bundle.
    if (name.includes(path.sep)) return null;
    return ANGULAR_BUNDLE.test(name) ? IMMUTABLE : null;
}

/** The same for the Windows 95 app, whose build is Vite's. */
function computerCacheControl(dir, filePath) {
    if (filePath.endsWith('.html')) return NO_STORE;
    return path.relative(dir, filePath).startsWith(VITE_ASSETS) ? IMMUTABLE : null;
}

module.exports = { NO_STORE, IMMUTABLE, angularCacheControl, computerCacheControl };
