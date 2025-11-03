// Authentication routes
import express from 'express';
import { hashPassword, verifyPassword, hasPassword } from '../../lib/password.js';
import { getOrCreateUser } from '../lib/db-helpers.js';

const router = express.Router();

export function createAuthRouter(pool) {
  // POST /api/auth/register - Register user or set password (password is optional)
  router.post('/register', async (req, res) => {
    try {
      const username = typeof (req.body && req.body.username) === 'string' ? req.body.username.trim() : null;
      const password = typeof (req.body && req.body.password) === 'string' ? req.body.password.trim() : null;
      
      if (!username || username.length === 0) {
        return res.status(400).json({ error: 'username is required' });
      }
      if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) {
        return res.status(400).json({ error: 'username must be 3-20 alphanumeric characters, underscore, or hyphen' });
      }
      
      // Password is optional - only validate if provided
      if (password && password.length > 0 && password.length < 6) {
        return res.status(400).json({ error: 'password must be at least 6 characters if provided' });
      }
      
      // Get or create user
      const user = await getOrCreateUser(pool, username);
      
      // Check if user already has a password
      const userHasPassword = hasPassword(user.password_hash);
      
      // If password provided, set or update it
      if (password && password.length >= 6) {
        // If user already has a password, check if provided password matches (login)
        if (userHasPassword) {
          const isValid = await verifyPassword(password, user.password_hash);
          if (isValid) {
            return res.json({ ok: true, user_id: user.id, username: user.username, message: 'Login successful' });
          }
          return res.status(401).json({ error: 'Username already exists with a different password. Please use the login endpoint or provide the correct password.' });
        }
        
        // User exists but has no password - set password for the first time
        const passwordHash = await hashPassword(password);
        await pool.query('UPDATE users SET password_hash = $1, updated_at = now() WHERE id = $2', [passwordHash, user.id]);
        return res.json({ ok: true, user_id: user.id, username: user.username, message: 'Password set successfully' });
      }
      
      // No password provided during registration
      if (userHasPassword) {
        // User already exists with a password - cannot register without password
        return res.status(400).json({ error: 'User already exists with a password. Please use the login endpoint or provide the password to set/update it.' });
      }
      
      // User exists but has no password, or is new user - allow registration without password
      return res.json({ ok: true, user_id: user.id, username: user.username, message: 'User registered (password optional)' });
    } catch (e) {
      console.error(e);
      if (e.code === '23505') { // unique_violation
        res.status(409).json({ error: 'Username already exists' });
      } else {
        res.status(500).json({ error: 'server_error' });
      }
    }
  });

  // POST /api/auth/login - Login with username and password
  router.post('/login', async (req, res) => {
    try {
      const username = typeof req.body?.username === 'string' ? req.body.username.trim() : null;
      const password = typeof req.body?.password === 'string' ? req.body.password : null;
      
      if (!username || username.length === 0) {
        return res.status(400).json({ error: 'username is required' });
      }
      if (!password) {
        return res.status(400).json({ error: 'password is required' });
      }
      
      const userResult = await pool.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username]);
      if (userResult.rows.length === 0) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }
      
      const user = userResult.rows[0];
      if (!hasPassword(user.password_hash)) {
        return res.status(401).json({ error: 'User has no password set. Please register first.' });
      }
      
      const isValid = await verifyPassword(password, user.password_hash);
      if (!isValid) {
        return res.status(401).json({ error: 'Invalid username or password' });
      }
      
      return res.json({ ok: true, user_id: user.id, username: user.username });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // GET /api/auth/check - Check if username exists and has password
  router.get('/check', async (req, res) => {
    try {
      const username = typeof (req.query && req.query.username) === 'string' ? req.query.username.trim() : null;
      if (!username) {
        return res.status(400).json({ error: 'username is required' });
      }
      
      const userResult = await pool.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username]);
      if (userResult.rows.length === 0) {
        return res.json({ exists: false, has_password: false });
      }
      
      const user = userResult.rows[0];
      return res.json({ 
        exists: true, 
        has_password: hasPassword(user.password_hash),
        user_id: user.id 
      });
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'server_error' });
    }
  });

  return router;
}

