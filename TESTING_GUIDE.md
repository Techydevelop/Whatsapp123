# WhatsApp-GHL SaaS Platform - Testing Guide

## 🎯 Overview

This guide provides comprehensive testing procedures for the WhatsApp-GHL SaaS platform to ensure all features work correctly before and after deployment.

## 🧪 Testing Environment Setup

### Prerequisites
- [ ] Backend deployed and running
- [ ] All frontend apps deployed
- [ ] Database schema deployed
- [ ] Environment variables configured
- [ ] Admin user created
- [ ] Test email account ready
- [ ] Test WhatsApp Business account ready

### Test Data Preparation
- [ ] Test email addresses
- [ ] Test phone numbers
- [ ] Test GHL account credentials
- [ ] Test customer data

## 🔍 Backend API Testing

### 1. Health Check Endpoint

**Endpoint:** `GET /api/health`

**Expected Response:**
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

**Test Steps:**
1. Send GET request to health endpoint
2. Verify status is "healthy"
3. Verify all services show "active"
4. Check response time < 1 second

### 2. Customer Registration Flow

**Endpoint:** `POST /api/saas/customers/register`

**Test Data:**
```json
{
  "email": "test@example.com",
  "phone": "+1234567890",
  "businessName": "Test Business",
  "password": "TestPassword123!"
}
```

**Test Steps:**
1. Send registration request
2. Verify response contains `otpId`
3. Check email for OTP code
4. Check WhatsApp for OTP code
5. Verify OTP codes are different
6. Test OTP verification endpoints
7. Verify customer account created
8. Check welcome email sent

### 3. Customer Authentication

**Endpoint:** `POST /api/saas/customers/login`

**Test Steps:**
1. Login with valid credentials
2. Verify JWT token returned
3. Test token validation
4. Test protected endpoints
5. Test token expiry
6. Test invalid credentials

### 4. Admin Authentication

**Endpoint:** `POST /api/saas/admin/login`

**Test Steps:**
1. Login with default admin credentials
2. Verify admin JWT token returned
3. Test admin-only endpoints
4. Test token validation
5. Test invalid credentials

### 5. Background Jobs Testing

**Test Steps:**
1. Check server logs for scheduler initialization
2. Verify cron jobs are registered
3. Test trial expiry checks
4. Test subscription expiry checks
5. Test connection monitoring
6. Test notification sending

## 🎨 Frontend Testing

### 1. Customer Website Testing

**URL:** `https://yourdomain.com`

**Test Scenarios:**

#### Homepage
- [ ] Page loads correctly
- [ ] All sections display properly
- [ ] Navigation works
- [ ] Pricing cards show correct information
- [ ] CTA buttons work

#### Registration Flow
- [ ] Registration form loads
- [ ] Form validation works
- [ ] Email format validation
- [ ] Phone format validation
- [ ] Password strength validation
- [ ] Submit button works
- [ ] OTP verification pages load
- [ ] Success page displays

#### Login Flow
- [ ] Login form loads
- [ ] Form validation works
- [ ] Invalid credentials show error
- [ ] Valid credentials redirect to dashboard
- [ ] Remember me functionality works

### 2. Customer Dashboard Testing

**URL:** `https://dashboard.yourdomain.com`

**Test Scenarios:**

#### Dashboard Overview
- [ ] Dashboard loads after login
- [ ] Statistics display correctly
- [ ] Recent activity shows
- [ ] Quick actions work
- [ ] Navigation menu works

#### WhatsApp Management
- [ ] Create new session button works
- [ ] QR code displays
- [ ] Connection status updates
- [ ] Session list shows correctly
- [ ] Delete session works

#### GHL Integration
- [ ] Connect GHL button works
- [ ] Authorization flow works
- [ ] GHL account displays
- [ ] Disconnect GHL works

#### Settings
- [ ] Profile settings load
- [ ] Update profile works
- [ ] Change password works
- [ ] Logout works

