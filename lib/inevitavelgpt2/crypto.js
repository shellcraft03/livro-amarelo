import crypto from 'crypto';

const ALGORITHM = 'aes-256-gcm';
const IV_BYTES = 12;

function getTokenKey() {
  const raw = process.env.OAUTH_TOKEN_ENCRYPTION_KEY;
  if (!raw) throw new Error('Missing env var: OAUTH_TOKEN_ENCRYPTION_KEY');

  const trimmed = raw.trim();
  const candidates = [
    () => Buffer.from(trimmed, 'base64'),
    () => Buffer.from(trimmed, 'hex'),
  ];

  for (const parse of candidates) {
    const key = parse();
    if (key.length === 32) return key;
  }

  throw new Error('OAUTH_TOKEN_ENCRYPTION_KEY must be 32 bytes encoded as base64 or hex');
}

export function encryptSecret(value) {
  const iv = crypto.randomBytes(IV_BYTES);
  const cipher = crypto.createCipheriv(ALGORITHM, getTokenKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(String(value), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `v1:${iv.toString('base64url')}:${tag.toString('base64url')}:${ciphertext.toString('base64url')}`;
}

export function decryptSecret(value) {
  const [version, iv, tag, ciphertext] = String(value || '').split(':');
  if (version !== 'v1' || !iv || !tag || !ciphertext) {
    throw new Error('Invalid encrypted secret format');
  }

  const decipher = crypto.createDecipheriv(
    ALGORITHM,
    getTokenKey(),
    Buffer.from(iv, 'base64url')
  );
  decipher.setAuthTag(Buffer.from(tag, 'base64url'));
  return Buffer.concat([
    decipher.update(Buffer.from(ciphertext, 'base64url')),
    decipher.final(),
  ]).toString('utf8');
}

export function randomToken(bytes = 32) {
  return crypto.randomBytes(bytes).toString('base64url');
}

export function sha256Base64Url(value) {
  return crypto.createHash('sha256').update(value).digest('base64url');
}
