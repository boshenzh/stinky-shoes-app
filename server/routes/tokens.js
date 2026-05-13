// API token management: POST to mint, GET to list, DELETE to revoke.
import express from 'express';
import { generateRawToken, hashToken, prefixOf } from '../lib/tokens.js';

export function createTokensRouter(pool, { hasPassword, verifyPassword }) {
  const router = express.Router();

  // POST /api/auth/tokens — mint a new token.
  // Requires username + password (the raw credentials), never an existing token.
  // Returns the raw token exactly once.
  router.post('/', async (req, res) => {
    try {
      const username = typeof req.body?.username === 'string' ? req.body.username.trim() : null;
      const password = typeof req.body?.password === 'string' ? req.body.password : null;
      const name = typeof req.body?.name === 'string' ? req.body.name.trim() : null;

      if (!username) return res.status(400).json({ error: 'username is required' });
      if (!password) return res.status(400).json({ error: 'password is required' });
      if (!name) return res.status(400).json({ error: 'name is required' });
      if (name.length > 64) return res.status(400).json({ error: 'name must be 64 chars or fewer' });

      const userResult = await pool.query(
        'SELECT id, username, password_hash FROM users WHERE username = $1',
        [username]
      );
      if (userResult.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }
      const user = userResult.rows[0];
      if (!hasPassword(user.password_hash)) {
        return res.status(400).json({
          error: 'User has no password set. Set a password via /api/auth/register first.',
        });
      }
      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }

      const raw = generateRawToken();
      const insert = await pool.query(
        `INSERT INTO api_tokens (user_id, name, token_prefix, token_hash)
         VALUES ($1, $2, $3, $4)
         RETURNING id, name, token_prefix, created_at`,
        [user.id, name, prefixOf(raw), hashToken(raw)]
      );

      const row = insert.rows[0];
      return res.status(201).json({
        id: row.id,
        name: row.name,
        token_prefix: row.token_prefix,
        created_at: row.created_at,
        token: raw,
      });
    } catch (e) {
      console.error('[tokens.create]', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  // GET /api/auth/tokens — list the caller's own active tokens.
  router.get('/', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'authentication_required' });
    try {
      const result = await pool.query(
        `SELECT id, name, token_prefix, last_used_at, created_at
           FROM api_tokens
          WHERE user_id = $1 AND revoked_at IS NULL
          ORDER BY created_at DESC`,
        [req.user.id]
      );
      return res.json(result.rows);
    } catch (e) {
      console.error('[tokens.list]', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  // DELETE /api/auth/tokens/:id — revoke a token the caller owns.
  router.delete('/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'authentication_required' });
    try {
      const result = await pool.query(
        `UPDATE api_tokens
            SET revoked_at = now()
          WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL`,
        [req.params.id, req.user.id]
      );
      if (result.rowCount === 0) {
        return res.status(404).json({ error: 'not_found' });
      }
      return res.json({ ok: true });
    } catch (e) {
      console.error('[tokens.revoke]', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  return router;
}
