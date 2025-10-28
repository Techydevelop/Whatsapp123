-- ============================================
-- MANUAL SUBSCRIPTION UPDATE (For Testing)
-- ============================================

-- 1. Update to TRIAL (7 days free, 1 subaccount)
UPDATE users 
SET 
  subscription_status = 'trial',
  subscription_plan = 'free',
  max_subaccounts = 1,
  trial_started_at = NOW(),
  trial_ends_at = NOW() + INTERVAL '7 days',
  trial_used = true,
  subscription_started_at = NULL,
  subscription_ends_at = NULL
WHERE email = 'your-email@example.com';

-- 2. Update to STARTER PLAN ($19/month, 3 subaccounts)
UPDATE users 
SET 
  subscription_status = 'active',
  subscription_plan = 'starter',
  max_subaccounts = 3,
  trial_started_at = NULL,
  trial_ends_at = NULL,
  trial_used = true,
  subscription_started_at = NOW(),
  subscription_ends_at = NOW() + INTERVAL '30 days',
  stripe_customer_id = 'manual_starter',
  stripe_subscription_id = 'manual_starter_sub'
WHERE email = 'your-email@example.com';

-- 3. Update to PROFESSIONAL PLAN ($49/month, 10 subaccounts)
UPDATE users 
SET 
  subscription_status = 'active',
  subscription_plan = 'professional',
  max_subaccounts = 10,
  trial_started_at = NULL,
  trial_ends_at = NULL,
  trial_used = true,
  subscription_started_at = NOW(),
  subscription_ends_at = NOW() + INTERVAL '30 days',
  stripe_customer_id = 'manual_professional',
  stripe_subscription_id = 'manual_professional_sub'
WHERE email = 'your-email@example.com';

-- 4. Reset trial for testing (start fresh 7-day trial)
UPDATE users 
SET 
  subscription_status = 'trial',
  subscription_plan = 'free',
  max_subaccounts = 1,
  trial_started_at = NOW(),
  trial_ends_at = NOW() + INTERVAL '7 days',
  trial_used = false,
  subscription_started_at = NULL,
  subscription_ends_at = NULL
WHERE email = 'your-email@example.com';

-- 5. Check your current subscription status
SELECT 
  id,
  email,
  subscription_status,
  subscription_plan,
  max_subaccounts,
  trial_started_at,
  trial_ends_at,
  trial_used,
  subscription_started_at,
  subscription_ends_at
FROM users 
WHERE email = 'your-email@example.com';

-- ============================================
-- QUICK RESET COMMANDS
-- ============================================

-- Reset to FREE TRIAL (for testing)
UPDATE users 
SET 
  subscription_status = 'trial',
  subscription_plan = 'free',
  max_subaccounts = 1,
  trial_started_at = NOW(),
  trial_ends_at = NOW() + INTERVAL '7 days',
  trial_used = false
WHERE email = 'YOUR_EMAIL_HERE';

-- Upgrade yourself to STARTER
UPDATE users 
SET 
  subscription_status = 'active',
  subscription_plan = 'starter',
  max_subaccounts = 3
WHERE email = 'YOUR_EMAIL_HERE';

-- Upgrade yourself to PROFESSIONAL
UPDATE users 
SET 
  subscription_status = 'active',
  subscription_plan = 'professional',
  max_subaccounts = 10
WHERE email = 'YOUR_EMAIL_HERE';

-- ============================================
-- USAGE INSTRUCTIONS
-- ============================================
/*
1. Replace 'YOUR_EMAIL_HERE' with your actual email
2. Run the SQL command in Supabase SQL Editor
3. Refresh your dashboard to see changes
4. Now you can test with different subscription levels
*/

-- Example:
UPDATE users 
SET subscription_status = 'active',
    subscription_plan = 'professional',
    max_subaccounts = 10
WHERE email = 'admin@octendr.com';

