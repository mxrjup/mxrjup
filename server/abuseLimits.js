const { rateLimit } = require('express-rate-limit');

/**
 * Limits on what anonymous visitors can send, so the routes that write to disk and
 * the chat cannot be flooded. All counters live in memory: there is a single Node
 * process, and a restart forgetting them is harmless.
 */

const MINUTE = 60 * 1000;

const MAX_CHAT_USER = 30;
const MAX_CHAT_TEXT = 500;

// A chat message is a few hundred bytes of JSON; anything much bigger is not one.
const MAX_WS_PAYLOAD = 4 * 1024;
// Per WebSocket connection.
const WS_MESSAGES_PER_WINDOW = 20;
const WS_WINDOW_MS = MINUTE;

/**
 * The server runs behind the host's reverse proxy, so the socket address is the
 * proxy's and every visitor would share one counter. Express must be told how many
 * proxies to trust to take the visitor's address from X-Forwarded-For. Trusting any
 * number of them ("true") would let a visitor pick their own address by sending the
 * header, so only a hop count, an address list or false is accepted.
 */
function parseTrustProxy(value) {
    if (value === undefined || value === '') return 1;
    if (/^\d+$/.test(value)) return Number(value);
    if (value === 'false') return false;
    if (value === 'true') throw new Error('TRUST_PROXY=true would let visitors spoof their IP');
    return value;
}

function limiter(windowMs, limit) {
    return rateLimit({
        windowMs,
        limit,
        standardHeaders: 'draft-8',
        legacyHeaders: false,
        message: { error: 'Too many requests, please try again later.' }
    });
}

// Created per app so each server (and each test server) starts with fresh counters.
function createRateLimiters() {
    return {
        upload: limiter(15 * MINUTE, 10),
        // Deleting, moving and creating folders share one budget.
        desktop: limiter(15 * MINUTE, 30)
    };
}

/**
 * Why a chat message cannot be saved, or null if it can. The web client caps the
 * fields lower than this; the server cap is for everything else that can post.
 */
function chatMessageError(user, text) {
    if (typeof user !== 'string' || typeof text !== 'string' || !user.trim() || !text.trim()) {
        return 'User and text required';
    }
    if (Array.from(user).length > MAX_CHAT_USER) {
        return `User name is limited to ${MAX_CHAT_USER} characters`;
    }
    if (Array.from(text).length > MAX_CHAT_TEXT) {
        return `Message is limited to ${MAX_CHAT_TEXT} characters`;
    }
    return null;
}

/**
 * A fixed-window counter for one WebSocket connection, which the HTTP rate limiter
 * never sees once the upgrade is done. take() says whether one more message fits.
 */
function createMessageBudget(limit = WS_MESSAGES_PER_WINDOW, windowMs = WS_WINDOW_MS,
    now = Date.now) {
    let windowStart = now();
    let used = 0;
    return {
        take() {
            const t = now();
            if (t - windowStart >= windowMs) {
                windowStart = t;
                used = 0;
            }
            if (used >= limit) return false;
            used += 1;
            return true;
        }
    };
}

module.exports = {
    parseTrustProxy,
    createRateLimiters,
    chatMessageError,
    createMessageBudget,
    MAX_CHAT_USER,
    MAX_CHAT_TEXT,
    MAX_WS_PAYLOAD
};
