# Database Schema

This PostgreSQL database uses **PostGIS** extension for geospatial data storage.

## Tables

### 1. `gyms` table

Main table storing gym/climbing facility information from two providers:
- **`amap`** provider: Data from `china_gyms.json`
- **`google`** provider: Data from `world_gyms_google.json` or `world_gyms_google_detailed.json`

#### Columns

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PRIMARY KEY, DEFAULT `gen_random_uuid()` | Unique identifier |
| `provider` | `text` | NOT NULL, DEFAULT 'amap' | Data source: 'amap' or 'google' |
| `provider_poi_id` | `text` | NOT NULL | Provider-specific POI identifier |
| `name` | `text` | NOT NULL | Gym/climbing facility name |
| `address` | `text` | NULL | Full address |
| `city` | `text` | NULL | City name |
| `province` | `text` | NULL | Province/state (for China) or country (for Google) |
| `phone` | `text` | NULL | Phone number |
| `type` | `text` | NULL | Type/category of facility |
| `geom` | `geography(Point, 4326)` | NOT NULL | Geographic point (longitude, latitude) |
| `image_primary_url` | `text` | NULL | Primary image URL |
| `raw` | `jsonb` | NULL | Original JSON data from source |
| `created_at` | `timestamptz` | DEFAULT `now()` | Record creation timestamp |
| `updated_at` | `timestamptz` | DEFAULT `now()` | Last update timestamp |

#### Constraints
- **Unique constraint**: `(provider, provider_poi_id)` - prevents duplicates from same provider

#### Indexes
- `gyms_geom_gix`: GIST index on `geom` for spatial queries
- `gyms_name_trgm`: GIN trigram index on `name` for text search

---

### 2. `gym_votes` table

Stores smell/vote ratings for gyms from users.

#### Columns

| Column | Type | Constraints | Description |
|--------|------|-------------|-------------|
| `id` | `uuid` | PRIMARY KEY, DEFAULT `gen_random_uuid()` | Unique identifier |
| `gym_id` | `uuid` | NOT NULL, FOREIGN KEY → `gyms(id)` | References `gyms.id` |
| `user_id` | `uuid` | NULL, FOREIGN KEY → `users(id)` | References `users.id` (preferred) |
| `username` | `text` | NULL | Voter's username (3-20 alphanumeric chars, underscore, hyphen) |
| `smell` | `smallint` | CHECK (0-100) | Smell rating: 0 (pleasant) to 100 (stinky) |
| `difficulty` | `smallint` | CHECK (-3 to +3) | Difficulty rating: -3 (easy) to +3 (hard) |
| `parking_availability` | `smallint` | CHECK (0-100) | Parking availability: 0 (none) to 100 (plentiful) |
| `pet_friendly` | `smallint` | CHECK (0-100) | Pet-friendly rating: 0 (not allowed) to 100 (very pet-friendly) |
| `crimpy_pct` | `smallint` | CHECK (0-100) | Style percentage: Crimpy climbing style (0-100) |
| `dynos_pct` | `smallint` | CHECK (0-100) | Style percentage: Dynos climbing style (0-100) |
| `overhang_pct` | `smallint` | CHECK (0-100) | Style percentage: Overhang climbing style (0-100) |
| `slab_pct` | `smallint` | CHECK (0-100) | Style percentage: Slab climbing style (0-100) |
| `created_at` | `timestamptz` | DEFAULT `now()` | Vote timestamp |
| `updated_at` | `timestamptz` | DEFAULT `now()` | Last update timestamp |

