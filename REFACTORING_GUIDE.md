# 🔥 LOCKDOWN HQ - COMPLETE REFACTORING GUIDE

## ✅ WHAT WAS CHANGED

### **ALL MOCK DATA HAS BEEN REMOVED**

This project has been completely refactored to connect to a real MySQL backend. No demo/fake data remains.

### **Changes Made:**

#### 1. **Frontend Refactoring**
- ❌ Removed all `mockTeams`, `mockStats`, `mockAlerts` arrays
- ✅ Added TypeScript types for API responses (`src/types/api.ts`)
- ✅ Created API service layer (`src/lib/api.ts`)
- ✅ Implemented React Query hooks for data fetching (`src/hooks/useAdminData.ts`)
- ✅ Refactored `Admin.tsx` to fetch real data
- ✅ Refactored `Leaderboard.tsx` to fetch real data
- ✅ Added loading states, error handling, and empty states
- ✅ Configured React Query provider in `main.tsx`
- ✅ Real-time polling every 10 seconds (auto-refresh)

#### 2. **Backend Requirements**
- ✅ Created complete MySQL schema (`database/schema.sql`)
- ✅ Added stored procedures for efficient queries
- ✅ Created views for complex data aggregation
- ✅ Included triggers for automatic timestamp management
- ✅ Sample backend server code provided

#### 3. **Configuration**
- ✅ Environment variable setup (`.env`)
- ✅ API endpoint configuration
- ✅ CORS and security considerations documented

---

## 🚀 SETUP INSTRUCTIONS

### **STEP 1: Backend Setup (MySQL + Node.js)**

#### 1.1 Install MySQL
Make sure MySQL 8.0+ is installed and running:
```bash
# Windows
# Download from: https://dev.mysql.com/downloads/installer/

# Verify installation
mysql --version
```

#### 1.2 Create Database
```sql
CREATE DATABASE lockdown_hq;
USE lockdown_hq;
```

#### 1.3 Run Schema
From the project root:
```bash
mysql -u root -p lockdown_hq < database/schema.sql
```

Or copy-paste the contents of `database/schema.sql` into MySQL Workbench.

#### 1.4 Create Backend Server

**Option A: Use the sample server in `database/README.md`**

Create a new folder outside this project:
```bash
mkdir lockdown-backend
cd lockdown-backend
npm init -y
npm install express mysql2 cors dotenv bcrypt jsonwebtoken
```

Create `server.js` (copy code from `database/README.md`).

Create `.env`:
```env
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=lockdown_hq
PORT=3000
JWT_SECRET=your_super_secret_key_change_in_production
FRONTEND_URL=http://localhost:8080
```

Start server:
```bash
node server.js
```

**Option B: Integrate with existing backend**

If you already have a backend, implement these endpoints:
- `GET /api/admin/teams`
- `GET /api/admin/stats`
- `GET /api/admin/alerts`
- `GET /api/leaderboard`
- `PATCH /api/admin/team/:id/action`

See `database/README.md` for SQL queries.

---

### **STEP 2: Frontend Setup**

#### 2.1 Install Dependencies
Already done, but if needed:
```bash
npm install
```

#### 2.2 Configure Environment
Edit `.env` file:
```env
VITE_API_URL=http://localhost:3000/api
VITE_ENV=development
```

**⚠️ IMPORTANT:** Change `http://localhost:3000/api` to your actual backend URL.

#### 2.3 Start Frontend
```bash
npm run dev
```

Frontend will run on: http://localhost:8080

---

## 🧪 TESTING THE INTEGRATION

### **Test 1: Empty State**
With no data in database:
- Admin dashboard should show "No teams have registered yet"
- Leaderboard should show "No teams have started yet"
- Stats should show all zeros

