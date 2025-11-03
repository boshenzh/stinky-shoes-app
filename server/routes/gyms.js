// Gym routes - handles gym CRUD and voting endpoints
import express from 'express';
import { hasStyleColumns, getOrCreateUser } from '../lib/db-helpers.js';

const router = express.Router();

// Helper function to build gym query with style support
function buildGymQuery(bbox, styleColumnsExist) {
  let q, params;
  
  if (bbox && Array.isArray(bbox) && bbox.length === 4) {
    const [minLng, minLat, maxLng, maxLat] = bbox;
    q = `
      with box as (
        select ST_MakeEnvelope($1,$2,$3,$4,4326)::geography as g
      ),
      base as (
        select id, provider, provider_poi_id, name, address, city, state, country_code, phone, type,
               ST_X(ST_AsText(geom::geometry)) as lng,
               ST_Y(ST_AsText(geom::geometry)) as lat,
               image_primary_url
        from gyms, box
        where ST_Intersects(geom, box.g)
      ),
      recent_votes_raw as (
        select gv.gym_id,
               gv.user_id,
               gv.username,
               gv.smell,
               gv.difficulty,
               gv.parking_availability,
               gv.pet_friendly,
               gv.created_at,
               row_number() over (partition by gv.gym_id order by gv.created_at desc) as vote_rn
        from gym_votes gv
        where gv.user_id IS NOT NULL OR gv.username IS NOT NULL
      ),
      recent_votes_100 as (
        select *
        from recent_votes_raw
        where vote_rn <= 100  -- Limit to most recent 100 votes per gym
      ),
      last_by_user as (
        select gym_id,
               coalesce(user_id::text, username) as voter_key,
               smell,
               difficulty,
               parking_availability,
               pet_friendly,
               row_number() over (partition by gym_id, coalesce(user_id::text, username) order by created_at desc) as rn
        from recent_votes_100
      ),
      vote_stats as (
        select gym_id,
               avg(smell)::int as smell_avg,
               count(*) filter (where smell IS NOT NULL) as smell_votes,
               avg(difficulty)::numeric(3,1) as difficulty_avg,
               count(*) filter (where difficulty IS NOT NULL) as difficulty_votes,
               avg(parking_availability)::int as parking_availability_avg,
               count(*) filter (where parking_availability IS NOT NULL) as parking_votes,
               avg(pet_friendly)::int as pet_friendly_avg,
               count(*) filter (where pet_friendly IS NOT NULL) as pet_friendly_votes
        from last_by_user where rn = 1 group by gym_id
      ),
      utility_recent_votes as (
        select gym_id,
               utility_name,
               vote,
               row_number() over (partition by gym_id, utility_name order by created_at desc) as rn
        from gym_utility_votes
      ),
      utility_top5_votes as (
        select gym_id,
               utility_name,
               vote
        from utility_recent_votes
        where rn <= 5  -- Always consider only the 5 most recent votes (or fewer if less than 5 exist)
      ),
      utility_vote_stats as (
        select gym_id,
               utility_name,
               count(*) filter (where vote = 1) as upvotes,
               count(*) filter (where vote = -1) as downvotes,
               count(*) as total_recent_votes
        from utility_top5_votes
        group by gym_id, utility_name
      ),
      utility_votes_agg as (
        select gym_id,
               jsonb_object_agg(utility_name, jsonb_build_object(
                 'exists', true,
                 'upvotes', upvotes,
                 'downvotes', downvotes,
                 'total_recent_votes', total_recent_votes
               )) as utilities
        from utility_vote_stats
        where upvotes > downvotes  -- Simple majority: more upvotes than downvotes
        group by gym_id
      )`;
      
      if (styleColumnsExist) {
        q += `,
      -- Style percentage calculation (from most recent 100 votes, simple average)
      style_votes_recent_100 as (
        select gv.gym_id, gv.crimpy_pct, gv.dynos_pct, gv.overhang_pct, gv.slab_pct, gv.created_at,
               coalesce(gv.user_id::text, gv.username) as voter_key,
               row_number() over (partition by gv.gym_id order by gv.created_at desc) as vote_rn
        from gym_votes gv
        where (gv.crimpy_pct IS NOT NULL 
          or gv.dynos_pct IS NOT NULL 
          or gv.overhang_pct IS NOT NULL 
          or gv.slab_pct IS NOT NULL)
      ),
      style_votes_filtered_raw as (
        select *
        from style_votes_recent_100
        where vote_rn <= 100  -- Limit to most recent 100 votes per gym
      ),
      style_votes_filtered as (
        select gym_id, crimpy_pct, dynos_pct, overhang_pct, slab_pct, created_at, voter_key,
               row_number() over (partition by gym_id, voter_key order by created_at desc) as rn
        from style_votes_filtered_raw
      ),
      style_votes_latest as (
        select * from style_votes_filtered where rn = 1
      ),
      style_avg_weighted as (
        select gym_id,
               round(avg(coalesce(crimpy_pct, 0))) as crimpy_avg,
               round(avg(coalesce(dynos_pct, 0))) as dynos_avg,
               round(avg(coalesce(overhang_pct, 0))) as overhang_avg,
               round(avg(coalesce(slab_pct, 0))) as slab_avg,
               count(*) as style_vote_count
        from style_votes_latest
        group by gym_id
      ),
      style_agg as (
        select gym_id, 
               jsonb_build_object(
                 'crimpy', crimpy_avg,
                 'dynos', dynos_avg,
                 'overhang', overhang_avg,
                 'slab', slab_avg
               ) as styles,
               style_vote_count
        from style_avg_weighted
      )`;
      }
      
      q += `
      select b.*,
             vs.smell_avg, vs.smell_votes,
             vs.difficulty_avg, vs.difficulty_votes,
             vs.parking_availability_avg, vs.parking_votes,
             vs.pet_friendly_avg, vs.pet_friendly_votes`;
      
      if (styleColumnsExist) {
        q += `,
             sa.styles,
             sa.style_vote_count`;
      } else {
        q += `,
             null::jsonb as styles,
             0 as style_vote_count`;
      }
      
      q += `,
             coalesce(ua.utilities, '{}'::jsonb) as utilities`;
      
      q += `
      from base b
      left join vote_stats vs on vs.gym_id = b.id`;
      
      if (styleColumnsExist) {
        q += `
      left join style_agg sa on sa.gym_id = b.id`;
      } else {
        q += `
      left join (select gym_id, null::jsonb as styles, 0 as style_vote_count from base where false) sa on sa.gym_id = b.id`;
      }
      
      q += `
      left join utility_votes_agg ua on ua.gym_id = b.id`;
      
      params = [minLng, minLat, maxLng, maxLat];
    } else {
      // Fetch all gyms
      q = `
      with base as (
        select id, provider, provider_poi_id, name, address, city, state, country_code, phone, type,
               ST_X(ST_AsText(geom::geometry)) as lng,
               ST_Y(ST_AsText(geom::geometry)) as lat,
               image_primary_url
        from gyms
      ),
      recent_votes_raw as (
        select gv.gym_id,
               gv.user_id,
               gv.username,
               gv.smell,
               gv.difficulty,
               gv.parking_availability,
               gv.pet_friendly,
               gv.created_at,
               row_number() over (partition by gv.gym_id order by gv.created_at desc) as vote_rn
        from gym_votes gv
        where gv.user_id IS NOT NULL OR gv.username IS NOT NULL
      ),
      recent_votes_100 as (
        select *
        from recent_votes_raw
        where vote_rn <= 100  -- Limit to most recent 100 votes per gym
      ),
      last_by_user as (
        select gym_id,
               coalesce(user_id::text, username) as voter_key,
               smell,
               difficulty,
               parking_availability,
               pet_friendly,
               row_number() over (partition by gym_id, coalesce(user_id::text, username) order by created_at desc) as rn
        from recent_votes_100
      ),
      vote_stats as (
        select gym_id,
               avg(smell)::int as smell_avg,
               count(*) filter (where smell IS NOT NULL) as smell_votes,
               avg(difficulty)::numeric(3,1) as difficulty_avg,
               count(*) filter (where difficulty IS NOT NULL) as difficulty_votes,
               avg(parking_availability)::int as parking_availability_avg,
               count(*) filter (where parking_availability IS NOT NULL) as parking_votes,
               avg(pet_friendly)::int as pet_friendly_avg,
               count(*) filter (where pet_friendly IS NOT NULL) as pet_friendly_votes
        from last_by_user where rn = 1 group by gym_id
      ),
      utility_recent_votes as (
        select gym_id,
               utility_name,
               vote,
               row_number() over (partition by gym_id, utility_name order by created_at desc) as rn
        from gym_utility_votes
      ),
      utility_top5_votes as (
        select gym_id,
               utility_name,
               vote
        from utility_recent_votes
        where rn <= 5  -- Always consider only the 5 most recent votes (or fewer if less than 5 exist)
      ),
      utility_vote_stats as (
        select gym_id,
               utility_name,
               count(*) filter (where vote = 1) as upvotes,
               count(*) filter (where vote = -1) as downvotes,
               count(*) as total_recent_votes
        from utility_top5_votes
        group by gym_id, utility_name
      ),
      utility_votes_agg as (
        select gym_id,
               jsonb_object_agg(utility_name, jsonb_build_object(
                 'exists', true,
                 'upvotes', upvotes,
                 'downvotes', downvotes,
                 'total_recent_votes', total_recent_votes
               )) as utilities
        from utility_vote_stats
        where upvotes > downvotes  -- Simple majority: more upvotes than downvotes
        group by gym_id
      )`;
      
      // Add style percentage calculation if columns exist
      if (styleColumnsExist) {
        q += `,
      -- Style percentage calculation (from most recent 100 votes, simple average)
      style_votes_recent_100 as (
        select gv.gym_id, gv.crimpy_pct, gv.dynos_pct, gv.overhang_pct, gv.slab_pct, gv.created_at,
               coalesce(gv.user_id::text, gv.username) as voter_key,
               row_number() over (partition by gv.gym_id order by gv.created_at desc) as vote_rn
        from gym_votes gv
        where (gv.crimpy_pct IS NOT NULL 
          or gv.dynos_pct IS NOT NULL 
          or gv.overhang_pct IS NOT NULL 
          or gv.slab_pct IS NOT NULL)
      ),
      style_votes_filtered_raw as (
        select *
        from style_votes_recent_100
        where vote_rn <= 100  -- Limit to most recent 100 votes per gym
      ),
      style_votes_filtered as (
        select gym_id, crimpy_pct, dynos_pct, overhang_pct, slab_pct, created_at, voter_key,
               row_number() over (partition by gym_id, voter_key order by created_at desc) as rn
        from style_votes_filtered_raw
      ),
      style_votes_latest as (
        select * from style_votes_filtered where rn = 1
      ),
      style_avg_weighted as (
        select gym_id,
               round(avg(coalesce(crimpy_pct, 0))) as crimpy_avg,
               round(avg(coalesce(dynos_pct, 0))) as dynos_avg,
               round(avg(coalesce(overhang_pct, 0))) as overhang_avg,
               round(avg(coalesce(slab_pct, 0))) as slab_avg,
               count(*) as style_vote_count
        from style_votes_latest
        group by gym_id
      ),
      style_agg as (
        select gym_id, 
               jsonb_build_object(
                 'crimpy', crimpy_avg,
                 'dynos', dynos_avg,
                 'overhang', overhang_avg,
                 'slab', slab_avg
               ) as styles,
               style_vote_count
        from style_avg_weighted
      )`;
      }
      
      q += `
      select b.*,
             vs.smell_avg, vs.smell_votes,
             vs.difficulty_avg, vs.difficulty_votes,
             vs.parking_availability_avg, vs.parking_votes,
             vs.pet_friendly_avg, vs.pet_friendly_votes`;
      
      if (styleColumnsExist) {
        q += `,
             sa.styles,
             sa.style_vote_count`;
      } else {
        q += `,
             null::jsonb as styles,
             0 as style_vote_count`;
      }
      
      q += `,
             coalesce(ua.utilities, '{}'::jsonb) as utilities`;
      
      q += `
      from base b
      left join vote_stats vs on vs.gym_id = b.id`;
      
      if (styleColumnsExist) {
        q += `
      left join style_agg sa on sa.gym_id = b.id`;
      } else {
        q += `
      left join (select gym_id, null::jsonb as styles, 0 as style_vote_count from base where false) sa on sa.gym_id = b.id`;
      }
      
      q += `
      left join utility_votes_agg ua on ua.gym_id = b.id`;
      
      params = [];
    }
    
    return { q, params };
}

