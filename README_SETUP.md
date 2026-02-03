# 🔐 Lockdown HQ - Complete Setup Guide

## 📁 Project Structure

```
lockdown-hq-main/
├── server/              # Backend API (Node.js + Express + MySQL)
│   ├── config/          # Database & email configuration
│   ├── controllers/     # Business logic
│   ├── middleware/      # Auth, rate limiting, role guards
│   ├── routes/          # API endpoints
│   ├── services/        # OTP, email, audit services
│   ├── utils/           # JWT & password utilities
│   ├── migrations/      # Database schema
│   ├── server.js        # Entry point
│   └── package.json
├── src/                 # Frontend (React + TypeScript)
│   ├── contexts/        # Auth context
│   ├── lib/             # API client with auto-refresh
│   ├── components/      # UI components + route guards
│   └── pages/           # Application pages
└── README_SETUP.md      # This file
```

## 🚀 Complete Installation

### Step 1: Install MySQL

**Windows:**
1. Download from: https://dev.mysql.com/downloads/installer/
2. Install MySQL Server
3. Set root password during installation
4. Start MySQL service

**Mac:**
```bash
brew install mysql
brew services start mysql
mysql_secure_installation
```

**Linux:**
```bash
sudo apt update
sudo apt install mysql-server
sudo systemctl start mysql
sudo mysql_secure_installation
```

### Step 2: Create Database

```bash
mysql -u root -p
```

```sql
CREATE DATABASE lockdown_hq;
EXIT;
```

### Step 3: Backend Setup

```bash
cd server
npm install
```

Configure environment:
```bash
cp .env.example .env
# Edit .env with your settings
```

Update `.env`:
```env
DB_HOST=localhost
DB_USER=root
DB_PASSWORD=your_mysql_password
DB_NAME=lockdown_hq

JWT_ACCESS_SECRET=change_this_secret_key_123
JWT_REFRESH_SECRET=change_this_refresh_key_456

EMAIL_HOST=smtp.gmail.com
EMAIL_PORT=587
EMAIL_USER=your_email@gmail.com
EMAIL_PASSWORD=your_app_password
EMAIL_FROM=noreply@lockdownhq.com
```

Run migrations:
```bash
npm run migrate
```

### Step 4: Create Admin User

Generate password hash:
```bash
node -e "console.log(require('bcrypt').hashSync('YourAdminPassword123!', 10))"
```

Copy the output hash, then:
```bash
mysql -u root -p lockdown_hq
```

```sql
INSERT INTO users (id, name, email, password_hash, role, is_verified) 
VALUES (
  UUID(),
  'System Admin',
  'admin@lockdownhq.com',
  '$2b$10$YOUR_GENERATED_HASH_HERE',
  'admin',
  TRUE
);

SELECT * FROM users WHERE role = 'admin';
```

### Step 5: Start Backend

```bash
npm run dev
```

You should see:
```
✅ MySQL database connected
✅ Email service ready
🚀 Server running on port 5000
```

### Step 6: Frontend Setup

Open a new terminal:
```bash
cd ..  # Back to root
npm install
```

Configure frontend:
```bash
cp .env.example .env
```

Update `.env`:
```env
VITE_API_URL=http://localhost:5000/api
```

### Step 7: Install Axios (for frontend)

```bash
npm install axios
```

### Step 8: Start Frontend

```bash
npm run dev
```

Frontend should open at: http://localhost:8080

---

## ✅ Testing the System

### 1. Test Admin Login

Visit: http://localhost:8080/login

```
Email: admin@lockdownhq.com
Password: YourAdminPassword123!
```

Should redirect to `/admin`

### 2. Test Team Registration

Visit: http://localhost:8080/register

Fill form → Receive OTP email → Verify → Login

### 3. Test API Directly

**Register Team:**
```bash
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Test User",
    "email": "test@test.com",
    "password": "Test123456!",
    "teamName": "Team Alpha"
  }'
```

**Login:**
```bash
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "admin@lockdownhq.com",
    "password": "YourAdminPassword123!"
  }'
```

---

## 🔒 Security Checklist

- [x] Passwords hashed with bcrypt (10 rounds)
- [x] JWT tokens (15min access, 7day refresh)
- [x] Email OTP verification
- [x] Optional 2FA
- [x] Rate limiting (5 attempts / 15min)
- [x] Audit logging
- [x] Role-based access control (admin vs team)
- [x] Auto token refresh on 401
- [x] Refresh token rotation
- [x] SQL injection prevention (parameterized queries)
- [x] CORS configured
- [x] Helmet security headers

---

## 🧪 Test All Features

### ✅ Registration Flow
1. Register team → Get OTP
2. Verify OTP → Account activated
3. Login → Receive tokens

### ✅ Login Flow
- Admin login → Access admin panel
- Team login → Access dashboard
- Failed login → Rate limited after 5 attempts

