# COMPONENT TESTING GUIDE

## Quick Start Testing

### Prerequisites
1. Backend server running on port 5000
2. Frontend dev server running (npm run dev)
3. At least one admin account created
4. At least one team registered

---

## 🔧 Admin Component Testing

### 1. Puzzle Management (`/admin/puzzles`)

**Test Scenario 1: View All Puzzles**
1. Login as admin
2. Navigate to `/admin/puzzles` or click "Puzzle Management" from admin dashboard
3. ✅ Should see table with all 9 seeded puzzles
4. ✅ Columns: Level, #, Title, Type, Points, Time, Hints, Submissions, Status, Actions
5. ✅ Data should load from database

**Test Scenario 2: Filter by Level**
1. Click "Level 1" button
2. ✅ Should show only 5 Level 1 puzzles
3. Click "Level 2" button
4. ✅ Should show only 4 Level 2 puzzles
5. Click "All" button
6. ✅ Should show all 9 puzzles

**Test Scenario 3: Create New Puzzle**
1. Click "Create Puzzle" button
2. Fill in form:
   - Level: 1
   - Puzzle Number: 6
   - Title: "Test Puzzle"
   - Description: "This is a test"
   - Type: "code"
   - Content: "Test content"
   - Answer: "TEST"
   - Points: 150
   - Time Limit: 15
3. Click "Create"
4. ✅ Should show success toast
5. ✅ New puzzle should appear in table

**Test Scenario 4: Edit Existing Puzzle**
1. Click "Edit" icon on any puzzle
2. Change title to "Updated Title"
3. Click "Save Changes"
4. ✅ Should show success toast
5. ✅ Title should update in table

**Test Scenario 5: Delete Puzzle**
1. Click "Delete" icon on test puzzle
2. Confirm deletion
3. ✅ Should show success toast
4. ✅ Puzzle should disappear from table

**Expected API Calls:**
```
GET /api/puzzles - On page load
GET /api/puzzles?level=1 - When filtering Level 1
GET /api/puzzles?level=2 - When filtering Level 2
POST /api/puzzles - When creating
PUT /api/puzzles/:id - When editing
DELETE /api/puzzles/:id - When deleting
```

---

### 2. Game Control (`/admin/game-control`)

**Test Scenario 1: View Game State**
1. Login as admin
2. Navigate to `/admin/game-control`
3. ✅ Should see 4 stat cards (Phase, Teams, Active, Completed)
4. ✅ Should see Level 1 and Level 2 status
5. ✅ Data auto-refreshes every 5 seconds

**Test Scenario 2: Start Game**
1. If game not started (Phase: Not Started)
2. Click "Start Game" button
3. ✅ Should show success toast
4. ✅ Phase should change to "Active"
5. ✅ Level 1 should unlock automatically

**Test Scenario 3: Unlock Level 2**
1. After starting game
2. Click "Unlock Level 2" button
3. ✅ Should show success toast
4. ✅ Level 2 status should change to "Unlocked"
5. ✅ Button should disappear

**Test Scenario 4: Pause/Resume Game**
1. Click "Pause Game" button
2. ✅ Should show warning toast
3. ✅ Status should show "Paused"
4. Click "Resume Game" button
5. ✅ Should show success toast
6. ✅ Status should clear "Paused" state

**Test Scenario 5: Broadcast Message**
1. Click "Broadcast Message" button
2. Select message type (Info/Warning/Alert/Success)
3. Enter message: "Test broadcast"
4. Click "Send Broadcast"
5. ✅ Should show success toast
6. ✅ Teams should see the message (check team interface)

**Test Scenario 6: End Game**
1. Click "End Game" button
2. Confirm ending
3. ✅ Should show info toast
4. ✅ Phase should change to "Completed"
5. ✅ All control buttons should hide

**Expected API Calls:**
```
GET /api/game/state - Every 5 seconds
POST /api/game/start - When starting
POST /api/game/level2/unlock - When unlocking Level 2
POST /api/game/pause - When pausing
POST /api/game/resume - When resuming
POST /api/game/broadcast - When sending message
POST /api/game/end - When ending
```

---

### 3. Live Monitoring (`/admin/monitoring`)