#### Constraints
- **Foreign key**: `gym_id` references `gyms(id)` ON DELETE CASCADE
- **Foreign key**: `user_id` references `users(id)` ON DELETE CASCADE (preferred method)
- **Check constraint**: `smell` must be between 0 and 100
- **Check constraint**: `difficulty` must be between -3 and +3
- **Check constraint**: `parking_availability` must be between 0 and 100
- **Check constraint**: `pet_friendly` must be between 0 and 100
- **Check constraint**: `crimpy_pct` must be between 0 and 100
- **Check constraint**: `dynos_pct` must be between 0 and 100
- **Check constraint**: `overhang_pct` must be between 0 and 100
- **Check constraint**: `slab_pct` must be between 0 and 100
- **Note**: Style percentages should sum to 100% when all are provided
- **Unique constraint**: `(gym_id, user_id)` WHERE `user_id IS NOT NULL` - one vote per user per gym
- **Unique constraint**: `(gym_id, username)` WHERE `username IS NOT NULL` - one vote per username per gym (backwards compatibility)

#### Indexes
- `gym_votes_gym_id_idx`: Index on `gym_id` for faster lookups
- `gym_votes_user_id_idx`: Index on `user_id` for faster lookups
- `gym_votes_gym_user_unique`: Unique index on `(gym_id, user_id)` WHERE `user_id IS NOT NULL`
- `gym_votes_gym_username_unique`: Unique index on `(gym_id, username)` WHERE `username IS NOT NULL`

---

## Extensions Used

1. **PostGIS** - Geospatial data types and functions (`geography`, `ST_MakePoint`, `ST_Intersects`, etc.)
2. **pgcrypto** - UUID generation (`gen_random_uuid()`)
3. **pg_trgm** - Trigram indexing for fuzzy text search

---

## Data Import Flow

### From `china_gyms.json`
- Provider: `'amap'`
- Parsed via `parseGym()` function
- Fields mapped: `id` → `provider_poi_id`, `tel` → `phone`, etc.

### From `world_gyms_google.json`
- Provider: `'google'`
- Parsed via `parseGooglePlace()` function
- Uses Google Places API data structure
- Falls back to `world_gyms_google_detailed.json` if available

---

## API Query Example

The `/api/gyms` endpoint queries gyms by bounding box:

```sql
WITH box AS (
  SELECT ST_MakeEnvelope(minLng, minLat, maxLng, maxLat, 4326)::geography AS g
),
base AS (
  SELECT id, provider, provider_poi_id, name, address, city, country_code, phone, type,
         ST_X(ST_AsText(geom::geometry)) AS lng,
         ST_Y(ST_AsText(geom::geometry)) AS lat,
         image_primary_url
  FROM gyms, box
  WHERE ST_Intersects(geom, box.g)
),
last_by_username AS (
  SELECT gv.gym_id, gv.username, gv.smell, gv.difficulty, gv.parking_availability, gv.pet_friendly,
         ROW_NUMBER() OVER (PARTITION BY gv.gym_id, gv.username ORDER BY gv.created_at DESC) AS rn
  FROM gym_votes gv
  WHERE gv.username IS NOT NULL
),
vote_stats AS (
  SELECT gym_id,
         AVG(smell)::int AS smell_avg,
         COUNT(*) FILTER (WHERE smell IS NOT NULL) AS smell_votes,
         AVG(difficulty)::numeric(3,1) AS difficulty_avg,
         COUNT(*) FILTER (WHERE difficulty IS NOT NULL) AS difficulty_votes,
         AVG(parking_availability)::int AS parking_availability_avg,
         COUNT(*) FILTER (WHERE parking_availability IS NOT NULL) AS parking_votes,
         AVG(pet_friendly)::int AS pet_friendly_avg,
         COUNT(*) FILTER (WHERE pet_friendly IS NOT NULL) AS pet_friendly_votes
  FROM last_by_username WHERE rn = 1 GROUP BY gym_id
)
SELECT b.*, 
       vs.smell_avg, vs.smell_votes,
       vs.difficulty_avg, vs.difficulty_votes,
       vs.parking_availability_avg, vs.parking_votes,
       vs.pet_friendly_avg, vs.pet_friendly_votes
FROM base b 
LEFT JOIN vote_stats vs ON vs.gym_id = b.id
LIMIT 2000;
```

This query:
1. Filters gyms within the bounding box
2. Calculates average ratings for all vote fields (only latest vote per username per gym)
3. Returns gym data with aggregated vote statistics for smell, difficulty, parking, and pet-friendly

