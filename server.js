import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import { hashPassword, verifyPassword, hasPassword } from "./lib/password.js";
import { createAuthRouter } from "./server/routes/auth.js";
import { createGymsRouter } from "./server/routes/gyms.js";
import { createFeedbackRouter } from "./server/routes/feedback.js";
import { createTokensRouter } from "./server/routes/tokens.js";
import { createBearerMiddleware } from "./server/middleware/bearer.js";

dotenv.config();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
const port = process.env.PORT || 3000;
const host = process.env.HOST || "127.0.0.1";
// so req.ip respects X-Forwarded-For in prod behind a proxy
app.set('trust proxy', true);

// Serve static files - use dist/ in production (after vite build), public/ in development
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, "dist")));
} else {
  app.use(express.static(path.join(__dirname, "public")));
}
app.use(express.json());

// Config endpoint - returns Protomaps API key if available
// Protomaps API key is optional - if not provided, falls back to demo PMTiles file
app.get("/config", (req, res) => {
  const protomapsKey = process.env.PROTOMAPS_API_KEY || "";
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.json({ 
    protomapsKey: protomapsKey,
    maptilerKey: "" // Legacy - kept for backward compatibility
  });
});

// --- Database
function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    return new Pool({ connectionString, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined });
  }
  return new Pool({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'gyms',
  });
}

const pool = getPool();

// Boot-time schema check: the gyms route filters listing queries on
// `business_status`. If the column hasn't been migrated onto this DB yet,
// every listing request will 500. Log loudly so a failed deploy is obvious
// without waiting for users to hit the bug.
pool.query(`
  SELECT 1 FROM information_schema.columns
  WHERE table_name = 'gyms' AND column_name = 'business_status' LIMIT 1
`).then(r => {
  if (r.rows.length === 0) {
    console.error('🚨 SCHEMA MISMATCH: gyms.business_status is missing on the connected DB.');
    console.error('   GET /api/gyms and /api/gyms/by-region will fail until migration 001 runs.');
    console.error('   Apply: node scripts/run_migration.mjs scripts/migrations/001_add_business_status.sql --target=<local|neon>');
  }
}).catch(err => {
  console.error('Boot-time schema check failed (continuing):', err.message);
});

// Resolve Authorization: Bearer ... into req.user before any route runs.
app.use(createBearerMiddleware(pool));

// --- Route Modules ---
// Token management is more specific than /api/auth, mount it first.
const tokensRouter = createTokensRouter(pool, { hasPassword, verifyPassword });
app.use('/api/auth/tokens', tokensRouter);

// Register authentication routes
const authRouter = createAuthRouter(pool);
app.use('/api/auth', authRouter);

// Register gym routes
const gymsRouter = createGymsRouter(pool, hasPassword, verifyPassword);
app.use('/api/gyms', gymsRouter);

// Register feedback routes
const feedbackRouter = createFeedbackRouter(pool);
app.use('/api/feedback', feedbackRouter);

// Start server
app.listen(port, host, () => {
  console.log(`Server running at http://${host}:${port}`);
});
