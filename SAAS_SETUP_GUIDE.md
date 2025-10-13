# WhatsApp-GHL SaaS Platform - Complete Setup Guide

## 🎯 Overview

This guide will help you set up the complete WhatsApp-GHL SaaS platform with customer management, admin panel, and automated notifications.

## 📋 Prerequisites

- Node.js 18+ installed
- PostgreSQL database (Supabase recommended)
- Gmail account for email sending
- WhatsApp Business account for OTP sending
- Domain name (optional, for production)

## 🗄️ Database Setup

### Step 1: Create Database Schema

1. **Connect to your Supabase database:**
   ```bash
   # Option A: Using Supabase SQL Editor
   # Go to Supabase Dashboard → SQL Editor
   # Copy and paste the content from database/saas-schema.sql
   
   # Option B: Using psql command line
   psql -h db.your-project.supabase.co -p 5432 -U postgres -d postgres -f database/saas-schema.sql
   ```

2. **Create first admin user:**
   ```bash
   psql -h db.your-project.supabase.co -p 5432 -U postgres -d postgres -f database/create-admin.sql
   ```

### Step 2: Verify Database Setup

Check that these tables were created:
- `customers`
- `admin_users`
- `subscriptions`
- `connection_logs`
- `notifications`
- `otp_verifications`

And that these columns were added to existing tables:
- `sessions.customer_id`
- `ghl_accounts.customer_id`

## 🔧 Backend Configuration

### Step 1: Install Dependencies

```bash
cd backend
npm install bcryptjs jsonwebtoken nodemailer node-cron pg
```

### Step 2: Environment Variables

Create `backend/.env` file with these variables:

```env
# Existing Supabase Configuration
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key
SUPABASE_ANON_KEY=your_anon_key

# NEW: Supabase Database Connection (same instance)
SUPABASE_DB_HOST=db.your-project.supabase.co
SUPABASE_DB_PORT=5432
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres
SUPABASE_DB_PASSWORD=your_db_password

# Existing GHL Configuration
GHL_CLIENT_ID=your_ghl_client_id
GHL_CLIENT_SECRET=your_ghl_client_secret
GHL_REDIRECT_URI=https://api.yourdomain.com/ghl/callback
GHL_SCOPES=locations.readonly conversations.write conversations.readonly conversations/message.readonly conversations/message.write contacts.readonly contacts.write businesses.readonly users.readonly medias.write

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

# Existing Configuration
PORT=3001
```

### Step 3: Generate JWT Secrets

```bash
# Generate random secrets (32+ characters)
node -e "console.log('CUSTOMER_JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('ADMIN_JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

### Step 4: Gmail App Password

1. Go to Google Account settings
2. Enable 2-factor authentication
3. Generate an App Password for "Mail"
4. Use this password in `SMTP_PASS`

### Step 5: Test Backend

```bash
cd backend
npm start
```

Check that you see:
- ✅ Customer database connected successfully
- ✅ Background jobs initialized successfully
- Server running on port 3001

## 🎨 Frontend Configuration

### Step 1: Dashboard (Existing)

Update `frontend/.env.local`:

```env
# Existing
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key

# NEW
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_WEBSITE_URL=https://yourdomain.com
```

### Step 2: Admin Panel

Update `admin/.env.local`:

```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

### Step 3: Customer Website

Update `website/.env.local`:

```env
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_DASHBOARD_URL=https://dashboard.yourdomain.com
```

## 🚀 Deployment Guide

### Backend Deployment (Render)

1. **Connect GitHub repository to Render**
2. **Set build command:** `cd backend && npm install`
3. **Set start command:** `cd backend && npm start`
4. **Add environment variables** (all from backend/.env)
5. **Deploy**

### Frontend Deployments (Vercel)

#### Dashboard Deployment

1. **Create new Vercel project**
2. **Connect GitHub repository**
3. **Set root directory:** `frontend`
4. **Add environment variables** (from frontend/.env.local)
5. **Deploy**

#### Admin Panel Deployment

1. **Create new Vercel project**
2. **Connect GitHub repository**
3. **Set root directory:** `admin`
4. **Add environment variables** (from admin/.env.local)
5. **Deploy**

#### Customer Website Deployment

1. **Create new Vercel project**
2. **Connect GitHub repository**
3. **Set root directory:** `website`
4. **Add environment variables** (from website/.env.local)
5. **Deploy**