### 3. Admin Panel Testing

**URL:** `https://admin.yourdomain.com`

**Test Scenarios:**

#### Admin Login
- [ ] Login form loads
- [ ] Default credentials work
- [ ] Invalid credentials show error
- [ ] Login redirects to dashboard

#### Dashboard Analytics
- [ ] Total customers displays
- [ ] Active trials shows
- [ ] Revenue metrics display
- [ ] Recent registrations show
- [ ] Charts render correctly

#### Customer Management
- [ ] Customer list loads
- [ ] Search functionality works
- [ ] Filter by status works
- [ ] View customer details works
- [ ] Edit customer works
- [ ] Suspend/activate customer works

#### Subscription Management
- [ ] Subscription list loads
- [ ] Create subscription works
- [ ] Update subscription works
- [ ] Cancel subscription works
- [ ] Payment tracking works

## 🔗 Integration Testing

### 1. WhatsApp Integration

**Test Scenarios:**

#### Connection Flow
- [ ] Create new WhatsApp session
- [ ] QR code generates
- [ ] Scan QR code with WhatsApp Business
- [ ] Connection status updates to "connected"
- [ ] Session appears in dashboard

#### Message Sending
- [ ] Send test message from dashboard
- [ ] Message appears in WhatsApp
- [ ] Message status updates
- [ ] Error handling works

#### Connection Monitoring
- [ ] Disconnect WhatsApp
- [ ] Connection status updates to "disconnected"
- [ ] Reconnection works
- [ ] Connection logs recorded

### 2. GHL Integration

**Test Scenarios:**

#### Authorization Flow
- [ ] Click connect GHL
- [ ] Redirect to GHL authorization
- [ ] Authorize application
- [ ] Return to dashboard
- [ ] GHL account displays

#### Data Sync
- [ ] Send message from WhatsApp
- [ ] Message appears in GHL
- [ ] Contact sync works
- [ ] Conversation sync works

#### Disconnection
- [ ] Disconnect GHL account
- [ ] Account removed from dashboard
- [ ] Reconnection works

### 3. Email Integration

**Test Scenarios:**

#### Registration Emails
- [ ] OTP email sent
- [ ] Welcome email sent
- [ ] Email format correct
- [ ] Links work correctly

#### Notification Emails
- [ ] Trial expiry emails sent
- [ ] Subscription expiry emails sent
- [ ] Connection lost emails sent
- [ ] Email templates render correctly

### 4. WhatsApp Notifications

**Test Scenarios:**

#### OTP Notifications
- [ ] OTP sent to WhatsApp
- [ ] Message format correct
- [ ] OTP code matches email

#### System Notifications
- [ ] Trial expiry notifications sent
- [ ] Connection lost notifications sent
- [ ] Message format correct

## 🚨 Error Handling Testing

### 1. Network Errors
- [ ] Backend unavailable
- [ ] Database connection lost
- [ ] External API failures
- [ ] Timeout handling

### 2. Validation Errors
- [ ] Invalid email format
- [ ] Invalid phone format
- [ ] Weak password
- [ ] Missing required fields

### 3. Authentication Errors
- [ ] Invalid JWT token
- [ ] Expired token
- [ ] Invalid credentials
- [ ] Unauthorized access

### 4. Business Logic Errors
- [ ] Duplicate email registration
- [ ] Invalid OTP codes
- [ ] Expired OTP codes
- [ ] Trial already used

## 📊 Performance Testing

### 1. Load Testing
- [ ] Multiple concurrent registrations
- [ ] Multiple concurrent logins
- [ ] Dashboard load with many sessions
- [ ] Admin panel with many customers

### 2. Response Time Testing
- [ ] API response times < 2 seconds
- [ ] Page load times < 3 seconds
- [ ] Database query performance
- [ ] Background job performance

### 3. Resource Usage
- [ ] Memory usage monitoring
- [ ] CPU usage monitoring
- [ ] Database connection pooling
- [ ] File system usage

