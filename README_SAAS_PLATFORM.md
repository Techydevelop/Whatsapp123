# WhatsApp-GHL SaaS Platform

## 🎯 Overview

A complete **Software-as-a-Service (SaaS)** platform that provides WhatsApp Business integration with GoHighLevel CRM. The platform includes customer management, subscription handling, automated notifications, and a comprehensive admin panel.

## ✨ Key Features

### 🏢 **Customer Management**
- **Dual OTP Verification**: Email + WhatsApp OTP for secure registration
- **Automated Trial System**: 7-day free trial with auto-generated credentials
- **Subscription Management**: Basic, Pro, and Enterprise plans
- **Customer Dashboard**: Real-time WhatsApp and GHL integration management

### 🔧 **Admin Panel**
- **Customer Analytics**: Total customers, active trials, revenue metrics
- **Subscription Management**: Create, update, and track customer subscriptions
- **Customer Support**: View customer details, suspend/activate accounts
- **System Monitoring**: Connection status, background job monitoring

### 🤖 **Automation & Notifications**
- **Connection Monitoring**: Real-time WhatsApp connection status tracking
- **Trial Management**: Automated trial expiry notifications and account suspension
- **Subscription Alerts**: Renewal reminders and expiry notifications
- **System Notifications**: Connection lost alerts and system status updates

### 🔗 **Integrations**
- **WhatsApp Business**: QR-based connection with real-time status monitoring
- **GoHighLevel CRM**: Seamless contact and conversation synchronization
- **Email System**: Automated welcome emails, notifications, and alerts
- **Background Jobs**: Automated maintenance and monitoring tasks

## 🏗️ Architecture

### **Backend (Node.js + Express)**
- **Customer Management API**: Registration, authentication, profile management
- **Admin API**: Customer management, subscription handling, analytics
- **WhatsApp Integration**: Baileys-based WhatsApp Business connection
- **GHL Integration**: GoHighLevel CRM synchronization
- **Background Jobs**: Automated trial/subscription management
- **Notification System**: Email and WhatsApp notifications

### **Frontend Applications**
- **Customer Website**: Public registration and pricing pages
- **Customer Dashboard**: WhatsApp and GHL management interface
- **Admin Panel**: Customer and subscription management dashboard

### **Database (PostgreSQL)**
- **Customer Tables**: `customers`, `subscriptions`, `otp_verifications`
- **Admin Tables**: `admin_users`
- **Monitoring Tables**: `connection_logs`, `notifications`
- **Existing Tables**: Enhanced with `customer_id` for multi-tenancy

## 🚀 Quick Start

### 1. **Database Setup**
```bash
# Deploy database schema
psql -h db.your-project.supabase.co -p 5432 -U postgres -d postgres -f database/saas-schema.sql

# Create first admin user
psql -h db.your-project.supabase.co -p 5432 -U postgres -d postgres -f database/create-admin.sql
```

### 2. **Backend Setup**
```bash
cd backend
npm install bcryptjs jsonwebtoken nodemailer node-cron pg
npm start
```

### 3. **Frontend Setup**
```bash
# Customer Dashboard
cd frontend
npm install
npm run dev

# Admin Panel
cd admin
npm install
npm run dev

# Customer Website
cd website
npm install
npm run dev
```

### 4. **Environment Configuration**
See `ENVIRONMENT_TEMPLATE.md` for complete environment variable setup.

## 📁 Project Structure

```
Whatsapp123/
├── backend/                 # Node.js + Express API
│   ├── config/             # Database and service configurations
│   ├── lib/                # WhatsApp and GHL integration libraries
│   ├── routes/             # API route handlers
│   ├── utils/              # Utility functions and services
│   └── server.js           # Main server file
├── frontend/               # Customer Dashboard (Next.js)
│   ├── app/                # App router pages
│   ├── components/         # React components
│   └── lib/                # Utility functions
├── admin/                  # Admin Panel (Next.js)
│   ├── app/                # App router pages
│   ├── components/         # React components
│   └── lib/                # Utility functions
├── website/                # Customer Website (Next.js)
│   ├── app/                # App router pages
│   ├── components/         # React components
│   └── lib/                # Utility functions
├── database/               # Database schemas and migrations
│   ├── saas-schema.sql     # Complete SaaS database schema
│   └── create-admin.sql    # First admin user creation
└── docs/                   # Documentation
    ├── SAAS_SETUP_GUIDE.md
    ├── DEPLOYMENT_CHECKLIST.md
    ├── TESTING_GUIDE.md
    └── ENVIRONMENT_TEMPLATE.md
```

