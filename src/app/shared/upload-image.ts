// The editorial images are resized by the server on the way out: asking for
// /uploads/photo.webp?w=480 gets that width, re-encoded to WebP when the
// browser takes it. See server/imageVariants.js.

// The ladder the server accepts. A width that is not on it is not an error -
// the original is served instead - so the two drifting apart costs bytes, never
// a broken image.
const WIDTHS = [160, 320, 480, 640, 800, 1200] as const;

/** Whether the server will resize this URL, or it has to be left alone. */
function isResizable(url: unknown): url is string {
    return typeof url === 'string'
        && url.startsWith('/uploads/')
        // Not a GIF: resizing one would leave a single frame of it.
        && /\.(jpe?g|png|webp)$/i.test(url.split('?')[0]);
}

/** The same image at one width, or the URL untouched if it is not ours. */
export function uploadImage(url: unknown, width: number): unknown {
    return isResizable(url) ? `${url}?w=${width}` : url;
}

/**
 * Every width the server offers, for an `<img>` that also carries `sizes`. The
 * browser picks by the space the image actually fills and how dense the screen
 * is. null when the URL is not one the server resizes, so binding it through
 * `attr.srcset` leaves the attribute off.
 */
export function uploadSrcset(url: unknown): string | null {
    if (!isResizable(url)) return null;
    return WIDTHS.map(w => `${url}?w=${w} ${w}w`).join(', ');
}
