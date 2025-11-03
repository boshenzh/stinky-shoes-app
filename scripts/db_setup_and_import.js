import 'dotenv/config';
import fs from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { Pool } from 'pg';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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

async function setup(pool) {
  await pool.query(`create extension if not exists postgis`);
  await pool.query(`create extension if not exists pgcrypto`);
  await pool.query(`create extension if not exists pg_trgm`);

  // Create gyms table
  await pool.query(`
  create table if not exists gyms (
    id uuid primary key default gen_random_uuid(),
    provider text not null default 'amap',
    provider_poi_id text not null,
    name text not null,
    address text,
    city text,
    state text,
    country_code text,
    phone text,
    type text,
    geom geography(Point, 4326) not null,
    image_primary_url text,
    raw jsonb,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    unique (provider, provider_poi_id)
  )`);
  
  // Add state column if it doesn't exist (migration for existing databases)
  await pool.query(`
    DO $$ 
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gyms' AND column_name = 'state') THEN
        ALTER TABLE gyms ADD COLUMN state text;
        CREATE INDEX IF NOT EXISTS gyms_state_idx ON gyms(state);
        CREATE INDEX IF NOT EXISTS gyms_city_state_country_idx ON gyms(city, state, country_code);
      END IF;
    END $$;
  `);

  // Create users table
  await pool.query(`
  create table if not exists users (
    id uuid primary key default gen_random_uuid(),
    username text not null unique,
    password_hash text null,
    created_at timestamptz default now(),
    updated_at timestamptz default now(),
    email text,
    display_name text,
    preferences jsonb,
    constraint username_format check (username ~ '^[a-zA-Z0-9_-]{3,20}$')
  )`);

  // Create gym_votes table (with all vote fields including style percentages)
  await pool.query(`
  create table if not exists gym_votes (
    id uuid primary key default gen_random_uuid(),
    gym_id uuid not null references gyms(id) on delete cascade,
    user_id uuid references users(id) on delete cascade,
    username text,
    smell smallint check (smell between 0 and 100),
    difficulty smallint check (difficulty >= -3 and difficulty <= 3),
    parking_availability smallint check (parking_availability >= 0 and parking_availability <= 100),
    pet_friendly smallint check (pet_friendly >= 0 and pet_friendly <= 100),
    -- Style percentages (normalized, sum to 100)
    crimpy_pct smallint check (crimpy_pct >= 0 and crimpy_pct <= 100),
    dynos_pct smallint check (dynos_pct >= 0 and dynos_pct <= 100),
    overhang_pct smallint check (overhang_pct >= 0 and overhang_pct <= 100),
    slab_pct smallint check (slab_pct >= 0 and slab_pct <= 100),
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  )`);
  
  // Add style percentage columns if they don't exist (migration for existing databases)
  await pool.query(`
    DO $$ 
    BEGIN
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gym_votes' AND column_name = 'crimpy_pct') THEN
        ALTER TABLE gym_votes ADD COLUMN crimpy_pct smallint CHECK (crimpy_pct >= 0 AND crimpy_pct <= 100);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gym_votes' AND column_name = 'dynos_pct') THEN
        ALTER TABLE gym_votes ADD COLUMN dynos_pct smallint CHECK (dynos_pct >= 0 AND dynos_pct <= 100);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gym_votes' AND column_name = 'overhang_pct') THEN
        ALTER TABLE gym_votes ADD COLUMN overhang_pct smallint CHECK (overhang_pct >= 0 AND overhang_pct <= 100);
      END IF;
      IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gym_votes' AND column_name = 'slab_pct') THEN
        ALTER TABLE gym_votes ADD COLUMN slab_pct smallint CHECK (slab_pct >= 0 AND slab_pct <= 100);
      END IF;
    END $$;
  `);

  // Create feedback table
  await pool.query(`
  create table if not exists feedback (
    id uuid primary key default gen_random_uuid(),
    feedback_type text,
    message text not null,
    user_id uuid references users(id) on delete set null,
    user_name text,
    user_email text,
    timestamp timestamptz default now(),
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  )`);

  // Create gym_style_votes table for style tags
  await pool.query(`
  create table if not exists gym_style_votes (
    id uuid primary key default gen_random_uuid(),
    gym_id uuid not null references gyms(id) on delete cascade,
    user_id uuid references users(id) on delete cascade,
    username text,
    style text not null,
    created_at timestamptz default now()
  )`);

  // Create gym_utility_votes table for utility upvote/downvote
  await pool.query(`
  create table if not exists gym_utility_votes (
    id uuid primary key default gen_random_uuid(),
    gym_id uuid not null references gyms(id) on delete cascade,
    user_id uuid references users(id) on delete cascade,
    username text,
    utility_name text not null,
    vote smallint not null check (vote in (1, -1)),
    created_at timestamptz default now(),
    updated_at timestamptz default now()
  )`);

  // Create indexes
  await pool.query(`create index if not exists gyms_geom_gix on gyms using gist (geom)`);
  await pool.query(`create index if not exists gyms_name_trgm on gyms using gin (name gin_trgm_ops)`);
  await pool.query(`create index if not exists users_username_idx on users(username)`);
  await pool.query(`create index if not exists gym_votes_gym_id_idx on gym_votes(gym_id)`);
  await pool.query(`create index if not exists gym_votes_user_id_idx on gym_votes(user_id)`);
  await pool.query(`create index if not exists gym_style_votes_gym_id_idx on gym_style_votes(gym_id)`);
  await pool.query(`create index if not exists gym_style_votes_user_id_idx on gym_style_votes(user_id)`);
  await pool.query(`create index if not exists gym_style_votes_style_idx on gym_style_votes(style)`);
  await pool.query(`create index if not exists gym_utility_votes_gym_id_idx on gym_utility_votes(gym_id)`);
  await pool.query(`create index if not exists gym_utility_votes_user_id_idx on gym_utility_votes(user_id)`);
  await pool.query(`create index if not exists gym_utility_votes_utility_name_idx on gym_utility_votes(utility_name)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS feedback_user_id_idx ON feedback(user_id)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON feedback(created_at)`);
  await pool.query(`CREATE INDEX IF NOT EXISTS feedback_type_idx ON feedback(feedback_type)`);

  // Create unique constraints (try both user_id and username approaches)
  await pool.query(`do $$ begin
    begin
      create unique index gym_votes_gym_user_unique on gym_votes(gym_id, user_id) where user_id is not null;
    exception when others then null; end;
  end $$;`);
  await pool.query(`do $$ begin
    begin
      create unique index gym_votes_gym_username_unique on gym_votes(gym_id, username) where username is not null;
    exception when others then null; end;
  end $$;`);
  await pool.query(`do $$ begin
    begin
      create unique index gym_style_votes_gym_user_style_unique on gym_style_votes(gym_id, user_id, style) where user_id is not null;
    exception when others then null; end;
  end $$;`);
  await pool.query(`do $$ begin
    begin
      create unique index gym_style_votes_gym_username_style_unique on gym_style_votes(gym_id, username, style) where username is not null;
    exception when others then null; end;
  end $$;`);
  await pool.query(`do $$ begin
    begin
      create unique index gym_utility_votes_gym_user_utility_unique on gym_utility_votes(gym_id, user_id, utility_name) where user_id is not null;
    exception when others then null; end;
  end $$;`);
  await pool.query(`do $$ begin
    begin
      create unique index gym_utility_votes_gym_username_utility_unique on gym_utility_votes(gym_id, username, utility_name) where username is not null;
    exception when others then null; end;
  end $$;`);
}

