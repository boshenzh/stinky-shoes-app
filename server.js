import express from "express";
import dotenv from "dotenv";
import path from "path";
import { fileURLToPath } from "url";
import { Pool } from "pg";
import { hashPassword, verifyPassword, hasPassword } from "./lib/password.js";
import { createAuthRouter } from "./server/routes/auth.js";
import { createGymsRouter } from "./server/routes/gyms.js";
import { createFeedbackRouter } from "./server/routes/feedback.js";

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

// Minimal config endpoint to deliver MapTiler key to the client
app.get("/config", (req, res) => {
  const key = process.env.MAPTILER_API_KEY || "";
  const origin = req.headers.origin;
  if (origin) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Vary", "Origin");
  }
  res.json({ maptilerKey: key });
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

// --- Route Modules ---
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
