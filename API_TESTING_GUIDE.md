# API Testing Guide - Lockdown HQ

## 🚀 Quick Start

### 1. Start Backend Server
```bash
cd server
node server.js
```

Server should show:
```
🚀 Lockdown HQ - Auth Server running on port 5000
✅ MySQL database connected
```

---

## 🔑 Authentication

### Admin Login
```bash
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "email": "agupta88094@gmail.com",
  "password": "tech@2026"
}
```

**Response:**
```json
{
  "message": "Login successful",
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "...",
  "user": {
    "id": "uuid",
    "email": "agupta88094@gmail.com",
    "name": "Admin",
    "role": "admin"
  }
}
```

Save the `accessToken` - you'll need it for all admin requests!

---

## 🎮 Game Control (Admin Only)

### Check Game State
```bash
GET http://localhost:5000/api/game/state
Authorization: Bearer <your-admin-token>
```

### Start the Game (Unlock Level 1)
```bash
POST http://localhost:5000/api/game/start
Authorization: Bearer <your-admin-token>
```

### Unlock Level 2
```bash
POST http://localhost:5000/api/game/level2/unlock
Authorization: Bearer <your-admin-token>
```

### Pause Game
```bash
POST http://localhost:5000/api/game/pause
Authorization: Bearer <your-admin-token>
```

### Resume Game
```bash
POST http://localhost:5000/api/game/resume
Authorization: Bearer <your-admin-token>
```

### End Game
```bash
POST http://localhost:5000/api/game/end
Authorization: Bearer <your-admin-token>
```

### Broadcast Message to All Teams
```bash
POST http://localhost:5000/api/game/broadcast
Authorization: Bearer <your-admin-token>
Content-Type: application/json

{
  "message": "Level 2 will unlock in 5 minutes!",
  "message_type": "warning",
  "expires_in_minutes": 30
}
```

---

## 🧩 Puzzle Management (Admin Only)

### Get All Puzzles
```bash
GET http://localhost:5000/api/puzzles
Authorization: Bearer <your-admin-token>
```

### Get Puzzles for Specific Level
```bash
GET http://localhost:5000/api/puzzles?level=1
Authorization: Bearer <your-admin-token>
```

### Get Single Puzzle with Hints
```bash
GET http://localhost:5000/api/puzzles/<puzzle-id>
Authorization: Bearer <your-admin-token>
```

### Create New Puzzle
```bash
POST http://localhost:5000/api/puzzles
Authorization: Bearer <your-admin-token>
Content-Type: application/json

{
  "level": 1,
  "puzzle_number": 6,
  "title": "New Puzzle",
  "description": "Solve this puzzle",
  "puzzle_type": "text",
  "puzzle_content": "What is 2+2?",
  "correct_answer": "4",
  "points": 100,
  "time_limit_minutes": 10
}
```

### Update Puzzle
```bash
PUT http://localhost:5000/api/puzzles/<puzzle-id>
Authorization: Bearer <your-admin-token>
Content-Type: application/json

{
  "title": "Updated Title",
  "points": 150
}
```

### Delete Puzzle
```bash
DELETE http://localhost:5000/api/puzzles/<puzzle-id>
Authorization: Bearer <your-admin-token>
```

### Add Hint to Puzzle
```bash
POST http://localhost:5000/api/puzzles/hints
Authorization: Bearer <your-admin-token>
Content-Type: application/json

{
  "puzzle_id": "<puzzle-id>",
  "hint_number": 1,
  "hint_text": "Think about basic math",
  "time_penalty_seconds": 300
}
```

---

## 👥 Admin Monitoring

### Live Team Monitoring
```bash
GET http://localhost:5000/api/admin/monitor/live
Authorization: Bearer <your-admin-token>
```

### Get Activity Logs
```bash
GET http://localhost:5000/api/admin/activity?limit=50
Authorization: Bearer <your-admin-token>
```

### Get Suspicious Activity
```bash
GET http://localhost:5000/api/admin/suspicious
Authorization: Bearer <your-admin-token>
```

### Export Results (CSV)
```bash
GET http://localhost:5000/api/admin/export/results
Authorization: Bearer <your-admin-token>
```

### Pause Specific Team
```bash
POST http://localhost:5000/api/game/team/<team-id>/pause
Authorization: Bearer <your-admin-token>
```

### Resume Specific Team
```bash
POST http://localhost:5000/api/game/team/<team-id>/resume
Authorization: Bearer <your-admin-token>
```

### Reset Team Progress
```bash
POST http://localhost:5000/api/game/team/<team-id>/reset
Authorization: Bearer <your-admin-token>
```

---

## 🎯 Team Gameplay

### Team Registration
```bash
POST http://localhost:5000/api/auth/register
Content-Type: application/json

{
  "name": "John Doe",
  "email": "team1@example.com",
  "password": "password123",
  "teamName": "Hackers United",
  "members": [
    {
      "name": "John Doe",
      "email": "team1@example.com",
      "phone": "1234567890",
      "role": "leader"
    },
    {
      "name": "Jane Smith",
      "email": "jane@example.com",
      "phone": "1234567891",
      "role": "member"
    },
    {
      "name": "Bob Johnson",
      "email": "bob@example.com",
      "phone": "1234567892",
      "role": "member"
    },
    {
      "name": "Alice Williams",
      "email": "alice@example.com",
      "phone": "1234567893",
      "role": "member"
    }
  ]
}
```

### Verify Email (Check console for OTP)
```bash
POST http://localhost:5000/api/auth/verify-email
Content-Type: application/json

{
  "userId": "<user-id-from-registration>",
  "otp": "123456"
}
```

### Team Login
```bash
POST http://localhost:5000/api/auth/login
Content-Type: application/json

{
  "email": "team1@example.com",
  "password": "password123"
}
```

