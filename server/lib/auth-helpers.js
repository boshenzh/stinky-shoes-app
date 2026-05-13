// resolveActor: the single auth gate for write endpoints.
//
// Returns either:
//   { ok: true, user: { id, username } }
//   { ok: false, status, error }
//
// Bearer path (req.user set by bearerMiddleware): trust the token.
// Body path: validate the username, getOrCreateUser, then verify
// the bcrypt password if one is set on that user.
import { getOrCreateUser } from './db-helpers.js';

const USERNAME_RE = /^[a-zA-Z0-9_-]{3,20}$/;

export async function resolveActor(req, pool, { hasPassword, verifyPassword }) {
  if (req.user && req.user.id) {
    return { ok: true, user: { id: req.user.id, username: req.user.username } };
  }

  const username = typeof req.body?.username === 'string' ? req.body.username.trim() : null;
  const password = typeof req.body?.password === 'string' ? req.body.password : null;

  if (!username || username.length === 0) {
    return { ok: false, status: 400, error: 'username is required' };
  }
  if (!USERNAME_RE.test(username)) {
    return {
      ok: false,
      status: 400,
      error: 'username must be 3-20 alphanumeric characters, underscore, or hyphen',
    };
  }

  try {
    const user = await getOrCreateUser(pool, username);
    if (hasPassword(user.password_hash)) {
      if (!password) {
        return { ok: false, status: 401, error: 'Password required for this account' };
      }
      const valid = await verifyPassword(password, user.password_hash);
      if (!valid) {
        return { ok: false, status: 401, error: 'Password required for this account' };
      }
    }
    return { ok: true, user: { id: user.id, username: user.username } };
  } catch (e) {
    console.error('[resolveActor] failed:', e);
    return { ok: false, status: 500, error: 'server_error' };
  }
}
