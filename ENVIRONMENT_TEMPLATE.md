# Environment Variables Template

## Backend Environment Variables (.env)

```env
# ===========================================
# EXISTING SUPABASE CONFIGURATION
# ===========================================
SUPABASE_URL=https://your-project.supabase.co
SUPABASE_SERVICE_ROLE_KEY=your_service_role_key_here
SUPABASE_ANON_KEY=your_anon_key_here

# ===========================================
# NEW: SUPABASE DATABASE CONNECTION
# ===========================================
SUPABASE_DB_HOST=db.your-project.supabase.co
SUPABASE_DB_PORT=5432
SUPABASE_DB_NAME=postgres
SUPABASE_DB_USER=postgres
SUPABASE_DB_PASSWORD=your_db_password_here

# ===========================================
# EXISTING GHL CONFIGURATION
# ===========================================
GHL_CLIENT_ID=your_ghl_client_id_here
GHL_CLIENT_SECRET=your_ghl_client_secret_here
GHL_REDIRECT_URI=https://api.yourdomain.com/ghl/callback
GHL_SCOPES=locations.readonly conversations.write conversations.readonly conversations/message.readonly conversations/message.write contacts.readonly contacts.write businesses.readonly users.readonly medias.write

# ===========================================
# NEW: JWT AUTHENTICATION
# ===========================================
# Generate with: node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
CUSTOMER_JWT_SECRET=your_random_customer_jwt_secret_min_32_chars_here
ADMIN_JWT_SECRET=your_random_admin_jwt_secret_min_32_chars_here
JWT_EXPIRES_IN=7d

# ===========================================
# NEW: EMAIL CONFIGURATION (NODEMAILER)
# ===========================================
SMTP_HOST=smtp.gmail.com
SMTP_PORT=587
SMTP_SECURE=false
SMTP_USER=your_email@gmail.com
SMTP_PASS=your_gmail_app_password_here
FROM_EMAIL=noreply@yourdomain.com
FROM_NAME=WhatsApp-GHL Platform

# ===========================================
# NEW: TRIAL SETTINGS
# ===========================================
DEFAULT_TRIAL_DAYS=7

# ===========================================
# NEW: APPLICATION URLs
# ===========================================
WEBSITE_URL=https://yourdomain.com
ADMIN_URL=https://admin.yourdomain.com
DASHBOARD_URL=https://dashboard.yourdomain.com
API_URL=https://api.yourdomain.com

# ===========================================
# NEW: ADMIN WHATSAPP FOR OTPs
# ===========================================
ADMIN_WHATSAPP_SESSION_ID=admin_otp_sender
ADMIN_WHATSAPP_NUMBER=+1234567890

# ===========================================
# EXISTING CONFIGURATION
# ===========================================
PORT=3001
```

## Frontend Environment Variables (.env.local)

### Dashboard (frontend/.env.local)
```env
# ===========================================
# EXISTING SUPABASE CONFIGURATION
# ===========================================
NEXT_PUBLIC_SUPABASE_URL=https://your-project.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=your_anon_key_here

# ===========================================
# NEW: API CONFIGURATION
# ===========================================
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_WEBSITE_URL=https://yourdomain.com
```

### Admin Panel (admin/.env.local)
```env
# ===========================================
# API CONFIGURATION
# ===========================================
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
```

### Customer Website (website/.env.local)
```env
# ===========================================
# API CONFIGURATION
# ===========================================
NEXT_PUBLIC_API_URL=https://api.yourdomain.com
NEXT_PUBLIC_DASHBOARD_URL=https://dashboard.yourdomain.com
```

## How to Generate JWT Secrets

```bash
# Generate random 32-character secrets
node -e "console.log('CUSTOMER_JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
node -e "console.log('ADMIN_JWT_SECRET=' + require('crypto').randomBytes(32).toString('hex'))"
```

## How to Get Gmail App Password

1. Go to [Google Account Settings](https://myaccount.google.com/)
2. Click on "Security" in the left sidebar
3. Enable 2-Factor Authentication if not already enabled
4. Click on "App passwords"
5. Select "Mail" as the app
6. Copy the generated password
7. Use this password in `SMTP_PASS`

## Domain Configuration

Replace `yourdomain.com` with your actual domain:

- `yourdomain.com` → Customer website
- `dashboard.yourdomain.com` → Customer dashboard  
- `admin.yourdomain.com` → Admin panel
- `api.yourdomain.com` → Backend API

## Supabase Configuration

1. Go to your Supabase project dashboard
2. Copy the URL and keys from Settings → API
3. Get database credentials from Settings → Database
4. Use the same database instance for both existing and new tables

## GHL Configuration

1. Go to your GoHighLevel account
2. Navigate to Settings → API
3. Create a new application
4. Copy the Client ID and Client Secret
5. Set the redirect URI to your backend callback URL

## WhatsApp Configuration

1. Use your existing WhatsApp Business account
2. Set up a dedicated session for admin OTP sending
3. Use the session ID in `ADMIN_WHATSAPP_SESSION_ID`
4. Use your WhatsApp Business number in `ADMIN_WHATSAPP_NUMBER`
