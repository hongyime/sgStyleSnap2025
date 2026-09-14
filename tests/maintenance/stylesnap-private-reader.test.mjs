import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { test } from 'node:test';
import { createClient } from '@supabase/supabase-js';
import { MAX_PRIVATE_MEDIA_BYTES, readPrivateMedia } from '../../src/lib/private-media.js';

const content = new Uint8Array([137, 80, 78, 71, 13, 10, 26, 10]);
const sha = createHash('sha256').update(content).digest('hex');
const reference = { table: 'clothes', id: '00000000-0000-4000-8000-000000000001', column: 'image_url', sourceUrl: 'https://fixtures.example.invalid/retained.png?label=a&b=c' };
const binding = {
  source_table: reference.table, source_id: reference.id, source_column: reference.column,
  source_url: reference.sourceUrl, manifest_sha: 'a'.repeat(64), content_sha256: sha,
  object_path: `sha256/${sha.slice(0, 2)}/${sha}`, content_bytes: content.length, mime_type: 'image/png',
};

function fixture({ rows = [binding], bytes = content, status = 200, stream, metadataError = false } = {}) {
  const calls = [];
  const client = createClient('https://fixture.supabase.co', 'synthetic-publishable-key', {
    auth: { persistSession: false, autoRefreshToken: false, detectSessionInUrl: false },
    global: { fetch: async (url, options) => {
      const parsed = new URL(url);
      assert.equal(parsed.origin, 'https://fixture.supabase.co');
      calls.push({ path: parsed.pathname, query: parsed.searchParams, options });
      if (parsed.pathname === '/rest/v1/stylesnap_media_bindings') {
        return new Response(JSON.stringify(metadataError ? { message: 'denied' } : rows), { status: metadataError ? 403 : 200, headers: { 'Content-Type': 'application/json' } });
      }
      assert.equal(parsed.pathname, `/storage/v1/object/stylesnap-media-archive/${binding.object_path}`);
      assert.equal(parsed.search, '');
      return new Response(status === 200 ? (stream || bytes) : JSON.stringify({ error: 'denied' }), { status });
    } },
  });
  return { client, calls };
}

test('real Supabase SDK reads one RLS binding and streams the exact verified image', async () => {
  const { client, calls } = fixture();
  const result = await readPrivateMedia(client, reference);
  assert.equal(result.sha256, sha);
  assert.equal(result.bytes, content.length);
  assert.equal(result.blob.type, 'image/png');
  assert.deepEqual(new Uint8Array(await result.blob.arrayBuffer()), content);
  assert.equal(calls.length, 2);
  assert.equal(calls[0].query.get('source_url'), `eq.${reference.sourceUrl}`);
  assert.equal(calls[1].options.cache, 'no-store');
});

for (const options of [{ rows: [] }, { metadataError: true }]) {
  test(`missing or forbidden binding stops before Storage (${JSON.stringify(options)})`, async () => {
    const { client, calls } = fixture(options);
    await assert.rejects(() => readPrivateMedia(client, reference), { code: 'media_unavailable' });
    assert.equal(calls.length, 1);
  });
}

for (const changes of [
  { source_id: '00000000-0000-4000-8000-000000000002' },
  { source_url: 'https://fixtures.example.invalid/stale.png' },
  { object_path: `manifests/${'a'.repeat(64)}.json.gz` },
  { content_bytes: MAX_PRIVATE_MEDIA_BYTES + 1 },
  { content_bytes: 0 },
  { mime_type: 'image/svg+xml' },
  { manifest_sha: null },
]) {
  test(`invalid binding ${Object.keys(changes)[0]} cannot start a media request`, async () => {
    const { client, calls } = fixture({ rows: [{ ...binding, ...changes }] });
    await assert.rejects(() => readPrivateMedia(client, reference), { code: 'invalid_media_binding' });
    assert.equal(calls.length, 1);
  });
}

test('truncated content fails byte parity', async () => {
  const { client } = fixture({ bytes: content.slice(0, -1) });
  await assert.rejects(() => readPrivateMedia(client, reference), { code: 'media_size_mismatch' });
});

test('same-length corruption fails checksum parity', async () => {
  const { client } = fixture({ bytes: new Uint8Array(content.length) });
  await assert.rejects(() => readPrivateMedia(client, reference), { code: 'media_checksum_mismatch' });
});

test('oversized streams are cancelled without reading the remaining chunks', async () => {
  let cancelled = false, reads = 0;
  const stream = new ReadableStream({
    pull(controller) { reads += 1; controller.enqueue(new Uint8Array(content.length + 1)); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  const { client } = fixture({ stream });
  await assert.rejects(() => readPrivateMedia(client, reference), { code: 'media_size_mismatch' });
  assert.equal(cancelled, true);
  assert.equal(reads, 1);
});

test('Storage rejection does not fall back to the retained external source URL', async () => {
  const { client, calls } = fixture({ status: 403 });
  await assert.rejects(() => readPrivateMedia(client, reference), { code: 'media_unavailable' });
  assert.equal(calls.length, 2);
});

test('a cancelled caller does not start any requests', async () => {
  const controller = new AbortController();
  controller.abort();
  const { client, calls } = fixture();
  await assert.rejects(() => readPrivateMedia(client, reference, { signal: controller.signal }), { code: 'media_read_cancelled' });
  assert.equal(calls.length, 0);
});

test('a stalled stream is cancelled when the read deadline expires', async () => {
  let cancelled = false;
  const stream = new ReadableStream({ cancel() { cancelled = true; } });
  const { client } = fixture({ stream });
  await assert.rejects(() => readPrivateMedia(client, reference, { timeoutMs: 25 }), { code: 'media_read_cancelled' });
  assert.equal(cancelled, true);
});

test('caller cancellation interrupts a stream already waiting for bytes', async () => {
  const controller = new AbortController();
  let cancelled = false;
  const stream = new ReadableStream({
    pull() { controller.abort(); },
    cancel() { cancelled = true; },
  }, { highWaterMark: 0 });
  const { client } = fixture({ stream });
  await assert.rejects(() => readPrivateMedia(client, reference, { signal: controller.signal }), { code: 'media_read_cancelled' });
  assert.equal(cancelled, true);
});

test('a subsequent read rechecks RLS instead of reusing a prior user result', async () => {
  const rows = [binding];
  const { client, calls } = fixture({ rows });
  await readPrivateMedia(client, reference);
  rows.length = 0;
  await assert.rejects(() => readPrivateMedia(client, reference), { code: 'media_unavailable' });
  assert.equal(calls.length, 3);
});

test('unsupported reference columns are rejected before any request', async () => {
  const { client, calls } = fixture();
  await assert.rejects(() => readPrivateMedia(client, { ...reference, column: 'owner_id' }), { code: 'invalid_media_reference' });
  assert.equal(calls.length, 0);
});
