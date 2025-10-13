# WhatsApp GHL Customer Management Platform - Complete Implementation Plan

## Executive Summary

This plan transforms the existing WhatsApp-GHL integration into a complete SaaS platform by adding:

- Custom JWT-based authentication (replacing Supabase Auth)
- Customer registration with dual OTP verification (Email + WhatsApp)
- Automated trial system (7 days) with auto-generated credentials
- Subscription management (Basic, Pro, Enterprise plans)
- Separate customer website for registration and pricing
- Admin panel for customer and subscription management
- Background automation for connection monitoring and notifications
- Email and WhatsApp notification system

**Critical: Existing WhatsApp/GHL functionality remains completely unchanged**

---

## Table of Contents

1. [Architecture Decisions](#architecture-decisions)
2. [Phase 1: Database Schema Design](#phase-1-database-schema-design)
3. [Phase 2: Backend Authentication System](#phase-2-backend-authentication-system)
4. [Phase 3: Backend Automation & Jobs](#phase-3-backend-automation--jobs)
5. [Phase 4: Frontend Authentication Updates](#phase-4-frontend-authentication-updates)
6. [Phase 5: Customer Website](#phase-5-customer-website)
7. [Phase 6: Admin Panel](#phase-6-admin-panel)
8. [Phase 7: Notification Templates](#phase-7-notification-templates)
9. [Phase 8: Environment Configuration](#phase-8-environment-configuration)
10. [Phase 9: Testing Strategy](#phase-9-testing-strategy)
11. [Phase 10: Deployment](#phase-10-deployment)
12. [Integration Points](#integration-points)
13. [Migration Strategy](#migration-strategy)
14. [Success Metrics](#success-metrics)

---

## Architecture Decisions

### Key Decisions Made:

**1. Database Strategy**

- Use separate PostgreSQL database for customer management
- Can be same Supabase instance but different schema/tables
- Existing tables (sessions, ghl_accounts, messages) remain untouched
- Add nullable customer_id column to link existing tables

**2. OTP Delivery Method**

- Use existing Baileys WhatsApp integration
- Configure one admin WhatsApp number as OTP sender
- Send email OTP via NodeMailer (SMTP)
- Both OTPs must be verified before account creation

**3. Payment Processing**

- Manual payment tracking only (Phase 1)
- Admin marks subscriptions as paid in admin panel
- No Stripe/PayPal integration initially
- Can be added later without breaking changes

**4. User Migration**

- Existing Supabase Auth users must re-register
- Old sessions/accounts remain in database (orphaned)
- Admin can manually link old data if needed
- Clean slate for customer management

**5. Admin Account Creation**

- First admin created via SQL script
- Default credentials: admin@yourdomain.com / Admin@123456
- Must be changed immediately after first login
- Additional admins created through admin panel

### Technology Stack:

**Backend:**

- Node.js + Express (existing)
- PostgreSQL via pg library (new customer DB)
- JWT (jsonwebtoken + bcryptjs)
- NodeMailer for emails
- node-cron for background jobs
- Baileys for WhatsApp (existing)

**Frontend:**

- Next.js 15 + TypeScript + Tailwind CSS (consistent across all apps)
- Three separate deployments: Dashboard (existing), Website (new), Admin (new)

**Deployment:**

- Backend: Render (existing)
- Dashboard: Vercel (existing)
- Website: Vercel (new)
- Admin Panel: Vercel (new)
- Database: Supabase PostgreSQL (existing + new tables)

---

## Phase 1: Database Schema Design

### 1.1 New Tables Overview

Create 6 new tables for customer management:

**Table 1: customers**

- Primary customer account table
- Stores email, phone, business name, password hash
- Tracks plan (trial/basic/pro/enterprise)
- Tracks status (active/suspended/expired/cancelled)
- Stores trial_ends_at and subscription_ends_at timestamps
- Auto-updates updated_at on changes

**Table 2: admin_users**

- Admin panel access control
- Stores email and password hash
- Role-based access (super_admin/admin/support)
- Tracks last_login_at for security

**Table 3: subscriptions**

- Subscription history and billing records
- Links to customer_id
- Stores plan, amount, currency
- Tracks start_date, end_date, status
- Payment method (manual/stripe/paypal for future)
- Optional payment_reference for tracking

**Table 4: connection_logs**

- Audit trail for WhatsApp connection events
- Links to customer_id and session_id
- Event types: connected, disconnected, qr_generated, error, reconnected
- Stores metadata as JSONB for flexibility
- Used by automation to track notification history

**Table 5: notifications**

- Queue for all outbound notifications
- Links to customer_id
- Types: connection_lost, trial_expiring_3days, trial_expiring_1day, trial_expired, subscription_expiring, subscription_expired, welcome, upgrade_success
- Channels: email, whatsapp, both
- Status: pending, sent, failed
- Stores error_message for failed notifications

**Table 6: otp_verifications**

- Temporary storage for OTP verification
- Stores both email_otp and whatsapp_otp
- Tracks verification status for each channel
- Expires after 10 minutes
- Cleaned up by background job

### 1.2 Indexes for Performance

Create indexes on:

- customers: email, phone, status, trial_ends_at
- admin_users: email
- subscriptions: customer_id, status, end_date
- connection_logs: customer_id, session_id, event_type, created_at
- notifications: customer_id, status, type, created_at
- otp_verifications: email, phone, expires_at

### 1.3 Link to Existing Tables

Modify existing tables (non-breaking):

- Add customer_id UUID to sessions table (nullable, references customers.id)
- Add customer_id UUID to ghl_accounts table (nullable, references customers.id)
- Create indexes on new customer_id columns
- Existing data has customer_id = NULL (orphaned records)

### 1.4 Database Triggers

Create automatic timestamp update trigger:

- Function: update_updated_at_column()
- Applies to: customers, subscriptions
- Updates updated_at to NOW() on every UPDATE

### 1.5 First Admin User

Create SQL script to insert first admin:

- Email: admin@yourdomain.com
- Password: Admin@123456 (bcrypt hashed)
- Role: super_admin
- Use ON CONFLICT DO NOTHING to prevent duplicates

---

## Phase 2: Backend Authentication System

### 2.1 Dependencies Installation

Add to backend/package.json:

- bcryptjs (password hashing)
- jsonwebtoken (JWT tokens)
- nodemailer (email sending)
- node-cron (scheduled jobs)
- pg (PostgreSQL client for customer DB)

### 2.2 Database Connection Setup

Create backend/config/customerDb.js:

- Initialize PostgreSQL connection pool
- Use environment variables for connection details
- Enable SSL for production
- Export pool for use in routes

### 2.3 Utility Functions

**File: backend/utils/password.js**

- generateSecurePassword(): Creates 12-character random password with letters, numbers, symbols
- hashPassword(password): Bcrypt hash with 10 rounds
- comparePassword(password, hash): Verify password against hash

**File: backend/utils/otp.js**

- generateOTP(): Creates 6-digit random number
- storeOTP(email, phone): Generates both OTPs, stores in database with 10-minute expiry
- verifyOTP(email, emailOTP, whatsappOTP): Checks both OTPs match and not expired
- cleanupExpiredOTPs(): Background job to delete old OTP records

**File: backend/utils/email.js**

- Configure NodeMailer with SMTP settings
- sendWelcomeEmail(email, password, dashboardUrl): Send credentials after registration
- sendOTPEmail(email, otp): Send email OTP code
- sendConnectionLostEmail(email, reconnectUrl): Alert for disconnected WhatsApp
- sendTrialExpiringEmail(email, daysLeft, upgradeUrl): Trial expiry reminder
- sendTrialExpiredEmail(email, upgradeUrl): Trial ended notification
- sendSubscriptionExpiringEmail(email, daysLeft, renewUrl): Subscription renewal reminder

**File: backend/utils/whatsapp-notification.js**

- sendWhatsAppOTP(phone, otp): Send OTP via admin WhatsApp number using Baileys
- sendConnectionLostWhatsApp(phone, reconnectUrl): Alert message
- sendTrialExpiringWhatsApp(phone, daysLeft, upgradeUrl): Trial reminder
- Uses existing Baileys client with dedicated admin session

**File: backend/utils/jwt.js**

- generateCustomerToken(customerId, email): Create JWT with 7-day expiry
- generateAdminToken(adminId, email, role): Create admin JWT with 7-day expiry
- verifyCustomerToken(token): Decode and validate customer JWT
- verifyAdminToken(token): Decode and validate admin JWT
- Use separate secrets for customer and admin tokens

### 2.4 Authentication Middleware

**File: backend/middleware/auth.js**

**authenticateCustomer middleware:**

- Extract token from Authorization header (Bearer token)
- Verify token using verifyCustomerToken()
- Query customer from database by ID
- Check customer exists and status is 'active'
- Attach customer object to req.customer
- Return 401 if invalid token or customer not found
- Return 403 if customer suspended

**authenticateAdmin middleware:**

- Extract token from Authorization header
- Verify token using verifyAdminToken()
- Query admin from database by ID
- Check admin exists
- Attach admin object to req.admin
- Return 401 if invalid token or admin not found

**File: backend/middleware/checkSubscription.js**

**checkSubscription middleware:**

- Runs after authenticateCustomer
- Check if customer.plan is 'trial'
- If yes, check if trial_ends_at > NOW()
- If expired, return 403 with message to upgrade
- Check if customer.plan is basic/pro/enterprise
- Check if subscription_ends_at > NOW()
- If expired, return 403 with message to renew
- If all checks pass, call next()
- Used on all dashboard routes

### 2.5 Customer Authentication Routes

**File: backend/routes/auth.js**

**POST /api/auth/register**

- Body: { email, phone, business_name }
- Validate email format and phone format
- Check if email or phone already exists
- Generate email OTP and WhatsApp OTP
- Store OTPs in database with 10-minute expiry
- Send email OTP via sendOTPEmail()
- Send WhatsApp OTP via sendWhatsAppOTP()
- Return success message
- No account created yet (happens after OTP verification)

**POST /api/auth/verify-otp**

- Body: { email, emailOTP, whatsappOTP, business_name }
- Verify both OTPs using verifyOTP()
- If invalid or expired, return error
- Generate secure random password
- Hash password with bcrypt
- Create customer record in database
- Set plan = 'trial'
- Set trial_ends_at = NOW() + 7 days
- Set status = 'active'
- Delete OTP record
- Send welcome email with credentials
- Return success with message to check email

**POST /api/auth/login**

- Body: { email, password }
- Query customer by email
- If not found, return 401 "Invalid credentials"
- Compare password with hash
- If invalid, return 401 "Invalid credentials"
- Check customer status is 'active'
- If suspended/expired, return 403 with specific message
- Generate JWT token
- Update last_login_at (optional tracking)
- Return token and customer info (without password hash)

**POST /api/auth/refresh**

- Body: { refreshToken } or use existing token
- Verify current token
- Generate new token with extended expiry
- Return new token

**POST /api/auth/forgot-password**

- Body: { email }
- Query customer by email
- If not found, return success anyway (security)
- Generate password reset token (JWT with 1-hour expiry)
- Send email with reset link: WEBSITE_URL/reset-password?token=...
- Return success message

**POST /api/auth/reset-password**

- Body: { token, newPassword }
- Verify reset token
- Extract customer ID from token
- Hash new password
- Update customer password_hash
- Return success message

**GET /api/auth/me**

- Requires authenticateCustomer middleware
- Return req.customer (without password hash)
- Used by frontend to get current user

### 2.6 Admin Authentication Routes

**File: backend/routes/admin-auth.js**

**POST /api/admin/auth/login**

- Body: { email, password }
- Query admin_users by email
- Compare password with hash
- If invalid, return 401
- Generate admin JWT token
- Update last_login_at
- Return token and admin info

**POST /api/admin/auth/refresh**

- Verify admin token
- Generate new admin token
- Return new token

**GET /api/admin/auth/me**

- Requires authenticateAdmin middleware
- Return req.admin

### 2.7 Customer API Routes

**File: backend/routes/customer.js**

All routes require authenticateCustomer + checkSubscription middleware

**GET /api/customer/profile**

- Return customer profile
- Include plan, trial/subscription end dates, status

**PUT /api/customer/profile**

- Body: { business_name, phone } (email cannot be changed)
- Update customer record
- Return updated profile

**GET /api/customer/sessions**

- Query sessions table WHERE customer_id = req.customer.id
- Return list of WhatsApp sessions with status
- Include phone numbers and connection status

**GET /api/customer/subscription**

- Query subscriptions table WHERE customer_id = req.customer.id
- Return current subscription details
- Include plan, amount, start/end dates, status

**POST /api/customer/upgrade-request**

- Body: { requestedPlan, message }
- Create notification for admin
- Type: 'upgrade_request'
- Return success message

### 2.8 Admin API Routes

**File: backend/routes/admin.js**

All routes require authenticateAdmin middleware

**GET /api/admin/customers**

- Query params: ?status=active&plan=trial&page=1&limit=50
- Query customers table with filters
- Return paginated list with counts
- Include trial/subscription end dates

**GET /api/admin/customers/:id**

- Query customer by ID
- Include related data:
  - Sessions (from sessions table)
  - GHL accounts (from ghl_accounts table)
  - Subscriptions (from subscriptions table)
  - Connection logs (recent 50)
  - Notifications (recent 50)
- Return comprehensive customer profile

**POST /api/admin/customers/create**

- Body: { email, phone, business_name, plan }
- Generate secure password
- Create customer record
- Send welcome email with credentials
- Return success

**POST /api/admin/customers/:id/upgrade**

- Body: { plan, amount, duration_months }
- Validate plan (basic/pro/enterprise)
- Create subscription record
- Update customer.plan and customer.subscription_ends_at
- Send upgrade success email
- Return success

**POST /api/admin/customers/:id/extend-trial**

- Body: { days }
- Update customer.trial_ends_at += days
- Return success

**POST /api/admin/customers/:id/suspend**

- Update customer.status = 'suspended'
- Send suspension notification
- Return success

**POST /api/admin/customers/:id/activate**

- Update customer.status = 'active'
- Send activation notification
- Return success

**GET /api/admin/analytics**

- Calculate and return:
  - Total customers
  - Active customers
  - Trial customers
  - Paid customers
  - Revenue (sum of subscriptions)
  - Messages sent (from messages table)
  - Active WhatsApp sessions
  - Connection uptime percentage
- Group by time periods (today, week, month)

**GET /api/admin/notifications**

- Query params: ?type=connection_lost&status=sent&page=1
- Query notifications table with filters
- Return paginated list

**GET /api/admin/connection-logs**

- Query params: ?customer_id=...&event_type=disconnected
- Query connection_logs table
- Return paginated list

**POST /api/admin/send-notification**

- Body: { customer_id, type, channel, message }
- Create notification record
- Send immediately via email/WhatsApp
- Return success

### 2.9 Modify Existing Server.js

**Changes needed:**

**Remove Supabase Auth dependency:**

- Keep Supabase client for database (sessions, ghl_accounts, messages)
- Remove any Supabase Auth middleware
- Remove auth.users references

**Import new routes:**

- Import authRoutes from './routes/auth.js'
- Import adminAuthRoutes from './routes/admin-auth.js'
- Import customerRoutes from './routes/customer.js'
- Import adminRoutes from './routes/admin.js'

**Register routes:**

- app.use('/api/auth', authRoutes)
- app.use('/api/admin/auth', adminAuthRoutes)
- app.use('/api/customer', customerRoutes)
- app.use('/api/admin', adminRoutes)

**Update existing WhatsApp/GHL endpoints:**

- Add authenticateCustomer middleware to protected routes
- Replace user_id with customer_id from req.customer.id
- When creating sessions, set customer_id
- When creating ghl_accounts, set customer_id
- Keep all existing logic unchanged

**Example changes:**

- POST /api/sessions/create: Add customer_id to session record
- GET /api/sessions: Filter by customer_id
- All GHL endpoints: Link to customer_id

---

## Phase 3: Backend Automation & Jobs

### 3.1 Connection Monitor

**File: backend/jobs/connectionMonitor.js**

**Real-time monitoring:**

- Export notifyCustomerConnectionLost(sessionId, metadata) function
- Query session by ID to get customer_id
- Query customer by ID to get email and phone
- Create connection_log record with event_type='disconnected'
- Create notification record with type='connection_lost'
- Send email via sendConnectionLostEmail()
- Send WhatsApp via sendConnectionLostWhatsApp()
- Update notification status to 'sent' or 'failed'

**Scheduled monitoring (every 5 minutes):**

- Query all sessions WHERE status='disconnected'
- For each disconnected session:
  - Check if notification already sent in last 1 hour (avoid spam)
  - If not notified, call notifyCustomerConnectionLost()
- Log results

**Integration with baileys-wa.js:**

- Import notifyCustomerConnectionLost in baileys-wa.js
- In connection.update event handler, when connection='close':
  - After existing disconnect logic
  - Call await notifyCustomerConnectionLost(sessionId, { reason, timestamp })

### 3.2 Trial Expiry Checker

**File: backend/jobs/trialExpiryChecker.js**

**Daily job (runs at 9 AM):**

**Check 3-day expiry:**

- Query customers WHERE plan='trial' AND trial_ends_at BETWEEN NOW() AND NOW() + 3 days
- For each customer:
  - Check if notification already sent (avoid duplicates)
  - Create notification record with type='trial_expiring_3days'
  - Send email and WhatsApp
  - Include upgrade link

**Check 1-day expiry:**

- Query customers WHERE plan='trial' AND trial_ends_at BETWEEN NOW() AND NOW() + 1 day
- Send urgent reminder
- Type='trial_expiring_1day'

**Check expired:**

- Query customers WHERE plan='trial' AND trial_ends_at < NOW() AND status='active'
- For each customer:
  - Update status='expired'
  - Create notification with type='trial_expired'
  - Send email and WhatsApp with upgrade link
  - Customer can no longer access dashboard (checkSubscription middleware blocks)

### 3.3 Subscription Checker

**File: backend/jobs/subscriptionChecker.js**

**Daily job (runs at 9 AM):**

**Check 7-day expiry:**

- Query customers WHERE plan IN ('basic','pro','enterprise') AND subscription_ends_at BETWEEN NOW() AND NOW() + 7 days
- Send renewal reminder
- Type='subscription_expiring'

**Check expired:**

- Query customers WHERE subscription_ends_at < NOW() AND status='active'
- Update status='expired'
- Send expiration notification
- Block dashboard access

### 3.4 Job Scheduler

**File: backend/jobs/scheduler.js**

**Initialize all cron jobs:**

- Import node-cron
- Import all job modules

**Schedule connection monitor:**

- cron.schedule('*/5 * * * *', connectionMonitor.checkDisconnected)
- Runs every 5 minutes

**Schedule trial expiry checker:**

- cron.schedule('0 9 * * *', trialExpiryChecker.checkExpiry)
- Runs daily at 9:00 AM

**Schedule subscription checker:**

- cron.schedule('0 9 * * *', subscriptionChecker.checkExpiry)
- Runs daily at 9:00 AM

**Schedule OTP cleanup:**

- cron.schedule('0 * * * *', otpCleanup)
- Runs hourly

**Export startScheduler() function:**

- Call from server.js on startup
- Log all scheduled jobs

**Modify server.js:**

- Import scheduler
- Call scheduler.startScheduler() after server starts
- Log "Background jobs initialized"

---

## Phase 4: Frontend Authentication Updates

### 4.1 Remove Supabase Auth

**File: frontend/src/lib/supabase.ts**

- Keep createClient for database queries
- Remove all auth-related code
- Keep only for querying sessions, ghl_accounts, messages tables

**File: frontend/src/app/layout.tsx**

- Remove Supabase AuthProvider wrapper
- Remove auth state management
- Keep layout structure

### 4.2 Create Custom Auth Client

**File: frontend/src/lib/api.ts**

**Create API client class:**

- Base URL from environment variable
- Methods:
  - login(email, password): POST /api/auth/login, store token in localStorage
  - logout(): Clear token from localStorage
  - getCurrentCustomer(): GET /api/auth/me with token
  - refreshToken(): POST /api/auth/refresh
  - forgotPassword(email): POST /api/auth/forgot-password
  - resetPassword(token, newPassword): POST /api/auth/reset-password

**Axios interceptor:**

- Automatically attach Authorization header with token
- On 401 response, try to refresh token
- If refresh fails, redirect to login

**File: frontend/src/lib/auth.ts**

**Auth helper functions:**

- getToken(): Get JWT from localStorage
- setToken(token): Store JWT in localStorage
- removeToken(): Clear JWT
- isAuthenticated(): Check if token exists and not expired
- decodeToken(): Parse JWT to get customer info

### 4.3 Update Login Page

**File: frontend/src/components/auth/LoginForm.tsx**

**Remove:**

- All Supabase auth code
- Signup toggle and form
- supabase.auth.signInWithPassword()
- supabase.auth.signUp()

**Replace with:**

- Email and password inputs only
- Call api.login(email, password) on submit
- On success, redirect to /dashboard
- On error, show error message

**Add:**

- Link: "Don't have an account? Register here" → Opens WEBSITE_URL
- Link: "Forgot password?" → /forgot-password page

**File: frontend/src/app/forgot-password/page.tsx** (NEW)

**Create forgot password page:**

- Email input
- Submit button calls api.forgotPassword(email)
- Show success message: "Check your email for reset link"

**File: frontend/src/app/reset-password/page.tsx** (NEW)

**Create reset password page:**

- Get token from URL query parameter
- New password input
- Confirm password input
- Submit button calls api.resetPassword(token, newPassword)
- On success, redirect to login with success message

### 4.4 Update Dashboard Layout

**File: frontend/src/app/dashboard/layout.tsx**

**Add authentication check:**

- Call api.getCurrentCustomer() on mount
- If not authenticated, redirect to /login
- Store customer in context or state

**Add subscription check:**

- Check customer.status
- If 'expired', show modal: "Your trial/subscription has expired. Please upgrade."
- Block access to dashboard features
- Show upgrade button linking to WEBSITE_URL/upgrade

**Add subscription banner:**

- If plan='trial', show: "Trial expires in X days" with countdown
- If plan='basic/pro/enterprise', show: "Subscription active until [date]"
- Add "Upgrade Plan" button

**File: frontend/src/components/dashboard/SubscriptionBanner.tsx** (NEW)

**Create banner component:**

- Calculate days remaining
- Show appropriate message based on plan
- Color coding: green (active), yellow (expiring soon), red (expired)
- Upgrade button

### 4.5 Update All Dashboard Components

**Replace in all components:**

- supabase.auth.getUser() → api.getCurrentCustomer()
- user.id → customer.id
- user_id → customer_id in all API calls

**Files to update:**

- frontend/src/app/dashboard/page.tsx
- frontend/src/components/dashboard/SessionsList.tsx
- frontend/src/components/dashboard/CreateSessionCard.tsx
- frontend/src/components/dashboard/GHLIntegration.tsx
- frontend/src/components/dashboard/ChatWindow.tsx
- All other dashboard components

**Changes:**

- Replace auth calls with custom API
- Use customer.id instead of user.id
- Add subscription checks before actions

---

## Phase 5: Customer Website

### 5.1 Create New Next.js Project

**Initialize website project:**

- Create new directory: website/
- Run: npx create-next-app@latest website --typescript --tailwind --app
- Configure TypeScript and Tailwind
- Set up environment variables

### 5.2 Landing Page

**File: website/app/page.tsx**

**Sections:**

1. Hero section
   - Headline: "WhatsApp Business Automation for GoHighLevel"
   - Subheadline: "Connect WhatsApp to your GHL account and automate conversations"
   - CTA button: "Start Free Trial" → /register
   - Secondary button: "View Pricing" → /pricing

2. Features section
   - Feature 1: "Seamless GHL Integration"
   - Feature 2: "Multi-Account Support"
   - Feature 3: "Real-time Message Sync"
   - Feature 4: "Media Support"
   - Feature 5: "Connection Monitoring"
   - Feature 6: "24/7 Uptime"

3. How It Works
   - Step 1: Register and verify
   - Step 2: Connect WhatsApp
   - Step 3: Link GHL account
   - Step 4: Start messaging

4. Pricing preview
   - Show 3 plans with key features
   - CTA: "View Full Pricing" → /pricing

5. Testimonials
   - 3-4 customer testimonials
   - Photos, names, companies

6. FAQ section
   - Common questions and answers

7. Footer
   - Links: About, Pricing, Contact, Terms, Privacy
   - Social media links
   - Copyright notice

### 5.3 Pricing Page

**File: website/app/pricing/page.tsx**

**Pricing cards (4 plans):**

**Trial Plan:**
- Price: $0
- Duration: 7 days
- Features:
  - 1 WhatsApp connection
  - 1 GHL location
  - 100 messages/day
  - Email support
- CTA: "Start Free Trial" → /register

**Basic Plan:**
- Price: $29/month
- Features:
  - 1 WhatsApp connection
  - 3 GHL locations
  - Unlimited messages
  - Priority email support
  - Connection monitoring
- CTA: "Get Started" → /register

**Pro Plan:**
- Price: $99/month
- Features:
  - 5 WhatsApp connections
  - Unlimited GHL locations
  - Unlimited messages
  - Priority support
  - Advanced analytics
  - API access
- CTA: "Get Started" → /register

**Enterprise Plan:**
- Price: $299/month
- Features:
  - Unlimited connections
  - Unlimited locations
  - Unlimited messages
  - Dedicated support
  - Custom integrations
  - White-label option
- CTA: "Contact Sales" → Contact form

**Comparison table:**
- Show all features across plans
- Highlight differences

### 5.4 Registration Page

**File: website/app/register/page.tsx**

**Registration form:**
- Email input (required, validated)
- Phone input (required, international format)
- Business name input (required)
- Terms and conditions checkbox
- Submit button: "Send Verification Codes"

**On submit:**
- Call API: POST /api/auth/register
- Show loading state
- On success:
  - Store email in localStorage (for next step)
  - Redirect to /verify-otp
  - Show message: "Verification codes sent to your email and WhatsApp"
- On error:
  - Show error message
  - Highlight invalid fields

**Validation:**
- Email format check
- Phone format check (international)
- Business name min 2 characters
- All fields required

### 5.5 OTP Verification Page

**File: website/app/verify-otp/page.tsx**

**OTP verification form:**
- Email OTP input (6 digits)
- WhatsApp OTP input (6 digits)
- Verify button
- Resend OTP button (disabled for 60 seconds)

**On verify:**
- Call API: POST /api/auth/verify-otp
- Show loading state
- On success:
  - Show success modal:
    - "Account created successfully!"
    - "Your credentials have been sent to your email"
    - "Password: [shown once]"
    - Button: "Go to Dashboard" → DASHBOARD_URL/login
- On error:
  - Show error message
  - Allow retry

**Resend OTP:**
- Call API: POST /api/auth/register again
- Reset 60-second timer
- Show success message

### 5.6 Login Redirect Page

**File: website/app/login/page.tsx**

**Simple redirect:**
- Show message: "Redirecting to dashboard..."
- Auto-redirect to DASHBOARD_URL/login
- Or show button: "Go to Dashboard Login"

### 5.7 Forgot Password Page

**File: website/app/forgot-password/page.tsx**

**Forgot password form:**
- Email input
- Submit button
- On submit:
  - Call API: POST /api/auth/forgot-password
  - Show success: "Reset link sent to your email"

### 5.8 Upgrade Page

**File: website/app/upgrade/page.tsx**

**Upgrade form:**
- Show current plan
- Show available upgrade options
- Plan selection
- Payment method selection (manual for now)
- Submit button: "Request Upgrade"
- On submit:
  - Call API: POST /api/customer/upgrade-request
  - Show success: "Upgrade request sent. Admin will contact you."

### 5.9 Website Components

**File: website/components/Hero.tsx**
- Hero section with gradient background
- Animated headline
- CTA buttons

**File: website/components/Features.tsx**
- Feature grid (3 columns)
- Icons for each feature
- Hover effects

**File: website/components/Pricing.tsx**
- Pricing cards component
- Reusable for landing and pricing pages
- Highlight popular plan

**File: website/components/Testimonials.tsx**
- Testimonial carousel
- Customer photos and quotes

**File: website/components/Footer.tsx**
- Multi-column footer
- Links and social media
- Newsletter signup

**File: website/components/Navbar.tsx**
- Sticky navigation
- Logo and links
- Login and Register buttons
- Mobile responsive

### 5.10 Website API Client

**File: website/lib/api.ts**

**API client for website:**
- Base URL: process.env.NEXT_PUBLIC_API_URL
- Methods:
  - register(email, phone, businessName): POST /api/auth/register
  - verifyOTP(email, emailOTP, whatsappOTP, businessName): POST /api/auth/verify-otp
  - forgotPassword(email): POST /api/auth/forgot-password
  - resetPassword(token, newPassword): POST /api/auth/reset-password

**Error handling:**
- Catch network errors
- Show user-friendly messages
- Log errors for debugging

### 5.11 Website Environment Variables

**File: website/.env.local**

```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_DASHBOARD_URL=https://dashboard.yourdomain.com
```

---

## Phase 6: Admin Panel

### 6.1 Create New Next.js Project

**Initialize admin panel project:**
- Create new directory: admin/
- Run: npx create-next-app@latest admin --typescript --tailwind --app
- Configure TypeScript and Tailwind
- Set up environment variables
- Install additional packages: recharts (for charts), date-fns (for date formatting)

### 6.2 Admin Login Page

**File: admin/app/login/page.tsx**

**Admin login form:**
- Email input
- Password input
- Remember me checkbox
- Submit button: "Login as Admin"

**On submit:**
- Call API: POST /api/admin/auth/login
- Store admin JWT in localStorage
- Redirect to /dashboard
- On error, show error message

**Security features:**
- Rate limiting on frontend (prevent brute force)
- Show CAPTCHA after 3 failed attempts (optional)
- Secure password input

### 6.3 Admin Dashboard Page

**File: admin/app/dashboard/page.tsx**

**Dashboard sections:**

**1. Key Metrics (Top cards):**
- Total Customers
- Active Customers (status='active')
- Trial Customers (plan='trial')
- Paid Customers (plan!='trial')
- Total Revenue (sum of subscriptions)
- Active WhatsApp Sessions
- Messages Sent Today
- Connection Uptime %

**2. Revenue Chart:**
- Line chart showing revenue over time
- Filter by: Last 7 days, Last 30 days, Last 3 months
- Group by day/week/month

**3. Customer Growth Chart:**
- Line chart showing new customers over time
- Separate lines for trial and paid

**4. Recent Activity:**
- Recent customer registrations
- Recent upgrades
- Recent connection issues
- Recent notifications sent

**5. Quick Actions:**
- Button: "Create Customer" → Modal
- Button: "View All Customers" → /customers
- Button: "View Notifications" → /notifications

### 6.4 Customers List Page

**File: admin/app/customers/page.tsx**

**Customer table:**

**Columns:**
- Email
- Business Name
- Phone
- Plan (badge with color: gray=trial, blue=basic, purple=pro, gold=enterprise)
- Status (badge: green=active, yellow=expiring, red=expired)
- Trial/Subscription Ends
- WhatsApp Sessions (count)
- Actions (View, Upgrade, Suspend)

**Filters:**
- Status dropdown: All, Active, Trial, Expired, Suspended
- Plan dropdown: All, Trial, Basic, Pro, Enterprise
- Search box: Search by email or business name
- Date range: Registration date filter

**Pagination:**
- Show 50 customers per page
- Page numbers and next/prev buttons
- Total count display

**Actions:**
- View button → /customers/[id]
- Upgrade button → Open upgrade modal
- Suspend button → Confirm and suspend
- Bulk actions: Select multiple and suspend/activate

### 6.5 Customer Details Page

**File: admin/app/customers/[id]/page.tsx**

**Customer profile section:**
- Email, Phone, Business Name
- Plan and Status badges
- Registration date
- Last login date
- Trial/Subscription end date

**Action buttons:**
- Upgrade Plan
- Extend Trial
- Suspend Account
- Activate Account
- Send Notification
- Delete Customer (with confirmation)

**WhatsApp Sessions section:**
- Table of all sessions for this customer
- Columns: Phone Number, Status, Connected At, Last Active
- Action: Disconnect session

**GHL Accounts section:**
- Table of linked GHL accounts
- Columns: Company ID, Location ID, Connected At
- Action: Disconnect GHL

**Subscription History:**
- Table of all subscriptions
- Columns: Plan, Amount, Start Date, End Date, Status, Payment Method
- Show payment references

**Connection Logs:**
- Recent 50 connection events
- Columns: Event Type, Timestamp, Metadata
- Filter by event type

**Notifications Sent:**
- Recent 50 notifications
- Columns: Type, Channel, Status, Sent At
- Resend option for failed notifications

### 6.6 Subscriptions Page

**File: admin/app/subscriptions/page.tsx**

**Subscription table:**

**Columns:**
- Customer Email
- Business Name
- Plan
- Amount
- Start Date
- End Date
- Status
- Payment Method
- Actions

**Filters:**
- Status: All, Active, Expired, Cancelled
- Plan: All, Basic, Pro, Enterprise
- Date range: Start date filter

**Actions:**
- Mark as Paid
- Cancel Subscription
- Extend Subscription
- View Customer Details

**Summary cards:**
- Total Active Subscriptions
- Monthly Recurring Revenue (MRR)
- Expiring This Month
- Cancelled This Month

### 6.7 Notifications Page

**File: admin/app/notifications/page.tsx**

**Notification logs table:**

**Columns:**
- Customer Email
- Type (connection_lost, trial_expiring, etc.)
- Channel (email, whatsapp, both)
- Status (sent, failed, pending)
- Sent At
- Error Message (if failed)
- Actions

**Filters:**
- Type dropdown
- Channel dropdown
- Status dropdown
- Date range

**Actions:**
- Resend notification
- View customer details
- Delete notification log

**Send Manual Notification section:**
- Select customer dropdown
- Type dropdown
- Channel dropdown
- Custom message textarea
- Send button

### 6.8 Settings Page

**File: admin/app/settings/page.tsx**

**Settings sections:**

**1. Trial Settings:**
- Default trial duration (days) input
- Save button

**2. Pricing Plans:**
- Edit plan prices
- Basic: $X/month input
- Pro: $X/month input
- Enterprise: $X/month input
- Save button

**3. Email Configuration:**
- SMTP Host, Port, User, Password inputs
- From Email input
- Test Email button (sends test email)
- Save button

**4. WhatsApp Configuration:**
- Admin WhatsApp Number input
- Admin Session ID input
- Test WhatsApp button (sends test message)
- Save button

**5. Notification Templates:**
- Tabs for each notification type
- Edit email subject and body
- Edit WhatsApp message
- Variables available: {{customer_name}}, {{days_left}}, {{upgrade_url}}
- Preview button
- Save button

**6. Admin Users:**
- Table of all admin users
- Add New Admin button
- Edit/Delete actions

### 6.9 Admin Components

**File: admin/components/CustomerTable.tsx**

**Reusable customer table component:**
- Props: customers array, filters, onFilterChange
- Sortable columns
- Row selection for bulk actions
- Responsive design

**File: admin/components/Analytics.tsx**

**Analytics dashboard component:**
- Props: metrics data
- Metric cards with icons
- Charts using recharts library
- Loading states

**File: admin/components/UpgradeModal.tsx**

**Upgrade customer modal:**
- Props: customer, onClose, onSuccess
- Plan selection dropdown
- Duration input (months)
- Amount input (auto-calculated)
- Payment method dropdown
- Notes textarea
- Upgrade button

**File: admin/components/ConnectionStatus.tsx**

**Real-time connection status component:**
- Props: sessionId
- Shows current status with color indicator
- Auto-refreshes every 30 seconds
- Shows last connected time

**File: admin/components/NotificationLogs.tsx**

**Notification logs table component:**
- Props: notifications array
- Filterable and sortable
- Resend action
- Status badges

**File: admin/components/Sidebar.tsx**

**Admin panel sidebar navigation:**
- Logo
- Navigation links:
  - Dashboard
  - Customers
  - Subscriptions
  - Notifications
  - Settings
- Active link highlighting
- Logout button at bottom

**File: admin/components/Header.tsx**

**Admin panel header:**
- Page title
- Admin user info dropdown
- Notifications bell icon
- Logout button

### 6.10 Admin API Client

**File: admin/lib/api.ts**

**API client for admin panel:**
- Base URL: process.env.NEXT_PUBLIC_API_URL
- Automatically attach admin JWT token
- Methods:
  - login(email, password): POST /api/admin/auth/login
  - logout(): Clear token
  - getMe(): GET /api/admin/auth/me
  - getCustomers(filters): GET /api/admin/customers
  - getCustomer(id): GET /api/admin/customers/:id
  - createCustomer(data): POST /api/admin/customers/create
  - upgradeCustomer(id, data): POST /api/admin/customers/:id/upgrade
  - extendTrial(id, days): POST /api/admin/customers/:id/extend-trial
  - suspendCustomer(id): POST /api/admin/customers/:id/suspend
  - activateCustomer(id): POST /api/admin/customers/:id/activate
  - getAnalytics(): GET /api/admin/analytics
  - getNotifications(filters): GET /api/admin/notifications
  - sendNotification(data): POST /api/admin/send-notification
  - getConnectionLogs(filters): GET /api/admin/connection-logs

**Axios interceptor:**
- Attach Authorization header
- Handle 401 (redirect to login)
- Handle errors globally

### 6.11 Admin Layout

**File: admin/app/layout.tsx**

**Admin layout structure:**
- Sidebar on left (fixed)
- Header on top
- Main content area
- Protected routes (check admin auth)

**File: admin/app/dashboard/layout.tsx**

**Dashboard layout with auth check:**
- Verify admin token on mount
- If not authenticated, redirect to /login
- Load admin user data
- Provide admin context to all pages

### 6.12 Admin Environment Variables

**File: admin/.env.local**

```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

---

## Phase 7: Notification Templates

### 7.1 Email Templates

**File: backend/templates/email/welcome.html**

**Welcome email template:**
- Subject: "Welcome to WhatsApp-GHL Platform - Your Account is Ready!"
- Body:
  - Welcome message
  - Account credentials (email and generated password)
  - Dashboard login link
  - Getting started guide
  - Trial information (7 days free)
  - Support contact info
- Variables: {{business_name}}, {{email}}, {{password}}, {{dashboard_url}}, {{trial_ends_at}}

**File: backend/templates/email/connection-lost.html**

**Connection lost alert template:**
- Subject: "⚠️ WhatsApp Connection Lost - Action Required"
- Body:
  - Alert message
  - Reason for disconnection (if available)
  - Reconnect instructions
  - Dashboard link to scan QR code
  - Support contact
- Variables: {{business_name}}, {{phone_number}}, {{reconnect_url}}, {{reason}}

**File: backend/templates/email/trial-expiring-3days.html**

**Trial expiring in 3 days template:**
- Subject: "Your Trial Expires in 3 Days - Upgrade Now"
- Body:
  - Trial expiry reminder
  - Benefits of upgrading
  - Pricing plans comparison
  - Upgrade link
  - FAQ about upgrading
- Variables: {{business_name}}, {{trial_ends_at}}, {{upgrade_url}}

**File: backend/templates/email/trial-expiring-1day.html**

**Trial expiring in 1 day template:**
- Subject: "⏰ Last Day of Your Trial - Don't Lose Access!"
- Body:
  - Urgent reminder
  - What happens after trial expires
  - Upgrade call-to-action
  - Special offer (optional)
- Variables: {{business_name}}, {{trial_ends_at}}, {{upgrade_url}}

**File: backend/templates/email/trial-expired.html**

**Trial expired template:**
- Subject: "Your Trial Has Ended - Upgrade to Continue"
- Body:
  - Trial ended message
  - Account status (access suspended)
  - Upgrade to restore access
  - Pricing plans
  - Contact sales option
- Variables: {{business_name}}, {{upgrade_url}}

**File: backend/templates/email/subscription-expiring.html**

**Subscription expiring template:**
- Subject: "Your Subscription Expires in {{days_left}} Days"
- Body:
  - Renewal reminder
  - Current plan details
  - Renewal link
  - Update payment method
  - Contact support
- Variables: {{business_name}}, {{plan}}, {{subscription_ends_at}}, {{days_left}}, {{renew_url}}

**File: backend/templates/email/subscription-expired.html**

**Subscription expired template:**
- Subject: "Your Subscription Has Expired"
- Body:
  - Expiry notification
  - Access suspended message
  - Renew subscription link
  - Contact support
- Variables: {{business_name}}, {{plan}}, {{renew_url}}

**File: backend/templates/email/upgrade-success.html**

**Upgrade success template:**
- Subject: "🎉 Upgrade Successful - Welcome to {{plan}} Plan"
- Body:
  - Congratulations message
  - New plan details
  - New features unlocked
  - Invoice/receipt
  - Thank you message
- Variables: {{business_name}}, {{plan}}, {{amount}}, {{subscription_ends_at}}

### 7.2 WhatsApp Templates

**File: backend/templates/whatsapp/connection-lost.txt**

```
⚠️ WhatsApp Connection Lost

Hi {{business_name}},

Your WhatsApp connection has been disconnected.

Please reconnect immediately:
{{reconnect_url}}

Need help? Contact support.
```

**File: backend/templates/whatsapp/trial-expiring-3days.txt**

```
⏰ Trial Expiring Soon

Hi {{business_name}},

Your 7-day trial expires in 3 days ({{trial_ends_at}}).

Upgrade now to continue:
{{upgrade_url}}

Questions? Reply to this message.
```

**File: backend/templates/whatsapp/trial-expiring-1day.txt**

```
🚨 Last Day of Trial!

Hi {{business_name}},

Your trial ends tomorrow!

Upgrade now to avoid losing access:
{{upgrade_url}}

Need help? Contact us.
```

**File: backend/templates/whatsapp/trial-expired.txt**

```
Trial Ended

Hi {{business_name}},

Your trial has ended. Your account is now suspended.

Upgrade to restore access:
{{upgrade_url}}

Contact us for assistance.
```

**File: backend/templates/whatsapp/subscription-expiring.txt**

```
Subscription Renewal Reminder

Hi {{business_name}},

Your {{plan}} subscription expires in {{days_left}} days.

Renew now:
{{renew_url}}

Questions? Reply here.
```

### 7.3 Template Rendering Utility

**File: backend/utils/templateRenderer.js**

**Template rendering function:**
- loadTemplate(templateName, type): Load HTML or TXT template from file
- renderTemplate(template, variables): Replace {{variable}} placeholders
- Support for conditional sections
- HTML escaping for security
- Export functions:
  - renderEmailTemplate(templateName, variables)
  - renderWhatsAppTemplate(templateName, variables)

**Usage example:**

```javascript
const html = renderEmailTemplate('welcome', {
  business_name: 'Acme Corp',
  email: 'user@example.com',
  password: 'SecurePass123',
  dashboard_url: 'https://dashboard.example.com',
  trial_ends_at: '2025-10-20'
});
```

---

## Phase 8: Environment Configuration

### 8.1 Backend Environment Variables

**File: backend/.env**

**Add new variables:**

```env
# Existing variables (keep these)
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
GHL_CLIENT_ID=your_ghl_client_id
GHL_CLIENT_SECRET=your_ghl_client_secret
GHL_REDIRECT_URI=https://api.yourdomain.com/ghl/callback
PORT=3001

# NEW: Customer Database (can be same Supabase or separate)
CUSTOMER_DB_HOST=db.your-project.supabase.co
CUSTOMER_DB_PORT=5432
CUSTOMER_DB_NAME=postgres
CUSTOMER_DB_USER=postgres
CUSTOMER_DB_PASSWORD=your_db_password
CUSTOMER_DB_SSL=true

# NEW: JWT Secrets (generate random 32+ character strings)
CUSTOMER_JWT_SECRET=your_random_customer_jwt_secret_min_32_chars
ADMIN_JWT_SECRET=your_random_admin_jwt_secret_min_32_chars
JWT_EXPIRES_IN=7d

# NEW: Email Configuration (NodeMailer SMTP)
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password
FROM_EMAIL=noreply@yourdomain.com
FROM_NAME=WhatsApp-GHL Platform

# NEW: Trial Settings
DEFAULT_TRIAL_DAYS=7

# NEW: URLs
WEBSITE_URL=https://yourdomain.com
ADMIN_URL=https://admin.yourdomain.com
DASHBOARD_URL=https://dashboard.yourdomain.com
API_URL=https://api.yourdomain.com

# NEW: Admin WhatsApp for OTPs
ADMIN_WHATSAPP_SESSION_ID=admin_otp_sender
ADMIN_WHATSAPP_NUMBER=+1234567890
```

### 8.2 Frontend (Dashboard) Environment Variables

**File: frontend/.env.local**

**Update variables:**

```env
# Existing
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# NEW
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_WEBSITE_URL=https://yourdomain.com
```

### 8.3 Website Environment Variables

**File: website/.env.local**

```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_DASHBOARD_URL=https://dashboard.yourdomain.com
```

### 8.4 Admin Panel Environment Variables

**File: admin/.env.local**

```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

### 8.5 Environment Variable Documentation

**File: ENVIRONMENT_VARIABLES.md**

Create documentation explaining:
- All environment variables
- How to generate JWT secrets
- How to get Gmail app password
- How to configure SMTP
- Security best practices
- Development vs production values

---

## Phase 9: Testing Strategy

### 9.1 Database Testing

**Test database schema:**
- Run saas-schema.sql on test database
- Verify all tables created
- Verify indexes created
- Verify foreign key constraints
- Test triggers (updated_at)
- Test customer_id linking to existing tables

**Test data:**
- Create test admin user
- Create test customers (trial, basic, pro)
- Create test subscriptions
- Create test connection logs
- Create test notifications

### 9.2 Backend API Testing

**Authentication endpoints:**
- Test customer registration (valid and invalid data)
- Test OTP generation and verification
- Test customer login (valid and invalid credentials)
- Test JWT token generation and verification
- Test password reset flow
- Test admin login
- Test middleware (authenticateCustomer, authenticateAdmin, checkSubscription)

**Customer API endpoints:**
- Test get profile
- Test update profile
- Test get sessions
- Test get subscription
- Test upgrade request

**Admin API endpoints:**
- Test get customers (with filters)
- Test get customer details
- Test create customer
- Test upgrade customer
- Test extend trial
- Test suspend/activate customer
- Test get analytics
- Test get notifications
- Test send notification

**Integration with existing endpoints:**
- Test session creation with customer_id
- Test GHL account linking with customer_id
- Test message sending with authentication

### 9.3 Background Jobs Testing

**Connection monitor:**
- Simulate WhatsApp disconnection
- Verify immediate notification sent
- Verify connection log created
- Test scheduled check (every 5 minutes)
- Verify no duplicate notifications

**Trial expiry checker:**
- Create test customers with trials expiring in 3 days, 1 day, today
- Run job manually
- Verify notifications sent
- Verify customer status updated for expired trials

**Subscription checker:**
- Create test subscriptions expiring in 7 days, today
- Run job manually
- Verify notifications sent
- Verify customer status updated

**OTP cleanup:**
- Create expired OTP records
- Run cleanup job
- Verify old OTPs deleted

### 9.4 Frontend Testing

**Dashboard authentication:**
- Test login with custom auth
- Test logout
- Test token refresh
- Test subscription check (expired trial/subscription)
- Test subscription banner display
- Verify all dashboard features work with new auth

**Website testing:**
- Test landing page load
- Test pricing page
- Test registration form (validation)
- Test OTP verification
- Test forgot password
- Test upgrade request

**Admin panel testing:**
- Test admin login
- Test dashboard analytics display
- Test customer list (filters, search, pagination)
- Test customer details page
- Test upgrade customer
- Test suspend/activate customer
- Test notification logs
- Test settings page

### 9.5 Email and WhatsApp Testing

**Email testing:**
- Test welcome email
- Test OTP email
- Test connection lost email
- Test trial expiring emails
- Test subscription emails
- Verify template rendering
- Verify variables replaced correctly

**WhatsApp testing:**
- Test OTP sending via admin WhatsApp
- Test connection lost alert
- Test trial expiring alerts
- Verify messages sent from correct number

### 9.6 End-to-End Testing

**Complete customer journey:**
1. Customer registers on website
2. Receives email and WhatsApp OTP
3. Verifies both OTPs
4. Receives welcome email with credentials
5. Logs into dashboard
6. Connects WhatsApp (scans QR)
7. Links GHL account
8. Sends test message
9. Trial expiry notifications received
10. Upgrades to paid plan (admin)
11. Continues using service

**Admin journey:**
1. Admin logs into admin panel
2. Views dashboard analytics
3. Creates new customer manually
4. Views customer list
5. Upgrades a customer
6. Sends manual notification
7. Views notification logs
8. Updates settings

### 9.7 Load Testing

**Test scalability:**
- Simulate 100 concurrent customer registrations
- Simulate 1000 WhatsApp messages per minute
- Test background jobs with large datasets
- Monitor database performance
- Monitor API response times

### 9.8 Security Testing

**Authentication security:**
- Test JWT token expiry
- Test invalid tokens
- Test SQL injection attempts
- Test XSS attempts
- Test CSRF protection
- Test rate limiting
- Test password strength requirements

---

## Phase 10: Deployment

### 10.1 Database Deployment

**Deploy customer database:**

**Option A: Same Supabase instance**
- Connect to existing Supabase project
- Run saas-schema.sql via SQL Editor
- Run create-admin.sql
- Verify tables created
- Update backend .env with same database credentials

**Option B: Separate database**
- Create new PostgreSQL database (Supabase, AWS RDS, etc.)
- Run saas-schema.sql
- Run create-admin.sql
- Update backend .env with new database credentials

### 10.2 Backend Deployment

**Update existing Render deployment:**
- Add new environment variables in Render dashboard
- Push updated code to GitHub
- Render auto-deploys
- Verify deployment logs
- Test new endpoints
- Verify background jobs started

**Environment variables to add:**
- All from Phase 8.1 (customer DB, JWT secrets, SMTP, URLs)

**Verify:**
- Backend health check endpoint
- Database connection successful
- Background jobs running
- Email sending works
- WhatsApp OTP sending works

### 10.3 Dashboard Deployment

**Update existing Vercel deployment:**
- Add new environment variables in Vercel dashboard
- Push updated code to GitHub
- Vercel auto-deploys
- Verify deployment
- Test login with custom auth
- Test subscription check

**Environment variables to add:**
- NEXT_PUBLIC_API_URL
- NEXT_PUBLIC_WEBSITE_URL

### 10.4 Website Deployment

**Deploy new website to Vercel:**
- Create new Vercel project
- Connect GitHub repository (website/ directory)
- Set root directory to "website"
- Add environment variables
- Deploy
- Configure custom domain (yourdomain.com)
- Verify SSL certificate
- Test all pages

**Post-deployment:**
- Test registration flow
- Test OTP verification
- Verify emails sent
- Verify WhatsApp OTPs sent

### 10.5 Admin Panel Deployment

**Deploy admin panel to Vercel:**
- Create new Vercel project
- Connect GitHub repository (admin/ directory)
- Set root directory to "admin"
- Add environment variables
- Deploy
- Configure custom subdomain (admin.yourdomain.com)
- Verify SSL certificate
- Test admin login

**Post-deployment:**
- Test admin login
- Test customer management
- Test analytics
- Verify API calls work

### 10.6 DNS Configuration

**Set up DNS records:**

**Main domain (yourdomain.com):**
- A record or CNAME to Vercel (website)

**Subdomain (dashboard.yourdomain.com):**
- CNAME to Vercel (existing dashboard)

**Subdomain (admin.yourdomain.com):**
- CNAME to Vercel (admin panel)

**Subdomain (api.yourdomain.com):**
- CNAME to Render (backend)

**Verify:**
- All domains resolve correctly
- SSL certificates active
- HTTPS enforced

### 10.7 Post-Deployment Verification

**Verify entire system:**
1. Website loads at yourdomain.com
2. Registration works end-to-end
3. OTP emails and WhatsApp messages sent
4. Customer can login to dashboard
5. WhatsApp connection works
6. GHL integration works
7. Admin can login to admin panel
8. Admin can manage customers
9. Background jobs running
10. Notifications sent correctly

**Monitor:**
- Error logs (Render, Vercel)
- Database performance
- API response times
- Email delivery rates
- WhatsApp message delivery

### 10.8 Rollback Plan

**If deployment fails:**
1. Revert backend code to previous version
2. Keep database changes (they're additive, non-breaking)
3. Revert frontend dashboard changes
4. Keep website and admin panel offline until fixed
5. Existing customers can still use old auth (if not removed yet)

**Gradual rollout:**
- Deploy backend first, test
- Deploy database changes, test
- Deploy dashboard updates, test
- Deploy website, test
- Deploy admin panel, test
- Enable new features gradually

---

## Integration Points

### How Customer Access Works

**Registration to Dashboard Flow:**
1. Customer visits website (yourdomain.com)
2. Clicks "Start Free Trial"
3. Fills registration form (email, phone, business name)
4. System sends OTP to email and WhatsApp
5. Customer enters both OTPs
6. System creates customer account with auto-generated password
7. System sends welcome email with credentials
8. Customer clicks dashboard link in email
9. Customer logs in with email and password
10. Customer sees dashboard with trial banner
11. Customer connects WhatsApp (existing functionality)
12. Customer links GHL account (existing functionality)
13. Customer starts using service

**Authentication Flow:**
1. Customer logs in → Backend generates JWT token
2. Frontend stores JWT in localStorage
3. All API calls include JWT in Authorization header
4. Backend middleware verifies JWT
5. Backend attaches customer object to request
6. Subscription middleware checks trial/subscription status
7. If expired, return 403 error
8. Frontend shows upgrade modal

**Session Linking:**
1. Customer creates WhatsApp session in dashboard
2. Backend creates session record with customer_id
3. When messages arrive, backend knows which customer owns session
4. Connection logs link to customer_id
5. Notifications sent to customer's email and phone

### How Admin Controls Work

**Admin Management Flow:**
1. Admin logs into admin panel (admin.yourdomain.com)
2. Admin sees dashboard with all customers
3. Admin can:
   - View customer details
   - Upgrade customer plan
   - Extend trial
   - Suspend/activate account
   - Send notifications
   - View analytics

**Upgrade Process:**
1. Admin selects customer
2. Admin clicks "Upgrade"
3. Admin selects plan (basic/pro/enterprise)
4. Admin enters duration (months)
5. Admin marks payment method
6. System creates subscription record
7. System updates customer.plan and customer.subscription_ends_at
8. System sends upgrade success email to customer
9. Customer can now access dashboard with new plan

**Automation Process:**
1. Background jobs run on schedule
2. Connection monitor checks every 5 minutes
3. Trial/subscription checker runs daily at 9 AM
4. Jobs query database for customers needing notifications
5. Jobs send emails and WhatsApp messages
6. Jobs log all actions to connection_logs and notifications tables
7. Admin can view logs in admin panel

### Database Relationships

**Customer → Sessions:**
- sessions.customer_id → customers.id
- One customer can have multiple WhatsApp sessions
- When customer creates session, customer_id is set

**Customer → GHL Accounts:**
- ghl_accounts.customer_id → customers.id
- One customer can have multiple GHL accounts
- When customer connects GHL, customer_id is set

**Customer → Subscriptions:**
- subscriptions.customer_id → customers.id
- One customer can have multiple subscription records (history)
- Current subscription determined by status='active'

**Customer → Connection Logs:**
- connection_logs.customer_id → customers.id
- Tracks all connection events for customer

**Customer → Notifications:**
- notifications.customer_id → customers.id
- Tracks all notifications sent to customer

---

## Migration Strategy

### Existing Users

**Current situation:**
- Users authenticated via Supabase Auth
- user_id stored in sessions, ghl_accounts, messages tables
- No customer management or subscriptions

**Migration approach:**

**Option 1: Force re-registration (Recommended)**
- All existing users must re-register through new website
- Old data remains in database (orphaned)
- customer_id = NULL for old records
- Admin can manually link old sessions to new customers if needed
- Clean slate for customer management

**Option 2: Automatic migration**
- Create migration script
- For each Supabase Auth user:
  - Create customer record
  - Generate password
  - Send email with new credentials
  - Update sessions.customer_id and ghl_accounts.customer_id
- More complex, higher risk

**Recommended: Option 1**
- Simpler implementation
- Lower risk
- Forces users to verify contact info
- Establishes proper customer records from start

### Data Preservation

**What's preserved:**
- All existing sessions table records
- All existing ghl_accounts table records
- All existing messages table records
- All existing provider_installations records

**What's new:**
- customer_id column added (nullable)
- New registrations populate customer_id
- Old records have customer_id = NULL

**Cleanup:**
- After 30 days, admin can delete orphaned records
- Or keep indefinitely for audit trail

### Communication Plan

**Notify existing users:**
1. Send email 1 week before migration
2. Explain new authentication system
3. Provide registration link
4. Offer support for questions
5. Send reminder 1 day before
6. On migration day, disable old login
7. Redirect to registration page with message

**Email template:**

```
Subject: Important: New Login System - Action Required

Hi,

We're upgrading our authentication system for better security and features.

What you need to do:
1. Register at: [website URL]
2. Verify your email and phone
3. Receive new login credentials
4. Log in to your dashboard

Your WhatsApp connections and data are safe.

Questions? Reply to this email.

Migration date: [date]
```

---

## Success Metrics

### Key Performance Indicators (KPIs)

**Customer Acquisition:**
- New registrations per week
- Registration completion rate (OTP verification)
- Trial to paid conversion rate
- Customer acquisition cost (CAC)

**Revenue:**
- Monthly Recurring Revenue (MRR)
- Average Revenue Per User (ARPU)
- Customer Lifetime Value (CLV)
- Churn rate

**Product Usage:**
- Active customers (daily/weekly/monthly)
- WhatsApp messages sent per customer
- Average session duration
- Feature adoption rate

**Technical:**
- Connection uptime percentage
- API response time
- Background job success rate
- Email delivery rate
- WhatsApp message delivery rate

**Support:**
- Support tickets per customer
- Average resolution time
- Customer satisfaction score

### Monitoring Dashboard

**Create monitoring dashboard:**
- Real-time metrics
- Alerts for critical issues
- Trend analysis
- Comparison with previous periods

**Tools:**
- Backend: Render logs, Sentry for errors
- Frontend: Vercel Analytics
- Database: Supabase Dashboard
- Custom: Admin panel analytics page

---

## Summary

This complete plan transforms the WhatsApp-GHL integration into a full SaaS platform with:

✅ **6 new database tables** for customer management
✅ **Custom JWT authentication** replacing Supabase Auth
✅ **Dual OTP verification** (Email + WhatsApp)
✅ **Automated trial system** with 7-day free trial
✅ **Customer website** for registration and pricing
✅ **Admin panel** for customer and subscription management
✅ **Background automation** for monitoring and notifications
✅ **Email and WhatsApp templates** for all notifications
✅ **Complete testing strategy** for all components
✅ **Deployment guide** for all services

**Total Implementation Time Estimate:** 4-6 weeks

**Team Requirements:**
- 1 Backend Developer (Node.js/PostgreSQL)
- 1 Frontend Developer (Next.js/React)
- 1 DevOps Engineer (Deployment/Monitoring)

**Priority Order:**
1. Phase 1-2: Database + Backend Auth (Week 1-2)
2. Phase 3-4: Automation + Frontend Updates (Week 2-3)
3. Phase 5-6: Website + Admin Panel (Week 3-4)
4. Phase 7-8: Templates + Configuration (Week 4-5)
5. Phase 9-10: Testing + Deployment (Week 5-6)

---

## Implementation Checklist

### Phase 1: Database Schema
- [ ] Create saas-schema.sql with all 6 tables
- [ ] Create indexes for performance
- [ ] Add customer_id to existing tables
- [ ] Create database triggers
- [ ] Create first admin user script
- [ ] Test schema on development database

### Phase 2: Backend Authentication
- [ ] Install dependencies (bcryptjs, jsonwebtoken, nodemailer, node-cron, pg)
- [ ] Create database connection pool
- [ ] Create utility functions (password, OTP, email, WhatsApp, JWT)
- [ ] Create authentication middleware
- [ ] Create customer auth routes
- [ ] Create admin auth routes
- [ ] Create customer API routes
- [ ] Create admin API routes
- [ ] Modify existing server.js
- [ ] Test all endpoints

### Phase 3: Backend Automation
- [ ] Create connection monitor job
- [ ] Create trial expiry checker job
- [ ] Create subscription checker job
- [ ] Create job scheduler
- [ ] Integrate with baileys-wa.js
- [ ] Test all background jobs

### Phase 4: Frontend Authentication
- [ ] Remove Supabase Auth from dashboard
- [ ] Create custom auth client (api.ts)
- [ ] Create auth helpers (auth.ts)
- [ ] Update login page
- [ ] Create forgot/reset password pages
- [ ] Update dashboard layout with subscription check
- [ ] Create subscription banner component
- [ ] Update all dashboard components
- [ ] Test authentication flow

### Phase 5: Customer Website
- [ ] Initialize Next.js project
- [ ] Create landing page
- [ ] Create pricing page
- [ ] Create registration page
- [ ] Create OTP verification page
- [ ] Create login redirect page
- [ ] Create forgot password page
- [ ] Create upgrade page
- [ ] Create website components
- [ ] Create website API client
- [ ] Test all pages

### Phase 6: Admin Panel
- [ ] Initialize Next.js project
- [ ] Create admin login page
- [ ] Create admin dashboard page
- [ ] Create customers list page
- [ ] Create customer details page
- [ ] Create subscriptions page
- [ ] Create notifications page
- [ ] Create settings page
- [ ] Create admin components
- [ ] Create admin API client
- [ ] Create admin layout
- [ ] Test all pages

### Phase 7: Notification Templates
- [ ] Create email templates (8 templates)
- [ ] Create WhatsApp templates (5 templates)
- [ ] Create template rendering utility
- [ ] Test template rendering
- [ ] Test variable replacement

### Phase 8: Environment Configuration
- [ ] Set up backend environment variables
- [ ] Set up dashboard environment variables
- [ ] Set up website environment variables
- [ ] Set up admin panel environment variables
- [ ] Create environment documentation
- [ ] Test all configurations

### Phase 9: Testing
- [ ] Test database schema
- [ ] Test backend API endpoints
- [ ] Test background jobs
- [ ] Test frontend authentication
- [ ] Test website functionality
- [ ] Test admin panel functionality
- [ ] Test email and WhatsApp notifications
- [ ] Perform end-to-end testing
- [ ] Perform security testing
- [ ] Perform load testing

### Phase 10: Deployment
- [ ] Deploy customer database
- [ ] Deploy backend updates
- [ ] Deploy dashboard updates
- [ ] Deploy website
- [ ] Deploy admin panel
- [ ] Configure DNS records
- [ ] Verify entire system
- [ ] Set up monitoring and alerts
- [ ] Create migration communication plan
- [ ] Document all changes

---

**END OF COMPLETE PLAN**

**File:** `WHATSAPP_GHL_SAAS_COMPLETE_PLAN.md`
**Total Lines:** 2500+
**Status:** ✅ COMPLETE

**Next Steps:**
1. Review this plan with your team
2. Set up development environment
3. Begin Phase 1: Database Schema Design
4. Follow the implementation checklist
5. Test each phase before moving to the next

**Questions or Need Clarification?**
- Contact: [Your Contact Info]
- Documentation: [Link to Docs]
- Support: [Support Channel]

