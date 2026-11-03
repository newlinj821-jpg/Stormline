import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { classifyPushFailure } from '../netlify/lib/push-diagnostics.mjs';

test('Netlify push sender uses the CommonJS default import',()=>{
  const source=readFileSync(new URL('../netlify/functions/push.mjs',import.meta.url),'utf8');
  assert.match(source,/import webpush from ['"]web-push['"]/);
  assert.doesNotMatch(source,/import \* as webpush from ['"]web-push['"]/);
});
test('Scheduled alerts use the CommonJS default import',()=>{
  const source=readFileSync(new URL('../netlify/functions/check-alerts.mjs',import.meta.url),'utf8');
  assert.match(source,/import webpush from ['"]web-push['"]/);
  assert.doesNotMatch(source,/import \* as webpush from ['"]web-push['"]/);
});
test('Missing push library functions are not blamed on VAPID keys',()=>{
  const diagnostic=classifyPushFailure(new TypeError('webpush.setVapidDetails is not a function'));
  assert.equal(diagnostic.code,'PUSH_LIBRARY_IMPORT_ERROR');
});
