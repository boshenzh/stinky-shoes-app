// Per-user write-rate limiter.
//
// Counts NEW vote rows (not updates — `created_at` is set on INSERT only) across
// gym_votes + gym_utility_votes in a rolling 1-hour window. On DB error, fails
// open: better a transient slip than blocking every write.

const DEFAULT_MAX_PER_HOUR = 60;

const SQL = `
  SELECT
    (SELECT count(*)::int FROM gym_votes
      WHERE user_id = $1 AND created_at > now() - interval '1 hour')
    +
    (SELECT count(*)::int FROM gym_utility_votes
      WHERE user_id = $1 AND created_at > now() - interval '1 hour')
    AS recent_count
`;

export async function enforceWriteRate(pool, userId, { maxPerHour = DEFAULT_MAX_PER_HOUR } = {}) {
  if (!userId) return { ok: true };
  try {
    const result = await pool.query(SQL, [userId]);
    const count = result.rows[0]?.recent_count ?? 0;
    if (count >= maxPerHour) {
      return {
        ok: false,
        status: 429,
        error: 'rate_limited',
        retry_after_seconds: 3600,
      };
    }
    return { ok: true };
  } catch (e) {
    console.error('[rate-limit] fail-open due to query error:', e.code, e.message);
    return { ok: true };
  }
}
