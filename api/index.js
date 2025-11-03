import express from 'express';
import cors from 'cors';
import { Pool } from 'pg';
import { hashPassword, verifyPassword, hasPassword } from '../lib/password.js';
import { createAuthRouter } from '../server/routes/auth.js';
import { createGymsRouter } from '../server/routes/gyms.js';
import { createFeedbackRouter } from '../server/routes/feedback.js';

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Database pool (reused across functions)
function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    return new Pool({ 
      connectionString, 
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined,
      // Connection pool settings for serverless
      max: 2, // Limit connections in serverless
      idleTimeoutMillis: 30000,
      connectionTimeoutMillis: 2000,
    });
  }
  return new Pool({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'gyms',
    max: 2,
    idleTimeoutMillis: 30000,
    connectionTimeoutMillis: 2000,
  });
}

const pool = getPool();

// Routes - Vercel passes full path including /api prefix
const authRouter = createAuthRouter(pool);
app.use('/api/auth', authRouter);

const gymsRouter = createGymsRouter(pool, hasPassword, verifyPassword);
app.use('/api/gyms', gymsRouter);

const feedbackRouter = createFeedbackRouter(pool);
app.use('/api/feedback', feedbackRouter);

// Config endpoint - returns Protomaps API key if available
app.get('/config', (req, res) => {
  const protomapsKey = process.env.PROTOMAPS_API_KEY || "";
  res.json({ 
    protomapsKey: protomapsKey,
    maptilerKey: "" // Legacy - kept for backward compatibility
  });
});

// Export as Vercel serverless function
export default app;