function parseGym(obj) {
  const lng = obj?.location?.lng;
  const lat = obj?.location?.lat;
  if (typeof lng !== 'number' || typeof lat !== 'number') return null;
  return {
    provider: 'amap',
    provider_poi_id: obj.id,
    name: obj.name || 'Gym',
    address: obj.address || null,
    city: obj.city || null,
    state: obj.province || null, // For China, province is stored as 'province' in the JSON
    country_code: 'CN', // China gyms are all from CN
    phone: obj.tel || null,
    type: obj.type || null,
    image: obj.image || null,
    lng,
    lat,
    raw: obj,
  };
}

async function importGyms(pool) {
  const filePath = path.resolve(__dirname, '../data/seed/china_gyms.json');
  const raw = await fs.readFile(filePath, 'utf8');
  const list = JSON.parse(raw);
  let count = 0;
  for (const item of list) {
    const g = parseGym(item);
    if (!g) continue;
    const q = `
      insert into gyms (provider, provider_poi_id, name, address, city, state, country_code, phone, type, geom, image_primary_url, raw)
      values ($1,$2,$3,$4,$5,$6,$7,$8,$9, ST_SetSRID(ST_MakePoint($10,$11),4326)::geography, $12, $13)
      on conflict (provider, provider_poi_id)
      do update set name=excluded.name, address=excluded.address, city=excluded.city, state=excluded.state, country_code=excluded.country_code,
        phone=excluded.phone, type=excluded.type, image_primary_url=excluded.image_primary_url, raw=excluded.raw,
        updated_at=now()
    `;
    await pool.query(q, [g.provider, g.provider_poi_id, g.name, g.address, g.city, g.state, g.country_code, g.phone, g.type, g.lng, g.lat, g.image, g.raw]);
    count += 1;
  }
  console.log(`Imported/updated ${count} gyms from china_gyms.json`);
}

