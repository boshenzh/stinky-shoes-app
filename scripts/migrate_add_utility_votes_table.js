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

async function migrate() {
  const pool = getPool();
  try {
    console.log('Creating gym_utility_votes table...');

    // Create gym_utility_votes table
    await pool.query(`
      CREATE TABLE IF NOT EXISTS gym_utility_votes (
        id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
        gym_id uuid NOT NULL REFERENCES gyms(id) ON DELETE CASCADE,
        user_id uuid REFERENCES users(id) ON DELETE CASCADE,
        username text,
        utility_name text NOT NULL,
        vote smallint NOT NULL CHECK (vote IN (1, -1)),
        created_at timestamptz DEFAULT now(),
        updated_at timestamptz DEFAULT now()
      )
    `);

    // Create indexes
    console.log('Creating indexes...');
    await pool.query(`CREATE INDEX IF NOT EXISTS gym_utility_votes_gym_id_idx ON gym_utility_votes(gym_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS gym_utility_votes_user_id_idx ON gym_utility_votes(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS gym_utility_votes_utility_name_idx ON gym_utility_votes(utility_name)`);

    // Create unique constraints
    console.log('Creating unique constraints...');
    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes 
          WHERE indexname = 'gym_utility_votes_gym_user_utility_unique'
        ) THEN
          CREATE UNIQUE INDEX gym_utility_votes_gym_user_utility_unique 
          ON gym_utility_votes(gym_id, user_id, utility_name) 
          WHERE user_id IS NOT NULL;
        END IF;
      END $$;
    `);

    await pool.query(`
      DO $$ 
      BEGIN
        IF NOT EXISTS (
          SELECT 1 FROM pg_indexes 
          WHERE indexname = 'gym_utility_votes_gym_username_utility_unique'
        ) THEN
          CREATE UNIQUE INDEX gym_utility_votes_gym_username_utility_unique 
          ON gym_utility_votes(gym_id, username, utility_name) 
          WHERE username IS NOT NULL;
        END IF;
      END $$;
    `);

    console.log('✅ Successfully created gym_utility_votes table and indexes!');
    
    // Verify table exists
    const checkTable = await pool.query(`
      SELECT EXISTS (
        SELECT FROM information_schema.tables 
        WHERE table_name = 'gym_utility_votes'
      )
    `);
    
    if (checkTable.rows[0].exists) {
      console.log('✅ Table verification: gym_utility_votes exists');
    } else {
      console.log('❌ Table verification failed: gym_utility_votes does not exist');
    }

  } catch (error) {
    console.error('❌ Migration failed:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('\nCould not connect to database. Check:');
      console.error('   - Database is running');
      console.error('   - .env file has correct credentials');
    } else {
      console.error('\nFull error:', error);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate().catch(console.error);

