#!/usr/bin/env node

/**
 * Cleanup votes script - Removes all votes from the database
 * 
 * Usage:
 *   node scripts/cleanup_votes.js
 * 
 * Options:
 *   --dry-run    Show what would be deleted without actually deleting
 *   --users      Also delete all users (default: keep users)
 *   --confirm    Skip confirmation prompt (use with caution!)
 */

import 'dotenv/config';
import { Pool } from 'pg';
import readline from 'readline';

function getPool() {
  const connectionString = process.env.DATABASE_URL;
  if (connectionString) {
    return new Pool({ 
      connectionString, 
      ssl: process.env.PGSSL === 'true' ? { rejectUnauthorized: false } : undefined 
    });
  }
  return new Pool({
    host: process.env.PGHOST || '127.0.0.1',
    port: Number(process.env.PGPORT || 5432),
    user: process.env.PGUSER || 'postgres',
    password: process.env.PGPASSWORD || 'postgres',
    database: process.env.PGDATABASE || 'gyms',
  });
}

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout,
});

function question(query) {
  return new Promise((resolve) => rl.question(query, resolve));
}

async function cleanupVotes(options = {}) {
  const { dryRun = false, deleteUsers = false, confirm = false } = options;
  
  const pool = getPool();

  try {
    console.log('🗑️  Vote Cleanup Script\n');
    console.log('Options:');
    console.log(`  Dry run: ${dryRun ? 'YES (no changes will be made)' : 'NO (will delete data)'}`);
    console.log(`  Delete users: ${deleteUsers ? 'YES' : 'NO'}`);
    console.log('');

    // Get current counts
    const voteCountResult = await pool.query('SELECT COUNT(*) as count FROM gym_votes');
    const utilityVoteCountResult = await pool.query('SELECT COUNT(*) as count FROM gym_utility_votes');
    const userCountResult = await pool.query('SELECT COUNT(*) as count FROM users');

    const voteCount = parseInt(voteCountResult.rows[0].count);
    const utilityVoteCount = parseInt(utilityVoteCountResult.rows[0].count);
    const userCount = parseInt(userCountResult.rows[0].count);

    console.log('📊 Current Database State:');
    console.log(`  gym_votes: ${voteCount.toLocaleString()} votes`);
    console.log(`  gym_utility_votes: ${utilityVoteCount.toLocaleString()} utility votes`);
    console.log(`  users: ${userCount.toLocaleString()} users`);
    console.log('');

    if (voteCount === 0 && utilityVoteCount === 0) {
      console.log('✓ No votes to clean up!');
      await pool.end();
      process.exit(0);
    }

    // Confirm deletion
    if (!confirm && !dryRun) {
      const answer = await question(
        `⚠️  This will delete ${voteCount.toLocaleString()} votes and ${utilityVoteCount.toLocaleString()} utility votes. Continue? (yes/no): `
      );
      
      if (answer.toLowerCase() !== 'yes') {
        console.log('❌ Cleanup cancelled.');
        await pool.end();
        process.exit(0);
      }

      if (deleteUsers) {
        const userAnswer = await question(
          `⚠️  This will also delete ALL ${userCount.toLocaleString()} users. Continue? (yes/no): `
        );
        
        if (userAnswer.toLowerCase() !== 'yes') {
          console.log('❌ Cleanup cancelled.');
          await pool.end();
          process.exit(0);
        }
      }
    }

    console.log('');
    
    if (dryRun) {
      console.log('🔍 DRY RUN MODE - No changes will be made\n');
      console.log('Would delete:');
      console.log(`  - ${voteCount.toLocaleString()} votes from gym_votes`);
      console.log(`  - ${utilityVoteCount.toLocaleString()} utility votes from gym_utility_votes`);
      if (deleteUsers) {
        console.log(`  - ${userCount.toLocaleString()} users from users`);
      }
    } else {
      console.log('🗑️  Deleting votes...\n');

      // Delete utility votes first (has foreign keys)
      console.log('  Deleting utility votes...');
      const utilityDeleteResult = await pool.query('DELETE FROM gym_utility_votes');
      console.log(`  ✓ Deleted ${utilityDeleteResult.rowCount.toLocaleString()} utility votes`);

      // Delete regular votes
      console.log('  Deleting votes...');
      const voteDeleteResult = await pool.query('DELETE FROM gym_votes');
      console.log(`  ✓ Deleted ${voteDeleteResult.rowCount.toLocaleString()} votes`);

      // Optionally delete users
      if (deleteUsers) {
        console.log('  Deleting users...');
        const userDeleteResult = await pool.query('DELETE FROM users');
        console.log(`  ✓ Deleted ${userDeleteResult.rowCount.toLocaleString()} users`);
      }

      // Verify deletion
      const remainingVotes = await pool.query('SELECT COUNT(*) as count FROM gym_votes');
      const remainingUtilityVotes = await pool.query('SELECT COUNT(*) as count FROM gym_utility_votes');
      const remainingUsers = await pool.query('SELECT COUNT(*) as count FROM users');

      console.log('');
      console.log('✅ Cleanup complete!');
      console.log('');
      console.log('📊 Final Database State:');
      console.log(`  gym_votes: ${parseInt(remainingVotes.rows[0].count)} votes`);
      console.log(`  gym_utility_votes: ${parseInt(remainingUtilityVotes.rows[0].count)} utility votes`);
      console.log(`  users: ${parseInt(remainingUsers.rows[0].count)} users`);
    }

    await pool.end();
    console.log('\n✓ Database connection closed.');
  } catch (error) {
    console.error('❌ Error during cleanup:', error);
    await pool.end();
    process.exit(1);
  } finally {
    rl.close();
  }
}

// Parse command line arguments
const args = process.argv.slice(2);
const options = {
  dryRun: args.includes('--dry-run'),
  deleteUsers: args.includes('--users'),
  confirm: args.includes('--confirm'),
};

// Run cleanup
cleanupVotes(options)
  .then(() => {
    process.exit(0);
  })
  .catch((error) => {
    console.error('Fatal error:', error);
    process.exit(1);
  });

