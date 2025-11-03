// Migration script to add feedback table
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
    console.log('Adding feedback table...\n');

    // Create feedback table
    await pool.query(`
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
      )
    `);

    // Create indexes for feedback table
    await pool.query(`CREATE INDEX IF NOT EXISTS feedback_user_id_idx ON feedback(user_id)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS feedback_created_at_idx ON feedback(created_at)`);
    await pool.query(`CREATE INDEX IF NOT EXISTS feedback_type_idx ON feedback(feedback_type)`);

    console.log('✅ Feedback table created successfully!');
    console.log('✅ Indexes created successfully!\n');

    // Verify table exists
    const result = await pool.query(`
      SELECT COUNT(*) as count 
      FROM information_schema.tables 
      WHERE table_name = 'feedback'
    `);
    
    if (result.rows[0].count === '1') {
      console.log('✅ Verification: feedback table exists\n');
    }

  } catch (error) {
    console.error('❌ Error:', error.message);
    if (error.code === 'ECONNREFUSED') {
      console.error('\n❌ Could not connect to database. Check:');
      console.error('   - Database is running');
      console.error('   - .env file has correct credentials');
      console.error('   - PGHOST, PGPORT, PGUSER, PGPASSWORD, PGDATABASE are set');
    } else {
      console.error('\nFull error:', error);
    }
    process.exit(1);
  } finally {
    await pool.end();
  }
}

migrate().catch(console.error);

