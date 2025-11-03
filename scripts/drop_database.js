import 'dotenv/config';
import { Pool, Client } from 'pg';

function getConnectionConfig() {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    return { connectionString, ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined };
  }
  return {
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'gyms',
  };
}

async function dropAllTables() {
  const pool = new Pool(getConnectionConfig());
  try {
    console.log('🗑️  Dropping all tables...\n');

    // Drop tables in order (respecting foreign key constraints)
    const tables = [
      'gym_style_votes',
      'gym_votes',
      'gyms',
      'users'
    ];

    for (const table of tables) {
      try {
        await pool.query(`DROP TABLE IF EXISTS ${table} CASCADE`);
        console.log(`✓ Dropped table: ${table}`);
      } catch (e) {
        console.log(`⚠ Could not drop ${table}: ${e.message}`);
      }
    }

    // Also drop any sequences that might exist
    console.log('\nCleaning up sequences...');
    await pool.query(`
      DO $$ DECLARE
        r RECORD;
      BEGIN
        FOR r IN (SELECT tablename FROM pg_tables WHERE schemaname = 'public') LOOP
          EXECUTE 'DROP TABLE IF EXISTS ' || quote_ident(r.tablename) || ' CASCADE';
        END LOOP;
      END $$;
    `);
    console.log('✓ Cleaned up remaining tables');

    console.log('\n✅ All tables dropped successfully!');
    console.log('\nNext steps:');
    console.log('  1. Run: npm run db:import');
    console.log('  2. Or: node scripts/db_setup_and_import.js');
    console.log('\nThis will recreate all tables with the latest schema.');

  } catch (error) {
    console.error('❌ Error dropping tables:', error.message);
    throw error;
  } finally {
    await pool.end();
  }
}

async function dropDatabase() {
  const config = getConnectionConfig();
  
  // Extract database name
  let dbName = 'gyms';
  if (config.connectionString) {
    try {
      const url = new URL(config.connectionString);
      dbName = url.pathname.slice(1) || 'gyms';
    } catch (e) {
      // Fallback: try to parse from connection string directly
      const match = config.connectionString.match(/\/\/([^:]+:[^@]+@)?[^\/]+\/([^?]+)/);
      if (match && match[2]) {
        dbName = match[2];
      }
    }
  } else {
    dbName = config.database || 'gyms';
  }
  
  // Connect to postgres database to drop the target database
  const clientConfig = { ...config };
  if (config.connectionString) {
    try {
      const url = new URL(config.connectionString);
      url.pathname = '/postgres';
      clientConfig.connectionString = url.toString();
    } catch (e) {
      // Fallback: replace database name in connection string
      clientConfig.connectionString = config.connectionString.replace(/\/[^\/?]+(\?|$)/, '/postgres$1');
    }
  } else {
    clientConfig.database = 'postgres';
  }

  const client = new Client(clientConfig);
  
  try {
    console.log(`🗑️  Dropping entire database: ${dbName}...\n`);
    
    await client.connect();
    
    // Terminate any active connections to the database
    try {
      await client.query(`
        SELECT pg_terminate_backend(pg_stat_activity.pid)
        FROM pg_stat_activity
        WHERE pg_stat_activity.datname = $1
          AND pid <> pg_backend_pid();
      `, [dbName]);
    } catch (e) {
      // Ignore if no connections exist
      console.log('No active connections to terminate');
    }
    
    // Drop the database
    await client.query(`DROP DATABASE IF EXISTS "${dbName}"`);
    console.log(`✓ Dropped database: ${dbName}`);
    
    // Recreate the database
    await client.query(`CREATE DATABASE "${dbName}"`);
    console.log(`✓ Created database: ${dbName}`);
    
    console.log('\n✅ Database reset successfully!');
    console.log('\nNext steps:');
    console.log('  1. Run: npm run db:import');
    console.log('  2. Or: node scripts/db_setup_and_import.js');
    console.log('\nThis will create all tables with the latest schema.');

  } catch (error) {
    console.error('❌ Error resetting database:', error.message);
    throw error;
  } finally {
    await client.end();
  }
}

async function main() {
  const args = process.argv.slice(2);
  const dropDb = args.includes('--drop-db') || args.includes('-d');
  
  try {
    if (dropDb) {
      await dropDatabase();
    } else {
      await dropAllTables();
    }
  } catch (error) {
    console.error('\n❌ Failed:', error);
    process.exit(1);
  }
}

main();

