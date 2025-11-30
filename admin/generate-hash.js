const bcrypt = require('bcryptjs');

bcrypt.hash('Abujandal19!', 10).then(hash => {
  console.log('Hashed password:', hash);
  console.log('\nSQL to insert superadmin:');
  console.log(`
INSERT INTO users (email, name, password, is_verified, is_admin, role, subscription_status, subscription_plan, max_subaccounts, created_at)
VALUES (
  'abjandal@superadmin.com',
  'Super Admin',
  '${hash}',
  true,
  true,
  'superadmin',
  'active',
  'admin',
  999,
  NOW()
)
ON CONFLICT (email) DO UPDATE SET
  is_admin = true,
  role = 'superadmin',
  password = '${hash}',
  is_verified = true;
  `);
});
