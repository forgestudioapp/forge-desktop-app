'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');

const root = path.join(__dirname, '..');
const read = file => fs.readFileSync(path.join(root, file), 'utf8');

test('the public site does not load analytics before consent', () => {
  const home = read('docs/index.html');
  assert.match(home, /src="consent\.js"/);
  assert.doesNotMatch(home, /src="analytics\.js"/);
  assert.match(home, /data-consent-accept/);
  assert.match(home, /data-consent-refuse/);
});

test('analytics requires current consent and uses a session-only id', () => {
  const analytics = read('docs/analytics.js');
  assert.match(analytics, /consent\.choice !== 'accepted'/);
  assert.match(analytics, /sessionStorage\.getItem\('forge_session_id'\)/);
  assert.doesNotMatch(analytics, /localStorage\.setItem\('forge_sid'/);
  assert.doesNotMatch(analytics, /document\.referrer \|\| ''\)\.slice/);
  assert.match(analytics, /sb_publishable_/);
  assert.doesNotMatch(analytics, /Bearer eyJ/);
});

test('legal pages and machine-readable discovery files exist', () => {
  for (const file of ['docs/privacy.html', 'docs/cookies.html', 'docs/terms.html', 'docs/refunds.html', 'docs/legal-notice.html', 'docs/robots.txt', 'docs/llms.txt', 'docs/sitemap.xml']) {
    assert.ok(fs.statSync(path.join(root, file)).size > 0, `${file} should not be empty`);
  }
});

test('every public HTML image has an alt attribute', () => {
  const files = fs.readdirSync(path.join(root, 'docs')).filter(file => file.endsWith('.html'));
  for (const file of files) {
    const html = read(path.join('docs', file));
    const images = html.match(/<img\b[^>]*>/gi) || [];
    for (const image of images) assert.match(image, /\balt\s*=\s*(?:"[^"]*"|'[^']*')/i, `${file}: ${image}`);
  }
});

test('the desktop app no longer sends install telemetry', () => {
  const main = read('main.js');
  assert.doesNotMatch(main, /pingInstallAnalytics|getOrCreateInstallId|rest\/v1\/app_installs/);
});