### ✅ 2FA Flow
1. Enable 2FA in profile
2. Logout and login
3. Receive OTP → Verify → Access granted

### ✅ Password Reset
1. Forgot password → Request OTP
2. Enter OTP + new password
3. Old tokens invalidated
4. Login with new password

### ✅ Token Refresh
- Access token expires (15min)
- Frontend auto-refreshes
- Continues working seamlessly

### ✅ Role Protection
- Team tries `/admin` → 403 Forbidden
- Admin tries `/dashboard` → 403 Forbidden
- Unauthenticated → Redirects to login

---

## 📊 Database Tables

- `users` - User accounts (admin/team)
- `teams` - Team data & progress
- `refresh_tokens` - Active sessions
- `email_otps` - One-time passwords
- `audit_logs` - Security events

View data:
```bash
mysql -u root -p lockdown_hq
```

```sql
SELECT * FROM users;
SELECT * FROM teams;
SELECT * FROM audit_logs ORDER BY created_at DESC LIMIT 10;
```

---

## 🐛 Troubleshooting

### MySQL Connection Failed
```
❌ MySQL connection failed: Access denied
```
Fix: Check DB_PASSWORD in server/.env

### Email Not Sending
```
⚠️ Email service not configured
```
Fix: Configure EMAIL_* variables in server/.env

For Gmail:
1. Enable 2FA on Gmail
2. Generate App Password
3. Use App Password in EMAIL_PASSWORD

### Frontend Can't Connect
```
Network Error
```
Fix: Check VITE_API_URL in .env points to http://localhost:5000/api

### Token Expired
```
401 Unauthorized - Token expired
```
Fix: Automatic - Frontend should auto-refresh. If not, clear localStorage and login again.

### Rate Limited
```
429 Too Many Requests
```
Fix: Wait 15 minutes or restart server (clears memory)

---

## 📝 API Endpoints Reference

### Authentication
- `POST /api/auth/register` - Register team
- `POST /api/auth/verify-email` - Verify OTP
- `POST /api/auth/login` - Login
- `POST /api/auth/verify-2fa` - Verify 2FA
- `POST /api/auth/refresh` - Refresh token
- `POST /api/auth/logout` - Logout
- `POST /api/auth/forgot-password` - Request reset
- `POST /api/auth/reset-password` - Reset password

### Team (Protected)
- `GET /api/team/me` - Get my team
- `GET /api/team/profile` - Get profile
- `PUT /api/team/name` - Update team name
- `POST /api/team/2fa` - Enable/disable 2FA

### Admin (Protected)
- `GET /api/admin/audit-logs` - Get logs
- `GET /api/admin/teams` - Get all teams
- `GET /api/admin/teams/:id` - Get team by ID
- `PUT /api/admin/teams/:id/status` - Update status
- `GET /api/admin/stats` - Get system stats

---

## 🎯 Production Deployment

### Environment Variables to Change
```env
NODE_ENV=production
JWT_ACCESS_SECRET=<generate 64 char random>
JWT_REFRESH_SECRET=<generate 64 char random>
FRONTEND_URL=https://yourdomain.com
```

### Generate Secure Secrets
```bash
node -e "console.log(require('crypto').randomBytes(64).toString('hex'))"
```

### Database
- Use managed MySQL (AWS RDS, Google Cloud SQL)
- Enable SSL connections
- Whitelist server IP only

### Backend
- Deploy to: Heroku, Railway, DigitalOcean
- Enable HTTPS
- Set rate limits appropriately
- Monitor audit logs

### Frontend
- Deploy to: Vercel, Netlify
- Update VITE_API_URL to production API
- Enable HTTPS
- Configure CORS on backend

---

## 📚 File Explanations

### Backend
- `server.js` - Express app setup, routes mounting
- `config/db.js` - MySQL connection pool
- `config/email.js` - Nodemailer transporter
- `utils/jwt.js` - Token generation & verification
- `utils/password.js` - bcrypt hashing
- `middleware/auth.js` - JWT verification
- `middleware/roleGuard.js` - Admin/team guards
- `middleware/rateLimiter.js` - Rate limiting
- `services/otpService.js` - OTP generation & validation
- `services/emailService.js` - Email sending
- `services/auditService.js` - Security logging
- `controllers/authController.js` - Auth logic
- `controllers/adminController.js` - Admin endpoints
- `controllers/teamController.js` - Team endpoints

### Frontend
- `contexts/AuthContext.tsx` - Auth state management
- `lib/authApi.ts` - API client with auto-refresh
- `components/ProtectedRoute.tsx` - Route guards
- `App.tsx` - Routes with protection

---

## ✅ You're All Set!

Backend: http://localhost:5000
Frontend: http://localhost:8080

Admin: admin@lockdownhq.com
Teams: Register at /register

Happy coding! 🚀🔐
