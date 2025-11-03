# Express.js Routing Best Practices

## 1. Route Order Matters (Critical!)

**Always define routes from most specific to least specific.**

### ❌ Bad - Catch-all route first
```javascript
router.get('/:id', getGym);              // Matches ANY path
router.get('/voted-gyms', getVotedGyms); // NEVER matches!
```

### ✅ Good - Specific routes first
```javascript
router.get('/voted-gyms', getVotedGyms); // Specific route first
router.get('/user/:user_id/stats', getUserStats); // More specific parameterized
router.get('/:id/my-vote', getMyVote);   // More specific parameterized
router.get('/:id', getGym);              // Catch-all LAST
```

### Route Matching Priority
Express matches routes in order, so:
1. **Exact paths** (`/voted-gyms`) - highest priority
2. **Specific parameterized** (`/:id/my-vote`) - medium priority
3. **Catch-all parameterized** (`/:id`) - lowest priority (should be last)

---

## 2. Route Organization Patterns

### Pattern 1: Group by Resource (Recommended)
```javascript
// All gym routes together
router.get('/gyms', getAllGyms);
router.get('/gyms/voted-gyms', getVotedGyms);
router.get('/gyms/:id', getGym);
router.get('/gyms/:id/votes', getVotes);
router.post('/gyms/:id/vote', createVote);

// All user routes together
router.get('/users', getAllUsers);
router.get('/users/:id', getUser);
router.get('/users/:id/stats', getUserStats);
```

### Pattern 2: Separate Routers (For Large Apps)
```javascript
// routes/gyms.js
const router = express.Router();
router.get('/', getAllGyms);
router.get('/voted-gyms', getVotedGyms);
router.get('/:id', getGym);
export default router;

// routes/users.js
const router = express.Router();
router.get('/', getAllUsers);
router.get('/:id', getUser);
export default router;

// app.js
import gymRoutes from './routes/gyms.js';
import userRoutes from './routes/users.js';
app.use('/api/gyms', gymRoutes);
app.use('/api/users', userRoutes);
```

---

## 3. Parameter Validation

### ✅ Always validate route parameters
```javascript
router.get('/:id', async (req, res) => {
  const { id } = req.params;
  
  // Validate UUID format
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  if (!uuidRegex.test(id)) {
    return res.status(400).json({ error: 'Invalid ID format' });
  }
  
  // Or validate numeric ID
  if (!/^\d+$/.test(id)) {
    return res.status(400).json({ error: 'ID must be a number' });
  }
  
  // Continue with handler...
});
```

### Use Middleware for Validation
```javascript
// middleware/validateUuid.js
export function validateUuid(req, res, next) {
  const { id } = req.params;
  const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
  
  if (!uuidRegex.test(id)) {
    return res.status(400).json({ error: 'Invalid UUID format' });
  }
  
  next();
}

// Use it
router.get('/:id', validateUuid, getGym);
```

---

## 4. Query Parameter Handling

### ✅ Safe query parameter extraction
```javascript
router.get('/gyms', async (req, res) => {
  // Always provide defaults and validate types
  const bbox = typeof req.query.bbox === 'string' ? req.query.bbox.trim() : null;
  const limit = Number(req.query.limit) || 10;
  const page = Number(req.query.page) || 1;
  
  // Validate ranges
  if (limit < 1 || limit > 100) {
    return res.status(400).json({ error: 'limit must be between 1 and 100' });
  }
  
  // Continue...
});
```

### Common Pattern: Query Object Builder
```javascript
function buildQueryOptions(req) {
  const limit = Math.min(Number(req.query.limit) || 10, 100);
  const offset = (Number(req.query.page) || 0) * limit;
  const sort = req.query.sort || 'created_at';
  const order = req.query.order === 'asc' ? 'ASC' : 'DESC';
  
  return { limit, offset, sort, order };
}
```

---

## 5. Error Handling

### ✅ Use try-catch in async routes
```javascript
router.get('/:id', async (req, res) => {
  try {
    const { id } = req.params;
    const gym = await db.getGym(id);
    
    if (!gym) {
      return res.status(404).json({ error: 'Gym not found' });
    }
    
    res.json(gym);
  } catch (error) {
    console.error('Error fetching gym:', error);
    res.status(500).json({ error: 'server_error' });
  }
});
```

### Use Error Handler Middleware
```javascript
// middleware/errorHandler.js
export function errorHandler(err, req, res, next) {
  console.error(err.stack);
  
  // Database errors
  if (err.code === '23505') { // unique_violation
    return res.status(409).json({ error: 'Resource already exists' });
  }
  
  if (err.code === '22P02') { // invalid_input_syntax
    return res.status(400).json({ error: 'Invalid input format' });
  }
  
  // Default
  res.status(500).json({ error: 'Internal server error' });
}

// app.js
app.use(errorHandler);
```

