# 🧟 Lockdown HQ - Resident Evil CTF

<div align="center">
  <img src="https://img.shields.io/badge/Status-Active-success?style=for-the-badge" alt="Status">
  <img src="https://img.shields.io/badge/Event-CTF_Competition-orange?style=for-the-badge" alt="Event Type">
  <img src="https://img.shields.io/badge/Theme-Resident_Evil-red?style=for-the-badge" alt="Theme">
</div>

## ⚡ QUICK START (FIXED - No More Port Conflicts!)

### 🚀 One-Click Startup (Windows)
```bash
# Double-click this file to start everything:
start-dev.bat
```
**OR**
```powershell
# Run this PowerShell script:
.\start-dev.ps1
```

### 🔧 Manual Startup
```bash
# Terminal 1: Backend
cd server && node server.js

# Terminal 2: Frontend
npm run dev
```

### 🌐 Access URLs
- **Frontend:** http://localhost:5173 (or 5174 if 5173 is busy)
- **Backend:** http://localhost:5000

---

## 📖 About The Project

Lockdown HQ is a full-stack web application I developed for Smart Tech Club's annual cybersecurity competition. The project combines my passion for web development with the thrill of CTF challenges, wrapped in an immersive Resident Evil theme.

The platform handles everything from team registration to live scoring, featuring a custom-built authentication system with JWT tokens and role-based access control. I spent considerable time polishing the UI to capture that eerie, terminal-style aesthetic while maintaining modern usability standards.

### 🎯 Why I Built This

After participating in several CTF events, I noticed many platforms lacked proper team management and real-time updates. I wanted to create something that not only looked professional but also provided a seamless experience for both participants and organizers. This became a great opportunity to:

- Implement enterprise-level authentication patterns
- Build a scalable MySQL database architecture
- Create a responsive, theme-driven UI
- Practice secure coding practices

## ✨ Key Features

- **🔐 Secure Authentication System**
  - JWT-based access & refresh tokens
  - Bcrypt password hashing (12 rounds)
  - Two-factor authentication via email
  - Session management with automatic token refresh

- **👥 Team Management**
  - Multi-member team registration
  - Team captain controls
  - Member invitation system
  - Performance tracking

- **🏆 Live Leaderboard**
  - Real-time score updates
  - Team rankings with tie-breakers
  - Performance analytics
  - Challenge completion tracking

- **📊 Admin Dashboard**
  - User management interface
  - Team oversight and moderation
  - Challenge deployment
  - System health monitoring

- **🎨 Themed UI/UX**
  - Resident Evil inspired design
  - Terminal-style typography
  - Green phosphor aesthetic
  - Responsive across all devices

## 🛠️ Tech Stack

### Frontend
```
├── React 18              # UI Framework
├── TypeScript            # Type Safety
├── Vite                  # Build Tool & Dev Server
├── Tailwind CSS          # Styling
├── shadcn/ui             # Component Library
└── React Router          # Navigation
```

### Backend
```
├── Node.js               # Runtime Environment
├── Express.js            # Web Framework
├── MySQL                 # Database
├── JWT                   # Authentication
├── Bcrypt                # Password Hashing
├── Nodemailer            # Email Service
└── Nodemon               # Dev Hot-Reload
```

## 🚀 Getting Started

### Prerequisites

Make sure you have these installed:
- Node.js (v16 or higher)
- npm or yarn
- MySQL Server (I used XAMPP for local development)

### Installation

1. **Clone the repository**
   ```bash
   git clone https://github.com/yourusername/lockdown-hq.git
   cd lockdown-hq
   ```

2. **Install frontend dependencies**
   ```bash
   npm install
   ```

3. **Install backend dependencies**
   ```bash
   cd server
   npm install
   ```

4. **Database Setup**
   
   Create a new MySQL database:
   ```sql
   CREATE DATABASE lockdown_hq;
   ```

   Import the schema:
   ```bash
   mysql -u root -p lockdown_hq < database/schema.sql
   ```

