const { test } = require('node:test');
const assert = require('node:assert/strict');
const {
    parseTrustProxy, chatMessageError, createMessageBudget, MAX_CHAT_USER, MAX_CHAT_TEXT
} = require('../abuseLimits');

test('TRUST_PROXY defaults to one hop and never to "trust everything"', () => {
    assert.equal(parseTrustProxy(undefined), 1);
    assert.equal(parseTrustProxy(''), 1);
    assert.equal(parseTrustProxy('2'), 2);
    assert.equal(parseTrustProxy('0'), 0);
    assert.equal(parseTrustProxy('false'), false);
    assert.equal(parseTrustProxy('loopback'), 'loopback');
    assert.throws(() => parseTrustProxy('true'), /spoof/);
});

test('chat messages need a user and a text within their limits', () => {
    assert.equal(chatMessageError('bob', 'hi'), null);
    assert.ok(chatMessageError('', 'hi'));
    assert.ok(chatMessageError('bob', '   '));
    assert.ok(chatMessageError('bob', { text: 'hi' }));
    assert.ok(chatMessageError(['bob'], 'hi'));

    assert.equal(chatMessageError('u'.repeat(MAX_CHAT_USER), 't'.repeat(MAX_CHAT_TEXT)), null);
    assert.match(chatMessageError('u'.repeat(MAX_CHAT_USER + 1), 'hi'), /30 characters/);
    assert.match(chatMessageError('bob', 't'.repeat(MAX_CHAT_TEXT + 1)), /500 characters/);
    // Characters, not UTF-16 units: an emoji counts once.
    assert.equal(chatMessageError('bob', '😀'.repeat(MAX_CHAT_TEXT)), null);
});

test('a WebSocket budget refuses past its limit until the window turns', () => {
    let now = 0;
    const budget = createMessageBudget(3, 1000, () => now);
    assert.deepEqual([budget.take(), budget.take(), budget.take(), budget.take()],
        [true, true, true, false]);
    now = 999;
    assert.equal(budget.take(), false);
    now = 1000;
    assert.equal(budget.take(), true);
});