function parseGooglePlace(obj) {
  const lat = obj?.location?.lat ?? obj?.location?.latitude;
  const lng = obj?.location?.lng ?? obj?.location?.longitude;
  if (typeof lng !== 'number' || typeof lat !== 'number') return null;
  const details = obj.details || {};
  const name = details?.displayName?.text || obj.name || null;
  const address = details?.formattedAddress || obj.address || obj.formattedAddress || null;
  const phone = details?.nationalPhoneNumber || obj.phone || null;
  const primaryType = details?.primaryType || obj.primaryType || null;
  const types = Array.isArray(details?.types) ? details.types : (Array.isArray(obj.types) ? obj.types : []);
  const imagePrimaryUrl = undefined; // optional; omit for now
  const providerPoiId = obj.id || (typeof obj.name === 'string' && obj.name.startsWith('places/') ? obj.name.split('/')[1] : obj.name) || null;
  if (!providerPoiId) return null;
  return {
    provider: 'google',
    provider_poi_id: providerPoiId,
    name: name || 'Gym',
    address: address || null,
    city: null,
    country_code: obj.country || null,
    phone: phone || null,
    type: primaryType || (Array.isArray(types) ? types.join(',') : null),
    image: imagePrimaryUrl || null,
    lng,
    lat,
    raw: obj,
  };
}

async function importWorldGymsGoogle(pool) {
  const detailedPath = path.resolve(__dirname, '../data/seed/world_gyms_google_detailed.json');
  const basicPath = path.resolve(__dirname, '../data/seed/world_gyms_google.json');
  let list = [];
  try {
    const st = await fs.stat(detailedPath);
    if (st && st.isFile()) {
      const raw = await fs.readFile(detailedPath, 'utf8');
      list = JSON.parse(raw);
    }
  } catch {}
  if (!Array.isArray(list) || list.length === 0) {
    try {
      const raw = await fs.readFile(basicPath, 'utf8');
      list = JSON.parse(raw);
    } catch {
      console.log('No world_gyms_google.json found; skipping Google import');
      return;
    }
  }
  let count = 0;
  for (const item of list) {
    const g = parseGooglePlace(item);
    if (!g) continue;
    const q = `
      insert into gyms (provider, provider_poi_id, name, address, city, country_code, phone, type, geom, image_primary_url, raw)
      values ($1,$2,$3,$4,$5,$6,$7,$8, ST_SetSRID(ST_MakePoint($9,$10),4326)::geography, $11, $12)
      on conflict (provider, provider_poi_id)
      do update set name=excluded.name, address=excluded.address, city=excluded.city, country_code=excluded.country_code,
        phone=excluded.phone, type=excluded.type, image_primary_url=excluded.image_primary_url, raw=excluded.raw,
        updated_at=now()
    `;
    await pool.query(q, [g.provider, g.provider_poi_id, g.name, g.address, g.city, g.country_code, g.phone, g.type, g.lng, g.lat, g.image, g.raw]);
    count += 1;
  }
  console.log(`Imported/updated ${count} gyms from world_gyms_google*.json`);
}

async function main() {
  const pool = getPool();
  try {
    await setup(pool);
    await importGyms(pool);
    await importWorldGymsGoogle(pool);
  } finally {
    await pool.end();
  }
}

main().catch((e) => { console.error(e); process.exit(1); });