### DNS Configuration

Set up these domains:

```
yourdomain.com          → Customer website (Vercel)
dashboard.yourdomain.com → Customer dashboard (Vercel)
admin.yourdomain.com    → Admin panel (Vercel)
api.yourdomain.com      → Backend API (Render)
```

## 🧪 Testing Guide

### Step 1: Test Database

```bash
# Test database connection
curl https://api.yourdomain.com/api/health
```

Expected response:
```json
{
  "status": "healthy",
  "timestamp": "2024-01-01T00:00:00.000Z",
  "services": {
    "whatsapp": "active",
    "ghl": "active",
    "database": "active",
    "saas": "active"
  }
}
```

### Step 2: Test Customer Registration

1. Go to `yourdomain.com/register`
2. Fill out registration form
3. Check email and WhatsApp for OTP codes
4. Verify OTP codes
5. Check email for welcome message with credentials

### Step 3: Test Admin Login

1. Go to `admin.yourdomain.com`
2. Login with default credentials:
   - Email: `admin@yourdomain.com`
   - Password: `Admin@123456`
3. Verify dashboard loads with analytics

### Step 4: Test Customer Login

1. Go to `dashboard.yourdomain.com/login`
2. Login with credentials from welcome email
3. Verify dashboard loads

### Step 5: Test WhatsApp Connection

1. In customer dashboard, create new WhatsApp session
2. Scan QR code with WhatsApp Business
3. Verify connection status shows "connected"
4. Test sending a message

### Step 6: Test GHL Integration

1. In customer dashboard, connect GHL account
2. Authorize with GoHighLevel
3. Verify GHL account appears in dashboard

## 🔍 Troubleshooting

### Common Issues

**1. Database Connection Failed**
- Check Supabase credentials
- Verify database host and port
- Ensure SSL is enabled

**2. Email Not Sending**
- Check Gmail app password
- Verify SMTP settings
- Check spam folder

**3. WhatsApp OTP Not Sending**
- Verify admin WhatsApp session is connected
- Check ADMIN_WHATSAPP_SESSION_ID
- Ensure phone number format is correct

**4. JWT Token Errors**
- Verify JWT secrets are 32+ characters
- Check token expiry settings
- Ensure secrets match between backend and frontend

**5. Background Jobs Not Running**
- Check server logs for scheduler errors
- Verify cron job syntax
- Check database permissions

### Debug Commands

```bash
# Check backend logs
cd backend && npm start

# Test database connection
node -e "
const { query } = require('./config/customerDb');
query('SELECT COUNT(*) FROM customers').then(r => console.log('Customers:', r.rows[0])).catch(console.error);
"

# Test email configuration
node -e "
const { testEmailConfiguration } = require('./utils/email');
testEmailConfiguration().then(console.log).catch(console.error);
"

# Test WhatsApp configuration
node -e "
const { testWhatsAppConfiguration } = require('./utils/whatsapp-notification');
testWhatsAppConfiguration().then(console.log).catch(console.error);
"
```

## 📊 Monitoring

### Health Checks

- **Backend:** `https://api.yourdomain.com/api/health`
- **Database:** Check Supabase dashboard
- **Background Jobs:** Check server logs

### Key Metrics to Monitor

- Customer registrations per day
- WhatsApp connection uptime
- Email delivery rates
- Background job success rates
- API response times

## 🔒 Security Checklist

- [ ] Change default admin password
- [ ] Use strong JWT secrets (32+ characters)
- [ ] Enable HTTPS on all domains
- [ ] Set up proper CORS policies
- [ ] Regular database backups
- [ ] Monitor failed login attempts
- [ ] Keep dependencies updated

## 📞 Support

If you encounter issues:

1. Check the troubleshooting section above
2. Review server logs for error messages
3. Verify all environment variables are set correctly
4. Test each component individually
5. Contact support with specific error messages

## 🎉 Success!

Once everything is set up and tested, you'll have:

✅ **Complete SaaS Platform** with customer management
✅ **Admin Panel** for customer and subscription management  
✅ **Customer Website** for registration and pricing
✅ **Automated Notifications** for trials and subscriptions
✅ **Real-time Monitoring** of WhatsApp connections
✅ **Background Jobs** for maintenance and notifications

Your WhatsApp-GHL SaaS platform is now ready for customers! 🚀
