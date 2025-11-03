import 'dotenv/config';
import { Pool } from 'pg';

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

async function showDatabase() {
  const pool = getPool();
  try {
    console.log('=== DATABASE SCHEMA ===\n');

    // Show users table structure
    const usersTable = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'users'
      ORDER BY ordinal_position
    `);
    if (usersTable.rows.length > 0) {
      console.log('👤 USERS TABLE:');
      console.table(usersTable.rows);
    }

    // Show gyms table structure
    console.log('\n📊 GYMS TABLE:');
    const gymsDesc = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'gyms'
      ORDER BY ordinal_position
    `);
    console.table(gymsDesc.rows);

    // Show gym_votes table structure
    console.log('\n📊 GYM_VOTES TABLE:');
    const votesDesc = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'gym_votes'
      ORDER BY ordinal_position
    `);
    console.table(votesDesc.rows);

    // Show gym_style_votes table structure
    const styleVotesTable = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'gym_style_votes'
      ORDER BY ordinal_position
    `);
    if (styleVotesTable.rows.length > 0) {
      console.log('\n🏷️  GYM_STYLE_VOTES TABLE:');
      console.table(styleVotesTable.rows);
    }

    // Show feedback table structure
    const feedbackTable = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'feedback'
      ORDER BY ordinal_position
    `);
    if (feedbackTable.rows.length > 0) {
      console.log('\n💡 FEEDBACK TABLE:');
      console.table(feedbackTable.rows);
    }

    // Show gym_utility_votes table structure
    const utilityVotesTable = await pool.query(`
      SELECT column_name, data_type, is_nullable, column_default
      FROM information_schema.columns
      WHERE table_name = 'gym_utility_votes'
      ORDER BY ordinal_position
    `);
    if (utilityVotesTable.rows.length > 0) {
      console.log('\n✅ GYM_UTILITY_VOTES TABLE:');
      console.table(utilityVotesTable.rows);
    }

    // Show constraints
    console.log('\n🔒 CONSTRAINTS:');
    const constraints = await pool.query(`
      SELECT 
        tc.table_name,
        tc.constraint_name,
        tc.constraint_type,
        kcu.column_name
      FROM information_schema.table_constraints tc
      JOIN information_schema.key_column_usage kcu
        ON tc.constraint_name = kcu.constraint_name
      WHERE tc.table_schema = 'public'
        AND tc.table_name IN ('users', 'gyms', 'gym_votes', 'gym_style_votes', 'gym_utility_votes', 'feedback')
      ORDER BY tc.table_name, tc.constraint_type
    `);
    console.table(constraints.rows);

    // Show indexes
    console.log('\n📑 INDEXES:');
    const indexes = await pool.query(`
      SELECT tablename, indexname, indexdef
      FROM pg_indexes
      WHERE schemaname = 'public'
      ORDER BY tablename, indexname
    `);
    indexes.rows.forEach(idx => {
      console.log(`  ${idx.tablename}.${idx.indexname}`);
      console.log(`    ${idx.indexdef}\n`);
    });

    // Show statistics
    console.log('\n📈 STATISTICS:\n');
    
    // Users stats
    try {
      const userStats = await pool.query(`
        SELECT 
          COUNT(*) as total_users,
          COUNT(CASE WHEN password_hash IS NOT NULL THEN 1 END) as users_with_password,
          COUNT(CASE WHEN password_hash IS NULL THEN 1 END) as users_without_password
        FROM users
      `);
      if (userStats.rows.length > 0) {
        console.log('👤 Users statistics:');
        console.table(userStats.rows);
      }
    } catch (e) {
      console.log('Users table not found (may not be migrated yet)');
    }
    
    // Show sample users
    try {
      console.log('\n👤 SAMPLE USERS (10 random):');
      const sampleUsers = await pool.query(`
        SELECT 
          id,
          username,
          CASE 
            WHEN password_hash IS NOT NULL AND password_hash != '' THEN 'Yes'
            ELSE 'No'
          END as has_password,
          created_at,
          updated_at
        FROM users
        ORDER BY RANDOM()
        LIMIT 10
      `);
      console.table(sampleUsers.rows);
    } catch (e) {
      console.log('Could not fetch sample users:', e.message);
    }

    // Gyms stats
    const gymStats = await pool.query(`
      SELECT 
        provider,
        COUNT(*) as count,
        COUNT(CASE WHEN address IS NOT NULL THEN 1 END) as with_address,
        COUNT(CASE WHEN city IS NOT NULL THEN 1 END) as with_city,
        COUNT(CASE WHEN state IS NOT NULL THEN 1 END) as with_state,
        COUNT(CASE WHEN phone IS NOT NULL THEN 1 END) as with_phone,
        COUNT(CASE WHEN image_primary_url IS NOT NULL THEN 1 END) as with_image
      FROM gyms
      GROUP BY provider
      ORDER BY provider
    `);
    console.log('Gyms by provider:');
    console.table(gymStats.rows);
    
    // Region stats
    const regionStats = await pool.query(`
      SELECT 
        COUNT(DISTINCT country_code) as unique_countries,
        COUNT(DISTINCT city) as unique_cities,
        COUNT(DISTINCT state) as unique_states,
        COUNT(DISTINCT CASE WHEN city IS NOT NULL THEN city || ', ' || country_code END) as regions_with_city,
        COUNT(DISTINCT CASE WHEN state IS NOT NULL THEN state || ', ' || country_code END) as regions_with_state
      FROM gyms
      WHERE country_code IS NOT NULL
    `);
    console.log('\n📍 Region statistics:');
    console.table(regionStats.rows);

    // Check if style percentage columns exist
    const hasStyleColumns = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'gym_votes' AND column_name = 'crimpy_pct'
    `).then(r => r.rows.length > 0);

    // Vote statistics
    let voteStatsQuery = `
      SELECT 
        COUNT(*) as total_votes,
        COUNT(DISTINCT gym_id) as gyms_with_votes,
        COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN user_id END) as unique_users,
        COUNT(DISTINCT CASE WHEN username IS NOT NULL THEN username END) as unique_usernames,
        COUNT(CASE WHEN smell IS NOT NULL THEN 1 END) as smell_votes,
        COUNT(CASE WHEN difficulty IS NOT NULL THEN 1 END) as difficulty_votes,
        COUNT(CASE WHEN parking_availability IS NOT NULL THEN 1 END) as parking_votes,
        COUNT(CASE WHEN pet_friendly IS NOT NULL THEN 1 END) as pet_friendly_votes,
        AVG(smell)::numeric(5,2) as avg_smell,
        AVG(difficulty)::numeric(3,1) as avg_difficulty,
        AVG(parking_availability)::numeric(5,2) as avg_parking,
        AVG(pet_friendly)::numeric(5,2) as avg_pet_friendly
    `;
    
    if (hasStyleColumns) {
      voteStatsQuery = voteStatsQuery.replace(
        'AVG(pet_friendly)::numeric(5,2) as avg_pet_friendly',
        'AVG(pet_friendly)::numeric(5,2) as avg_pet_friendly,\n        COUNT(CASE WHEN crimpy_pct IS NOT NULL THEN 1 END) as style_votes'
      );
    }
    
    voteStatsQuery += ' FROM gym_votes';
    
    const voteStats = await pool.query(voteStatsQuery);
    console.log('\nVote statistics:');
    console.table(voteStats.rows);

    // Style percentage statistics
    if (hasStyleColumns) {
      try {
        const stylePctStats = await pool.query(`
          SELECT 
            COUNT(*) as votes_with_styles,
            AVG(crimpy_pct)::numeric(5,2) as avg_crimpy_pct,
            AVG(dynos_pct)::numeric(5,2) as avg_dynos_pct,
            AVG(overhang_pct)::numeric(5,2) as avg_overhang_pct,
            AVG(slab_pct)::numeric(5,2) as avg_slab_pct,
            COUNT(CASE WHEN crimpy_pct IS NOT NULL THEN 1 END) as crimpy_votes,
            COUNT(CASE WHEN dynos_pct IS NOT NULL THEN 1 END) as dynos_votes,
            COUNT(CASE WHEN overhang_pct IS NOT NULL THEN 1 END) as overhang_votes,
            COUNT(CASE WHEN slab_pct IS NOT NULL THEN 1 END) as slab_votes
          FROM gym_votes
          WHERE crimpy_pct IS NOT NULL 
             OR dynos_pct IS NOT NULL 
             OR overhang_pct IS NOT NULL 
             OR slab_pct IS NOT NULL
        `);
        if (stylePctStats.rows.length > 0 && stylePctStats.rows[0].votes_with_styles > 0) {
          console.log('\nStyle percentage statistics:');
          console.table(stylePctStats.rows);
        }
      } catch (e) {
        console.log('\n⚠️  Could not fetch style percentage statistics:', e.message);
      }
    } else {
      console.log('\n⚠️  Style percentage columns (crimpy_pct, dynos_pct, overhang_pct, slab_pct) do not exist yet.');
      console.log('   Run the database setup script to add them: npm run db:setup');
    }

    // Style votes statistics
    try {
      const styleStats = await pool.query(`
        SELECT 
          COUNT(*) as total_style_votes,
          COUNT(DISTINCT gym_id) as gyms_with_style_votes,
          COUNT(DISTINCT style) as unique_styles,
          COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN user_id END) as unique_users,
          COUNT(DISTINCT CASE WHEN username IS NOT NULL THEN username END) as unique_usernames
        FROM gym_style_votes
      `);
      if (styleStats.rows.length > 0) {
        console.log('\nStyle vote statistics:');
        console.table(styleStats.rows);
      }

      const topStyles = await pool.query(`
        SELECT 
          style,
          COUNT(*) as vote_count,
          COUNT(DISTINCT gym_id) as gyms_count
        FROM gym_style_votes
        GROUP BY style
        ORDER BY vote_count DESC
        LIMIT 10
      `);
      if (topStyles.rows.length > 0) {
        console.log('\nTop style tags:');
        console.table(topStyles.rows);
      }
    } catch (e) {
      console.log('\nStyle votes table not found (may not be migrated yet)');
    }

    // Show sample gyms
    console.log('\n📍 SAMPLE GYMS (5 random):');
    const samples = await pool.query(`
      SELECT 
        id,
        provider,
        name,
        city,
        state,
        country_code,
        ST_X(ST_AsText(geom::geometry))::numeric(9,6) as lng,
        ST_Y(ST_AsText(geom::geometry))::numeric(9,6) as lat
      FROM gyms
      ORDER BY RANDOM()
      LIMIT 5
    `);
    console.table(samples.rows);

    // Show sample votes with all fields
    try {
      console.log('\n🗳️  SAMPLE VOTES (5 random):');
      let sampleVotesQuery = `
        SELECT 
          gv.id,
          g.name as gym_name,
          u.username,
          gv.smell,
          gv.difficulty,
          gv.parking_availability,
          gv.pet_friendly
      `;
      
      if (hasStyleColumns) {
        sampleVotesQuery += `,
          gv.crimpy_pct,
          gv.dynos_pct,
          gv.overhang_pct,
          gv.slab_pct`;
      }
      
      sampleVotesQuery += `,
          gv.created_at
        FROM gym_votes gv
        LEFT JOIN gyms g ON g.id = gv.gym_id
        LEFT JOIN users u ON u.id = gv.user_id
        ORDER BY RANDOM()
        LIMIT 5
      `;
      
      const sampleVotes = await pool.query(sampleVotesQuery);
      console.table(sampleVotes.rows);
    } catch (e) {
      console.log('Could not fetch sample votes:', e.message);
    }

    // Utility votes statistics
    try {
      console.log('\n✅ UTILITY VOTES STATISTICS:');
      const utilityStats = await pool.query(`
        SELECT 
          COUNT(*) as total_utility_votes,
          COUNT(DISTINCT gym_id) as gyms_with_utility_votes,
          COUNT(DISTINCT utility_name) as unique_utilities,
          COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN user_id END) as unique_users,
          COUNT(DISTINCT CASE WHEN username IS NOT NULL THEN username END) as unique_usernames,
          COUNT(CASE WHEN vote = 1 THEN 1 END) as total_upvotes,
          COUNT(CASE WHEN vote = -1 THEN 1 END) as total_downvotes,
          SUM(vote) as net_votes
        FROM gym_utility_votes
      `);
      if (utilityStats.rows.length > 0) {
        console.table(utilityStats.rows);
      }

      // Show utility votes by utility
      const utilityByType = await pool.query(`
        SELECT 
          utility_name,
          COUNT(*) as total_votes,
          COUNT(CASE WHEN vote = 1 THEN 1 END) as upvotes,
          COUNT(CASE WHEN vote = -1 THEN 1 END) as downvotes,
          SUM(vote) as net_votes,
          COUNT(DISTINCT gym_id) as gyms_count,
          COUNT(DISTINCT CASE WHEN user_id IS NOT NULL THEN user_id END) as unique_users,
          COUNT(DISTINCT CASE WHEN username IS NOT NULL THEN username END) as unique_usernames
        FROM gym_utility_votes
        GROUP BY utility_name
        ORDER BY net_votes DESC, total_votes DESC
      `);
      if (utilityByType.rows.length > 0) {
        console.log('\n✅ UTILITY VOTES BY UTILITY:');
        console.table(utilityByType.rows);
      }

      // Show top utilities by net votes
      const topUtilities = await pool.query(`
        SELECT 
          g.name as gym_name,
          guv.utility_name,
          COUNT(*) as total_votes,
          COUNT(CASE WHEN guv.vote = 1 THEN 1 END) as upvotes,
          COUNT(CASE WHEN guv.vote = -1 THEN 1 END) as downvotes,
          SUM(guv.vote) as net_votes
        FROM gym_utility_votes guv
        LEFT JOIN gyms g ON g.id = guv.gym_id
        GROUP BY g.name, guv.utility_name
        HAVING SUM(guv.vote) > 0
        ORDER BY net_votes DESC, total_votes DESC
        LIMIT 10
      `);
      if (topUtilities.rows.length > 0) {
        console.log('\n✅ TOP UTILITIES BY NET VOTES (Top 10):');
        console.table(topUtilities.rows);
      }

      // Show sample utility votes
      console.log('\n✅ SAMPLE UTILITY VOTES (5 random):');
      const sampleUtilityVotes = await pool.query(`
        SELECT 
          guv.id,
          g.name as gym_name,
          COALESCE(u.username, guv.username, 'Unknown') as username,
          guv.utility_name,
          CASE 
            WHEN guv.vote = 1 THEN 'Upvote (Available)'
            WHEN guv.vote = -1 THEN 'Downvote (Not Available)'
            ELSE 'Unknown'
          END as vote_type,
          guv.vote,
          guv.created_at,
          guv.updated_at
        FROM gym_utility_votes guv
        LEFT JOIN gyms g ON g.id = guv.gym_id
        LEFT JOIN users u ON u.id = guv.user_id
        ORDER BY RANDOM()
        LIMIT 5
      `);
      console.table(sampleUtilityVotes.rows);
    } catch (e) {
      console.log('\n⚠️  Utility votes table not found (may not be migrated yet)');
      console.log('   Error:', e.message);
    }

    // Feedback statistics
    try {
      console.log('\n💡 FEEDBACK STATISTICS:');
      const feedbackStats = await pool.query(`
        SELECT 
          COUNT(*) as total_feedback,
          COUNT(DISTINCT user_id) as unique_users,
          COUNT(CASE WHEN feedback_type = 'bug' THEN 1 END) as bug_reports,
          COUNT(CASE WHEN feedback_type = 'feature' THEN 1 END) as feature_requests,
          COUNT(CASE WHEN feedback_type = 'idea' THEN 1 END) as idea_requests,
          COUNT(CASE WHEN feedback_type IS NULL OR feedback_type = '' THEN 1 END) as general_feedback,
          COUNT(CASE WHEN user_id IS NOT NULL THEN 1 END) as from_logged_in_users,
          COUNT(CASE WHEN user_name IS NOT NULL THEN 1 END) as with_provided_name,
          COUNT(CASE WHEN user_email IS NOT NULL THEN 1 END) as with_provided_email
        FROM feedback
      `);
      console.table(feedbackStats.rows);

      // Show feedback by type
      const feedbackByType = await pool.query(`
        SELECT 
          COALESCE(feedback_type, 'general') as feedback_type,
          COUNT(*) as count,
          COUNT(DISTINCT user_id) as unique_users,
          MIN(created_at) as earliest,
          MAX(created_at) as latest
        FROM feedback
        GROUP BY feedback_type
        ORDER BY count DESC
      `);
      if (feedbackByType.rows.length > 0) {
        console.log('\n💡 FEEDBACK BY TYPE:');
        console.table(feedbackByType.rows);
      }

      // Show recent feedback (last 10)
      console.log('\n💡 RECENT FEEDBACK (last 10):');
      const recentFeedback = await pool.query(`
        SELECT 
          f.id,
          COALESCE(f.feedback_type, 'general') as type,
          LEFT(f.message, 80) as message_preview,
          COALESCE(u.username, f.user_name, 'Anonymous') as submitted_by,
          CASE 
            WHEN u.id IS NOT NULL THEN 'Logged in user'
            WHEN f.user_name IS NOT NULL THEN 'Guest (provided name)'
            ELSE 'Anonymous'
          END as user_type,
          f.user_email,
          f.created_at,
          f.timestamp
        FROM feedback f
        LEFT JOIN users u ON u.id = f.user_id
        ORDER BY f.created_at DESC
        LIMIT 10
      `);
      console.table(recentFeedback.rows);

      // Show sample feedback (5 random)
      console.log('\n💡 SAMPLE FEEDBACK (5 random with full message):');
      const sampleFeedback = await pool.query(`
        SELECT 
          f.id,
          COALESCE(f.feedback_type, 'general') as type,
          f.message,
          COALESCE(u.username, f.user_name, 'Anonymous') as submitted_by,
          CASE 
            WHEN u.id IS NOT NULL THEN 'Yes'
            ELSE 'No'
          END as is_logged_in_user,
          f.user_email,
          f.created_at
        FROM feedback f
        LEFT JOIN users u ON u.id = f.user_id
        ORDER BY RANDOM()
        LIMIT 5
      `);
      sampleFeedback.rows.forEach((row, idx) => {
        console.log(`\n${idx + 1}. [${row.type}] ${row.submitted_by} (${row.created_at})`);
        console.log(`   ${row.message}`);
        if (row.user_email) {
          console.log(`   Email: ${row.user_email}`);
        }
      });
    } catch (e) {
      console.log('Could not fetch feedback statistics:', e.message);
      console.error(e);
    }

  } catch (error) {
    console.error('Error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('\n❌ Could not connect to database. Check:');
      console.error('   - Database is running');
      console.error('   - .env file has correct credentials');
      console.error('   - PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE are set');
    } else {
      console.error('\nFull error:', error);
    }
  } finally {
    await pool.end();
  }
}

showDatabase().catch(console.error);

