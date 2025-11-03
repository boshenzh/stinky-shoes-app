# Import Gym Data Guide

## Quick Start

1. **Get your DATABASE_URL from Vercel:**
   - Go to Vercel Dashboard → Your Project → Settings → Environment Variables
   - Copy the `DATABASE_URL` value

2. **Set it locally:**
   ```bash
   # Edit .env.local (or create it)
   DATABASE_URL=your_neon_connection_string_here
   PGSSL=true
   ```

3. **Run the import:**
   ```bash
   npm run db:import
   ```

## What Gets Imported

The import script (`scripts/db_setup_and_import.js`) will:

1. **Setup database schema** (if not already done):
   - Creates tables: gyms, users, gym_votes, feedback, etc.
   - Creates indexes and constraints

2. **Import China gyms** from `data/seed/china_gyms.json`

3. **Import World gyms** from:
   - `data/seed/world_gyms_google_detailed.json` (if exists)
   - Otherwise: `data/seed/world_gyms_google.json`

## Available Data Files

- `china_gyms.json` (411KB) - China climbing gyms
- `world_gyms_google.json` (8.2MB) - World gyms (basic data)
- `world_gyms_google_detailed.json` (212MB) - World gyms (detailed data, large file)
- `world_gyms_compact.json` (5.2MB) - Compact world gyms

## Import Options

### Import to Neon Database (Production)

```bash
# Set DATABASE_URL in .env.local
export DATABASE_URL="your_neon_connection_string"
export PGSSL=true

# Run import
npm run db:import
```

### Import to Local Database

```bash
# Set local database variables in .env.local
export PGHOST=localhost
export PGPORT=5432
export PGUSER=postgres
export PGPASSWORD=your_password
export PGDATABASE=gyms

# Run import
npm run db:import
```

## Troubleshooting

### Connection Errors

If you get connection errors:
- Check that `DATABASE_URL` is correct
- Ensure `PGSSL=true` is set for Neon
- Verify your Neon database is active

### Large File Warnings

The `world_gyms_google_detailed.json` file is 212MB. If you want to use a smaller file:
- The script will automatically fall back to `world_gyms_google.json` if detailed doesn't exist
- Or you can temporarily rename the detailed file to skip it

### Verify Import

After importing, check in Neon SQL Editor:
```sql
SELECT COUNT(*) FROM gyms;
```

You should see the number of imported gyms.