export function createGymsRouter(pool, hasPassword, verifyPassword) {
  // ============================================================================
  // IMPORTANT: ROUTE ORDER MATTERS IN EXPRESS!
  // 
  // Express matches routes in the order they are defined. If you define:
  //   1. router.get('/:id', ...)    <- This matches ANY path
  //   2. router.get('/voted-gyms', ...)  <- This will NEVER match because
  //                                          "voted-gyms" was already captured
  //                                          as the :id parameter
  //
  // SOLUTION: Always define SPECIFIC routes BEFORE parameterized routes.
  // 
  // Correct order:
  //   1. Specific routes first: /voted-gyms, /user/:user_id/stats, etc.
  //   2. More specific parameterized: /:id/my-vote, /:id/utility-vote
  //   3. Catch-all parameterized LAST: /:id
  // ============================================================================
  
  // Helper function to verify user password
  async function verifyUserPassword(user, password) {
    if (!hasPassword(user.password_hash)) {
      return true; // No password set, allow access
    }
    if (!password) {
      return false; // Password required but not provided
    }
    return verifyPassword(password, user.password_hash);
  }
  
  // GET user account stats (regions, farthest gyms, etc.) - uses user_id as source of truth
  router.get('/user/:user_id/stats', async (req, res) => {
    try {
      const userId = typeof (req.params && req.params.user_id) === 'string' ? req.params.user_id.trim() : null;
      
      if (!userId || userId.length === 0) {
        return res.status(400).json({ error: 'user_id is required' });
      }

      // Get user (verify user exists)
      const userResult = await pool.query(
        `SELECT id, username FROM users WHERE id = $1`,
        [userId]
      );
      
      if (userResult.rows.length === 0) {
        return res.status(404).json({ error: 'User not found' });
      }
      
      const username = userResult.rows[0].username;

      // Fetch all unique gyms the user has voted on with coordinates
      // Use user_id as the only source of truth
      const gymsQuery = `
        SELECT DISTINCT ON (g.id)
          g.id,
          g.name,
          g.city,
          g.country_code,
          ST_X(ST_AsText(g.geom::geometry))::numeric as lng,
          ST_Y(ST_AsText(g.geom::geometry))::numeric as lat,
          gv.created_at as voted_at
        FROM gym_votes gv
        JOIN gyms g ON g.id = gv.gym_id
        WHERE gv.user_id = $1
          AND g.geom IS NOT NULL
        ORDER BY g.id, gv.created_at DESC
      `;

      const { rows: gyms } = await pool.query(gymsQuery, [userId]);
      
      // Validate and parse coordinates
      const validGyms = gyms.filter(gym => {
        const lng = parseFloat(gym.lng);
        const lat = parseFloat(gym.lat);
        return !isNaN(lng) && !isNaN(lat) && 
               lng >= -180 && lng <= 180 && 
               lat >= -90 && lat <= 90;
      }).map(gym => ({
        ...gym,
        lng: parseFloat(gym.lng),
        lat: parseFloat(gym.lat)
      }));

      // Calculate region distribution (group by country_code and city)
      const regionStats = {};
      validGyms.forEach(gym => {
        const region = gym.city && gym.city.trim() ? 
          `${gym.city}, ${gym.country_code || 'Unknown'}` : 
          (gym.country_code || 'Unknown');
        regionStats[region] = (regionStats[region] || 0) + 1;
      });

      // Calculate two farthest gyms (using Haversine distance between all pairs)
      let farthestPairs = [];
      for (let i = 0; i < validGyms.length; i++) {
        for (let j = i + 1; j < validGyms.length; j++) {
          const gym1 = validGyms[i];
          const gym2 = validGyms[j];
          
          // Simple Haversine distance calculation (in km)
          const R = 6371; // Earth radius in km
          const dLat = (gym2.lat - gym1.lat) * Math.PI / 180;
          const dLon = (gym2.lng - gym1.lng) * Math.PI / 180;
          const a = Math.sin(dLat/2) * Math.sin(dLat/2) +
                    Math.cos(gym1.lat * Math.PI / 180) * Math.cos(gym2.lat * Math.PI / 180) *
                    Math.sin(dLon/2) * Math.sin(dLon/2);
          const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
          const distance = R * c;
          
          farthestPairs.push({
            gym1: { id: gym1.id, name: gym1.name, city: gym1.city, country_code: gym1.country_code },
            gym2: { id: gym2.id, name: gym2.name, city: gym2.city, country_code: gym2.country_code },
            distance: distance
          });
        }
      }
      
      // Sort by distance and get top 2
      farthestPairs.sort((a, b) => b.distance - a.distance);
      const twoFarthest = farthestPairs.slice(0, 2);

      // Find stinkiest gym the user has visited (highest average smell_avg among gyms they voted on)
      // Get community average smell for each gym the user has visited
      const stinkiestGymQuery = `
        WITH user_visited_gyms AS (
          SELECT DISTINCT g.id
          FROM gym_votes gv
          JOIN gyms g ON g.id = gv.gym_id
          WHERE gv.user_id = $1
        ),
        last_vote_per_user AS (
          SELECT gv.gym_id,
                 gv.smell,
                 coalesce(gv.user_id::text, gv.username) as voter_key,
                 row_number() over (partition by gv.gym_id, coalesce(gv.user_id::text, gv.username) order by gv.created_at desc) as rn
          FROM gym_votes gv
          WHERE (gv.user_id IS NOT NULL OR gv.username IS NOT NULL)
            AND gv.smell IS NOT NULL
        ),
        gym_smell_stats AS (
          SELECT 
            g.id,
            g.name,
            g.city,
            g.country_code,
            COALESCE(avg(lvp.smell)::int, 0) as smell_avg,
            count(*) filter (where lvp.smell IS NOT NULL) as smell_votes
          FROM gyms g
          JOIN user_visited_gyms uvg ON uvg.id = g.id
          LEFT JOIN last_vote_per_user lvp ON lvp.gym_id = g.id AND lvp.rn = 1
          GROUP BY g.id, g.name, g.city, g.country_code
          HAVING count(*) filter (where lvp.smell IS NOT NULL) > 0
            AND avg(lvp.smell) > 0
        )
        SELECT *
        FROM gym_smell_stats
        ORDER BY smell_avg DESC, smell_votes DESC
        LIMIT 1
      `;
      
      let stinkiestGym = null;
      try {
        const stinkiestResult = await pool.query(stinkiestGymQuery, [userId]);
        if (stinkiestResult.rows.length > 0) {
          const row = stinkiestResult.rows[0];
          const smellAvg = parseInt(row.smell_avg) || 0;
          if (smellAvg > 0) {
            stinkiestGym = {
              id: row.id,
              name: row.name,
              city: row.city,
              country_code: row.country_code,
              smell_avg: smellAvg,
              smell_votes: parseInt(row.smell_votes) || 0
            };
          }
        }
      } catch (queryError) {
        console.error('Error querying stinkiest gym:', queryError);
        // Continue without stinkiest gym if query fails
      }

      return res.json({
        username: username,
        user_id: userId,
        gymsVisited: validGyms.length,
        regionStats: regionStats,
        farthestGyms: twoFarthest,
        stinkiestGym: stinkiestGym
      });
    } catch (e) {
      console.error('Error in /user/:user_id/stats:', e);
      console.error('Stack:', e.stack);
      res.status(500).json({ error: 'server_error', details: e.message });
    }
  });

  // GET gyms by bbox: /api/gyms?bbox=minLng,minLat,maxLng,maxLat
  // Or fetch all: /api/gyms (no bbox parameter)
  router.get('/', async (req, res) => {
    try {
      const bboxStr = String(req.query.bbox || '').trim();
      const hasBbox = bboxStr.length > 0;
      const styleColumnsExist = await hasStyleColumns(pool);
      
      let q, params;
      
      if (hasBbox) {
        const bbox = bboxStr.split(',').map(Number);
        if (bbox.length !== 4 || bbox.some(n => Number.isNaN(n))) {
          return res.status(400).json({ error: 'bbox must be minLng,minLat,maxLng,maxLat' });
        }
        const queryResult = buildGymQuery(bbox, styleColumnsExist);
        q = queryResult.q;
        params = queryResult.params;
      } else {
        const queryResult = buildGymQuery(null, styleColumnsExist);
        q = queryResult.q;
        params = queryResult.params;
      }
      
      const { rows } = await pool.query(q, params);
      console.log(`[API] Fetched ${rows.length} gyms (bbox: ${hasBbox}, styleColumns: ${styleColumnsExist})`);
      return res.json(rows);
    } catch (e) {
      console.error('[API] Error fetching gyms:', e);
      console.error('[API] Stack:', e.stack);
      res.status(500).json({ error: 'server_error', message: e.message });
    }
  });

  // GET user's utility votes for a gym
  router.get('/:id/my-utility-votes', async (req, res) => {
    try {
      const id = req.params.id;
      const username = typeof req.query?.username === 'string' ? req.query.username.trim() : null;
      
      if (!username || username.length === 0) {
        return res.status(400).json({ error: 'username is required' });
      }

      // Get user (if exists)
      const userResult = await pool.query(
        `SELECT id FROM users WHERE username = $1`,
        [username]
      );
      
      const userId = userResult.rows.length > 0 ? userResult.rows[0].id : null;
      
      // Fetch utility votes for this user and gym
      const { rows } = await pool.query(
        `SELECT utility_name, vote
         FROM gym_utility_votes
         WHERE gym_id = $1 AND (user_id = $2 OR username = $3)
         ORDER BY utility_name`,
        [id, userId, username]
      );
      
      // Convert to object mapping utility_name -> vote
      const utilityVotes = {};
      rows.forEach(row => {
        utilityVotes[row.utility_name] = row.vote;
      });
      
      return res.json(utilityVotes);
    } catch (e) {
      console.error(e);
      return res.status(500).json({ error: 'server_error' });
    }
  });

  // POST utility vote
  router.post('/:id/utility-vote', async (req, res) => {
    try {
      const id = req.params.id;
      const username = typeof req.body?.username === 'string' ? req.body.username.trim() : null;
      const password = typeof req.body?.password === 'string' ? req.body.password : null;
      const utilityName = typeof req.body?.utility_name === 'string' ? req.body.utility_name.trim() : null;
      const vote = req.body?.vote !== undefined ? Number(req.body.vote) : null;
      
      if (!username || username.length === 0) {
        return res.status(400).json({ error: 'username is required' });
      }
      if (!utilityName || utilityName.length === 0) {
        return res.status(400).json({ error: 'utility_name is required' });
      }
      if (vote !== 1 && vote !== -1) {
        return res.status(400).json({ error: 'vote must be 1 (upvote) or -1 (downvote)' });
      }
      if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) {
        return res.status(400).json({ error: 'username must be 3-20 alphanumeric characters, underscore, or hyphen' });
      }

      // Get or create user
      const user = await getOrCreateUser(pool, username);
      
      // Verify password if user has one set
      const passwordValid = await verifyUserPassword(user, password);
      if (!passwordValid) {
        return res.status(401).json({ error: 'Password required for this account' });
      }

      // Check if using user_id (normalized) or username (backwards compatibility)
      const hasUserId = await pool.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'gym_utility_votes' AND column_name = 'user_id'
      `).then(r => r.rows.length > 0);

      if (hasUserId) {
        // Use normalized user_id approach - upsert
        const updateResult = await pool.query(
          `UPDATE gym_utility_votes 
           SET vote = $3, updated_at = now()
           WHERE gym_id = $1 AND user_id = $2 AND utility_name = $4`,
          [id, user.id, vote, utilityName]
        );
        
        if (updateResult.rowCount === 0) {
          await pool.query(
            `INSERT INTO gym_utility_votes (gym_id, user_id, utility_name, vote)
             VALUES ($1, $2, $3, $4)`,
            [id, user.id, utilityName, vote]
          );
        }
      } else {
        // Fallback to username approach - upsert
        const updateResult = await pool.query(
          `UPDATE gym_utility_votes 
           SET vote = $3, updated_at = now()
           WHERE gym_id = $1 AND username = $2 AND utility_name = $4`,
          [id, username, vote, utilityName]
        );
        
        if (updateResult.rowCount === 0) {
          await pool.query(
            `INSERT INTO gym_utility_votes (gym_id, username, utility_name, vote)
             VALUES ($1, $2, $3, $4)`,
            [id, username, utilityName, vote]
          );
        }
      }

      return res.json({ ok: true, user_id: user.id });
    } catch (e) {
      console.error(e);
      if (e.code === '23505') { // unique_violation
        res.status(409).json({ error: 'You have already voted for this utility' });
      } else {
        res.status(500).json({ error: 'server_error' });
      }
    }
  });

  // GET user's previous vote for a gym (MUST be before /api/gyms/:id to match correctly)
  router.get('/:id/my-vote', async (req, res) => {
    try {
      const id = req.params.id;
      const username = typeof req.query?.username === 'string' ? req.query.username.trim() : null;
      
      if (!username || username.length === 0) {
        return res.status(400).json({ error: 'username is required' });
      }

      // Check if style columns exist
      const styleColumnsExist = await hasStyleColumns(pool);
      
      // Get user (if exists)
      const userResult = await pool.query(
        `SELECT id FROM users WHERE username = $1`,
        [username]
      );
      
      const userId = userResult.rows.length > 0 ? userResult.rows[0].id : null;
      
      // Fetch the latest vote for this user and gym (check both user_id and username for backwards compatibility)
      let query = `
        SELECT 
          smell, 
          difficulty, 
          parking_availability, 
          pet_friendly`;
      
      if (styleColumnsExist) {
        query += `,
          crimpy_pct,
          dynos_pct,
          overhang_pct,
          slab_pct`;
      }
      
      query += `
        FROM gym_votes
        WHERE gym_id = $1 AND (user_id = $2 OR username = $3)
        ORDER BY created_at DESC
        LIMIT 1
      `;
      
      const queryParams = [id, userId, username];
      const { rows } = await pool.query(query, queryParams);
      
      if (rows.length === 0) {
        return res.json(null); // No vote found
      }
      
      const vote = rows[0];
      
      // Format response
      const response = {
        smell: vote.smell,
        difficulty: vote.difficulty,
        parking_availability: vote.parking_availability,
        pet_friendly: vote.pet_friendly,
      };
      
      if (styleColumnsExist && (vote.crimpy_pct !== null || vote.dynos_pct !== null || vote.overhang_pct !== null || vote.slab_pct !== null)) {
        response.style_percentages = {
          crimpy: vote.crimpy_pct,
          dynos: vote.dynos_pct,
          overhang: vote.overhang_pct,
          slab: vote.slab_pct,
        };
      }
      
      return res.json(response);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // ============================================================================
  // SPECIFIC ROUTES - Must come BEFORE parameterized routes like /:id
  // ============================================================================
  
  // GET all gym IDs that a user has voted on (MUST be before /:id to avoid route conflict)
  router.get('/voted-gyms', async (req, res) => {
    try {
      const username = typeof req.query?.username === 'string' ? req.query.username.trim() : null;
      
      if (!username || username.length === 0) {
        return res.json([]); // Return empty array if no username
      }

      // Get user (if exists)
      const userResult = await pool.query(
        `SELECT id FROM users WHERE username = $1`,
        [username]
      );
      
      const userId = userResult.rows.length > 0 ? userResult.rows[0].id : null;
      
      // Fetch all unique gym IDs the user has voted on (check both user_id and username for backwards compatibility)
      const query = `
        SELECT DISTINCT gym_id
        FROM gym_votes
        WHERE (user_id = $1 OR username = $2)
      `;
      
      const { rows } = await pool.query(query, [userId, username]);
      const gymIds = rows.map(row => row.gym_id);
      
      return res.json(gymIds);
    } catch (e) {
      console.error('Error fetching voted gyms:', e);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // ============================================================================
  // PARAMETERIZED ROUTES - Put catch-all routes like /:id LAST
  // More specific parameterized routes (like /:id/my-vote) can come before /:id
  // ============================================================================
  
  // GET single gym by ID: /api/gyms/:id
  // NOTE: This is a catch-all, so it MUST come after all specific routes
  router.get('/:id', async (req, res) => {
    try {
      const id = req.params.id;
      const styleColumnsExist = await hasStyleColumns(pool);
      let q = `
        with base as (
          select id, provider, provider_poi_id, name, address, city, state, country_code, phone, type,
                 ST_X(ST_AsText(geom::geometry)) as lng,
                 ST_Y(ST_AsText(geom::geometry)) as lat,
                 image_primary_url
          from gyms
          where id = $1
        ),
        recent_votes_raw as (
          select gv.gym_id,
                 gv.user_id,
                 gv.username,
                 gv.smell,
                 gv.difficulty,
                 gv.parking_availability,
                 gv.pet_friendly,
                 gv.created_at,
                 row_number() over (partition by gv.gym_id order by gv.created_at desc) as vote_rn
          from gym_votes gv
          where (gv.user_id IS NOT NULL OR gv.username IS NOT NULL) AND gv.gym_id = $1
        ),
        recent_votes_100 as (
          select *
          from recent_votes_raw
          where vote_rn <= 100  -- Limit to most recent 100 votes per gym
        ),
        last_by_user as (
          select gym_id,
                 coalesce(user_id::text, username) as voter_key,
                 smell,
                 difficulty,
                 parking_availability,
                 pet_friendly,
                 row_number() over (partition by gym_id, coalesce(user_id::text, username) order by created_at desc) as rn
          from recent_votes_100
        ),
        vote_stats as (
          select gym_id,
                 avg(smell)::int as smell_avg,
                 count(*) filter (where smell IS NOT NULL) as smell_votes,
                 avg(difficulty)::numeric(3,1) as difficulty_avg,
                 count(*) filter (where difficulty IS NOT NULL) as difficulty_votes,
                 avg(parking_availability)::int as parking_availability_avg,
                 count(*) filter (where parking_availability IS NOT NULL) as parking_votes,
                 avg(pet_friendly)::int as pet_friendly_avg,
                 count(*) filter (where pet_friendly IS NOT NULL) as pet_friendly_votes
          from last_by_user where rn = 1 group by gym_id
        ),
        utility_recent_votes as (
          select gym_id,
                 utility_name,
                 vote,
                 row_number() over (partition by gym_id, utility_name order by created_at desc) as rn
          from gym_utility_votes
          where gym_id = $1
        ),
        utility_top5_votes as (
          select gym_id,
                 utility_name,
                 vote
          from utility_recent_votes
          where rn <= 5  -- Always consider only the 5 most recent votes (or fewer if less than 5 exist)
        ),
        utility_vote_stats as (
          select gym_id,
                 utility_name,
                 count(*) filter (where vote = 1) as upvotes,
                 count(*) filter (where vote = -1) as downvotes,
                 count(*) as total_recent_votes
          from utility_top5_votes
          group by gym_id, utility_name
        ),
        utility_votes_agg as (
          select gym_id,
                 jsonb_object_agg(utility_name, jsonb_build_object(
                   'exists', true,
                   'upvotes', upvotes,
                   'downvotes', downvotes,
                   'total_recent_votes', total_recent_votes
                 )) as utilities
          from utility_vote_stats
          where upvotes > downvotes  -- Simple majority: more upvotes than downvotes
          group by gym_id
        )`;
        
        // Add style percentage calculation if columns exist
        if (styleColumnsExist) {
          q += `,
        style_votes_recent_100 as (
          select gv.gym_id, gv.crimpy_pct, gv.dynos_pct, gv.overhang_pct, gv.slab_pct, gv.created_at,
                 coalesce(gv.user_id::text, gv.username) as voter_key,
                 row_number() over (partition by gv.gym_id order by gv.created_at desc) as vote_rn
          from gym_votes gv
          where (gv.crimpy_pct IS NOT NULL 
            or gv.dynos_pct IS NOT NULL 
            or gv.overhang_pct IS NOT NULL 
            or gv.slab_pct IS NOT NULL)
            AND gv.gym_id = $1
        ),
        style_votes_filtered_raw as (
          select *
          from style_votes_recent_100
          where vote_rn <= 100  -- Limit to most recent 100 votes per gym
        ),
        style_votes_filtered as (
          select gym_id, crimpy_pct, dynos_pct, overhang_pct, slab_pct, created_at, voter_key,
                 row_number() over (partition by gym_id, voter_key order by created_at desc) as rn
          from style_votes_filtered_raw
        ),
        style_votes_latest as (
          select * from style_votes_filtered where rn = 1
        ),
        style_vote_counts as (
          select gym_id, count(*) as total_votes
          from style_votes_latest
          group by gym_id
        ),
        style_votes_with_age as (
          select sv.*, svc.total_votes,
                 extract(epoch from (now() - sv.created_at)) / 86400.0 as age_days,
                 exp(-extract(epoch from (now() - sv.created_at)) / (86400.0 * 365.0)) as recency_weight
          from style_votes_latest sv
          join style_vote_counts svc on svc.gym_id = sv.gym_id
        ),
        style_votes_filtered_by_age as (
          select *
          from style_votes_with_age
          where total_votes < 50 
             or age_days <= 180
        ),
        style_avg_weighted as (
          select gym_id,
                 case 
                   when sum(recency_weight) > 0 
                   then round(sum(coalesce(crimpy_pct, 0) * recency_weight) / sum(recency_weight))
                   else 0
                 end as crimpy_avg,
                 case 
                   when sum(recency_weight) > 0 
                   then round(sum(coalesce(dynos_pct, 0) * recency_weight) / sum(recency_weight))
                   else 0
                 end as dynos_avg,
                 case 
                   when sum(recency_weight) > 0 
                   then round(sum(coalesce(overhang_pct, 0) * recency_weight) / sum(recency_weight))
                   else 0
                 end as overhang_avg,
                 case 
                   when sum(recency_weight) > 0 
                   then round(sum(coalesce(slab_pct, 0) * recency_weight) / sum(recency_weight))
                   else 0
                 end as slab_avg,
                 count(*) as style_vote_count
          from style_votes_filtered_by_age
          group by gym_id
        ),
        style_agg as (
          select gym_id, 
                 jsonb_build_object(
                   'crimpy', crimpy_avg,
                   'dynos', dynos_avg,
                   'overhang', overhang_avg,
                   'slab', slab_avg
                 ) as styles,
                 style_vote_count
          from style_avg_weighted
        )`;
        }
        
        q += `
        select b.*,
               vs.smell_avg, vs.smell_votes,
               vs.difficulty_avg, vs.difficulty_votes,
               vs.parking_availability_avg, vs.parking_votes,
               vs.pet_friendly_avg, vs.pet_friendly_votes`;
        
        if (styleColumnsExist) {
          q += `,
               sa.styles,
               sa.style_vote_count`;
        } else {
          q += `,
               null::jsonb as styles,
               0 as style_vote_count`;
        }
        
        q += `,
               coalesce(ua.utilities, '{}'::jsonb) as utilities`;
        
        q += `
        from base b
        left join vote_stats vs on vs.gym_id = b.id`;
        
        if (styleColumnsExist) {
          q += `
        left join style_agg sa on sa.gym_id = b.id`;
        } else {
          q += `
        left join (select gym_id, null::jsonb as styles, 0 as style_vote_count from base where false) sa on sa.gym_id = b.id`;
        }
        
        q += `
        left join utility_votes_agg ua on ua.gym_id = b.id
        limit 1
      `;
      
      const { rows } = await pool.query(q, [id]);
      if (rows.length === 0) {
        return res.status(404).json({ error: 'Gym not found' });
      }
      return res.json(rows[0]);
    } catch (e) {
      console.error(e);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // POST vote: { smell?, difficulty?, parking_availability?, pet_friendly?, styles?: string[], username, password? }
  router.post('/:id/vote', async (req, res) => {
    try {
      const id = req.params.id;
      const username = typeof req.body?.username === 'string' ? req.body.username.trim() : null;
      const password = typeof req.body?.password === 'string' ? req.body.password : null;
      
      if (!username || username.length === 0) {
        return res.status(400).json({ error: 'username is required' });
      }
      // Validate username: alphanumeric, underscore, hyphen, 3-20 chars
      if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) {
        return res.status(400).json({ error: 'username must be 3-20 alphanumeric characters, underscore, or hyphen' });
      }

      // Get or create user
      const user = await getOrCreateUser(pool, username);
      
      // Verify password if user has one set
      const passwordValid = await verifyUserPassword(user, password);
      if (!passwordValid) {
        return res.status(401).json({ error: 'Password required for this account' });
      }

      // Validate and extract vote fields
      const smell = req.body?.smell !== undefined ? Number(req.body.smell) : null;
      if (smell !== null && (!Number.isFinite(smell) || smell < 0 || smell > 100)) {
        return res.status(400).json({ error: 'smell must be 0..100' });
      }

      const difficulty = req.body?.difficulty !== undefined ? Number(req.body.difficulty) : null;
      if (difficulty !== null && (!Number.isFinite(difficulty) || difficulty < -3 || difficulty > 3)) {
        return res.status(400).json({ error: 'difficulty must be -3..3' });
      }

      const parkingAvailability = req.body?.parking_availability !== undefined ? Number(req.body.parking_availability) : null;
      if (parkingAvailability !== null && (!Number.isFinite(parkingAvailability) || parkingAvailability < 0 || parkingAvailability > 100)) {
        return res.status(400).json({ error: 'parking_availability must be 0..100' });
      }

      const petFriendly = req.body?.pet_friendly !== undefined ? Number(req.body.pet_friendly) : null;
      if (petFriendly !== null && (!Number.isFinite(petFriendly) || petFriendly < 0 || petFriendly > 100)) {
        return res.status(400).json({ error: 'pet_friendly must be 0..100' });
      }

      // Extract style percentages from request (should be an object with percentages)
      const stylePercentages = req.body?.style_percentages || {};
      const crimpyPct = stylePercentages.crimpy !== undefined ? Number(stylePercentages.crimpy) : null;
      const dynosPct = stylePercentages.dynos !== undefined ? Number(stylePercentages.dynos) : null;
      const overhangPct = stylePercentages.overhang !== undefined ? Number(stylePercentages.overhang) : null;
      const slabPct = stylePercentages.slab !== undefined ? Number(stylePercentages.slab) : null;
      
      // Check if style columns exist
      const styleColumnsExist = await hasStyleColumns(pool);
      
      // Validate style percentages (0-100, should sum to 100)
      const stylePcts = [crimpyPct, dynosPct, overhangPct, slabPct].filter(p => p !== null);
      if (stylePcts.length > 0) {
        if (!styleColumnsExist) {
          return res.status(400).json({ error: 'Style percentage columns do not exist in database. Please run the database setup script.' });
        }
        const sum = stylePcts.reduce((a, b) => a + b, 0);
        if (Math.abs(sum - 100) > 1) { // Allow 1% tolerance for rounding
          return res.status(400).json({ error: 'Style percentages must sum to 100%' });
        }
        for (const pct of stylePcts) {
          if (!Number.isFinite(pct) || pct < 0 || pct > 100) {
            return res.status(400).json({ error: 'Style percentages must be 0-100' });
          }
        }
      }

      // Backwards compatibility: also accept styles array and convert to percentages
      const styles = Array.isArray(req.body?.styles) ? req.body.styles.filter(s => typeof s === 'string') : [];

      // Check if using user_id (normalized) or username (backwards compatibility)
      const hasUserId = await pool.query(`
        SELECT column_name FROM information_schema.columns 
        WHERE table_name = 'gym_votes' AND column_name = 'user_id'
      `).then(r => r.rows.length > 0);

      if (hasUserId) {
        // Use normalized user_id approach
        // For partial unique indexes, we need to use upsert pattern
        // First try to update existing vote
        let updateQuery = `UPDATE gym_votes 
           SET smell = COALESCE($3, smell),
               difficulty = COALESCE($4, difficulty),
               parking_availability = COALESCE($5, parking_availability),
               pet_friendly = COALESCE($6, pet_friendly)`;
        
        let updateParams = [id, user.id, smell, difficulty, parkingAvailability, petFriendly];
        let paramIndex = 7;
        
        if (styleColumnsExist) {
          updateQuery += `,
               crimpy_pct = COALESCE($${paramIndex++}, crimpy_pct),
               dynos_pct = COALESCE($${paramIndex++}, dynos_pct),
               overhang_pct = COALESCE($${paramIndex++}, overhang_pct),
               slab_pct = COALESCE($${paramIndex++}, slab_pct)`;
          updateParams.push(crimpyPct, dynosPct, overhangPct, slabPct);
        }
        
        updateQuery += `,
               updated_at = now()
           WHERE gym_id = $1 AND user_id = $2`;
        
        const updateResult = await pool.query(updateQuery, updateParams);
        
        // If no rows updated, insert new vote
        if (updateResult.rowCount === 0) {
          let insertColumns = '(gym_id, user_id, smell, difficulty, parking_availability, pet_friendly';
          let insertValues = '($1, $2, $3, $4, $5, $6';
          let insertParams = [id, user.id, smell, difficulty, parkingAvailability, petFriendly];
          let insertIndex = 7;
          
          if (styleColumnsExist) {
            insertColumns += ', crimpy_pct, dynos_pct, overhang_pct, slab_pct';
            insertValues += `, $${insertIndex++}, $${insertIndex++}, $${insertIndex++}, $${insertIndex++}`;
            insertParams.push(crimpyPct, dynosPct, overhangPct, slabPct);
          }
          
          insertColumns += ')';
          insertValues += ')';
          
          await pool.query(
            `INSERT INTO gym_votes ${insertColumns} VALUES ${insertValues}`,
            insertParams
          );
        }

        // Backwards compatibility: also store in gym_style_votes if styles array provided
        if (styles.length > 0) {
          // Delete all existing style votes for this user/gym
          await pool.query(`DELETE FROM gym_style_votes WHERE gym_id = $1 AND user_id = $2`, [id, user.id]);
          
          // Deduplicate styles and insert unique ones
          const uniqueStyles = [...new Set(styles.map(s => s.trim()).filter(s => s.length > 0))];
          for (const style of uniqueStyles) {
            await pool.query(
              `INSERT INTO gym_style_votes (gym_id, user_id, style) VALUES ($1, $2, $3)`,
              [id, user.id, style]
            );
          }
        }
      } else {
        // Fallback to username approach (backwards compatibility)
        // Use upsert pattern: try UPDATE first, then INSERT if needed
        let updateQuery = `UPDATE gym_votes 
           SET smell = COALESCE($3, smell),
               difficulty = COALESCE($4, difficulty),
               parking_availability = COALESCE($5, parking_availability),
               pet_friendly = COALESCE($6, pet_friendly)`;
        
        let updateParams = [id, username, smell, difficulty, parkingAvailability, petFriendly];
        let paramIndex = 7;
        
        if (styleColumnsExist) {
          updateQuery += `,
               crimpy_pct = COALESCE($${paramIndex++}, crimpy_pct),
               dynos_pct = COALESCE($${paramIndex++}, dynos_pct),
               overhang_pct = COALESCE($${paramIndex++}, overhang_pct),
               slab_pct = COALESCE($${paramIndex++}, slab_pct)`;
          updateParams.push(crimpyPct, dynosPct, overhangPct, slabPct);
        }
        
        updateQuery += `,
               updated_at = now()
           WHERE gym_id = $1 AND username = $2`;
        
        const updateResult = await pool.query(updateQuery, updateParams);
        
        // If no rows updated, insert new vote
        if (updateResult.rowCount === 0) {
          let insertColumns = '(gym_id, username, smell, difficulty, parking_availability, pet_friendly';
          let insertValues = '($1, $2, $3, $4, $5, $6';
          let insertParams = [id, username, smell, difficulty, parkingAvailability, petFriendly];
          let insertIndex = 7;
          
          if (styleColumnsExist) {
            insertColumns += ', crimpy_pct, dynos_pct, overhang_pct, slab_pct';
            insertValues += `, $${insertIndex++}, $${insertIndex++}, $${insertIndex++}, $${insertIndex++}`;
            insertParams.push(crimpyPct, dynosPct, overhangPct, slabPct);
          }
          
          insertColumns += ')';
          insertValues += ')';
          
          await pool.query(
            `INSERT INTO gym_votes ${insertColumns} VALUES ${insertValues}`,
            insertParams
          );
        }

        // Backwards compatibility: also store in gym_style_votes if styles array provided
        if (styles.length > 0) {
          // Delete all existing style votes for this username/gym
          await pool.query(`DELETE FROM gym_style_votes WHERE gym_id = $1 AND username = $2`, [id, username]);
          
          // Deduplicate styles and insert unique ones
          const uniqueStyles = [...new Set(styles.map(s => s.trim()).filter(s => s.length > 0))];
          for (const style of uniqueStyles) {
            await pool.query(
              `INSERT INTO gym_style_votes (gym_id, username, style) VALUES ($1, $2, $3)`,
              [id, username, style]
            );
          }
        }
      }

      return res.json({ ok: true, user_id: user.id });
    } catch (e) {
      console.error(e);
      if (e.code === '23505') { // unique_violation
        res.status(409).json({ error: 'You have already voted for this gym' });
      } else {
        res.status(500).json({ error: 'server_error' });
      }
    }
  });

  // Keep old endpoint for backwards compatibility
  router.post('/:id/smell', async (req, res) => {
    try {
      const id = req.params.id;
      const smell = Number(req.body?.smell);
      if (!Number.isFinite(smell) || smell < 0 || smell > 100) {
        return res.status(400).json({ error: 'smell must be 0..100' });
      }
      const username = typeof req.body?.username === 'string' ? req.body.username.trim() : null;
      if (!username || username.length === 0) {
        return res.status(400).json({ error: 'username is required' });
      }
      if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) {
        return res.status(400).json({ error: 'username must be 3-20 alphanumeric characters, underscore, or hyphen' });
      }
      // Use upsert pattern: try UPDATE first, then INSERT if needed
      const updateResult = await pool.query(
        `UPDATE gym_votes 
         SET smell = $2, updated_at = now()
         WHERE gym_id = $1 AND username = $3`,
        [id, smell, username]
      );
      
      // If no rows updated, insert new vote
      if (updateResult.rowCount === 0) {
        await pool.query(
          `INSERT INTO gym_votes (gym_id, smell, username)
           VALUES ($1, $2, $3)`,
          [id, smell, username]
        );
      }
      return res.json({ ok: true });
    } catch (e) {
      console.error(e);
      if (e.code === '23505') {
        res.status(409).json({ error: 'You have already voted for this gym' });
      } else {
        res.status(500).json({ error: 'server_error' });
      }
    }
  });

  return router;
}

