# Vercel Deployment Guide

This guide covers deploying your climbing gym map application to Vercel.

## Files Created

### ✅ Step 1: Vercel Configuration (`vercel.json`)
- Configured build commands and output directory
- Set up routing for API and static files
- Added CORS headers for API endpoints

### ✅ Step 2: API Serverless Functions
- `api/index.js` - Main Express app handler for all API routes
- `api/config.js` - Config endpoint handler

### ✅ Step 3: Build Configuration
- Added `vercel-build` script to `package.json`
- Installed `cors` package for CORS support

## Next Steps

### Step 4: Database Setup

You need a hosted PostgreSQL database. Recommended options:

1. **Vercel Postgres** (easiest with Vercel)
   - Go to Vercel Dashboard → Storage → Create Database → Postgres
   - Connection string provided automatically

2. **Supabase** (free tier available)
   - Visit https://supabase.com
   - Create project → Get connection string
   - Supports PostGIS extensions

3. **Neon** (serverless Postgres, free tier)
   - Visit https://neon.tech
   - Create database → Get connection string

4. **Railway** (free tier available)
   - Visit https://railway.app
   - Create PostgreSQL service → Get connection string

### Step 5: Environment Variables

Set these in Vercel Dashboard → Settings → Environment Variables:

**Required:**
- `DATABASE_URL` - PostgreSQL connection string (from your database provider)
- `MAPTILER_API_KEY` - Your MapTiler API key

**Optional (if not using DATABASE_URL):**
- `PGHOST` - Database host
- `PGPORT` - Database port (usually 5432)
- `PGUSER` - Database user
- `PGPASSWORD` - Database password
- `PGDATABASE` - Database name
- `PGSSL` - Set to `"true"` if using SSL (usually required for hosted databases)

**Production:**
- `NODE_ENV` - Set to `"production"`

### Step 6: Database Migration

Before deploying, ensure your database schema is set up:

1. **Run database setup script locally** (if you have a local database):
   ```bash
   npm run db:import
   ```

2. **For production database**, run the setup manually:
   - Connect to your hosted database
   - Run the SQL from `scripts/db_setup_and_import.js`
   - Or use a database migration tool

3. **Import gym data** (if needed):
   - Use the same database connection
   - Run import scripts with production DATABASE_URL

### Step 7: Deploy to Vercel

#### Option A: Vercel CLI (Recommended)

```bash
# Install Vercel CLI
npm i -g vercel

# Login to Vercel
vercel login

# Deploy (will prompt for configuration)
vercel

# For production deployment
vercel --prod
```

#### Option B: GitHub Integration

1. Push your code to GitHub
2. Go to https://vercel.com
3. Click "New Project"
4. Import your GitHub repository
5. Configure:
   - **Framework Preset**: Other
   - **Root Directory**: `./`
   - **Build Command**: `npm run build`
   - **Output Directory**: `dist`
   - **Install Command**: `npm install`
6. Add environment variables (see Step 5)
7. Click "Deploy"

### Step 8: Post-Deployment Verification

After deployment, verify:

1. **Frontend loads**: Visit `https://your-app.vercel.app`
2. **API endpoints work**: 
   - `https://your-app.vercel.app/api/gyms`
   - `https://your-app.vercel.app/config`
3. **Database connection**: Check Vercel function logs for connection errors
4. **CORS**: Verify API requests from frontend work correctly

### Troubleshooting

#### API Routes Return 404
- Check `vercel.json` routing configuration
- Verify `api/index.js` exports correctly
- Check Vercel function logs

#### Database Connection Errors
- Verify `DATABASE_URL` is set correctly
- Check if `PGSSL=true` is needed
- Verify database allows connections from Vercel IPs
- Check connection pool settings (max: 2 for serverless)

#### CORS Errors
- Verify CORS middleware is enabled in `api/index.js`
- Check `vercel.json` headers configuration
- Ensure frontend URL matches allowed origins

#### Cold Start Issues
- First request may be slow (cold start)
- Consider Vercel Pro plan for better performance
- Connection pooling helps with subsequent requests

### Important Notes

1. **Database Connections**: Serverless functions create new instances, so connection pooling is limited. The pool is set to `max: 2` connections.

2. **Function Timeouts**:
   - Free tier: 10 seconds
   - Pro tier: 60 seconds
   - Ensure database queries complete within limits

3. **Environment Variables**: Must be set in Vercel Dashboard for production. Local `.env` files are not deployed.

4. **Static Files**: Vite build output goes to `dist/` which Vercel serves automatically.

5. **API Routes**: All `/api/*` requests route to `api/index.js`. The Express app handles routing internally without the `/api` prefix (Vercel handles that).

## Deployment Checklist

- [ ] Database created and connection string obtained
- [ ] Environment variables set in Vercel Dashboard
- [ ] Database schema migrated/imported
- [ ] Local build tested: `npm run build`
- [ ] Code pushed to GitHub (if using GitHub integration)
- [ ] Vercel project created and configured
- [ ] Deployment successful
- [ ] Frontend loads correctly
- [ ] API endpoints respond
- [ ] Database queries work
- [ ] CORS configured correctly

## Files Modified/Created

- ✅ `vercel.json` - Vercel configuration
- ✅ `api/index.js` - Main API serverless function
- ✅ `api/config.js` - Config endpoint
- ✅ `package.json` - Added `vercel-build` script
- ✅ Added `cors` dependency

## Need Help?

If you encounter issues:
1. Check Vercel function logs in the dashboard
2. Verify environment variables are set correctly
3. Test database connection locally with production DATABASE_URL
4. Check Vercel deployment logs for build errors

