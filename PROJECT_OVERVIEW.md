# Lockdown HQ - Project Overview

## 🎮 What is Lockdown HQ?

**Lockdown HQ** is a **digital escape room game platform** for hosting timed puzzle-solving competitions. Teams register, solve puzzles across multiple levels, and compete against each other while admins monitor progress in real-time.

---

## 🏗️ Architecture

### Tech Stack

| Layer | Technology |
|-------|------------|
| **Frontend** | React 18 + TypeScript, Vite, TailwindCSS, shadcn/ui |
| **Backend** | Node.js + Express.js |
| **Database** | MySQL |
| **Auth** | JWT (Access + Refresh Tokens) |
| **State** | TanStack Query (React Query) |

---

## 📁 Project Structure

```
lockdown-hq-main/
├── server/                    # Backend API
│   ├── server.js              # Express server entry
│   ├── config/
│   │   ├── db.js              # MySQL connection
│   │   └── email.js           # Email config
│   ├── controllers/
│   │   ├── authController.js  # Login, Register, 2FA
│   │   ├── adminController.js # Team management, monitoring
│   │   ├── gameController.js  # Game state, controls
│   │   ├── puzzleController.js# Puzzle CRUD
│   │   └── teamController.js  # Team operations
│   ├── middleware/
│   │   ├── auth.js            # JWT verification
│   │   └── roleGuard.js       # Admin/Team role checks
│   ├── routes/                # API route definitions
│   ├── services/              # OTP, Email, Audit logging
│   └── migrations/            # Database schema
│
├── src/                       # Frontend React App
│   ├── pages/
│   │   ├── Index.tsx          # Landing page
│   │   ├── Login.tsx          # Team login
│   │   ├── AdminLogin.tsx     # Admin login
│   │   ├── Register.tsx       # Team registration
│   │   ├── Admin.tsx          # Admin dashboard
│   │   ├── Dashboard.tsx      # Team dashboard
│   │   ├── GameControl.tsx    # Admin game controls
│   │   ├── LiveMonitoring.tsx # Real-time team tracking
│   │   ├── PuzzleManagement.tsx# Puzzle CRUD UI
│   │   └── TeamGameplay.tsx   # Team puzzle interface
│   ├── components/
│   │   ├── Navbar.tsx         # Navigation
│   │   ├── ProtectedRoute.tsx # Auth guards
│   │   ├── TerminalCard.tsx   # Themed card component
│   │   ├── GlitchEffects.tsx  # Visual effects
│   │   ├── InventoryPanel.tsx # Team inventory display
│   │   └── PuzzleTimer.tsx    # Countdown timer
│   ├── contexts/
│   │   └── AuthContext.tsx    # Auth state management
│   └── lib/
│       ├── api.ts             # API client
│       └── authApi.ts         # Auth API functions
```

---

## 🗄️ Database Schema (18 Tables)

| Table | Purpose |
|-------|---------|
| `users` | User accounts (admin & team) |
| `teams` | Team info, status, progress |
| `team_members` | Individual team member details |
| `puzzles` | Puzzle definitions |
| `hints` | Hints for each puzzle |
| `submissions` | Answer attempts |
| `team_progress` | Current puzzle progress |
| `hint_usage` | Which hints were used |
| `inventory` | Collected digital items |
| `game_state` | Global game configuration |
| `activity_logs` | Team activity tracking |
| `sessions` | Multi-login detection |
| `refresh_tokens` | JWT refresh tokens |
| `email_otps` | OTP codes for verification |
| `audit_logs` | Admin action logs |

---

## 🔐 Authentication Flow

```
┌─────────────┐     ┌─────────────┐     ┌─────────────┐
│   Register  │────▶│ Verify Email│────▶│   Login     │
│   (Team)    │     │   (OTP)     │     │             │
└─────────────┘     └─────────────┘     └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │ 2FA (if on) │
                                        └──────┬──────┘
                                               │
                                               ▼
                                        ┌─────────────┐
                                        │ JWT Tokens  │
                                        │ Issued      │
                                        └─────────────┘
```