## 🔒 Security Testing

### 1. Authentication Security
- [ ] Password hashing
- [ ] JWT token security
- [ ] Session management
- [ ] Rate limiting

### 2. Data Protection
- [ ] Sensitive data encryption
- [ ] SQL injection prevention
- [ ] XSS prevention
- [ ] CSRF protection

### 3. API Security
- [ ] CORS configuration
- [ ] Input validation
- [ ] Output sanitization
- [ ] Error message security

## 📱 Mobile Testing

### 1. Responsive Design
- [ ] Mobile viewport testing
- [ ] Tablet viewport testing
- [ ] Desktop viewport testing
- [ ] Touch interactions

### 2. Mobile-Specific Features
- [ ] QR code scanning
- [ ] Touch gestures
- [ ] Mobile navigation
- [ ] Mobile forms

## 🧪 Automated Testing

### 1. Unit Tests
- [ ] API endpoint tests
- [ ] Utility function tests
- [ ] Database query tests
- [ ] Email service tests

### 2. Integration Tests
- [ ] End-to-end registration flow
- [ ] WhatsApp connection flow
- [ ] GHL integration flow
- [ ] Email notification flow

### 3. E2E Tests
- [ ] Complete customer journey
- [ ] Admin management flow
- [ ] Error handling scenarios
- [ ] Performance scenarios

## 📋 Test Results Documentation

### Test Report Template

```
Test Date: [DATE]
Tester: [NAME]
Environment: [PRODUCTION/STAGING]
Version: [VERSION]

## Test Results Summary
- Total Tests: [NUMBER]
- Passed: [NUMBER]
- Failed: [NUMBER]
- Skipped: [NUMBER]

## Failed Tests
1. [TEST NAME] - [DESCRIPTION] - [STATUS]
2. [TEST NAME] - [DESCRIPTION] - [STATUS]

## Critical Issues
1. [ISSUE DESCRIPTION]
2. [ISSUE DESCRIPTION]

## Recommendations
1. [RECOMMENDATION]
2. [RECOMMENDATION]
```

## 🚀 Go-Live Testing

### Pre-Launch Checklist
- [ ] All critical tests passed
- [ ] Performance benchmarks met
- [ ] Security tests passed
- [ ] Error handling verified
- [ ] Mobile compatibility confirmed
- [ ] Integration tests passed

### Post-Launch Monitoring
- [ ] Monitor error rates
- [ ] Monitor performance metrics
- [ ] Monitor user feedback
- [ ] Monitor system health
- [ ] Monitor business metrics

## 📞 Testing Support

### Common Issues and Solutions

**1. Email Not Sending**
- Check SMTP configuration
- Verify Gmail app password
- Check spam folder
- Test with different email providers

**2. WhatsApp OTP Not Sending**
- Verify admin WhatsApp session
- Check phone number format
- Verify session ID configuration
- Test with different numbers

**3. Database Connection Issues**
- Check Supabase credentials
- Verify database host and port
- Check SSL configuration
- Test connection string

**4. Frontend Build Errors**
- Check environment variables
- Verify API URLs
- Check TypeScript errors
- Verify dependencies

### Debug Commands

```bash
# Test backend health
curl https://api.yourdomain.com/api/health

# Test database connection
node -e "
const { query } = require('./backend/config/customerDb');
query('SELECT COUNT(*) FROM customers').then(r => console.log('Customers:', r.rows[0])).catch(console.error);
"

# Test email configuration
node -e "
const { testEmailConfiguration } = require('./backend/utils/email');
testEmailConfiguration().then(console.log).catch(console.error);
"

# Test WhatsApp configuration
node -e "
const { testWhatsAppConfiguration } = require('./backend/utils/whatsapp-notification');
testWhatsAppConfiguration().then(console.log).catch(console.error);
"
```

---

**Remember:** Thorough testing ensures a smooth launch and happy customers! 🎯