**Test Scenario 1: View Live Teams**
1. Login as admin
2. Navigate to `/admin/monitoring`
3. ✅ Should see stats cards (Total, Active, Completed, Avg Progress)
4. ✅ Should see team table with all registered teams
5. ✅ Data auto-refreshes every 3 seconds
6. ✅ Green pulse indicator when auto-refresh on

**Test Scenario 2: Monitor Team Progress**
1. Have a team start solving puzzles
2. Watch the monitoring dashboard
3. ✅ Team status should update in real-time
4. ✅ Current puzzle should show
5. ✅ Progress bar should increase
6. ✅ Attempts and hints should increment
7. ✅ Time should update
8. ✅ Last activity timestamp should show "X seconds ago"

**Test Scenario 3: View Activity Feed**
1. Scroll down to activity feed section
2. Have teams perform actions (submit answers, request hints)
3. ✅ Should see new activities appear at top
4. ✅ Icons should match activity type:
   - ✓ Green checkmark for correct answers
   - ✗ Red X for wrong answers
   - 💡 Yellow lightbulb for hints
5. ✅ Timestamps should update (X seconds/minutes ago)

**Test Scenario 4: Suspicious Activity Detection**
1. If suspicious activity detected
2. ✅ Should see red alert card at top
3. ✅ Should show team name and issue type
4. ✅ Should show detection timestamp

**Test Scenario 5: Pause/Resume Auto-Refresh**
1. Click "Pause" button
2. ✅ Auto-refresh should stop
3. ✅ Indicator should turn gray
4. Click "Resume" button
5. ✅ Auto-refresh should restart
6. ✅ Indicator should turn green and pulse

**Expected API Calls:**
```
GET /api/admin/monitor/live - Every 3 seconds
GET /api/admin/activity?limit=50 - Every 5 seconds
GET /api/admin/suspicious - Every 10 seconds
```

---

## 👥 Team Component Testing

### 4. Team Gameplay (`/gameplay`)

**Test Scenario 1: View Current Puzzle**
1. Login as team
2. Admin must have started game
3. Navigate to `/gameplay`
4. ✅ Should see 4 stat cards (Progress, Completed, Hints Used, Time)
5. ✅ Should see current puzzle card with:
   - Level and puzzle number
   - Title with glitch effect
   - Description
   - Points and time limit
   - Puzzle content
   - Attempts counter
   - Available hints counter

**Test Scenario 2: Submit Correct Answer**
1. Enter correct answer for current puzzle
2. Click "Submit" button
3. ✅ Should show green success toast
4. ✅ Answer input should clear
5. ✅ Should load next puzzle
6. ✅ Progress stats should update
7. ✅ Completed counter should increment

**Test Scenario 3: Submit Wrong Answer**
1. Enter wrong answer
2. Click "Submit" button
3. ✅ Should show red error toast
4. ✅ Answer input should NOT clear
5. ✅ Attempts counter should increment
6. ✅ Should stay on same puzzle

**Test Scenario 4: Request Hint**
1. Click "Request Hint" button
2. ✅ Should show dialog with penalty warning
3. Click "Get Hint"
4. ✅ Should show yellow toast with time penalty
5. ✅ Hint should display in yellow panel
6. ✅ Hints used counter should increment
7. ✅ Available hints should decrease

**Test Scenario 5: Complete All Puzzles**
1. Solve all Level 1 puzzles (5 puzzles)
2. Admin unlocks Level 2
3. Solve all Level 2 puzzles (4 puzzles)
4. ✅ Should show game completed notification
5. ✅ Should show "No Active Puzzle" message

**Test Scenario 6: Game Not Started**
1. Login before admin starts game
2. Navigate to `/gameplay`
3. ✅ Should show "No Active Puzzle" card
4. ✅ Message: "Game has not started yet"

**Expected API Calls:**
```
GET /api/gameplay/puzzle/current - Every 10 seconds
GET /api/gameplay/progress - Every 5 seconds
POST /api/gameplay/puzzle/submit - When submitting answer
POST /api/gameplay/puzzle/hint - When requesting hint
```

---

## 🎯 Integration Testing

### End-to-End Game Flow

**Setup:**
1. Create admin account
2. Register 3 test teams
3. Seed puzzles (already done)