5. **Environment Configuration**
   
   Create `server/.env` file:
   ```env
   # Database Configuration
   DB_HOST=localhost
   DB_USER=root
   DB_PASSWORD=your_mysql_password
   DB_NAME=lockdown_hq
   DB_PORT=3306

   # JWT Secrets (use strong random strings in production)
   JWT_SECRET=your_jwt_secret_key_here
   JWT_REFRESH_SECRET=your_refresh_secret_key_here

   # Server Configuration
   PORT=5000
   NODE_ENV=development

   # Email Configuration (optional - OTPs log to console if not set)
   EMAIL_HOST=smtp.gmail.com
   EMAIL_PORT=587
   EMAIL_USER=your_email@gmail.com
   EMAIL_PASSWORD=your_app_password
   EMAIL_FROM=noreply@lockdownhq.com
   ```

   Create `.env` in root directory:
   ```env
   VITE_API_URL=http://localhost:5000/api
   ```

6. **Start the Development Servers**

   Terminal 1 (Backend):
   ```bash
   cd server
   npm run dev
   ```

   Terminal 2 (Frontend):
   ```bash
   npm run dev
   ```

7. **Access the Application**
   - Frontend: http://localhost:8080
   - Backend API: http://localhost:5000

## 📁 Project Structure

```
lockdown-hq/
├── public/              # Static assets
├── src/
│   ├── components/      # React components
│   │   ├── ui/         # Reusable UI components
│   │   └── ...         # Feature components
│   ├── contexts/       # React Context providers
│   ├── hooks/          # Custom React hooks
│   ├── lib/            # Utility functions
│   ├── pages/          # Route pages
│   └── types/          # TypeScript definitions
├── server/
│   ├── config/         # Server configuration
│   ├── controllers/    # Route controllers
│   ├── middleware/     # Express middleware
│   ├── models/         # Database models
│   ├── routes/         # API routes
│   ├── services/       # Business logic
│   └── utils/          # Helper functions
├── database/
│   └── schema.sql      # Database schema
└── ...config files
```

## 🔒 Security Features

I took security seriously while building this:

- **Password Security**: Bcrypt with 12 salt rounds
- **Token Management**: Separate access (15min) and refresh tokens (7 days)
- **SQL Injection Prevention**: Parameterized queries throughout
- **XSS Protection**: Input sanitization on both client and server
- **CORS Configuration**: Restricted origins in production
- **Rate Limiting**: Implemented on auth endpoints
- **Environment Variables**: Sensitive data never committed

## 🎮 Usage

### For Participants

1. Register your team with a unique team name
2. Verify your email with the OTP sent
3. Access challenges from the dashboard
4. Submit flags and climb the leaderboard
5. Track your team's progress in real-time

### For Admins

1. Login with admin credentials
2. Monitor all teams from the admin dashboard
3. Manage challenges and flags
4. View system statistics and logs
5. Handle user issues and moderation

## 🐛 Known Issues & Future Improvements

**Current Limitations:**
- Email service requires SMTP configuration (currently logs to console)
- Real-time updates use polling (planning to implement WebSockets)
- No password recovery flow yet (coming soon)

**Planned Features:**
- [ ] WebSocket integration for live updates
- [ ] Password reset functionality
- [ ] Challenge file upload system
- [ ] Team chat feature
- [ ] Export leaderboard to CSV
- [ ] Mobile app version

## 🤝 Contributing

While this was a personal project, I'm open to contributions! If you have ideas for improvements:

1. Fork the repository
2. Create a feature branch (`git checkout -b feature/AmazingFeature`)
3. Commit your changes (`git commit -m 'Add some AmazingFeature'`)
4. Push to the branch (`git push origin feature/AmazingFeature`)
5. Open a Pull Request

## 📝 Development Notes

**Challenges I Faced:**
- Implementing refresh token rotation without breaking active sessions
- Designing a scalable database schema for team hierarchies
- Creating a responsive terminal-themed UI that works on mobile
- Handling MySQL timezone issues with JWT expiration

**Lessons Learned:**
- Always validate tokens on the server, never trust client-side checks
- TypeScript saved me countless hours in debugging
- Proper error handling makes debugging 10x easier
- Testing auth flows early prevents major refactoring later

## 📜 License

This project is licensed under the MIT License - see the [LICENSE](LICENSE) file for details.

## 🙏 Acknowledgments

- **shadcn/ui** - For the amazing component library
- **Tailwind CSS Team** - For making styling enjoyable
- **Smart Tech Club** - For the opportunity to build this
- **Resident Evil Franchise** - For the design inspiration

## 📧 Contact

**Developer**: Alok Gupta  
**Email**: agupta88094@gmail.com  
**Project Link**: https://github.com/yourusername/lockdown-hq

---

<div align="center">
  <sub>Built with ❤️ for the cybersecurity community</sub>
</div>