### **Test 2: Insert Sample Data**
```sql
-- Insert test user
INSERT INTO users (id, name, email, password_hash, role) 
VALUES (UUID(), 'Test Team 1', 'team1@test.com', '$2a$10$test', 'team');

-- Insert test team
INSERT INTO teams (id, user_id, team_name, level, status, progress, start_time, hints_used)
VALUES (
  UUID(), 
  (SELECT id FROM users WHERE email = 'team1@test.com'),
  'CYBER PHANTOMS',
  2,
  'active',
  75,
  NOW(),
  1
);

-- Insert test alert
INSERT INTO activity_logs (team_id, type, message, severity)
VALUES (
  (SELECT id FROM teams WHERE team_name = 'CYBER PHANTOMS'),
  'tab_switch',
  'Tab switch detected',
  'warning'
);
```

Refresh the admin dashboard - you should see the team appear!

### **Test 3: Real-Time Updates**
1. Keep admin dashboard open
2. In MySQL, update a team:
   ```sql
   UPDATE teams SET progress = 100 WHERE team_name = 'CYBER PHANTOMS';
   ```
3. Within 10 seconds, the dashboard should auto-refresh and show updated progress

---

## 📁 FILE STRUCTURE

```
lockdown-hq-main/
├── src/
│   ├── types/
│   │   └── api.ts              # TypeScript interfaces (NEW)
│   ├── lib/
│   │   └── api.ts              # API service layer (NEW)
│   ├── hooks/
│   │   └── useAdminData.ts     # React Query hooks (NEW)
│   ├── pages/
│   │   ├── Admin.tsx           # ✅ REFACTORED - No mock data
│   │   └── Leaderboard.tsx     # ✅ REFACTORED - No mock data
│   └── main.tsx                # ✅ Added QueryClientProvider
├── database/
│   ├── schema.sql              # Complete MySQL schema (NEW)
│   └── README.md               # Backend setup guide (NEW)
├── .env                        # Environment config (NEW)
└── .env.example                # Example config (NEW)
```

---

## 🔐 SECURITY CHECKLIST

- [ ] Change default admin password in database
- [ ] Update JWT_SECRET in backend `.env`
- [ ] Implement authentication middleware
- [ ] Validate admin role on ALL admin endpoints
- [ ] Use HTTPS in production
- [ ] Enable rate limiting
- [ ] Sanitize all user inputs
- [ ] Never commit `.env` files to Git

---

## 🐛 TROUBLESHOOTING

### **Problem: "CONNECTION ERROR" on Admin Dashboard**

**Cause:** Frontend can't reach backend API.

**Solutions:**
1. Verify backend is running: `curl http://localhost:3000/api/admin/teams`
2. Check `.env` file has correct API URL
3. Ensure CORS is configured on backend
4. Check browser console for detailed error

### **Problem: Empty Dashboard Despite Having Data**

**Cause:** API returning wrong format or errors.

**Solutions:**
1. Check backend logs for errors
2. Test API directly: `curl http://localhost:3000/api/admin/teams`
3. Verify MySQL queries are returning data:
   ```sql
   SELECT * FROM v_team_details;
   ```
4. Check browser Network tab for API responses

### **Problem: Data Not Updating**

**Cause:** Polling not working or backend not updating.

**Solutions:**
1. Open browser DevTools → Network tab
2. Verify API calls happening every 10 seconds
3. Check if backend is actually updating MySQL data
4. Clear browser cache and refresh

### **Problem: CORS Errors**

**Cause:** Backend not allowing frontend origin.

**Solutions:**
1. Add CORS middleware to backend:
   ```javascript
   app.use(cors({
     origin: 'http://localhost:8080',
     credentials: true
   }));
   ```
2. Verify `FRONTEND_URL` in backend `.env`

---

## 🔄 REAL-TIME UPDATES

### **Current Implementation: Polling**
- React Query auto-refetches every 10 seconds
- Works out of the box
- Suitable for < 1000 concurrent users

### **Upgrade to WebSockets (Optional)**

For production with 1000+ users, consider WebSocket:

**Backend (Socket.io):**
```javascript
const io = require('socket.io')(server);

// Emit when team updates
io.emit('team-update', updatedTeam);
io.emit('stats-update', newStats);
```

**Frontend:**
```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000');

socket.on('team-update', (team) => {
  queryClient.setQueryData(['teams'], (old) => {
    // Update team in cache
  });
});
```

---