**Flow:**
1. **Admin starts game**
   - Admin: `/admin/game-control` → Click "Start Game"
   - ✅ Phase changes to "Active"
   - ✅ Level 1 unlocks
   - Teams: Can now access puzzles

2. **Teams solve Level 1**
   - Teams: `/gameplay` → See first puzzle
   - Submit answers, request hints
   - ✅ Live Monitoring shows progress
   - ✅ Activity feed updates
   - ✅ Stats update in real-time

3. **Admin unlocks Level 2**
   - Admin: `/admin/game-control` → Click "Unlock Level 2"
   - ✅ Teams can now see Level 2 puzzles after completing Level 1

4. **Teams complete game**
   - Teams solve all 9 puzzles
   - ✅ Completion notification shows
   - ✅ Leaderboard updates
   - ✅ Live Monitoring shows completed status

5. **Admin ends game**
   - Admin: `/admin/game-control` → Click "End Game"
   - ✅ Game ends
   - ✅ Final rankings locked

---

## 🔍 Error Testing

### Test Error Scenarios

**Backend Down:**
1. Stop backend server
2. Try to load any component
3. ✅ Should show connection error
4. ✅ Should have retry button

**Invalid Authentication:**
1. Clear localStorage token
2. Try to access protected routes
3. ✅ Should redirect to login

**No Puzzles:**
1. Delete all puzzles from database
2. Team loads `/gameplay`
3. ✅ Should show "No Active Puzzle"

**API Timeout:**
1. Slow down network (browser dev tools)
2. ✅ Loading states should show
3. ✅ Skeleton loaders appear

---

## 📊 Performance Testing

### Auto-Refresh Intervals

**Check these intervals:**
- Game Control: 5 seconds
- Team Progress: 5 seconds
- Current Puzzle: 10 seconds
- Live Monitoring: 3 seconds (teams), 5 seconds (activity), 10 seconds (suspicious)

**Test:**
1. Open browser dev tools → Network tab
2. Watch API call frequency
3. ✅ Should match expected intervals
4. ✅ No duplicate or extra calls

---

## 🎨 Visual Testing

### Responsive Design

**Test on different screen sizes:**
1. Desktop (1920x1080)
   - ✅ Tables should fit
   - ✅ Cards in grids
   - ✅ All columns visible

2. Tablet (768x1024)
   - ✅ Responsive grid layouts
   - ✅ Buttons stack properly
   - ✅ Tables scroll horizontally if needed

3. Mobile (375x667)
   - ✅ Single column layouts
   - ✅ Touch-friendly buttons
   - ✅ Text readable

### Theme Consistency

**Check toxic-green theme:**
- ✅ Primary color: lime green (#00ff00)
- ✅ Success: green
- ✅ Warning: yellow
- ✅ Danger: red
- ✅ Info: blue
- ✅ Background: black with noise overlay
- ✅ Borders: semi-transparent toxic-green
- ✅ Glitch text on titles
- ✅ Terminal font for technical text

---

## 🐛 Known Issues & Limitations

1. **Email Service:**
   - Warning shows in terminal (expected - Gmail not configured)
   - Doesn't affect functionality

2. **Inventory System:**
   - Not yet implemented in UI
   - API endpoints exist but unused

3. **Broadcast Messages:**
   - Send functionality works
   - Display on team dashboard not yet implemented

4. **Timer Countdown:**
   - Global timer works
   - Per-puzzle countdown not yet implemented

5. **Advanced Animations:**
   - Basic animations present
   - Glitch effects on errors not yet implemented

---

## ✅ Success Criteria

### All tests pass if:
- ✅ All components load without errors
- ✅ API calls succeed with correct data
- ✅ Real-time updates work
- ✅ User actions trigger expected responses
- ✅ Toast notifications show appropriately
- ✅ Navigation works correctly
- ✅ Role-based access enforced
- ✅ Data persists across page refreshes
- ✅ No console errors
- ✅ Responsive design works on all screen sizes

---

## 🚀 Next Steps After Testing

If all tests pass:
1. Implement inventory panel
2. Add broadcast message display for teams
3. Implement per-puzzle countdown timer
4. Add glitch effects on wrong answers
5. Create achievement system
6. Add team chat functionality
7. Implement advanced animations
8. Add sound effects
9. Create admin analytics dashboard
10. Prepare for production deployment
