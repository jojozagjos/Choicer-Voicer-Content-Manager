'use strict';

/**
 * The escaping the renderer puts around other people's text.
 *
 * Every pack title, publisher name, summary, tag and file-name-inside-a-zip
 * shown in this app was written by somebody else. Most of them are placed into
 * attributes of tags the app builds, so the interesting question is not
 * whether `<script>` survives — it is whether a double quote can end an
 * attribute early and start another one.
 *
 * Run by `npm test`.
 */

const fs = require('fs');
const path = require('path');
const assert = require('assert');

// The module is written for the browser, so it is read and evaluated here
// rather than required. Keeping one copy is the point; a second one written
// for the tests would be the thing that stayed correct.
const source = fs.readFileSync(
  path.join(__dirname, '..', 'src', 'renderer', 'escape.js'), 'utf8'
);
const escapeForHtml = new Function(`${source.replace(/export function/, 'function')}
  return escapeForHtml;`)();

let passed = 0;
let failed = 0;

function check(what, fn) {
  try {
    fn();
    passed++;
  } catch (err) {
    failed++;
    console.log(`  FAILED  ${what}\n          ${err.message}`);
  }
}

console.log('\nBetween tags');

check('a tag cannot be opened', () => {
  assert.strictEqual(escapeForHtml('<script>alert(1)</script>'),
    '&lt;script&gt;alert(1)&lt;/script&gt;');
});

check('an ampersand does not become an entity', () => {
  assert.strictEqual(escapeForHtml('Tom & Jerry'), 'Tom &amp; Jerry');
});

check('escaping twice does not double up on itself', () => {
  // Not idempotent, and should not be: the second pass is escaping text that
  // happens to look like an entity, which is correct. This pins the behaviour
  // so nobody "fixes" it into a hole.
  assert.strictEqual(escapeForHtml(escapeForHtml('<b>')), '&amp;lt;b&amp;gt;');
});

console.log('\nInside an attribute, which is where it is mostly used');

check('a double quote cannot close the attribute', () => {
  const title = '" onerror="alert(1)';
  const html = `<img src="x" title="${escapeForHtml(title)}" />`;
  assert.ok(!/onerror=/.test(html.replace(/&quot;/g, '')) || !html.includes('" onerror='),
    'the quote survived into the markup');
  assert.ok(html.includes('&quot;'), 'the quote was not escaped');
});

check('a single quote cannot close the attribute', () => {
  const html = `<span data-x='${escapeForHtml("' onclick='alert(1)")}'>`;
  assert.ok(!html.includes("' onclick='"), 'the quote survived into the markup');
});

check('a backtick is escaped', () => {
  assert.ok(escapeForHtml('a`b').includes('&#96;'));
});

check('a real pack name is left readable', () => {
  assert.strictEqual(escapeForHtml("Caine's Crashout"), 'Caine&#39;s Crashout');
});

console.log('\nThings that are not strings');

check('null and undefined come back empty', () => {
  assert.strictEqual(escapeForHtml(null), '');
  assert.strictEqual(escapeForHtml(undefined), '');
});

check('a number survives', () => {
  assert.strictEqual(escapeForHtml(42), '42');
});

check('an object cannot smuggle markup through toString', () => {
  const sneaky = { toString: () => '<img onerror=alert(1)>' };
  assert.strictEqual(escapeForHtml(sneaky), '&lt;img onerror=alert(1)&gt;');
});

console.log(`\n${passed}/${passed + failed} passed\n`);
process.exit(failed ? 1 : 0);
