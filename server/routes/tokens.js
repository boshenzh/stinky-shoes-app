// API token management.
//
// Policy: at most one active token per user (enforced by the partial unique
// index `api_tokens_one_active_per_user_idx`).
//
// Routes:
//   POST   /api/auth/tokens         mint            (body creds; 409 if already has one)
//   POST   /api/auth/tokens/rotate  rotate          (body creds; atomic revoke+mint)
//   POST   /api/auth/tokens/list    list            (body creds; browser-friendly)
//   POST   /api/auth/tokens/:id/revoke revoke       (body creds; browser-friendly)
//   GET    /api/auth/tokens         list            (Bearer; CLI/agent)
//   DELETE /api/auth/tokens/:id     revoke          (Bearer; CLI/agent)
import express from 'express';
import { generateRawToken, hashToken, prefixOf } from '../lib/tokens.js';

const LIST_SQL = `
  SELECT id, name, token_prefix, last_used_at, created_at
    FROM api_tokens
   WHERE user_id = $1 AND revoked_at IS NULL
   ORDER BY created_at DESC
`;

const REVOKE_SQL = `
  UPDATE api_tokens
     SET revoked_at = now()
   WHERE id = $1 AND user_id = $2 AND revoked_at IS NULL
`;

export function createTokensRouter(pool, { hasPassword, verifyPassword }) {
  const router = express.Router();

  // Body-credential auth shared by mint, rotate, list (POST), revoke (POST).
  async function verifyBodyCredentials(req) {
    const username = typeof req.body?.username === 'string' ? req.body.username.trim() : null;
    const password = typeof req.body?.password === 'string' ? req.body.password : null;
    if (!username) return { ok: false, status: 400, error: 'username is required' };
    if (!password) return { ok: false, status: 400, error: 'password is required' };

    const result = await pool.query(
      'SELECT id, username, password_hash FROM users WHERE username = $1',
      [username]
    );
    if (result.rows.length === 0) {
      return { ok: false, status: 401, error: 'Invalid username or password' };
    }
    const user = result.rows[0];
    if (!hasPassword(user.password_hash)) {
      return {
        ok: false,
        status: 400,
        error: 'User has no password set. Set a password via /api/auth/register first.',
      };
    }
    const valid = await verifyPassword(password, user.password_hash);
    if (!valid) return { ok: false, status: 401, error: 'Invalid username or password' };
    return { ok: true, user };
  }

  function validateName(name, { required }) {
    if (name == null || name === '') {
      if (required) return { ok: false, status: 400, error: 'name is required' };
      return { ok: true, value: null };
    }
    if (typeof name !== 'string') return { ok: false, status: 400, error: 'name must be a string' };
    const trimmed = name.trim();
    if (required && !trimmed) return { ok: false, status: 400, error: 'name is required' };
    if (trimmed.length > 64) return { ok: false, status: 400, error: 'name must be 64 chars or fewer' };
    return { ok: true, value: trimmed };
  }

  async function insertNewToken(client, userId, name) {
    const raw = generateRawToken();
    const insert = await client.query(
      `INSERT INTO api_tokens (user_id, name, token_prefix, token_hash)
       VALUES ($1, $2, $3, $4)
       RETURNING id, name, token_prefix, created_at`,
      [userId, name, prefixOf(raw), hashToken(raw)]
    );
    const row = insert.rows[0];
    return {
      id: row.id,
      name: row.name,
      token_prefix: row.token_prefix,
      created_at: row.created_at,
      token: raw,
    };
  }

  // POST /api/auth/tokens — mint. Refuses if the user already has an active token.
  router.post('/', async (req, res) => {
    try {
      const auth = await verifyBodyCredentials(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

      const nameCheck = validateName(req.body?.name, { required: true });
      if (!nameCheck.ok) return res.status(nameCheck.status).json({ error: nameCheck.error });

      const existing = await pool.query(
        'SELECT 1 FROM api_tokens WHERE user_id = $1 AND revoked_at IS NULL LIMIT 1',
        [auth.user.id]
      );
      if (existing.rows.length > 0) {
        return res.status(409).json({
          error: 'token_exists',
          message: 'You already have an active API token. Rotate or revoke it first.',
        });
      }

      const minted = await insertNewToken(pool, auth.user.id, nameCheck.value);
      return res.status(201).json(minted);
    } catch (e) {
      if (e.code === '23505') {
        // Unique-violation race: someone else minted between the SELECT and INSERT.
        return res.status(409).json({ error: 'token_exists' });
      }
      console.error('[tokens.create]', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  // POST /api/auth/tokens/rotate — atomically revoke the active token (if any) and mint a new one.
  // If `name` isn't supplied, inherits the old token's name.
  router.post('/rotate', async (req, res) => {
    const auth = await verifyBodyCredentials(req);
    if (!auth.ok) return res.status(auth.status).json({ error: auth.error });

    const nameCheck = validateName(req.body?.name, { required: false });
    if (!nameCheck.ok) return res.status(nameCheck.status).json({ error: nameCheck.error });

    const client = await pool.connect();
    try {
      await client.query('BEGIN');
      const revoked = await client.query(
        `UPDATE api_tokens
            SET revoked_at = now()
          WHERE user_id = $1 AND revoked_at IS NULL
        RETURNING name`,
        [auth.user.id]
      );
      const inheritedName = revoked.rows[0]?.name ?? null;
      const finalName = nameCheck.value || inheritedName || 'api-token';
      const minted = await insertNewToken(client, auth.user.id, finalName);
      await client.query('COMMIT');
      return res.status(201).json(minted);
    } catch (e) {
      await client.query('ROLLBACK').catch(() => {});
      console.error('[tokens.rotate]', e);
      return res.status(500).json({ error: 'server_error' });
    } finally {
      client.release();
    }
  });

  // POST /api/auth/tokens/list — body-credential list (browser).
  router.post('/list', async (req, res) => {
    try {
      const auth = await verifyBodyCredentials(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
      const result = await pool.query(LIST_SQL, [auth.user.id]);
      return res.json(result.rows);
    } catch (e) {
      console.error('[tokens.list.body]', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  // POST /api/auth/tokens/:id/revoke — body-credential revoke (browser).
  router.post('/:id/revoke', async (req, res) => {
    try {
      const auth = await verifyBodyCredentials(req);
      if (!auth.ok) return res.status(auth.status).json({ error: auth.error });
      const result = await pool.query(REVOKE_SQL, [req.params.id, auth.user.id]);
      if (result.rowCount === 0) return res.status(404).json({ error: 'not_found' });
      return res.json({ ok: true });
    } catch (e) {
      console.error('[tokens.revoke.body]', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  // GET /api/auth/tokens — Bearer list (CLI/agent).
  router.get('/', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'authentication_required' });
    try {
      const result = await pool.query(LIST_SQL, [req.user.id]);
      return res.json(result.rows);
    } catch (e) {
      console.error('[tokens.list]', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  // DELETE /api/auth/tokens/:id — Bearer revoke (CLI/agent).
  router.delete('/:id', async (req, res) => {
    if (!req.user) return res.status(401).json({ error: 'authentication_required' });
    try {
      const result = await pool.query(REVOKE_SQL, [req.params.id, req.user.id]);
      if (result.rowCount === 0) return res.status(404).json({ error: 'not_found' });
      return res.json({ ok: true });
    } catch (e) {
      console.error('[tokens.revoke]', e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  return router;
}
