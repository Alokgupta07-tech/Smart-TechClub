-- Insert admin user with correct password hash
-- Password: tech@2026
-- Hash generated with bcrypt rounds=12

INSERT INTO users (
  id, 
  name, 
  email, 
  password_hash, 
  role, 
  is_verified, 
  created_at
) VALUES (
  'de2da67e-662f-429b-b4b1-694caa569e59',
  'Admin',
  'agupta88094@gmail.com',
  '$2b$12$g3AYs4EPyqlzyQy1ZuntY.fT1v6iH0vTTEt5eahqIje1LR89EyzTO',
  'admin',
  TRUE,
  NOW()
);