---

## 6. HTTP Method Best Practices

### Use Appropriate HTTP Methods
```javascript
// GET - Read only, no side effects
router.get('/gyms/:id', getGym);

// POST - Create new resource
router.post('/gyms', createGym);

// PUT - Replace entire resource
router.put('/gyms/:id', replaceGym);

// PATCH - Partial update
router.patch('/gyms/:id', updateGym);

// DELETE - Remove resource
router.delete('/gyms/:id', deleteGym);
```

### Idempotency
- **GET, PUT, DELETE**: Should be idempotent (safe to call multiple times)
- **POST**: Not idempotent (creates new resource each time)

---

## 7. Response Consistency

### Standardized Response Format
```javascript
// Success response
res.json({
  data: gym,
  meta: {
    count: 1,
    timestamp: new Date().toISOString()
  }
});

// Error response
res.status(400).json({
  error: 'validation_error',
  message: 'Invalid input',
  details: validationErrors
});
```

---

## 8. Route Documentation

### Document Routes with Comments
```javascript
/**
 * GET /api/gyms/voted-gyms?username=admin
 * 
 * Returns array of gym IDs that the user has voted on
 * 
 * Query params:
 * - username (required): Username to fetch votes for
 * 
 * Returns:
 * - 200: Array of gym IDs [uuid1, uuid2, ...]
 * - 400: Missing username
 * - 500: Server error
 */
router.get('/voted-gyms', async (req, res) => {
  // Implementation...
});
```

---

## 9. Security Best Practices

### Input Sanitization
```javascript
// Sanitize strings
const username = typeof req.query.username === 'string' 
  ? req.query.username.trim().slice(0, 50)  // Limit length
  : null;

// Validate patterns
if (!/^[a-zA-Z0-9_-]{3,20}$/.test(username)) {
  return res.status(400).json({ error: 'Invalid username format' });
}
```

### SQL Injection Prevention
```javascript
// ✅ Always use parameterized queries
const { rows } = await pool.query(
  'SELECT * FROM gyms WHERE id = $1',
  [gymId]  // Parameterized
);

// ❌ NEVER do this (SQL injection risk)
const query = `SELECT * FROM gyms WHERE id = '${gymId}'`;
```

---

## 10. Performance Considerations

### Limit Response Data
```javascript
router.get('/gyms', async (req, res) => {
  const limit = Math.min(Number(req.query.limit) || 10, 100); // Cap at 100
  const gyms = await db.getGyms({ limit });
  res.json(gyms);
});
```

### Use Indexing
Ensure database columns used in WHERE clauses are indexed:
- Route parameters (e.g., `id`)
- Common query parameters (e.g., `username`, `gym_id`)

---

## 11. Route Testing Strategy

### Test Route Order
```javascript
// tests/routes.test.js
describe('Route Order', () => {
  it('should match /voted-gyms before /:id', async () => {
    const res = await request(app)
      .get('/api/gyms/voted-gyms?username=test');
    
    expect(res.status).toBe(200);
    // If this fails, route order is wrong!
  });
});
```

---

## Summary Checklist

When adding new routes:

1. ✅ **Order**: Specific routes → Parameterized routes → Catch-all routes
2. ✅ **Validation**: Validate all inputs (params, query, body)
3. ✅ **Error Handling**: Use try-catch and proper error responses
4. ✅ **Documentation**: Document parameters and responses
5. ✅ **Security**: Sanitize inputs, use parameterized queries
6. ✅ **HTTP Methods**: Use appropriate methods (GET, POST, etc.)
7. ✅ **Consistency**: Follow the same patterns across all routes
8. ✅ **Testing**: Test route order and edge cases

---

## Real-World Example

```javascript
// routes/gyms.js - Well-organized route file

export function createGymsRouter(pool) {
  const router = express.Router();

  // ============================================================================
  // SPECIFIC ROUTES (must come first)
  // ============================================================================
  
  router.get('/', getAllGyms);           // GET /api/gyms
  router.get('/voted-gyms', getVotedGyms); // GET /api/gyms/voted-gyms
  
  // ============================================================================
  // MORE SPECIFIC PARAMETERIZED ROUTES
  // ============================================================================
  
  router.get('/:id/my-vote', getMyVote);        // GET /api/gyms/:id/my-vote
  router.get('/:id/my-utility-votes', getUtilityVotes);
  router.post('/:id/vote', createVote);
  router.post('/:id/utility-vote', createUtilityVote);
  
  // ============================================================================
  // CATCH-ALL PARAMETERIZED ROUTES (must come last)
  // ============================================================================
  
  router.get('/:id', getGym);  // GET /api/gyms/:id
  
  return router;
}
```

This organization ensures routes are matched correctly and the code is maintainable.

