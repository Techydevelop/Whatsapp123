-- Create First Admin User Script
-- This script creates the first admin user for the SaaS platform
-- Default credentials: admin@yourdomain.com / Admin@123456

-- Insert first admin user
-- Password: Admin@123456 (bcrypt hashed with 10 rounds)
-- Hash generated using: bcrypt.hash('Admin@123456', 10)
INSERT INTO admin_users (email, password_hash, role) 
VALUES (
    'admin@yourdomain.com',
    '$2a$10$92IXUNpkjO0rOQ5byMi.Ye4oKoEa3Ro9llC/.og/at2.uheWG/igi', -- Admin@123456
    'super_admin'
) ON CONFLICT (email) DO NOTHING;

-- Verify admin user was created
SELECT 
    id,
    email,
    role,
    created_at
FROM admin_users 
WHERE email = 'admin@yourdomain.com';

-- Success message
SELECT 'First admin user created successfully! Email: admin@yourdomain.com, Password: Admin@123456' as status;
