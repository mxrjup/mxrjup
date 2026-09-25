// What a browser is allowed to keep. The cost of getting this wrong is not
// symmetrical: too little caching is a round trip, too much pins a file in
// every visitor's browser for a year with no way to take it back. The tests
// below are mostly about the second kind.
const { test } = require('node:test');
const assert = require('node:assert/strict');
const path = require('path');

const {
    NO_STORE, IMMUTABLE, angularCacheControl, computerCacheControl
} = require('../cachePolicy');

const BROWSER_DIR = path.join('/srv', 'dist', 'angular-mxrjup', 'browser');
const COMPUTER_DIR = path.join('/srv', 'dist', 'computer');
const inBrowser = (...p) => path.join(BROWSER_DIR, ...p);
const inComputer = (...p) => path.join(COMPUTER_DIR, ...p);

test('the two app shells are never cached', () => {
    assert.equal(angularCacheControl(BROWSER_DIR, inBrowser('index.html')), NO_STORE);
    assert.equal(angularCacheControl(BROWSER_DIR, inBrowser('admin', 'index.html')), NO_STORE);
    assert.equal(computerCacheControl(COMPUTER_DIR, inComputer('index.html')), NO_STORE);
});

test('what the Angular build hashes is kept for a year', () => {
    for (const name of [
        'main-PVJVEZLB.js',
        'chunk-7V2A5NV3.js',
        'styles-OIJCXR7H.css',
        'polyfills-B6TNHZQ6.js',
        'scripts-4RHTIHOI.js',
    ]) {
        assert.equal(angularCacheControl(BROWSER_DIR, inBrowser(name)), IMMUTABLE, name);
    }
});

test('what the Vite build hashes is kept for a year', () => {
    for (const name of [
        'index-CyueTYKJ.js',
        'index-D8E5vFKd.css',
        '95icon-BMsbTOW0.png',
        'win95-Cjxn4tiz.ttf',
        'live_grey-CowGa4xp.gif',
    ]) {
        assert.equal(computerCacheControl(COMPUTER_DIR, inComputer('assets', name)), IMMUTABLE, name);
    }
});

// The whole point of naming the build outputs rather than matching a shape: a
// file whose name survives the next release must stay revalidated, however much
// it looks like a bundle.
test('a file that keeps its name across releases is revalidated', () => {
    for (const p of [
        inBrowser('favicon.png'),
        inBrowser('favicon.ico'),
        inBrowser('assets', 'pc.png'),
        inBrowser('admin', 'config.yml'),
        // Someone drops a hyphenated picture in public/: it is not a bundle.
        inBrowser('assets', 'my-wallpaper.png'),
        inBrowser('assets', 'some-long-name-here.jpg'),
        // Named like a bundle but outside the build's own output.
        inBrowser('assets', 'main-PVJVEZLB.js'),
        inComputer('vite.svg'),
        inComputer('robots.txt'),
    ]) {
        const angular = angularCacheControl(BROWSER_DIR, p);
        const computer = computerCacheControl(COMPUTER_DIR, p);
        assert.equal(angular, null, `angular: ${p}`);
        assert.equal(computer, null, `computer: ${p}`);
    }
});

test('a path cannot climb out of the computer build into an immutable year', () => {
    const outside = path.join(COMPUTER_DIR, '..', 'angular-mxrjup', 'browser', 'favicon.png');
    assert.equal(computerCacheControl(COMPUTER_DIR, outside), null);
});
