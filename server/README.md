# 🔐 Lockdown HQ - Enterprise Authentication System

## 🎯 Features

- ✅ Role-based authentication (Admin / Team)
- ✅ JWT Access + Refresh Tokens
- ✅ Email OTP verification
- ✅ Password reset via OTP
- ✅ Optional 2FA (Email-based)
- ✅ Audit & login history
- ✅ Rate limiting & brute-force protection
- ✅ MySQL database
- ✅ Strict security & access isolation

## 🚀 Setup

### 1. Install Dependencies

```bash
cd server
npm install
```

### 2. Configure Environment

```bash
cp .env.example .env
# Edit .env with your actual values
```

### 3. Create Database & Run Migrations

```bash
mysql -u root -p
CREATE DATABASE lockdown_hq;
exit;

npm run migrate
```

### 4. Create Admin User (Manual)

```sql
INSERT INTO users (id, name, email, password_hash, role, is_verified) 
VALUES (
  UUID(),
  'Admin User',
  'admin@lockdownhq.com',
  '$2b$10$YourHashedPasswordHere',
  'admin',
  TRUE
);
```

To generate password hash:
```bash
node -e "console.log(require('bcrypt').hashSync('YourPassword123', 10))"
```

### 5. Start Server

```bash
npm run dev  # Development
npm start    # Production
```

## 📚 API Documentation

### Authentication Endpoints

#### Register Team
```
POST /api/auth/register
Body: { name, email, password, teamName }
Response: { message, userId }
```

#### Verify Email
```
POST /api/auth/verify-email
Body: { userId, otp }
Response: { message }
```

#### Login
```
POST /api/auth/login
Body: { email, password }
Response: { accessToken, refreshToken, role, user } OR { requireTwoFa, userId }
```

#### Verify 2FA
```
POST /api/auth/verify-2fa
Body: { userId, otp }
Response: { accessToken, refreshToken, role, user }
```

#### Refresh Token
```
POST /api/auth/refresh
Body: { refreshToken }
Response: { accessToken }
```

#### Logout
```
POST /api/auth/logout
Headers: Authorization: Bearer <token>
Body: { refreshToken }
Response: { message }
```

#### Forgot Password
```
POST /api/auth/forgot-password
Body: { email }
Response: { message, userId }
```

#### Reset Password
```
POST /api/auth/reset-password
Body: { userId, otp, newPassword }
Response: { message }
```

### Admin Endpoints

#### Get Audit Logs
```
GET /api/admin/audit-logs?page=1&limit=50
Headers: Authorization: Bearer <token>
Response: { logs[], total, page, pages }
```

#### Get All Teams
```
GET /api/admin/teams
Headers: Authorization: Bearer <token>
Response: { teams[] }
```

### Team Endpoints

#### Get My Team
```
GET /api/team/me
Headers: Authorization: Bearer <token>
Response: { team }
```

## 🔒 Security Features

### Rate Limiting
- 5 attempts per 15 minutes per IP
- Applied to: login, OTP verification, password reset

### JWT Tokens
- Access Token: 15 minutes
- Refresh Token: 7 days
- Stored in httpOnly cookies (recommended) or localStorage

### Audit Logging
All security events are logged:
- Registration
- Login success/failure
- OTP verification
- Password resets
- Token refresh
- Admin actions

### Password Security
- bcrypt hashing with 10 rounds
- No plaintext storage
- Reset invalidates all refresh tokens

## 🏗️ Architecture

```
server/
├── config/
│   ├── db.js              # MySQL connection pool
│   └── email.js           # Nodemailer config
├── controllers/
│   ├── authController.js  # Auth logic
│   └── adminController.js # Admin endpoints
├── middleware/
│   ├── auth.js            # JWT verification
│   ├── roleGuard.js       # Admin/Team guards
│   └── rateLimiter.js     # Rate limiting
├── services/
│   ├── emailService.js    # OTP emails
│   ├── auditService.js    # Logging
│   └── otpService.js      # OTP generation
├── utils/
│   ├── jwt.js             # Token utilities
│   └── bcrypt.js          # Password hashing
├── routes/
│   ├── authRoutes.js      # Auth endpoints
│   ├── adminRoutes.js     # Admin endpoints
│   └── teamRoutes.js      # Team endpoints
├── migrations/
│   └── schema.sql         # Database schema
└── server.js              # Entry point
```

## 🧪 Testing

Test with curl or Postman:

```bash
# Register
curl -X POST http://localhost:5000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{"name":"Test User","email":"test@test.com","password":"Test123!","teamName":"Team Alpha"}'

# Login
curl -X POST http://localhost:5000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{"email":"test@test.com","password":"Test123!"}'
```

## 📝 Notes

- Admin users cannot self-register (create manually)
- Teams must verify email before login
- 2FA is optional (user-enabled)
- All sensitive actions are rate-limited and audited
- Frontend must handle token refresh on 401 errors