## 🔧 Configuration

### **Environment Variables**
- **Database**: Supabase PostgreSQL connection
- **Authentication**: JWT secrets for customer and admin tokens
- **Email**: SMTP configuration for notifications
- **WhatsApp**: Admin session for OTP sending
- **GHL**: GoHighLevel API credentials
- **URLs**: Frontend and backend application URLs

### **Database Schema**
- **6 new tables** for SaaS functionality
- **Enhanced existing tables** with customer_id for multi-tenancy
- **Indexes and triggers** for performance and data integrity
- **UUID primary keys** for security

## 🎨 User Interfaces

### **Customer Website** (`yourdomain.com`)
- **Landing Page**: Hero section, features, pricing
- **Registration**: Multi-step form with OTP verification
- **Login**: Secure authentication with JWT tokens
- **Pricing**: Clear plan comparison and features

### **Customer Dashboard** (`dashboard.yourdomain.com`)
- **Overview**: Statistics, recent activity, quick actions
- **WhatsApp Management**: Create sessions, view connections, send messages
- **GHL Integration**: Connect accounts, view contacts, manage conversations
- **Settings**: Profile management, password changes, account settings

### **Admin Panel** (`admin.yourdomain.com`)
- **Analytics Dashboard**: Customer metrics, revenue tracking, system health
- **Customer Management**: View, edit, suspend/activate customer accounts
- **Subscription Management**: Create, update, track customer subscriptions
- **System Monitoring**: Background jobs, connection status, notifications

## 🔄 Workflows

### **Customer Registration Flow**
1. **Registration Form**: Customer fills out business details
2. **OTP Verification**: Email and WhatsApp OTP codes sent
3. **Account Creation**: Customer account created with trial status
4. **Welcome Email**: Credentials and setup instructions sent
5. **Dashboard Access**: Customer can access dashboard immediately

### **Trial Management Flow**
1. **Trial Start**: 7-day trial begins automatically
2. **Monitoring**: Background jobs track trial status
3. **Notifications**: 3-day and 1-day expiry reminders sent
4. **Expiry**: Account suspended if no subscription created
5. **Reactivation**: Account reactivated upon subscription

### **WhatsApp Connection Flow**
1. **Session Creation**: Customer creates new WhatsApp session
2. **QR Generation**: QR code displayed for scanning
3. **Connection**: WhatsApp Business account connected
4. **Monitoring**: Real-time connection status tracking
5. **Integration**: Messages sync with GHL automatically

## 🚀 Deployment

### **Backend (Render)**
- **Build Command**: `cd backend && npm install`
- **Start Command**: `cd backend && npm start`
- **Environment**: All backend environment variables
- **Health Check**: `/api/health` endpoint

### **Frontend (Vercel)**
- **Dashboard**: Root directory `frontend`
- **Admin Panel**: Root directory `admin`
- **Website**: Root directory `website`
- **Environment**: Respective frontend environment variables

### **DNS Configuration**
- `yourdomain.com` → Customer website
- `dashboard.yourdomain.com` → Customer dashboard
- `admin.yourdomain.com` → Admin panel
- `api.yourdomain.com` → Backend API

## 🧪 Testing

### **Automated Testing**
- **API Tests**: All endpoints with various scenarios
- **Integration Tests**: WhatsApp, GHL, email integrations
- **E2E Tests**: Complete user journeys
- **Performance Tests**: Load and response time testing

### **Manual Testing**
- **Registration Flow**: End-to-end customer registration
- **Admin Functions**: Customer and subscription management
- **Integration Testing**: WhatsApp and GHL connections
- **Error Handling**: Network failures and edge cases

## 📊 Monitoring

### **Health Checks**
- **Backend Health**: `/api/health` endpoint
- **Database Status**: Connection and query performance
- **Background Jobs**: Scheduler and job execution status
- **External APIs**: WhatsApp and GHL service status

