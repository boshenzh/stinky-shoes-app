// Feedback routes
import express from 'express';

export function createFeedbackRouter(pool) {
  const router = express.Router();

  // POST /api/feedback - Receive feedback from feedbackfin widget
  router.post('/', async (req, res) => {
    try {
      const { feedbackType, message, timestamp, ...userData } = req.body;

      // Validate required fields
      if (!message || typeof message !== 'string' || message.trim().length === 0) {
        return res.status(400).json({ error: 'message is required' });
      }

      // Extract user information
      const user = userData.user || {};
      const userId = user.id || null;
      const userName = user.name || null;
      const userEmail = user.email || null;

      // Insert feedback into database
      const result = await pool.query(
        `INSERT INTO feedback (feedback_type, message, user_id, user_name, user_email, timestamp, created_at, updated_at)
         VALUES ($1, $2, $3, $4, $5, $6, now(), now())
         RETURNING id, created_at`,
        [
          feedbackType || null,
          message.trim(),
          userId,
          userName,
          userEmail,
          timestamp ? new Date(timestamp) : new Date(),
        ]
      );

      return res.json({
        ok: true,
        id: result.rows[0].id,
        message: 'Feedback submitted successfully',
      });
    } catch (e) {
      console.error('Error submitting feedback:', e);
      res.status(500).json({ error: 'server_error' });
    }
  });

  // GET /api/feedback - Get feedback (optional, for admin viewing)
  router.get('/', async (req, res) => {
    try {
      const limit = parseInt(req.query.limit || '50', 10);
      const offset = parseInt(req.query.offset || '0', 10);

      const result = await pool.query(
        `SELECT 
          id,
          feedback_type,
          message,
          user_id,
          user_name,
          user_email,
          timestamp,
          created_at
         FROM feedback
         ORDER BY created_at DESC
         LIMIT $1 OFFSET $2`,
        [limit, offset]
      );

      const countResult = await pool.query('SELECT COUNT(*) as total FROM feedback');
      const total = parseInt(countResult.rows[0].total, 10);

      return res.json({
        ok: true,
        feedback: result.rows,
        total,
        limit,
        offset,
      });
    } catch (e) {
      console.error('Error fetching feedback:', e);
      res.status(500).json({ error: 'server_error' });
    }
  });

  return router;
}

