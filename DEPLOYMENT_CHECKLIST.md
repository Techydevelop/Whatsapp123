# WhatsApp-GHL SaaS Platform - Deployment Checklist

## 🎯 Pre-Deployment Checklist

### Database Setup
- [ ] Supabase project created
- [ ] Database schema deployed (`database/saas-schema.sql`)
- [ ] First admin user created (`database/create-admin.sql`)
- [ ] Database connection tested
- [ ] Existing tables have `customer_id` columns added

### Backend Configuration
- [ ] All dependencies installed (`bcryptjs`, `jsonwebtoken`, `nodemailer`, `node-cron`, `pg`)
- [ ] Environment variables configured
- [ ] JWT secrets generated (32+ characters)
- [ ] Gmail app password created
- [ ] Admin WhatsApp session configured
- [ ] Backend starts without errors
- [ ] Health check endpoint responds

### Frontend Configuration
- [ ] Dashboard environment variables set
- [ ] Admin panel environment variables set
- [ ] Customer website environment variables set
- [ ] All apps build successfully
- [ ] No TypeScript errors

## 🚀 Deployment Steps

### 1. Backend Deployment (Render)

#### Render Setup
- [ ] Create new Render service
- [ ] Connect GitHub repository
- [ ] Set build command: `cd backend && npm install`
- [ ] Set start command: `cd backend && npm start`
- [ ] Set Node.js version: 18+

#### Environment Variables (Render)
- [ ] `SUPABASE_URL`
- [ ] `SUPABASE_SERVICE_ROLE_KEY`
- [ ] `SUPABASE_ANON_KEY`
- [ ] `SUPABASE_DB_HOST`
- [ ] `SUPABASE_DB_PORT`
- [ ] `SUPABASE_DB_NAME`
- [ ] `SUPABASE_DB_USER`
- [ ] `SUPABASE_DB_PASSWORD`
- [ ] `GHL_CLIENT_ID`
- [ ] `GHL_CLIENT_SECRET`
- [ ] `GHL_REDIRECT_URI`
- [ ] `GHL_SCOPES`
- [ ] `CUSTOMER_JWT_SECRET`
- [ ] `ADMIN_JWT_SECRET`
- [ ] `JWT_EXPIRES_IN`
- [ ] `SMTP_HOST`
- [ ] `SMTP_PORT`
- [ ] `SMTP_SECURE`
- [ ] `SMTP_USER`
- [ ] `SMTP_PASS`
- [ ] `FROM_EMAIL`
- [ ] `FROM_NAME`
- [ ] `DEFAULT_TRIAL_DAYS`
- [ ] `WEBSITE_URL`
- [ ] `ADMIN_URL`
- [ ] `DASHBOARD_URL`
- [ ] `API_URL`
- [ ] `ADMIN_WHATSAPP_SESSION_ID`
- [ ] `ADMIN_WHATSAPP_NUMBER`
- [ ] `PORT`

#### Deploy Backend
- [ ] Deploy to Render
- [ ] Check deployment logs
- [ ] Verify health endpoint: `https://api.yourdomain.com/api/health`
- [ ] Test database connection
- [ ] Verify background jobs started

### 2. Dashboard Deployment (Vercel)

#### Vercel Setup
- [ ] Create new Vercel project
- [ ] Connect GitHub repository
- [ ] Set root directory: `frontend`
- [ ] Set framework: Next.js

#### Environment Variables (Vercel)
- [ ] `NEXT_PUBLIC_SUPABASE_URL`
- [ ] `NEXT_PUBLIC_SUPABASE_ANON_KEY`
- [ ] `NEXT_PUBLIC_API_URL`
- [ ] `NEXT_PUBLIC_WEBSITE_URL`

#### Deploy Dashboard
- [ ] Deploy to Vercel
- [ ] Check build logs
- [ ] Verify dashboard loads
- [ ] Test login functionality

### 3. Admin Panel Deployment (Vercel)

#### Vercel Setup
- [ ] Create new Vercel project
- [ ] Connect GitHub repository
- [ ] Set root directory: `admin`
- [ ] Set framework: Next.js

#### Environment Variables (Vercel)
- [ ] `NEXT_PUBLIC_API_URL`

#### Deploy Admin Panel
- [ ] Deploy to Vercel
- [ ] Check build logs
- [ ] Verify admin panel loads
- [ ] Test admin login

### 4. Customer Website Deployment (Vercel)

#### Vercel Setup
- [ ] Create new Vercel project
- [ ] Connect GitHub repository
- [ ] Set root directory: `website`
- [ ] Set framework: Next.js

