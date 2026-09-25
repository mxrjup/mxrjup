// Spotify serves one image in a handful of fixed sizes, and says which by a
// prefix on the image id: the rest of the URL is the same. Nothing here calls
// the API, it only rewrites a URL the content already holds.
//
// The sync stores the largest of each, so a page that draws a cover at 44px
// would otherwise fetch 150 kB for it.

const HOST = 'https://i.scdn.co/image/';

// Prefix to pixel width, per family. Albums and artists have their own ladders
// and no size in common, so a URL is only ever rewritten within its own.
const LADDERS: ReadonlyArray<ReadonlyArray<readonly [string, number]>> = [
    // Album and track covers.
    [['ab67616d00004851', 64], ['ab67616d00001e02', 300], ['ab67616d0000b273', 640]],
    // Artist portraits.
    [['ab6761610000f178', 160], ['ab67616100005174', 320], ['ab6761610000e5eb', 640]],
];

/** The ladder a URL belongs to, with its prefix, or null for anything else. */
function locate(url: unknown) {
    if (typeof url !== 'string' || !url.startsWith(HOST)) return null;
    const prefix = url.slice(HOST.length, HOST.length + 16);
    for (const ladder of LADDERS) {
        if (ladder.some(([p]) => p === prefix)) {
            return { ladder, id: url.slice(HOST.length + 16) };
        }
    }
    return null;
}

/**
 * The same image at the smallest size that is at least `width` pixels, or the
 * largest there is when none reaches it. A URL from anywhere else is returned
 * untouched, so a caller never has to check first.
 */
export function spotifyImage(url: unknown, width: number): unknown {
    const found = locate(url);
    if (!found) return url;
    const [prefix] = found.ladder.find(([, size]) => size >= width) ?? found.ladder.at(-1)!;
    return HOST + prefix + found.id;
}

/**
 * A srcset of every size in the image's ladder, for an `<img>` that also
 * carries `sizes`. The browser then picks by how big the image really is and
 * how dense the screen is, which is more than a single URL can know. null for a
 * URL with no ladder, so binding it through `attr.srcset` leaves it off.
 */
export function spotifySrcset(url: unknown): string | null {
    const found = locate(url);
    if (!found) return null;
    return found.ladder.map(([prefix, size]) => `${HOST}${prefix}${found.id} ${size}w`).join(', ');
}
