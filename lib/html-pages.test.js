'use strict';
const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const root = path.join(__dirname, '..');
for (const page of fs.readdirSync(root).filter(name => name.endsWith('.html'))) {
  test(`${page}: inline scripts compile and local navigation targets exist`, () => {
    const html = fs.readFileSync(path.join(root, page), 'utf8');
    for (const match of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
      if (/\bsrc\s*=|application\/ld\+json/i.test(match[1])) continue;
      assert.doesNotThrow(() => new vm.Script(match[2], { filename: page }));
    }
    for (const match of html.matchAll(/\bhref=["']([^"'#?]+\.html)(?:[?#][^"']*)?["']/gi)) {
      if (/^(?:https?:|\/)/i.test(match[1])) continue;
      assert.ok(fs.existsSync(path.resolve(root, match[1])), `${page}: missing ${match[1]}`);
    }
  });
}