**Tokens:**
- `accessToken` - Short-lived (15min), stored in localStorage
- `refreshToken` - Long-lived (7 days), auto-refresh on expiry

---

## 👥 User Roles

### **Admin**
- Login: `/admin-login`
- Dashboard: `/admin`
- Can:
  - Manage puzzles (CRUD)
  - Control game (start/pause/end)
  - Approve/activate/pause teams
  - Monitor teams in real-time
  - View audit logs
  - Broadcast messages

### **Team**
- Login: `/login`
- Register: `/register`
- Dashboard: `/dashboard`
- Can:
  - Solve puzzles
  - Use hints (with time penalty)
  - View inventory
  - Track progress

---

## 🎯 Core Features

### Admin Features
| Feature | Description |
|---------|-------------|
| **Team Management** | Approve, activate, pause, disqualify, delete teams |
| **Activate All** | Bulk activate all waiting teams |
| **Pause All** | Bulk pause all active teams |
| **Game Control** | Start/pause/resume/end game globally |
| **Live Monitoring** | Real-time view of all team progress |
| **Puzzle Management** | Create, edit, delete puzzles with hints |
| **Broadcast Messages** | Send announcements to all teams |

### Team Features
| Feature | Description |
|---------|-------------|
| **Registration** | Team signup with member details |
| **Email Verification** | OTP-based email verification |
| **Two-Factor Auth** | Optional 2FA for teams |
| **Puzzle Solving** | Submit answers, track attempts |
| **Hint System** | Request hints (time penalty) |
| **Inventory** | Collect digital clues/keys |
| **Progress Tracking** | See completion percentage |

---

## 🎨 UI Theme

**"Biohazard/Containment"** aesthetic:
- Dark background with green accent (`toxic-green`)
- Terminal/hacker style fonts
- Glitch effects and scan lines
- Biohazard icons
- Noise overlay textures

---

## 🚀 Running the Project

### Prerequisites
- Node.js 18+
- MySQL 8+
- npm or bun

### Start Commands
```bash
# Backend (port 5000)
cd server
node server.js

# Frontend (port 5173)
npm run dev
```

### Default Admin Login
- **Email:** `admin@lockdown.com`
- **Password:** `tech@2026`

---

## 📊 API Endpoints Summary

### Auth (`/api/auth`)
- `POST /register` - Team registration
- `POST /login` - Login (admin/team)
- `POST /verify-email` - Email OTP verification
- `POST /verify-2fa` - 2FA verification
- `POST /refresh` - Refresh access token

### Admin (`/api/admin`)
- `GET /teams` - List all teams
- `PUT /teams/:id/status` - Update team status
- `DELETE /teams/:id` - Delete team
- `GET /stats` - Dashboard statistics
- `GET /monitor/live` - Live monitoring data
- `GET /audit-logs` - Audit trail

### Game (`/api/game`)
- `GET /state` - Current game state
- `POST /start` - Start game
- `POST /pause` - Pause game
- `POST /resume` - Resume game
- `POST /broadcast` - Send message

### Puzzles (`/api/puzzles`)
- `GET /` - List all puzzles
- `POST /` - Create puzzle
- `PUT /:id` - Update puzzle
- `DELETE /:id` - Delete puzzle

---

## ✅ Current Status

| Component | Status |
|-----------|--------|
| Backend API | ✅ Working |
| Frontend UI | ✅ Working |
| Authentication | ✅ Working |
| Admin Dashboard | ✅ Working |
| Team Approval | ✅ Added |
| Activate/Pause All | ✅ Added |
| Live Monitoring | ✅ Working |
| Puzzle Management | ✅ Working |
| Email Service | ⚠️ Gmail credentials needed |

---

This is a production-ready escape room platform for hosting competitive puzzle events!
