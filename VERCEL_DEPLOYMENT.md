# 🚀 Vercel Deployment Guide - Lockdown HQ

## Prerequisites

1. **GitHub Account** - Push your code to GitHub
2. **Vercel Account** - Sign up at [vercel.com](https://vercel.com)
3. **MySQL Database** - Use one of these cloud providers:
   - [PlanetScale](https://planetscale.com) (Free tier available)
   - [Aiven](https://aiven.io) (Free tier available)
   - [Railway](https://railway.app)
   - [TiDB Cloud](https://tidbcloud.com)

---

## Step 1: Set Up Cloud MySQL Database

### Option A: PlanetScale (Recommended)
1. Go to [planetscale.com](https://planetscale.com)
2. Create a new database named `lockdown_hq`
3. Go to **Settings** → **Passwords** → **New Password**
4. Copy the connection details:
   - Host: `aws.connect.psdb.cloud`
   - Username: your-username
   - Password: your-password
   - Database: `lockdown_hq`

### Option B: Aiven
1. Go to [aiven.io](https://aiven.io)
2. Create a free MySQL service
3. Copy connection details from the dashboard

### Initialize Database
Run the schema on your cloud database:
```sql
-- Copy contents from server/migrations/schema.sql
-- Run in your database console
```

---

## Step 2: Push to GitHub

```bash
cd lockdown-hq-main
git init
git add .
git commit -m "Initial commit - Lockdown HQ"
git branch -M main
git remote add origin https://github.com/YOUR_USERNAME/lockdown-hq.git
git push -u origin main
```

---

## Step 3: Deploy to Vercel

### Via Vercel Dashboard
1. Go to [vercel.com/new](https://vercel.com/new)
2. Import your GitHub repository
3. Configure the project:
   - **Framework Preset:** Vite
   - **Root Directory:** `./` (leave default)
   - **Build Command:** `npm run build`
   - **Output Directory:** `dist`

### Add Environment Variables
In Vercel Dashboard → Project → Settings → Environment Variables:

```
DB_HOST=your-mysql-host.com
DB_PORT=3306
DB_USER=your_username
DB_PASSWORD=your_password
DB_NAME=lockdown_hq

JWT_ACCESS_SECRET=your-super-secret-access-key-min-32-characters
JWT_REFRESH_SECRET=your-super-secret-refresh-key-min-32-characters
JWT_ACCESS_EXPIRY=15m
JWT_REFRESH_EXPIRY=7d

NODE_ENV=production
```

> ⚠️ **Important:** Generate secure random strings for JWT secrets. Use:
> ```bash
> node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
> ```

---

## Step 4: Create Admin User

After deployment, create your admin user by running this SQL in your cloud database:

```sql
INSERT INTO users (id, name, email, password_hash, role, is_verified) 
VALUES (
  UUID(),
  'Admin',
  'your-email@example.com',
  '$2b$10$YOUR_BCRYPT_HASH_HERE',
  'admin',
  TRUE
);
```

To generate a bcrypt hash for your password:
```bash
node -e "const bcrypt = require('bcrypt'); bcrypt.hash('YourPassword123', 10).then(console.log)"
```

---

## Step 5: Verify Deployment

1. Visit your Vercel URL: `https://your-app.vercel.app`
2. Test the login at `/admin-login`
3. Check API at `/api/game/state`

---

## Project Structure for Vercel

```
lockdown-hq-main/
├── api/                    # Vercel Serverless Functions
│   ├── _lib/              # Shared utilities
│   │   ├── auth.js
│   │   ├── db.js
│   │   ├── jwt.js
│   │   └── password.js
│   ├── auth/[...path].js  # /api/auth/* routes
│   ├── admin/[...path].js # /api/admin/* routes
│   ├── team/[...path].js  # /api/team/* routes
│   ├── game/[...path].js  # /api/game/* routes
│   ├── puzzles/[...path].js
│   ├── gameplay/[...path].js
│   ├── leaderboard.js
│   └── package.json       # API dependencies
├── src/                   # React Frontend
├── vercel.json           # Vercel configuration
└── package.json          # Frontend dependencies
```

---

## Troubleshooting

### "Cannot connect to database"
- Verify your database credentials in Vercel Environment Variables
- Check if your database allows connections from Vercel IPs
- PlanetScale: Enable "Connect from anywhere" in settings

### "API returns 500 error"
- Check Vercel Function logs: Dashboard → Project → Functions → Logs
- Verify all environment variables are set

### "CORS errors"
- The `vercel.json` already includes CORS headers
- Make sure you're using the correct API URL

### "bcrypt error in serverless"
If you see bcrypt errors, the `api/package.json` should install it correctly.
If issues persist, consider using `bcryptjs` instead:
```bash
cd api
npm uninstall bcrypt
npm install bcryptjs
```
Then update `api/_lib/password.js` to use `bcryptjs`.

---

## Local Development

For local development, keep using the original setup:

```bash
# Terminal 1: Frontend
npm run dev

# Terminal 2: Backend (Express server)
cd server
node server.js
```

The frontend will automatically use `http://localhost:5000/api` in development
and `/api` (Vercel serverless) in production.

---

## Environment Variable Reference

| Variable | Description | Example |
|----------|-------------|---------|
| `DB_HOST` | MySQL host | `aws.connect.psdb.cloud` |
| `DB_PORT` | MySQL port | `3306` |
| `DB_USER` | MySQL username | `admin` |
| `DB_PASSWORD` | MySQL password | `secret123` |
| `DB_NAME` | Database name | `lockdown_hq` |
| `JWT_ACCESS_SECRET` | Access token secret | `random-32-char-string` |
| `JWT_REFRESH_SECRET` | Refresh token secret | `random-32-char-string` |
| `JWT_ACCESS_EXPIRY` | Access token lifetime | `15m` |
| `JWT_REFRESH_EXPIRY` | Refresh token lifetime | `7d` |

---

## Support

If you encounter issues:
1. Check Vercel deployment logs
2. Verify environment variables
3. Test database connection separately
4. Check browser console for frontend errors
