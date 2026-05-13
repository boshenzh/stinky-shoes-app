// Bearer middleware: resolves Authorization: Bearer yss_live_... into req.user.
// Missing header → req.user = null and pass through (anonymous reads still work).
// Malformed / unknown / revoked → 401 (a present-but-bad credential is never silent).
import { hashToken, isPlausibleToken } from '../lib/tokens.js';

export function createBearerMiddleware(pool) {
  return async function bearerMiddleware(req, res, next) {
    req.user = null;
    const header = req.headers.authorization || req.headers.Authorization;
    if (!header || typeof header !== 'string') return next();

    const match = /^Bearer\s+(.+)$/i.exec(header.trim());
    if (!match) {
      return res.status(401).json({ error: 'invalid_token' });
    }
    const raw = match[1].trim();
    if (!isPlausibleToken(raw)) {
      return res.status(401).json({ error: 'invalid_token' });
    }

    try {
      const hash = hashToken(raw);
      const result = await pool.query(
        `SELECT t.id AS token_id, t.user_id, u.username
           FROM api_tokens t
           JOIN users u ON u.id = t.user_id
          WHERE t.token_hash = $1 AND t.revoked_at IS NULL
          LIMIT 1`,
        [hash]
      );
      if (result.rows.length === 0) {
        return res.status(401).json({ error: 'invalid_token' });
      }
      const row = result.rows[0];
      req.user = { id: row.user_id, username: row.username, token_id: row.token_id };
      pool.query('UPDATE api_tokens SET last_used_at = now() WHERE id = $1', [row.token_id])
        .catch(() => {});
      return next();
    } catch (e) {
      console.error('[bearer] lookup failed:', e);
      return res.status(500).json({ error: 'server_error' });
    }
  };
}