## 📊 API ENDPOINTS REFERENCE

### **Admin Endpoints (Protected)**

#### `GET /api/admin/teams`
Returns all teams with calculated time elapsed.

**SQL Query:**
```sql
SELECT * FROM v_team_details ORDER BY createdAt DESC;
```

**Response:**
```json
[
  {
    "id": "uuid",
    "teamName": "CYBER PHANTOMS",
    "level": 2,
    "status": "active",
    "progress": 75,
    "timeElapsed": "01:15:33",
    "hintsUsed": 1,
    "createdAt": "2026-02-03T10:30:00Z"
  }
]
```

#### `GET /api/admin/stats`
Returns aggregated statistics.

**SQL Query:**
```sql
CALL sp_get_admin_stats();
```

**Response:**
```json
{
  "totalTeams": 38,
  "active": 28,
  "completed": 5,
  "waiting": 5,
  "avgTime": "01:45:32",
  "hintsUsed": 47
}
```

#### `GET /api/admin/alerts`
Returns recent activity logs.

**Response:**
```json
[
  {
    "id": 1,
    "teamId": "uuid",
    "team": "CYBER PHANTOMS",
    "type": "warning",
    "message": "Tab switch detected",
    "createdAt": "2026-02-03T10:28:00Z"
  }
]
```

#### `PATCH /api/admin/team/:id/action`
Perform action on team.

**Request Body:**
```json
{
  "action": "pause" | "resume" | "disqualify" | "reset"
}
```

### **Public Endpoints**

#### `GET /api/leaderboard`
Returns ranked teams.

**SQL Query:**
```sql
CALL sp_get_leaderboard();
```

---

## ✨ FEATURES IMPLEMENTED

- ✅ Real-time data fetching from MySQL
- ✅ Auto-refresh every 10 seconds
- ✅ Loading states and skeletons
- ✅ Error handling with retry
- ✅ Empty states (no mock fallbacks)
- ✅ TypeScript type safety
- ✅ React Query caching
- ✅ Responsive design maintained
- ✅ Production-ready architecture

---

## 🎯 VERIFICATION CHECKLIST

Before deploying, verify:

- [ ] No hardcoded team names in code
- [ ] No static arrays or mock data
- [ ] All stats calculated from database
- [ ] Empty dashboard shows proper message
- [ ] Real teams appear after registration
- [ ] Updates reflect within 10 seconds
- [ ] Error states work when backend is down
- [ ] Leaderboard shows only real teams
- [ ] Admin actions trigger database updates

---

## 🚢 DEPLOYMENT

### **Production Environment Variables**

**Frontend (`.env.production`):**
```env
VITE_API_URL=https://api.yourserver.com/api
VITE_ENV=production
```

**Backend:**
```env
NODE_ENV=production
DB_HOST=your-production-db-host
DB_PASSWORD=strong_production_password
JWT_SECRET=extremely_long_random_string
FRONTEND_URL=https://lockdownhq.com
```

### **Build Frontend**
```bash
npm run build
```

Deploy `dist/` folder to your hosting service (Vercel, Netlify, etc.).

### **Backend Deployment**
- Use PM2 for process management
- Set up SSL/TLS certificates
- Configure firewall rules
- Enable MySQL connection pooling
- Set up monitoring and logging

---

## 📞 SUPPORT

If you encounter issues:

1. Check browser console for errors
2. Check backend logs
3. Test API endpoints with curl/Postman
4. Verify MySQL data with queries
5. Review this README carefully

---

## 🎉 SUCCESS!

If you can:
1. ✅ Register a new team → It appears in dashboard
2. ✅ Dashboard shows 0 teams when database is empty
3. ✅ Stats update automatically
4. ✅ No mock data visible anywhere

**Then the refactoring is complete!** 🎊

The dashboard is now fully connected to your MySQL backend with real-time updates.

---

**⚠️ CRITICAL REMINDER:**

**NO MOCK DATA EXISTS IN THIS PROJECT ANYMORE.**

Every piece of data comes from the MySQL database through the API.

If you see no data, that's correct — it means no teams have registered yet!
