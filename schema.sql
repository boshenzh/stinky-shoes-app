-- Database Schema Setup for Stinky Shoes App
-- Run this in Neon SQL Editor to set up all tables and indexes

-- ============================================
-- 1. Extensions (PostGIS, pgcrypto, pg_trgm)
-- ============================================
CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- ============================================
-- 2. Tables
-- ============================================

-- Gyms table
CREATE TABLE IF NOT EXISTS gyms (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  provider text NOT NULL DEFAULT 'amap',
  provider_poi_id text NOT NULL,
  name text NOT NULL,
  address text,
  city text,
  state text,
  country_code text,
  phone text,
  type text,
  geom geography(Point, 4326) NOT NULL,
  image_primary_url text,
  raw jsonb,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE (provider, provider_poi_id)
);

-- Add state column migration (for existing databases)
DO $$ 
BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'gyms' AND column_name = 'state') THEN
    ALTER TABLE gyms ADD COLUMN state text;
    CREATE INDEX IF NOT EXISTS gyms_state_idx ON gyms(state);
    CREATE INDEX IF NOT EXISTS gyms_city_state_country_idx ON gyms(city, state, country_code);
  END IF;
END $$;

-- Users table
CREATE TABLE IF NOT EXISTS users (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  username text NOT NULL UNIQUE,
  password_hash text NULL,
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  email text,
  display_name text,
  preferences jsonb,
  CONSTRAINT username_format CHECK (username ~ '^[a-zA-Z0-9_-]{3,20}$')
);

-- Gym votes table
CREATE TABLE IF NOT EXISTS gym_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  username text,
  smell smallint CHECK (smell BETWEEN 0 AND 100),
  difficulty smallint CHECK (difficulty >= -3 AND difficulty <= 3),
  parking_availability smallint CHECK (parking_availability >= 0 AND parking_availability <= 100),
  pet_friendly smallint CHECK (pet_friendly >= 0 AND pet_friendly <= 100),
  -- Style percentages (normalized, sum to 100)
  crimpy_pct smallint CHECK (crimpy_pct >= 0 AND crimpy_pct <= 100),
  dynos_pct smallint CHECK (dynos_pct >= 0 AND dynos_pct <= 100),
  overhang_pct smallint CHECK (overhang_pct >= 0 AND overhang_pct <= 100),
  slab_pct smallint CHECK (slab_pct >= 0 AND slab_pct <= 100),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Add style percentage columns migration (for existing databases)
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

-- Feedback table
CREATE TABLE IF NOT EXISTS feedback (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  feedback_type text,
  message text NOT NULL,
  user_id uuid REFERENCES users(id) ON DELETE SET NULL,
  user_name text,
  user_email text,
  timestamp timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Gym style votes table
CREATE TABLE IF NOT EXISTS gym_style_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  username text,
  style text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- Gym utility votes table
CREATE TABLE IF NOT EXISTS gym_utility_votes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
  user_id uuid REFERENCES users(id) ON DELETE CASCADE,
  username text,
  utility_name text NOT NULL,
  vote smallint NOT NULL CHECK (vote IN (1, -1)),
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- ============================================
-- 3. Indexes
-- ============================================

-- Gyms indexes
CREATE INDEX IF NOT EXISTS gyms_geom_gix ON gyms USING GIST (geom);
CREATE INDEX IF NOT EXISTS gyms_name_trgm ON gyms USING GIN (name gin_trgm_ops);

-- Users indexes
CREATE INDEX IF NOT EXISTS users_username_idx ON users(username);

-- Gym votes indexes
CREATE INDEX IF NOT EXISTS gym_votes_gym_id_idx ON gym_votes(gym_id);
CREATE INDEX IF NOT EXISTS gym_votes_user_id_idx ON gym_votes(user_id);

-- Gym style votes indexes
CREATE INDEX IF NOT EXISTS gym_style_votes_gym_id_idx ON gym_style_votes(gym_id);
CREATE INDEX IF NOT EXISTS gym_style_votes_user_id_idx ON gym_style_votes(user_id);
CREATE INDEX IF NOT EXISTS gym_style_votes_style_idx ON gym_style_votes(style);

-- Gym utility votes indexes
CREATE INDEX IF NOT EXISTS gym_utility_votes_gym_id_idx ON gym_utility_votes(gym_id);
CREATE INDEX IF NOT EXISTS gym_utility_votes_user_id_idx ON gym_utility_votes(user_id);
CREATE INDEX IF NOT EXISTS gym_utility_votes_utility_name_idx ON gym_utility_votes(utility_name);

-- Feedback indexes
CREATE INDEX IF NOT EXISTS feedback_user_id_idx ON feedback(user_id);
CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON feedback(created_at);
CREATE INDEX IF NOT EXISTS feedback_type_idx ON feedback(feedback_type);

-- ============================================
-- 4. Unique Constraints
-- ============================================

-- Gym votes unique constraints
DO $$ 
BEGIN
  BEGIN
    CREATE UNIQUE INDEX gym_votes_gym_user_unique ON gym_votes(gym_id, user_id) WHERE user_id IS NOT NULL;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

DO $$ 
BEGIN
  BEGIN
    CREATE UNIQUE INDEX gym_votes_gym_username_unique ON gym_votes(gym_id, username) WHERE username IS NOT NULL;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

-- Gym style votes unique constraints
DO $$ 
BEGIN
  BEGIN
    CREATE UNIQUE INDEX gym_style_votes_gym_user_style_unique ON gym_style_votes(gym_id, user_id, style) WHERE user_id IS NOT NULL;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

DO $$ 
BEGIN
  BEGIN
    CREATE UNIQUE INDEX gym_style_votes_gym_username_style_unique ON gym_style_votes(gym_id, username, style) WHERE username IS NOT NULL;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

-- Gym utility votes unique constraints
DO $$ 
BEGIN
  BEGIN
    CREATE UNIQUE INDEX gym_utility_votes_gym_user_utility_unique ON gym_utility_votes(gym_id, user_id, utility_name) WHERE user_id IS NOT NULL;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

DO $$ 
BEGIN
  BEGIN
    CREATE UNIQUE INDEX gym_utility_votes_gym_username_utility_unique ON gym_utility_votes(gym_id, username, utility_name) WHERE username IS NOT NULL;
  EXCEPTION WHEN others THEN NULL;
  END;
END $$;

