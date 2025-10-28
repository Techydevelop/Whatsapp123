-- Update user to Professional Plan ($49/month, 10 subaccounts)
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
WHERE email = 'abjandal19@gamil.com';

-- Verify the update
SELECT 
  id,
  email,
  subscription_status,
  subscription_plan,
  max_subaccounts,
  trial_ends_at,
  subscription_ends_at
FROM users 
WHERE email = 'abjandal19@gamil.com';

