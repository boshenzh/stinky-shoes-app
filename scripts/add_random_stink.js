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

async function addRandomStinkValues() {
  const pool = getPool();
  
  try {
    console.log('Adding random stink values to all gyms...');
    
    // Get or create a test user
    let testUser;
    const userResult = await pool.query('SELECT id FROM users WHERE username = $1', ['test_user']);
    if (userResult.rows.length > 0) {
      testUser = userResult.rows[0];
      console.log('Using existing test_user');
    } else {
      const newUser = await pool.query(
        'INSERT INTO users (username) VALUES ($1) RETURNING id',
        ['test_user']
      );
      testUser = newUser.rows[0];
      console.log('Created test_user');
    }
    
    // Get all gyms
    const gymsResult = await pool.query('SELECT id FROM gyms');
    const gyms = gymsResult.rows;
    console.log(`Found ${gyms.length} gyms`);
    
    if (gyms.length === 0) {
      console.log('No gyms found in database. Run db:import first.');
      return;
    }
    
    // Generate random votes for each gym
    let added = 0;
    let updated = 0;
    
    for (const gym of gyms) {
      // Generate random values
      const smell = Math.floor(Math.random() * 101); // 0-100
      const difficulty = Math.floor(Math.random() * 7) - 3; // -3 to 3
      const parking = Math.floor(Math.random() * 101); // 0-100
      const petFriendly = Math.floor(Math.random() * 101); // 0-100
      
      // Generate style percentages that sum to 100
      const crimpy = Math.floor(Math.random() * 101);
      const remaining = 100 - crimpy;
      const dynos = Math.floor(Math.random() * (remaining + 1));
      const remaining2 = remaining - dynos;
      const overhang = Math.floor(Math.random() * (remaining2 + 1));
      const slab = remaining2 - overhang;
      
      // Check if vote already exists for this gym and user
      const existing = await pool.query(
        'SELECT id FROM gym_votes WHERE gym_id = $1 AND user_id = $2',
        [gym.id, testUser.id]
      );
      
      if (existing.rows.length > 0) {
        // Update existing vote
        await pool.query(`
          UPDATE gym_votes
          SET smell = $1,
              difficulty = $2,
              parking_availability = $3,
              pet_friendly = $4,
              crimpy_pct = $5,
              dynos_pct = $6,
              overhang_pct = $7,
              slab_pct = $8,
              updated_at = now()
          WHERE gym_id = $9 AND user_id = $10
        `, [smell, difficulty, parking, petFriendly, crimpy, dynos, overhang, slab, gym.id, testUser.id]);
        updated++;
      } else {
        // Insert new vote
        await pool.query(`
          INSERT INTO gym_votes (gym_id, user_id, smell, difficulty, parking_availability, pet_friendly, crimpy_pct, dynos_pct, overhang_pct, slab_pct)
          VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10)
        `, [gym.id, testUser.id, smell, difficulty, parking, petFriendly, crimpy, dynos, overhang, slab]);
        added++;
      }
    }
    
    console.log(`\n✅ Complete!`);
    console.log(`   Added: ${added} votes`);
    console.log(`   Updated: ${updated} votes`);
    console.log(`   Total: ${added + updated} gyms now have stink values`);
    
  } catch (error) {
    console.error('Error adding random stink values:', error);
    throw error;
  } finally {
    await pool.end();
  }
}

addRandomStinkValues().catch(console.error);