#### Environment Variables (Vercel)
- [ ] `NEXT_PUBLIC_API_URL`
- [ ] `NEXT_PUBLIC_DASHBOARD_URL`

#### Deploy Website
- [ ] Deploy to Vercel
- [ ] Check build logs
- [ ] Verify website loads
- [ ] Test registration flow

### 5. DNS Configuration

#### Domain Setup
- [ ] Purchase domain name
- [ ] Configure DNS records:
  - [ ] `yourdomain.com` → Customer website (Vercel)
  - [ ] `dashboard.yourdomain.com` → Customer dashboard (Vercel)
  - [ ] `admin.yourdomain.com` → Admin panel (Vercel)
  - [ ] `api.yourdomain.com` → Backend API (Render)

#### SSL Certificates
- [ ] Verify SSL certificates are active
- [ ] Test HTTPS on all domains
- [ ] Check certificate validity

## 🧪 Post-Deployment Testing

### 1. Backend Testing
- [ ] Health check endpoint responds
- [ ] Database connection works
- [ ] Background jobs are running
- [ ] Email sending works
- [ ] WhatsApp OTP sending works

### 2. Customer Registration Flow
- [ ] Visit `yourdomain.com/register`
- [ ] Fill registration form
- [ ] Receive email OTP
- [ ] Receive WhatsApp OTP
- [ ] Verify OTP codes
- [ ] Receive welcome email
- [ ] Account created successfully

### 3. Admin Panel Testing
- [ ] Visit `admin.yourdomain.com`
- [ ] Login with default credentials
- [ ] View dashboard analytics
- [ ] Create new customer
- [ ] View customer list
- [ ] Test customer management features

### 4. Customer Dashboard Testing
- [ ] Visit `dashboard.yourdomain.com/login`
- [ ] Login with customer credentials
- [ ] View dashboard
- [ ] Create WhatsApp session
- [ ] Connect GHL account
- [ ] Test message sending

### 5. Integration Testing
- [ ] WhatsApp connection works
- [ ] GHL integration works
- [ ] Messages sync between WhatsApp and GHL
- [ ] Connection monitoring works
- [ ] Notifications are sent

## 🔍 Monitoring Setup

### 1. Error Monitoring
- [ ] Set up error tracking (Sentry recommended)
- [ ] Monitor backend errors
- [ ] Monitor frontend errors
- [ ] Set up alerts for critical errors

### 2. Performance Monitoring
- [ ] Monitor API response times
- [ ] Monitor database performance
- [ ] Monitor background job performance
- [ ] Set up performance alerts

### 3. Business Metrics
- [ ] Track customer registrations
- [ ] Track trial conversions
- [ ] Monitor subscription renewals
- [ ] Track customer churn

## 🔒 Security Checklist

### 1. Authentication & Authorization
- [ ] Default admin password changed
- [ ] Strong JWT secrets used
- [ ] Token expiry configured
- [ ] Rate limiting enabled

### 2. Data Protection
- [ ] Database backups configured
- [ ] Sensitive data encrypted
- [ ] API endpoints secured
- [ ] CORS policies configured

### 3. Infrastructure Security
- [ ] HTTPS enforced on all domains
- [ ] Security headers configured
- [ ] Dependencies updated
- [ ] Environment variables secured

## 📊 Go-Live Checklist

### Final Verification
- [ ] All deployments successful
- [ ] All tests passing
- [ ] Monitoring configured
- [ ] Security measures in place
- [ ] Documentation updated
- [ ] Support processes ready

### Launch Preparation
- [ ] Announcement prepared
- [ ] Support team trained
- [ ] Monitoring dashboards ready
- [ ] Rollback plan prepared
- [ ] Launch date confirmed

## 🎉 Launch!

Once all items are checked:

1. **Update DNS** to point to production domains
2. **Monitor** all systems closely for first 24 hours
3. **Test** customer registration flow end-to-end
4. **Verify** all integrations work correctly
5. **Announce** the launch to your users

## 📞 Post-Launch Support

### Immediate Actions (First 24 Hours)
- [ ] Monitor error logs
- [ ] Check customer registrations
- [ ] Verify email delivery
- [ ] Test WhatsApp connections
- [ ] Monitor background jobs

### First Week
- [ ] Review customer feedback
- [ ] Monitor system performance
- [ ] Check subscription conversions
- [ ] Update documentation based on issues
- [ ] Plan improvements

### Ongoing
- [ ] Regular security updates
- [ ] Performance optimization
- [ ] Feature enhancements
- [ ] Customer support
- [ ] Business growth monitoring

---

**Congratulations! Your WhatsApp-GHL SaaS platform is now live! 🚀**
