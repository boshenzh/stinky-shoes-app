# Your Shoe Smells 🧗‍♀️

An interactive web application for finding and rating climbing/bouldering gyms worldwide. Discover gyms, vote on smelliness, difficulty, parking availability, and more!

**Live site**: [yourshoesmells.com](https://yourshoesmells.com)

## Features

- 🗺️ **Interactive Map**: Browse climbing gyms worldwide using MapLibre GL JS and MapTiler
- 💨 **Gym Ratings**: Vote on gym smelliness (0-100), difficulty, parking, and pet-friendliness
- 🎯 **Climbing Styles**: Vote on gym styles (crimpy, dynos, overhang, slab percentages)
- 🏷️ **Utility Tags**: Mark gyms with utilities like showers, lockers, pro shop, etc.
- 🔍 **Search & Filter**: Find gyms by location, view statistics, and filter by ratings
- 👤 **User Accounts**: Optional accounts with passwords to track your votes
- 📍 **Geolocation**: Locate yourself on the map with one click
- 📱 **Mobile-Friendly**: Responsive design optimized for mobile devices

## Tech Stack

### Frontend
- **Vanilla JavaScript** (ES6 modules)
- **MapLibre GL JS** - Interactive map library
- **Vite** - Build tool and dev server
- **Tailwind CSS** - Utility-first CSS framework
- **Zustand** - Lightweight state management

### Backend
- **Express.js** - Web server framework
- **PostgreSQL** with **PostGIS** - Database with geospatial support
- **bcrypt** - Password hashing

### Deployment
- **Vercel** - Serverless hosting
- **Neon** - Serverless PostgreSQL database

## Prerequisites

- **Node.js** 18+ (see [NODE_UPDATE_GUIDE.md](./NODE_UPDATE_GUIDE.md) if needed)
- **PostgreSQL** with PostGIS extension (for local development)
- **MapTiler API Key** (free tier available at https://cloud.maptiler.com/)
- **Google Maps API Key** (optional, for geocoding/enrichment)

## Setup

### 1. Clone and Install

```bash
git clone <repository-url>
cd map
npm install
```

### 2. Environment Variables

Create `.env` file in the root directory:

```bash
# MapTiler API Key (required)
MAPTILER_API_KEY=your_maptiler_key_here

# Database Configuration (for local development)
PGHOST=127.0.0.1
PGPORT=5432
PGUSER=postgres
PGPASSWORD=your_password
PGDATABASE=gyms

# Optional: Google Maps API Key (for database enrichment)
GOOGLE_MAPS_API_KEY=your_google_maps_key_here
```

For **production/Neon database**, create `.env.local`:

```bash
# Neon Database Connection (production)
DATABASE_URL=postgresql://user:password@host/database?sslmode=require
PGSSL=true
```

### 3. Database Setup

#### Local Development

1. Create PostgreSQL database with PostGIS:
   ```sql
   CREATE DATABASE gyms;
   \c gyms
   CREATE EXTENSION IF NOT EXISTS postgis;
   ```

2. Run the schema setup:
   ```bash
   # Connect to your database and run:
   psql -d gyms -f schema.sql
   ```

#### Database Schema

The database includes these tables:
- `users` - User accounts
- `gyms` - Gym data with PostGIS geometry
- `gym_votes` - User votes (smell, difficulty, parking, etc.)
- `gym_style_votes` - Climbing style votes
- `gym_utility_votes` - Utility tags (showers, lockers, etc.)
- `feedback` - User feedback

See [schema.sql](./schema.sql) for full schema definition.

### 4. Run Development Server

```bash
# Start Express server (serves API + static files)
npm run dev

# Or use Vite dev server + Express (two terminals)
npm run dev:all

# Visit http://localhost:3000
```

## Database Management Scripts

### Enrich Local Database with City/State Data

Populate city/state information for gyms:

```bash
# Extract from existing raw JSON data (fast, no API calls)
npm run db:enrich-local

# Also use Google Geocoding API for remaining gyms
npm run db:enrich-local -- --api

# Limit to first 1000 gyms
npm run db:enrich-local -- --api --limit=1000
```

This script:
1. First extracts city/state from existing raw JSON data (if available)
2. Optionally uses Google Geocoding API for remaining gyms
3. Updates gym records with enriched location data

### Copy Local Database to Neon (Production)

Copy all data from local database to Neon:

```bash
npm run db:copy-to-neon
```

This script:
- Copies all tables (users, gyms, votes, feedback)
- Handles PostGIS geometry fields correctly
- Clears existing Neon data before copying
- Uses batch inserts for performance

**Requirements:**
- Local database: `PGHOST`, `PGDATABASE`, etc. in `.env`
- Neon database: `DATABASE_URL` in `.env.local`

## Project Structure

```
map/
├── api/                    # Vercel serverless functions
│   ├── index.js           # Main API handler
│   └── config.js          # Config endpoint
├── public/                # Frontend source files
│   ├── app.js             # Main application entry
│   ├── components/        # UI components
│   │   ├── map/          # Map-related components
│   │   │   ├── MapLayers.js      # Layer management
│   │   │   ├── PopupManager.js   # Popup creation
│   │   │   ├── MapControls.js   # Map controls
│   │   │   └── VotePanel.js     # Voting panel
│   │   ├── MapManager.js  # Map initialization
│   │   └── GymList.js     # Gym list component
│   ├── services/
│   │   └── api.js         # API client
│   ├── store/
│   │   └── index.js       # Zustand store
│   └── lib/              # Utilities
├── server/                # Backend source files
│   ├── routes/           # API route handlers
│   │   ├── auth.js       # Authentication
│   │   ├── gyms.js       # Gym CRUD and voting
│   │   └── feedback.js   # Feedback submissions
│   └── lib/              # Server utilities
├── scripts/              # Database management scripts
│   ├── enrich_local_db.js      # Enrich local DB with city/state
│   └── copy_local_to_neon.js   # Copy local DB to Neon
├── schema.sql            # Database schema
├── server.js             # Express server (local dev)
├── vercel.json           # Vercel configuration
└── package.json
```

## API Endpoints

### Authentication
- `POST /api/auth/register` - Register user or set password
- `POST /api/auth/login` - Login with username/password
- `POST /api/auth/logout` - Logout (client-side)

### Gyms
- `GET /api/gyms` - Get all gyms (GeoJSON)
- `GET /api/gyms?bbox=minLng,minLat,maxLng,maxLat` - Get gyms in bounding box
- `GET /api/gyms/:id` - Get single gym by ID
- `GET /api/gyms/voted-gyms?username=username` - Get gym IDs user has voted on

### Voting
- `POST /api/gyms/:id/vote` - Submit vote (smell, difficulty, parking, etc.)
- `POST /api/gyms/:id/style-vote` - Submit style vote (crimpy, dynos, etc.)
- `POST /api/gyms/:id/utility-vote` - Submit utility tag vote

### Feedback
- `POST /api/feedback` - Submit feedback

### Config
- `GET /config` - Get MapTiler API key

## Building for Production

```bash
# Build frontend (outputs to dist/)
npm run build

# Preview production build locally
npm run preview

# Start production server
npm start
```

## Deployment

### Deploy to Vercel

1. **Push to GitHub** (if using GitHub integration)

2. **Set Environment Variables** in Vercel Dashboard:
   - `DATABASE_URL` - Neon database connection string
   - `MAPTILER_API_KEY` - Your MapTiler API key
   - `NODE_ENV` - Set to `"production"`

3. **Deploy**:
   ```bash
   vercel
   ```

See [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md) for detailed deployment instructions.

### Database Setup on Neon

1. Create Neon database and get connection string
2. Run schema setup:
   ```bash
   # Option 1: Use Neon SQL Editor to run schema.sql
   # Option 2: Use psql locally with DATABASE_URL
   psql $DATABASE_URL -f schema.sql
   ```
3. Import/enrich data using scripts (see [Database Management Scripts](#database-management-scripts))

## Development

### Code Organization

- **Frontend**: Modular ES6 components in `public/components/`
- **Backend**: Route handlers in `server/routes/`
- **State**: Zustand store in `public/store/`
- **API Client**: Centralized in `public/services/api.js`

### Key Files

- `public/app.js` - Main application orchestration
- `public/components/MapManager.js` - Map initialization and control
- `server/routes/gyms.js` - Gym and voting endpoints
- `server/routes/auth.js` - Authentication logic

## Features Explained

### Voting System

- **Smell Rating**: 0-100 scale
  - 0-20: Fresh
  - 20-40: Slight odor
  - 40-60: Moderate smell
  - 60-80: Strong odor
  - 80-100: Cave of Despair

- **Difficulty**: 0-10 scale (beginner to expert)
- **Parking**: 0-5 scale (none to abundant)
- **Pet Friendly**: 0-2 scale (no/yes/maybe)

### Map Features

- **Heatmap**: Shows gym density
- **Clusters**: Groups nearby gyms at low zoom
- **Custom Icons**: Red cross marks for gyms you've voted on
- **Popup Cards**: Rich popup with ratings and details
- **Statistics**: View mode for gym statistics

## SEO

The application includes:
- Meta tags (description, keywords, robots)
- Open Graph tags (Facebook, LinkedIn)
- Twitter Card tags
- JSON-LD structured data
- Canonical URLs

See `public/index.html` for full SEO implementation.

## Troubleshooting

### Database Connection Issues
- Verify environment variables are set correctly
- Check database is running (local) or active (Neon)
- Ensure PostGIS extension is installed

### Build Errors
- Ensure Node.js 18+ is installed
- Clear `node_modules` and reinstall: `rm -rf node_modules package-lock.json && npm install`

### Map Not Loading
- Verify `MAPTILER_API_KEY` is set correctly
- Check browser console for API errors
- Ensure MapTiler account is active

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Submit a pull request

## License

This project is private and proprietary.

## Related Documentation

- [VERCEL_DEPLOYMENT.md](./VERCEL_DEPLOYMENT.md) - Detailed deployment guide
- [NODE_UPDATE_GUIDE.md](./NODE_UPDATE_GUIDE.md) - Node.js update instructions
- [EXPRESS_ROUTING_BEST_PRACTICES.md](./EXPRESS_ROUTING_BEST_PRACTICES.md) - Routing guidelines
- [schema.sql](./schema.sql) - Database schema definition

---

Built with ❤️ for the climbing community
