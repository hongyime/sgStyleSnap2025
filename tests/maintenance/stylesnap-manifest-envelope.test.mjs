import assert from 'node:assert/strict';
import { createHash, generateKeyPairSync } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import test from 'node:test';
import { sealManifest, openManifest, validateRecipient, RECIPIENT_SHA256,
  MAX_PLAINTEXT_BYTES } from '../../scripts/stylesnap-manifest-envelope.mjs';

const recipient = generateKeyPairSync('rsa', { modulusLength: 3072 });
const pem = Buffer.from(recipient.publicKey.export({ type: 'spki', format: 'pem' }));
const hash = value => createHash('sha256').update(value).digest('hex');
const fingerprint = hash(pem);
const raw = Buffer.from('{"private_url":"https://private.invalid/source","unicode":"衣服🦐","raw_field":[null,0,false],"reference_mapping":[{"status":"unresolved_asset"}]}');

test('hybrid encryption preserves every raw byte, including unresolved-reference metadata', () => {
  const sealed = sealManifest(raw, pem, fingerprint);
  assert.deepEqual(openManifest(sealed, recipient.privateKey, fingerprint), raw);
  for (const value of ['private.invalid', 'unresolved_asset', '衣服', 'raw_field']) {
    assert.ok(!JSON.stringify(sealed).includes(value));
  }
  const again = sealManifest(raw, pem, fingerprint);
  assert.notEqual(again.iv, sealed.iv); assert.notEqual(again.wrapped_key, sealed.wrapped_key);
  assert.notEqual(again.ciphertext, sealed.ciphertext);
});

test('multi-megabyte manifests remain bounded and decrypt without regex stack growth', () => {
  const large = Buffer.alloc(4 * 1024 * 1024, 'x');
  assert.deepEqual(openManifest(sealManifest(large, pem, fingerprint), recipient.privateKey, fingerprint), large);
});

test('tampered ciphertext, authentication tag, IV, wrapped key and recipient fail closed', () => {
  const sealed = sealManifest(raw, pem, fingerprint);
  for (const field of ['ciphertext', 'tag', 'iv', 'wrapped_key']) {
    const changed = structuredClone(sealed); const bytes = Buffer.from(changed[field], 'base64');
    bytes[0] ^= 1; changed[field] = bytes.toString('base64');
    assert.throws(() => openManifest(changed, recipient.privateKey, fingerprint), /authentication_failed/);
  }
  assert.throws(() => openManifest(sealed, recipient.privateKey, 'a'.repeat(64)), /invalid_envelope/);
  const wrong = generateKeyPairSync('rsa', { modulusLength: 3072 });
  assert.throws(() => openManifest(sealed, wrong.privateKey, fingerprint), /authentication_failed/);
});

test('recipient identity, key strength and public-only format are verified first', () => {
  assert.throws(() => sealManifest(raw, pem, 'a'.repeat(64)), /invalid_recipient/);
  const weak = generateKeyPairSync('rsa', { modulusLength: 2048 });
  const weakPem = Buffer.from(weak.publicKey.export({ type: 'spki', format: 'pem' }));
  assert.throws(() => sealManifest(raw, weakPem, hash(weakPem)), /invalid_recipient_strength/);
  const privatePem = Buffer.from(recipient.privateKey.export({ type: 'pkcs8', format: 'pem' }));
  assert.throws(() => validateRecipient(privatePem, hash(privatePem)), /invalid_recipient/);
});

test('malformed envelopes and oversized plaintext do not enter decryption', () => {
  const sealed = sealManifest(raw, pem, fingerprint);
  for (const changed of [null, [], {...sealed, version: 2}, {...sealed, plaintext_bytes: MAX_PLAINTEXT_BYTES + 1},
      {...sealed, iv: 'not base64'}, {...sealed, tag: ''}, {...sealed, extra: 'private'},
      {...sealed, ciphertext: sealed.ciphertext + '\n'}]) {
    assert.throws(() => openManifest(changed, recipient.privateKey, fingerprint), /invalid_envelope/);
  }
  assert.throws(() => sealManifest(Buffer.alloc(MAX_PLAINTEXT_BYTES + 1), pem, fingerprint), /manifest_byte_limit/);
});

test('checked-in public key matches the reviewed receiving fingerprint', async () => {
  const reviewed = await readFile(new URL('../../scripts/stylesnap-export-recipient.pem', import.meta.url));
  assert.equal(hash(reviewed), RECIPIENT_SHA256); validateRecipient(reviewed, RECIPIENT_SHA256);
});

test('invalid CLI invocation emits only a fixed error, never stdin plaintext', () => {
  const script = new URL('../../scripts/stylesnap-manifest-envelope.mjs', import.meta.url);
  const result = spawnSync(process.execPath, [fileURLToPath(script), 'invalid'], { input: raw, encoding: 'utf8' });
  assert.equal(result.status, 1); assert.equal(result.stdout, '');
  assert.deepEqual(JSON.parse(result.stderr), { failure_code: 'invalid_envelope_mode' });
});