Save the team's `accessToken`!

### Get Current Puzzle
```bash
GET http://localhost:5000/api/gameplay/puzzle/current
Authorization: Bearer <team-token>
```

### Submit Answer
```bash
POST http://localhost:5000/api/gameplay/puzzle/submit
Authorization: Bearer <team-token>
Content-Type: application/json

{
  "puzzle_id": "<puzzle-id-from-current>",
  "answer": "HACK"
}
```

**Response (Correct):**
```json
{
  "success": true,
  "is_correct": true,
  "message": "Correct answer! Moving to next puzzle.",
  "points": 100,
  "time_taken": 45
}
```

**Response (Incorrect):**
```json
{
  "success": true,
  "is_correct": false,
  "message": "Incorrect answer. Try again!",
  "attempts": 2
}
```

### Request Hint
```bash
POST http://localhost:5000/api/gameplay/puzzle/hint
Authorization: Bearer <team-token>
Content-Type: application/json

{
  "puzzle_id": "<puzzle-id>"
}
```

**Response:**
```json
{
  "success": true,
  "hint": {
    "hint_number": 1,
    "hint_text": "Binary code represents ASCII characters.",
    "time_penalty_seconds": 180
  },
  "remaining_hints": 1
}
```

### Get Team Progress
```bash
GET http://localhost:5000/api/gameplay/progress
Authorization: Bearer <team-token>
```

### Get Inventory
```bash
GET http://localhost:5000/api/gameplay/inventory
Authorization: Bearer <team-token>
```

### Add Inventory Item
```bash
POST http://localhost:5000/api/gameplay/inventory
Authorization: Bearer <team-token>
Content-Type: application/json

{
  "item_type": "clue",
  "item_name": "Secret Code",
  "item_value": "ABC123",
  "puzzle_id": "<puzzle-id>"
}
```

### Get Activity Logs
```bash
GET http://localhost:5000/api/gameplay/logs
Authorization: Bearer <team-token>
```

---

## 🧪 Testing Flow

### Complete Game Flow Test:

1. **Admin: Start Game**
```bash
POST http://localhost:5000/api/game/start
```

2. **Team: Register & Verify**
```bash
POST /api/auth/register
POST /api/auth/verify-email
POST /api/auth/login
```

3. **Team: Get First Puzzle**
```bash
GET /api/gameplay/puzzle/current
# Will show Level 1, Puzzle 1: "System Access Breach"
# Binary: 01001000 01000001 01000011 01001011
# Answer: HACK
```

4. **Team: Submit Correct Answer**
```bash
POST /api/gameplay/puzzle/submit
{
  "puzzle_id": "<id>",
  "answer": "HACK"
}
# Team auto-moves to Puzzle 2
```

5. **Team: Request Hint**
```bash
POST /api/gameplay/puzzle/hint
{
  "puzzle_id": "<id>"
}
# 180 second penalty applied
```

6. **Admin: Monitor Progress**
```bash
GET /api/admin/monitor/live
# See team progress, current puzzle, hints used
```

7. **Admin: Pause Team**
```bash
POST /api/game/team/<team-id>/pause
```

8. **Admin: Unlock Level 2**
```bash
POST /api/game/level2/unlock
```

9. **Team: Complete All Puzzles**
```bash
# Keep submitting correct answers
# Auto-progresses through all 9 puzzles
# Final message: "Congratulations! All puzzles completed!"
```

10. **Admin: Export Results**
```bash
GET /api/admin/export/results
# Downloads CSV with all team data
```

---

## 📊 Sample Puzzle Answers

### Level 1:
1. **System Access Breach** → `HACK`
2. **Encrypted Communications** → `SECURITY`
3. **Network Trace** → `10.0.0.42`
4. **Password Database** → `password`
5. **Final Gateway** → `64`

### Level 2:
1. **Advanced Encryption** → `Lockdown HQ Activated`
2. **Hex Memory Dump** → `SYSTEM BREACH`
3. **Code Injection** → `' OR '1'='1`
4. **Final Lockdown** → `HACKY64-Lockdown`

---

## 🛠️ Useful Commands

### Get All Teams
```bash
GET http://localhost:5000/api/admin/teams
Authorization: Bearer <admin-token>
```

### Get Team Details
```bash
GET http://localhost:5000/api/admin/teams/<team-id>
Authorization: Bearer <admin-token>
```

### Qualify Team
```bash
PUT http://localhost:5000/api/admin/teams/<team-id>/status
Authorization: Bearer <admin-token>
Content-Type: application/json

{
  "status": "qualified"
}
```

---

## 💡 Tips

1. **Always include the Authorization header** with Bearer token
2. **Check console logs** for OTPs (email not configured)
3. **Test with Postman** or curl for easier API testing
4. **Save tokens** - they expire after 1 hour
5. **Check terminal** for real-time server logs

---

## 🐛 Troubleshooting

### "Authentication required"
- Make sure you included: `Authorization: Bearer <token>`

### "Access denied"
- Admin endpoints need admin token
- Team endpoints need team token

### "Token expired"
- Login again to get a new token
- Or use refresh token endpoint

### "Puzzle not found"
- Make sure puzzles are seeded: `node migrations/seed-puzzles.js`

### "Team not active"
- Admin must start the game first: `POST /api/game/start`

---

## 📱 Postman Collection

You can import these endpoints into Postman:
1. Create new collection "Lockdown HQ"
2. Add environment variables:
   - `baseUrl`: `http://localhost:5000`
   - `adminToken`: (get from admin login)
   - `teamToken`: (get from team login)
3. Use `{{baseUrl}}` and `{{adminToken}}` in requests

---

**Ready to test! Backend is fully operational.**🚀
