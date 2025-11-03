// Database helper functions
export async function hasStyleColumns(pool) {
  try {
    const result = await pool.query(`
      SELECT column_name 
      FROM information_schema.columns 
      WHERE table_name = 'gym_votes' AND column_name = 'crimpy_pct'
    `);
    return result.rows.length > 0;
  } catch (e) {
    return false;
  }
}

export async function getOrCreateUser(pool, username) {
  // Try to find existing user
  let userResult = await pool.query('SELECT id, username, password_hash FROM users WHERE username = $1', [username]);
  
  if (userResult.rows.length > 0) {
    return userResult.rows[0];
  }
  
  // Create new user if doesn't exist
  const newUser = await pool.query(
    'INSERT INTO users (username) VALUES ($1) RETURNING id, username, password_hash',
    [username]
  );
  return newUser.rows[0];
}

