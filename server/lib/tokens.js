// API token helpers. Tokens are 128 bits of randomness, prefixed with
// "yss_live_". The raw token is only ever returned at creation; the
// database stores sha256(raw) so a leaked DB cannot reveal tokens.
import crypto from 'crypto';

const PREFIX = 'yss_live_';
const RAW_HEX_BYTES = 16; // 32 hex chars
const DISPLAY_PREFIX_LEN = PREFIX.length + 8; // "yss_live_" + 8 hex chars

export function generateRawToken() {
  return PREFIX + crypto.randomBytes(RAW_HEX_BYTES).toString('hex');
}

export function hashToken(raw) {
  return crypto.createHash('sha256').update(raw).digest('hex');
}

export function prefixOf(raw) {
  return raw.slice(0, DISPLAY_PREFIX_LEN);
}

export function isPlausibleToken(raw) {
  return typeof raw === 'string'
    && raw.startsWith(PREFIX)
    && raw.length === PREFIX.length + RAW_HEX_BYTES * 2;
}