### **Business Metrics**
- **Customer Growth**: Registration and conversion rates
- **Revenue Tracking**: Subscription and payment metrics
- **System Usage**: API calls, active sessions, message volume
- **Error Rates**: Failed requests and system errors

## 🔒 Security

### **Authentication & Authorization**
- **JWT Tokens**: Secure customer and admin authentication
- **Password Hashing**: bcrypt with salt rounds
- **Rate Limiting**: API endpoint protection
- **CORS Configuration**: Cross-origin request security

### **Data Protection**
- **Database Security**: Encrypted connections and access control
- **Input Validation**: SQL injection and XSS prevention
- **Error Handling**: Secure error messages
- **Audit Logging**: Customer and admin action tracking

## 📈 Business Model

### **Subscription Plans**
- **Trial**: 7-day free trial with full features
- **Basic**: $29/month - 1 WhatsApp session, 1 GHL account
- **Pro**: $79/month - 3 WhatsApp sessions, 3 GHL accounts
- **Enterprise**: $199/month - Unlimited sessions and accounts

### **Revenue Streams**
- **Monthly Subscriptions**: Recurring revenue from active customers
- **Trial Conversions**: Free trial to paid subscription conversion
- **Customer Retention**: Automated renewal and upgrade notifications
- **Support Services**: Premium support and custom integrations

## 🛠️ Development

### **Tech Stack**
- **Backend**: Node.js, Express, PostgreSQL, Baileys, GoHighLevel API
- **Frontend**: Next.js 15, TypeScript, Tailwind CSS, React
- **Database**: Supabase PostgreSQL with real-time subscriptions
- **Deployment**: Render (backend), Vercel (frontend)
- **Monitoring**: Built-in health checks and logging

### **Key Dependencies**
- **Authentication**: `jsonwebtoken`, `bcryptjs`
- **Email**: `nodemailer`
- **Scheduling**: `node-cron`
- **Database**: `pg` (PostgreSQL client)
- **WhatsApp**: `@whiskeysockets/baileys`
- **Frontend**: `next`, `react`, `tailwindcss`

## 📚 Documentation

- **[Complete Setup Guide](SAAS_SETUP_GUIDE.md)**: Step-by-step setup instructions
- **[Deployment Checklist](DEPLOYMENT_CHECKLIST.md)**: Pre and post-deployment checklist
- **[Testing Guide](TESTING_GUIDE.md)**: Comprehensive testing procedures
- **[Environment Template](ENVIRONMENT_TEMPLATE.md)**: Environment variable configuration
- **[Complete Plan](WHATSAPP_GHL_SAAS_COMPLETE_PLAN.md)**: Detailed implementation plan

## 🎯 Success Metrics

### **Technical Metrics**
- **Uptime**: 99.9% system availability
- **Performance**: < 2 second API response times
- **Reliability**: < 1% error rate
- **Security**: Zero security incidents

### **Business Metrics**
- **Customer Growth**: 20% month-over-month growth
- **Trial Conversion**: 15% trial to paid conversion rate
- **Customer Retention**: 90% monthly retention rate
- **Revenue Growth**: 25% month-over-month revenue growth

## 🚀 Future Enhancements

### **Phase 2 Features**
- **Payment Integration**: Stripe/PayPal subscription management
- **Advanced Analytics**: Customer behavior and usage analytics
- **API Access**: RESTful API for third-party integrations
- **Mobile App**: React Native mobile application

### **Phase 3 Features**
- **White-label Solution**: Customizable branding and domains
- **Multi-language Support**: Internationalization and localization
- **Advanced Automation**: Workflow automation and triggers
- **Enterprise Features**: SSO, advanced security, custom integrations

---

## 🎉 Ready to Launch!

Your WhatsApp-GHL SaaS platform is now ready for customers! The platform provides:

✅ **Complete customer management** with automated trials and subscriptions
✅ **Professional admin panel** for customer and subscription management
✅ **Automated notifications** for trials, subscriptions, and system alerts
✅ **Real-time monitoring** of WhatsApp connections and system health
✅ **Background automation** for maintenance and customer management
✅ **Scalable architecture** ready for growth and expansion

**Start your SaaS journey today!** 🚀
