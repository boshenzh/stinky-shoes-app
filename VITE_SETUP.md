# Vite Setup Explanation

## Why Two Servers?

You don't actually NEED two servers! Here are the options:

### Option 1: Two Servers (Development Only)
**Development:**
- **Vite** (port 5173): Serves frontend with Hot Module Replacement (HMR)
- **Express** (port 3000): Serves API endpoints
- Vite proxies API requests to Express

**Why?** Fast HMR in development, but requires two terminals

**Production:**
- Only **Express** server: Serves built files + API
- Run `npm run build` first, then Express serves from `dist/`

---

### Option 2: Single Server (Simpler) ⭐ **RECOMMENDED**

**Keep using Express for everything:**
- Express already serves static files from `public/`
- Use Vite only for **building** (not as dev server)
- Simpler workflow, no proxy needed

**Setup:**
```json
{
  "scripts": {
    "dev": "node server.js",
    "build": "vite build",
    "start": "NODE_ENV=production node server.js"
  }
}
```

**Production:**
- Build: `npm run build` (creates optimized bundle in `dist/`)
- Serve: Express serves from `dist/` instead of `public/`

---

## Recommended Approach

Since your Express server already serves static files, use **Option 2**:

1. **Development**: Keep using `npm run dev:server` (Express serves everything)
2. **Building**: Use Vite to create optimized production bundle
3. **Production**: Express serves built files from `dist/`

This way:
- ✅ Simple - only one server
- ✅ Still get Vite's build optimizations
- ✅ No proxy configuration needed
- ✅ Works the same way you're used to

### Update server.js for production:

```javascript
// In server.js
if (process.env.NODE_ENV === 'production') {
  app.use(express.static(path.join(__dirname, "dist")));
} else {
  app.use(express.static(path.join(__dirname, "public")));
}
```

### Update vite.config.js:

```javascript
// Build output goes to dist/ for production
build: {
  outDir: '../dist',
}
```

---

## When to Use Two Servers?

Only use two servers if you want:
- ⚡ Instant Hot Module Replacement (changes update without page refresh)
- 🛠️ Better developer experience in development
- But you're okay with managing two terminals

For most projects, **single server + Vite build** is simpler and sufficient!

