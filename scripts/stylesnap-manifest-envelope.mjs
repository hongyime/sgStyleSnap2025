// Recipient-encrypted raw manifest bytes. No provider credentials or plaintext files.
import { constants, createCipheriv, createDecipheriv, createHash, createPublicKey,
  privateDecrypt, publicEncrypt, randomBytes } from 'node:crypto';
import { readFile } from 'node:fs/promises';
import { pathToFileURL } from 'node:url';

export const MAX_PLAINTEXT_BYTES = 32 * 1024 * 1024;
export const MAX_ENVELOPE_BYTES = 45 * 1024 * 1024;
export const RECIPIENT_SHA256 = '2f1af15a75a30476ab8fb6b6e35807f32bf0952d140490eda171546bda0a088c';
const SHA = /^[0-9a-f]{64}$/;
const FORMAT = 'stylesnap-media-manifest-export';
class EnvelopeError extends Error {}
const fail = code => { throw new EnvelopeError(code); };
const hash = value => createHash('sha256').update(value).digest('hex');
const aad = recipient => Buffer.from(`stylesnap-media-manifest-export-v1|${recipient}`);

export function validateRecipient(pem, expectedSha) {
  if (!Buffer.isBuffer(pem) || pem.length > 16384 || !SHA.test(expectedSha) || hash(pem) !== expectedSha ||
      !pem.toString('ascii').startsWith('-----BEGIN PUBLIC KEY-----')) fail('invalid_recipient');
  let key;
  try { key = createPublicKey(pem); } catch { fail('invalid_recipient'); }
  if (key.asymmetricKeyType !== 'rsa' || key.asymmetricKeyDetails.modulusLength < 3072 ||
      key.asymmetricKeyDetails.modulusLength > 8192) fail('invalid_recipient_strength');
  return key;
}

export function sealManifest(plaintext, publicPem, expectedSha) {
  const recipient = validateRecipient(publicPem, expectedSha);
  if (!Buffer.isBuffer(plaintext) || !plaintext.length || plaintext.length > MAX_PLAINTEXT_BYTES) fail('manifest_byte_limit');
  const key = randomBytes(32), iv = randomBytes(12);
  try {
    const cipher = createCipheriv('aes-256-gcm', key, iv);
    cipher.setAAD(aad(expectedSha));
    const ciphertext = Buffer.concat([cipher.update(plaintext), cipher.final()]);
    return { format: FORMAT, version: 1, recipient_sha256: expectedSha, plaintext_bytes: plaintext.length,
      wrapped_key: publicEncrypt({ key: recipient, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING }, key).toString('base64'),
      iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), ciphertext: ciphertext.toString('base64') };
  } finally { key.fill(0); }
}

function decode(value, maximum) {
  if (typeof value !== 'string' || value.length > Math.ceil(maximum / 3) * 4 ||
      value.length % 4 !== 0 || /[^A-Za-z0-9+/=]/.test(value)) fail('invalid_envelope');
  const decoded = Buffer.from(value, 'base64');
  if (decoded.length > maximum || decoded.toString('base64') !== value) fail('invalid_envelope');
  return decoded;
}

// Receiving-side helper only: callers retain decrypted bytes in memory.
export function openManifest(envelope, privateKey, expectedRecipientSha) {
  if (!envelope || typeof envelope !== 'object' || Array.isArray(envelope) ||
      Object.keys(envelope).sort().join(',') !== 'ciphertext,format,iv,plaintext_bytes,recipient_sha256,tag,version,wrapped_key' ||
      envelope.format !== FORMAT || envelope.version !== 1 || !SHA.test(expectedRecipientSha) ||
      envelope.recipient_sha256 !== expectedRecipientSha || !Number.isSafeInteger(envelope.plaintext_bytes) ||
      envelope.plaintext_bytes < 1 || envelope.plaintext_bytes > MAX_PLAINTEXT_BYTES) fail('invalid_envelope');
  const wrapped = decode(envelope.wrapped_key, 1024), iv = decode(envelope.iv, 12), tag = decode(envelope.tag, 16);
  const ciphertext = decode(envelope.ciphertext, MAX_PLAINTEXT_BYTES);
  if (wrapped.length < 384 || iv.length !== 12 || tag.length !== 16 || ciphertext.length !== envelope.plaintext_bytes) fail('invalid_envelope');
  let key;
  try {
    key = privateDecrypt({ key: privateKey, oaepHash: 'sha256', padding: constants.RSA_PKCS1_OAEP_PADDING }, wrapped);
    if (key.length !== 32) fail('invalid_envelope');
    const decipher = createDecipheriv('aes-256-gcm', key, iv);
    decipher.setAAD(aad(expectedRecipientSha)); decipher.setAuthTag(tag);
    return Buffer.concat([decipher.update(ciphertext), decipher.final()]);
  } catch { fail('envelope_authentication_failed'); }
  finally { key?.fill(0); }
}

async function readBounded(stream) {
  const parts = []; let size = 0;
  for await (const part of stream) {
    size += part.length;
    if (size > MAX_PLAINTEXT_BYTES) fail('manifest_byte_limit');
    parts.push(part);
  }
  return Buffer.concat(parts);
}

async function main() {
  try {
    const mode = process.argv[2];
    if (process.argv.length !== 3 || !['validate', 'seal'].includes(mode)) fail('invalid_envelope_mode');
    const publicPem = await readFile(new URL('./stylesnap-export-recipient.pem', import.meta.url));
    validateRecipient(publicPem, RECIPIENT_SHA256);
    if (mode === 'validate') {
      process.stdout.write(JSON.stringify({ recipient_sha256: RECIPIENT_SHA256 }));
    } else {
      const plaintext = await readBounded(process.stdin);
      try { process.stdout.write(JSON.stringify(sealManifest(plaintext, publicPem, RECIPIENT_SHA256)) + '\n'); }
      finally { plaintext.fill(0); }
    }
  } catch (error) {
    process.stderr.write(JSON.stringify({ failure_code: error instanceof EnvelopeError ? error.message : 'envelope_failed' }) + '\n');
    process.exitCode = 1;
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) await main();
