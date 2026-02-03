# 🎮 LOCKDOWN HQ - Complete Setup Guide

> **A cyberpunk-themed escape room game with real-time puzzle solving, team management, and live monitoring.**

## 🚀 Quick Start (5 Minutes)

### 1. Start Database Server
```powershell
cd database
node server.js
```
✅ **Expected**: "✅ MySQL database connected"

### 2. Start Backend Server
```powershell
cd server
node server.js
```
✅ **Expected**: "🚀 Lockdown HQ - Auth Server running on port 5000"

### 3. Start Frontend
```powershell
npm run dev
```
✅ **Expected**: "Local: http://localhost:5173"

### 4. Open Browser
Navigate to `http://localhost:5173`

---

## 📋 Prerequisites

### Required Software
- **Node.js**: v18+ (Download from [nodejs.org](https://nodejs.org))
- **MySQL**: v8+ (Comes with XAMPP or standalone)
- **Git**: For cloning repository

### Check Installations
```powershell
node --version     # Should show v18.x.x or higher
npm --version      # Should show 9.x.x or higher
mysql --version    # Should show 8.x.x or higher
```

---

## 🛠️ Full Installation

### Step 1: Clone Repository
```powershell
git clone <repository-url>
cd lockdown-hq-main
```

### Step 2: Install Dependencies

#### Frontend Dependencies
```powershell
npm install
```

#### Backend Dependencies
```powershell
cd server
npm install
cd ..
```

#### Database Dependencies
```powershell
cd database
npm install
cd ..
```

### Step 3: Configure Environment

#### Frontend (.env)
Create `.env` file in root directory:
```env
VITE_API_URL=http://localhost:5000
```

#### Backend (server/.env)
Create `server/.env` file:
```env
# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=lockdown_hq

# JWT Secrets
JWT_SECRET=your_super_secret_jwt_key_here
JWT_REFRESH_SECRET=your_refresh_secret_here

# Email (Optional - for OTP verification)
EMAIL_USER=your_email@gmail.com
EMAIL_PASS=your_gmail_app_password

# Server
PORT=5000
NODE_ENV=development
```

### Step 4: Setup Database

#### Option A: Automatic (Recommended)
```powershell
cd server
node migrations/run.js
node migrations/seed-puzzles.js
```

#### Option B: Manual
1. Open MySQL Workbench or command line
2. Run `server/migrations/schema.sql`
3. Run `server/migrations/seed-puzzles.js`

### Step 5: Create Admin Account
```powershell
cd server
node create-admin.js
```
Enter admin credentials when prompted.

---

## 🎯 Testing the Application

### 1. Test Admin Login
1. Navigate to `http://localhost:5173/admin-login`
2. Login with admin credentials
3. ✅ Should redirect to `/admin` dashboard

### 2. Test Puzzle Management
1. From admin dashboard, click "Puzzle Management"
2. ✅ Should see 9 seeded puzzles
3. Try creating a new puzzle
4. ✅ Should appear in table

### 3. Test Game Control
1. Click "Game Control" from admin dashboard
2. Click "Start Game"
3. ✅ Phase should change to "Active"
4. ✅ Level 1 should unlock

### 4. Test Team Registration
1. Open new browser window (or incognito)
2. Navigate to `http://localhost:5173/register`
3. Register a test team
4. ✅ Should receive OTP (check server console if email not configured)
5. Verify and login

### 5. Test Team Gameplay
1. As logged-in team, navigate to `/gameplay`
2. ✅ Should see first puzzle
3. Submit an answer
4. ✅ Should see success/error toast
5. Request a hint
6. ✅ Should show hint with penalty warning

### 6. Test Live Monitoring
1. As admin, navigate to `/admin/monitoring`
2. ✅ Should see team in table
3. ✅ Activity feed should show team actions
4. ✅ Stats should auto-update every 3 seconds

---

## 📁 Project Structure

```
lockdown-hq-main/
├── 📂 src/                          # Frontend source code
│   ├── 📂 components/               # Reusable UI components
│   │   ├── ui/                      # shadcn/ui components
│   │   ├── BiohazardIcon.tsx
│   │   ├── CountdownTimer.tsx
│   │   ├── Footer.tsx
│   │   ├── GlitchText.tsx
│   │   ├── Navbar.tsx
│   │   └── ProtectedRoute.tsx
│   ├── 📂 pages/                    # Route pages
│   │   ├── Admin.tsx                # Admin dashboard
│   │   ├── AdminLogin.tsx           # Admin login
│   │   ├── Dashboard.tsx            # Team dashboard
│   │   ├── GameControl.tsx          # ✨ Game control panel
│   │   ├── Leaderboard.tsx          # Leaderboard display
│   │   ├── LiveMonitoring.tsx       # ✨ Real-time monitoring
│   │   ├── Login.tsx                # Team login
│   │   ├── PuzzleManagement.tsx     # ✨ Puzzle CRUD
│   │   ├── Register.tsx             # Team registration
│   │   ├── Rules.tsx                # Game rules
│   │   └── TeamGameplay.tsx         # ✨ Puzzle solving
│   ├── 📂 contexts/                 # React contexts
│   │   └── AuthContext.tsx
│   ├── 📂 hooks/                    # Custom React hooks
│   ├── 📂 lib/                      # Utilities and API clients
│   └── 📂 types/                    # TypeScript type definitions
│
├── 📂 server/                       # Backend source code
│   ├── 📂 config/                   # Configuration files
│   │   ├── db.js                    # Database connection
│   │   └── email.js                 # Email service
│   ├── 📂 controllers/              # Business logic
│   │   ├── adminController.js       # Admin operations
│   │   ├── authController.js        # Authentication
│   │   ├── gameController.js        # Game control
│   │   ├── puzzleController.js      # Puzzle management
│   │   ├── teamController.js        # Team operations
│   │   └── teamGameController.js    # Team gameplay
│   ├── 📂 middleware/               # Express middleware
│   │   ├── auth.js                  # JWT authentication
│   │   ├── rateLimiter.js           # Rate limiting
│   │   └── roleGuard.js             # Role-based access
│   ├── 📂 routes/                   # API routes
│   │   ├── adminRoutes.js
│   │   ├── authRoutes.js
│   │   ├── gameplayRoutes.js
│   │   ├── gameRoutes.js
│   │   ├── puzzleRoutes.js
│   │   └── teamRoutes.js
│   ├── 📂 services/                 # External services
│   │   ├── adminSeedService.js
│   │   ├── auditService.js
│   │   ├── emailService.js
│   │   └── otpService.js
│   ├── 📂 migrations/               # Database migrations
│   │   ├── schema.sql               # Database schema
│   │   ├── seed-puzzles.js          # Puzzle seeding
│   │   └── run.js                   # Migration runner
│   ├── 📂 utils/                    # Utility functions
│   └── server.js                    # Main server file
│
├── 📂 database/                     # Database server
│   └── server.js                    # MySQL connection
│
├── 📄 package.json                  # Frontend dependencies
├── 📄 vite.config.ts                # Vite configuration
├── 📄 tailwind.config.ts            # Tailwind CSS config
└── 📄 tsconfig.json                 # TypeScript config

✨ = New components created
```

---

## 🔑 Key Features

### ✅ Admin Features
- **Puzzle Management**: Create, edit, delete puzzles and hints
- **Game Control**: Start, pause, resume, end game; unlock levels
- **Live Monitoring**: Real-time team tracking, activity logs, suspicious activity alerts
- **Team Management**: View teams, pause/resume, disqualify
- **Broadcast Messaging**: Send announcements to all teams

### ✅ Team Features
- **Puzzle Solving**: View puzzles, submit answers, get instant feedback
- **Hint System**: Request hints with time penalty warnings
- **Progress Tracking**: View completion stats, time elapsed, hints used
- **Leaderboard**: Real-time rankings
- **Broadcast Messages**: Receive admin announcements

### ✅ Security
- JWT authentication with refresh tokens
- Role-based access control (admin/team)
- Password hashing with bcrypt
- Rate limiting on sensitive endpoints
- Protected routes on frontend

### ✅ Real-Time Features
- Auto-refresh intervals for live data
- Activity feed updates
- Team progress tracking
- Broadcast message delivery

---

## 🎨 UI Theme

**Cyberpunk Toxic-Green Theme**
- Primary Color: Lime Green (#00ff00)
- Background: Black with noise overlay
- Typography: Terminal/monospace fonts
- Effects: Glitch text, scanlines, pulse animations
- Status Colors: Green (success), Yellow (warning), Red (danger), Blue (info)

---

## 📊 Database Schema

**18 Tables Created:**
1. `users` - User accounts
2. `teams` - Team information
3. `team_members` - Team member relationships
4. `sessions` - Active sessions
5. `otp_codes` - Email verification
6. `puzzles` - Puzzle definitions
7. `hints` - Puzzle hints
8. `submissions` - Answer submissions
9. `team_progress` - Team puzzle progress
10. `hint_usage` - Hint usage tracking
11. `inventory` - Team inventory items
12. `game_state` - Global game state
13. `activity_logs` - Team activity logs
14. `broadcast_messages` - Admin broadcasts
15. *(Plus 4 more supporting tables)*

---

## 🔌 API Endpoints

### Authentication
- `POST /api/auth/register` - Register team
- `POST /api/auth/login` - Team login
- `POST /api/auth/verify-email` - Verify OTP
- `POST /api/auth/admin-login` - Admin login

### Puzzles (Admin)
- `GET /api/puzzles` - Get all puzzles
- `POST /api/puzzles` - Create puzzle
- `PUT /api/puzzles/:id` - Update puzzle
- `DELETE /api/puzzles/:id` - Delete puzzle

### Game Control (Admin)
- `GET /api/game/state` - Get game state
- `POST /api/game/start` - Start game
- `POST /api/game/pause` - Pause game
- `POST /api/game/resume` - Resume game
- `POST /api/game/end` - End game
- `POST /api/game/broadcast` - Send broadcast
- `POST /api/game/level2/unlock` - Unlock Level 2

### Gameplay (Team)
- `GET /api/gameplay/puzzle/current` - Get current puzzle
- `POST /api/gameplay/puzzle/submit` - Submit answer
- `POST /api/gameplay/puzzle/hint` - Request hint
- `GET /api/gameplay/progress` - Get team progress

### Monitoring (Admin)
- `GET /api/admin/monitor/live` - Live team data
- `GET /api/admin/activity` - Activity logs
- `GET /api/admin/suspicious` - Suspicious activity
- `GET /api/admin/export` - Export results

---

## 🧪 Sample Test Data

### Admin Account
```
Email: admin@lockdown.com
Password: Admin@123
```

### Test Teams
```
Team 1:
Email: team1@test.com
Password: Test@123
Name: Alpha Squad

Team 2:
Email: team2@test.com
Password: Test@123
Name: Beta Team
```

### Sample Puzzles (9 Pre-seeded)
- **Level 1**: 5 puzzles (100-150 points each)
- **Level 2**: 4 puzzles (150-250 points each)
- **Total Points**: 1250 points

---

## 🐛 Troubleshooting

### Backend won't start
**Problem**: "Port 5000 already in use"
**Solution**:
```powershell
# Kill process on port 5000
Get-NetTCPConnection -LocalPort 5000 | ForEach-Object { Stop-Process -Id $_.OwningProcess -Force }
```

### Database connection fails
**Problem**: "ER_ACCESS_DENIED_ERROR"
**Solution**:
1. Check MySQL is running
2. Verify credentials in `server/.env`
3. Ensure database `lockdown_hq` exists

### Frontend can't reach API
**Problem**: "Network Error" or 404
**Solution**:
1. Ensure backend is running on port 5000
2. Check `.env` has `VITE_API_URL=http://localhost:5000`
3. Check browser console for CORS errors

### Email OTP not working
**Problem**: "Email service error"
**Solution**:
- This is expected if Gmail not configured
- OTP codes are printed in server console
- Use console OTP to verify

---

## 📖 Documentation

- **[BACKEND_COMPLETE.md](BACKEND_COMPLETE.md)** - Backend API documentation
- **[FRONTEND_COMPONENTS.md](FRONTEND_COMPONENTS.md)** - Component details
- **[COMPONENT_TESTING.md](COMPONENT_TESTING.md)** - Testing procedures
- **[API_TESTING_GUIDE.md](API_TESTING_GUIDE.md)** - API testing guide
- **[PROJECT_STATUS.md](PROJECT_STATUS.md)** - Overall project status

---

## 🚀 Deployment (Coming Soon)

### Production Checklist
- [ ] Set production environment variables
- [ ] Configure production database
- [ ] Set up SSL certificates
- [ ] Configure CDN for assets
- [ ] Set up error logging (Sentry)
- [ ] Configure monitoring (DataDog)
- [ ] Perform load testing
- [ ] Security audit
- [ ] Set up CI/CD pipeline
- [ ] Configure backups

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit changes (`git commit -m 'Add AmazingFeature'`)
4. Push to branch (`git push origin feature/AmazingFeature`)
5. Open Pull Request

---

## 📝 License

This project is licensed under the MIT License - see LICENSE file for details.

---

## 👥 Credits

**Built with:**
- React + TypeScript
- Node.js + Express
- MySQL
- shadcn/ui
- Tailwind CSS
- TanStack Query

**Special Thanks:**
- Lucide Icons for icon library
- Radix UI for accessible primitives
- Vercel for Vite tooling

---

## 📞 Support

For issues, questions, or feature requests:
1. Check documentation files
2. Review troubleshooting section
3. Open an issue on GitHub
4. Contact project maintainers

---

## 🎯 Current Status

**Version**: 0.85.0 (Beta)  
**Completion**: 85%  
**Status**: Ready for testing and demonstration  

**What Works**:
✅ Admin puzzle management  
✅ Game control system  
✅ Team puzzle solving  
✅ Live monitoring  
✅ Real-time updates  
✅ Authentication & security  

**Coming Soon**:
⏳ Inventory system UI  
⏳ Per-puzzle countdown timer  
⏳ Team chat  
⏳ Advanced animations  

---

**🎉 Happy Gaming! May the fastest team escape the lockdown! 🎉**
