# COMPLETE FLOW TESTING GUIDE

## ✅ FIXED ISSUES
1. **Dashboard now fetches real team data** - No more mock data
2. **Database migrations completed** - All tables created (email_otps, teams, users, etc.)
3. **Registration flow working** - Teams are properly created in database
4. **Email verification working** - OTP system functional

## 📋 USER FLOW EXPLAINED

### For FIRST-TIME TEAMS (Registration):

1. **Go to http://localhost:5173/register**
   - Fill in team leader details:
     - Name (your name)
     - Email (unique email)
     - Password (min 8 characters)
     - Team Name

2. **After submission:**
   - OTP sent to email (check server console if email not configured)
   - Verify email with 6-digit OTP
   - Get redirected to `/login`

3. **Login at http://localhost:5173/login**
   - Use your email and password
   - Get redirected to `/dashboard`

4. **Dashboard (http://localhost:5173/dashboard)**
   - Shows your team's real data:
     - Team name
     - Current level
     - Status (waiting/active/completed)
     - Hints used
     - Time elapsed
   - Wait for admin to start the event

### For ADMIN:

1. **Go to http://localhost:5173/login**
   - Email: agupta88094@gmail.com
   - Password: tech@2026

2. **Admin Panel (http://localhost:5173/admin)**
   - View all registered teams
   - See statistics
   - Control event (start/pause/reset teams)
   - View audit logs

## 🧪 TESTING STEPS

### Test 1: Register a New Team
\`\`\`bash
# From browser:
1. Go to http://localhost:5173/register
2. Fill the form:
   - Name: John Doe
   - Email: john@example.com (use unique email)
   - Password: password123
   - Team Name: Alpha Squad

3. Click Register
4. You'll see OTP verification screen
5. Get OTP from server console or run: node server/get-otp.js
6. Enter OTP and verify
7. You'll be redirected to /login
\`\`\`

### Test 2: Login as Team Member
\`\`\`bash
# From browser:
1. Go to http://localhost:5173/login
2. Enter credentials from Test 1
3. Click Login
4. You should see Dashboard with your team info
\`\`\`

### Test 3: Check Dashboard Data
\`\`\`bash
# Dashboard should show:
- Your team name in header
- Team status: "AWAITING EVENT START" (if admin hasn't started)
- Team info card with:
  - Team name
  - Current level (1)
  - Hints used (0/3)
- No registration form!
\`\`\`

### Test 4: Admin Login and Control
\`\`\`bash
# From browser:
1. Open http://localhost:5173/login in incognito/private window
2. Login as admin (agupta88094@gmail.com / tech@2026)
3. You'll see Admin Panel with:
   - List of all registered teams
   - Statistics (total teams, active, etc.)
   - Team actions (pause/resume/reset)
\`\`\`

## 🐛 COMMON ISSUES & SOLUTIONS

### Issue 1: "Team not found" on Dashboard
**Solution:** Make sure you completed email verification after registration

### Issue 2: OTP not received
**Solution:** Check server console output - OTPs are logged there if email service not configured

### Issue 3: "Port already in use"
**Solution:** Servers are already running, just refresh browser

### Issue 4: Dashboard shows "Loading..." forever
**Solution:** 
- Check backend is running (http://localhost:5000/api/team/me should work when logged in)
- Open browser console (F12) to see error messages
- Check server terminal for errors

## 🔧 USEFUL COMMANDS

### Check all registered teams:
\`\`\`bash
cd server
node list-teams.js
\`\`\`

### Get latest OTP for verification:
\`\`\`bash
cd server
node get-otp.js
\`\`\`

### Check if admin exists:
\`\`\`bash
cd server
node check-admin.js
\`\`\`

### Test registration via script:
\`\`\`bash
cd server
node test-register.js
# Then get OTP with: node get-otp.js
# Then verify with: node test-verify.js <userId> <otp>
\`\`\`

## 📡 API ENDPOINTS

### Authentication:
- `POST /api/auth/register` - Register new team
- `POST /api/auth/verify-email` - Verify email with OTP
- `POST /api/auth/login` - Login (admin or team)
- `POST /api/auth/logout` - Logout

### Team Endpoints (requires team login):
- `GET /api/team/me` - Get my team data
- `GET /api/team/profile` - Get my profile
- `PUT /api/team/name` - Update team name

### Admin Endpoints (requires admin login):
- `GET /api/admin/teams` - Get all teams
- `GET /api/admin/stats` - Get statistics
- `GET /api/admin/alerts` - Get audit logs
- `POST /api/admin/team/:id/action` - Control team (pause/resume/etc)

## ✨ WHAT'S NEW IN THIS FIX

1. **Dashboard.tsx** - Now fetches real team data from `/api/team/me`
   - Shows loading state while fetching
   - Displays error if fetch fails
   - Uses actual team data (teamName, level, status, hintsUsed)
   - No more hardcoded mockTeam

2. **teamController.js** - Returns proper camelCase responses
   - `getMyTeam()` returns team object directly (not wrapped)
   - Converts snake_case DB fields to camelCase for frontend

3. **Database migrations** - Created missing tables:
   - email_otps (for OTP verification)
   - refresh_tokens (for JWT refresh)
   - audit_logs (for admin audit trail)

4. **authApi.ts** - Fixed getMyTeam to expect unwrapped response

## 🎯 EXPECTED BEHAVIOR

### After Registration + Login:
✅ Dashboard loads with spinner
✅ Shows "Loading team data..."
✅ Fetches team from /api/team/me
✅ Displays real team name in header
✅ Shows "AWAITING EVENT START" message
✅ Shows team info (level, hints, status)

### What SHOULD NOT happen:
❌ Dashboard does NOT show registration form
❌ Dashboard does NOT redirect back to /register
❌ Dashboard does NOT show "mock team" name like "CYBER PHANTOMS"
❌ No "fill members details" form after login

---

## 🚀 NEXT STEPS

1. Test the complete flow in browser
2. Verify Dashboard shows real team data (not mock)
3. Confirm team members can see their dashboard after login
4. Test admin panel to control teams

If you see any issues, check:
- Browser console (F12 → Console tab)
- Server terminal output
- Database using list-teams.js script
