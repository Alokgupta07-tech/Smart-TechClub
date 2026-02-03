# Database Setup Guide

## Prerequisites
- MySQL 8.0 or higher
- Node.js backend server (Express recommended)

## Setup Instructions

### 1. Create Database
```sql
CREATE DATABASE lockdown_hq;
USE lockdown_hq;
```

### 2. Run Schema
```bash
mysql -u root -p lockdown_hq < database/schema.sql
```

### 3. Environment Variables
Create a `.env` file in your backend directory:

```env
# Database
DB_HOST=localhost
DB_PORT=3306
DB_USER=root
DB_PASSWORD=your_password
DB_NAME=lockdown_hq

# Server
PORT=3000
NODE_ENV=production

# JWT Secret (CHANGE THIS!)
JWT_SECRET=your_super_secret_key_change_this_in_production

# Frontend URL
FRONTEND_URL=http://localhost:8080
```

### 4. Backend API Implementation

#### Required Endpoints

**Admin Endpoints (Protected)**
- `GET /api/admin/teams` - Get all teams
- `GET /api/admin/stats` - Get aggregated statistics
- `GET /api/admin/alerts` - Get recent activity logs
- `PATCH /api/admin/team/:id/action` - Perform team action

**Public Endpoints**
- `GET /api/leaderboard` - Get leaderboard rankings
- `POST /api/auth/register` - Register new team
- `POST /api/auth/login` - Login

#### Sample Backend Code (Express + MySQL2)

```javascript
// server.js
const express = require('express');
const mysql = require('mysql2/promise');
const cors = require('cors');
require('dotenv').config();

const app = express();

// Middleware
app.use(cors());
app.use(express.json());

// Database connection pool
const pool = mysql.createPool({
  host: process.env.DB_HOST,
  user: process.env.DB_USER,
  password: process.env.DB_PASSWORD,
  database: process.env.DB_NAME,
  waitForConnections: true,
  connectionLimit: 10,
  queueLimit: 0
});

// GET /api/admin/teams
app.get('/api/admin/teams', async (req, res) => {
  try {
    const [rows] = await pool.query('SELECT * FROM v_team_details ORDER BY createdAt DESC');
    res.json(rows);
  } catch (error) {
    console.error('Error fetching teams:', error);
    res.status(500).json({ error: 'Failed to fetch teams' });
  }
});

// GET /api/admin/stats
app.get('/api/admin/stats', async (req, res) => {
  try {
    const [rows] = await pool.query('CALL sp_get_admin_stats()');
    res.json(rows[0][0]);
  } catch (error) {
    console.error('Error fetching stats:', error);
    res.status(500).json({ error: 'Failed to fetch stats' });
  }
});

// GET /api/admin/alerts
app.get('/api/admin/alerts', async (req, res) => {
  try {
    const [rows] = await pool.query(`
      SELECT 
        a.id, 
        a.team_id AS teamId, 
        t.team_name AS team, 
        a.type, 
        a.message, 
        a.severity AS type,
        a.created_at AS createdAt
      FROM activity_logs a
      INNER JOIN teams t ON a.team_id = t.id
      ORDER BY a.created_at DESC
      LIMIT 50
    `);
    res.json(rows);
  } catch (error) {
    console.error('Error fetching alerts:', error);
    res.status(500).json({ error: 'Failed to fetch alerts' });
  }
});

// GET /api/leaderboard
app.get('/api/leaderboard', async (req, res) => {
  try {
    const [rows] = await pool.query('CALL sp_get_leaderboard()');
    
    // Add rank to each team
    const leaderboard = rows[0].map((team, index) => ({
      ...team,
      rank: index + 1
    }));
    
    res.json(leaderboard);
  } catch (error) {
    console.error('Error fetching leaderboard:', error);
    res.status(500).json({ error: 'Failed to fetch leaderboard' });
  }
});

// PATCH /api/admin/team/:id/action
app.patch('/api/admin/team/:id/action', async (req, res) => {
  try {
    const { id } = req.params;
    const { action } = req.body;
    
    let updateQuery = '';
    
    switch (action) {
      case 'pause':
        updateQuery = 'UPDATE teams SET status = "waiting" WHERE id = ?';
        break;
      case 'resume':
        updateQuery = 'UPDATE teams SET status = "active" WHERE id = ?';
        break;
      case 'disqualify':
        updateQuery = 'UPDATE teams SET status = "disqualified" WHERE id = ?';
        break;
      case 'reset':
        updateQuery = 'UPDATE teams SET progress = 0, level = 1, start_time = NULL, end_time = NULL, status = "waiting" WHERE id = ?';
        break;
      default:
        return res.status(400).json({ error: 'Invalid action' });
    }
    
    await pool.query(updateQuery, [id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Error performing team action:', error);
    res.status(500).json({ error: 'Failed to perform action' });
  }
});

// Start server
const PORT = process.env.PORT || 3000;
app.listen(PORT, () => {
  console.log(`Server running on port ${PORT}`);
});
```

### 5. Frontend Environment Variables

Create `.env` in your frontend root:

```env
VITE_API_URL=http://localhost:3000/api
```

## Testing

### Insert Test Data
```sql
-- Insert a test team
INSERT INTO users (id, name, email, password_hash, role) 
VALUES (UUID(), 'Test Team', 'team1@test.com', '$2a$10$hashedpassword', 'team');

INSERT INTO teams (id, user_id, team_name, level, status, progress, start_time, hints_used)
VALUES (UUID(), (SELECT id FROM users WHERE email = 'team1@test.com'), 'CYBER PHANTOMS', 2, 'active', 75, NOW(), 1);

-- Insert test alert
INSERT INTO activity_logs (team_id, type, message, severity)
VALUES ((SELECT id FROM teams WHERE team_name = 'CYBER PHANTOMS'), 'tab_switch', 'Tab switch detected', 'warning');
```

### Verify Data
```sql
SELECT * FROM v_team_details;
CALL sp_get_admin_stats();
CALL sp_get_leaderboard();
```

## Security Checklist

- [ ] Change default admin password
- [ ] Use environment variables for sensitive data
- [ ] Implement JWT authentication
- [ ] Validate admin role on backend
- [ ] Use prepared statements (already in place)
- [ ] Enable HTTPS in production
- [ ] Rate limit API endpoints
- [ ] Sanitize all user inputs

## Real-Time Updates

### Option 1: Polling (Simpler)
Frontend polls every 10 seconds:
```javascript
setInterval(() => {
  refetch();
}, 10000);
```

### Option 2: WebSocket (Recommended for Production)
Use Socket.io for real-time updates:

Backend:
```javascript
const io = require('socket.io')(server);

// Emit when team data changes
io.emit('team-update', updatedTeam);
io.emit('stats-update', newStats);
```

Frontend:
```javascript
socket.on('team-update', (team) => {
  updateTeams(team);
});
```

## Troubleshooting

### Connection Issues
- Check MySQL is running: `systemctl status mysql`
- Verify credentials in `.env`
- Test connection: `mysql -u root -p`

### Empty Data
- Run seed script: `npm run seed`
- Check tables exist: `SHOW TABLES;`
- Verify view: `SELECT * FROM v_team_details;`

### CORS Errors
- Ensure backend allows frontend origin
- Check `FRONTEND_URL` in `.env`
