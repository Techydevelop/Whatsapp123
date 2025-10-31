const { createClient } = require('@supabase/supabase-js');

// Email service for sending notifications
class EmailService {
  constructor() {
    this.supabaseUrl = process.env.SUPABASE_URL;
    this.supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
    this.supabaseAdmin = createClient(this.supabaseUrl, this.supabaseKey);
  }

  /**
   * Send connection lost email notification to user
   * @param {string} userId - User ID
   * @param {string} locationId - GHL Location ID
   * @param {string} reason - Reason for disconnect (mobile/logout)
   */
  async sendDisconnectNotification(userId, locationId, reason = 'mobile') {
    try {
      console.log(`📧 Preparing disconnect email for user: ${userId}, location: ${locationId}, reason: ${reason}`);

      // Get user email from database
      const { data: user, error: userError } = await this.supabaseAdmin
        .from('users')
        .select('id, email, name')
        .eq('id', userId)
        .maybeSingle();

      if (userError || !user) {
        console.error('❌ Failed to fetch user for email:', userError);
        return { success: false, error: 'User not found' };
      }

      if (!user.email) {
        console.error('❌ User email not found');
        return { success: false, error: 'User email not available' };
      }

      // Get GHL account details
      const { data: ghlAccount } = await this.supabaseAdmin
        .from('ghl_accounts')
        .select('location_id')
        .eq('location_id', locationId)
        .eq('user_id', userId)
        .maybeSingle();

      const locationName = ghlAccount ? `Location ${locationId}` : `Location ${locationId}`;

      // Prepare email content
      const subject = '⚠️ WhatsApp Connection Lost - Please Reconnect';
      const disconnectReason = reason === 'mobile' 
        ? 'disconnected from your mobile phone' 
        : 'logged out from the dashboard';
      
      const userName = user.name || user.email.split('@')[0];
      
      const htmlContent = `
        <!DOCTYPE html>
        <html>
          <head>
            <meta charset="utf-8">
            <meta name="viewport" content="width=device-width, initial-scale=1.0">
            <title>Connection Lost</title>
            <style>
              body {
                font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif;
                line-height: 1.6;
                color: #333;
                background-color: #f5f5f5;
                margin: 0;
                padding: 0;
              }
              .container {
                max-width: 600px;
                margin: 0 auto;
                background-color: #ffffff;
                padding: 0;
              }
              .header {
                background: linear-gradient(135deg, #075E54 0%, #128C7E 100%);
                padding: 30px;
                text-align: center;
                color: white;
              }
              .header h1 {
                margin: 0;
                font-size: 24px;
                font-weight: 700;
              }
              .content {
                padding: 40px 30px;
              }
              .alert-box {
                background: #FFF3E0;
                border-left: 4px solid #FF9800;
                padding: 20px;
                margin: 20px 0;
                border-radius: 4px;
              }
              .alert-box strong {
                color: #E65100;
                display: block;
                margin-bottom: 10px;
                font-size: 18px;
              }
              .info-box {
                background: #F0F2F5;
                padding: 20px;
                border-radius: 8px;
                margin: 20px 0;
              }
              .info-row {
                display: flex;
                justify-content: space-between;
                padding: 8px 0;
                border-bottom: 1px solid #E9EDEF;
              }
              .info-row:last-child {
                border-bottom: none;
              }
              .button {
                display: inline-block;
                background: #25D366;
                color: white;
                padding: 14px 28px;
                text-decoration: none;
                border-radius: 8px;
                font-weight: 600;
                margin: 20px 0;
                text-align: center;
              }
              .button:hover {
                background: #1DA851;
              }
              .footer {
                background: #F0F2F5;
                padding: 20px;
                text-align: center;
                color: #54656F;
                font-size: 14px;
              }
              .steps {
                margin: 20px 0;
                padding-left: 20px;
              }
              .steps li {
                margin: 10px 0;
              }
            </style>
          </head>
          <body>
            <div class="container">
              <div class="header">
                <h1>⚠️ WhatsApp Connection Lost</h1>
              </div>
              
              <div class="content">
                <p>Hello ${userName},</p>
                
                <div class="alert-box">
                  <strong>Connection Disconnected</strong>
                  Your WhatsApp connection for <strong>${locationName}</strong> has been ${disconnectReason}.
                </div>
                
                <div class="info-box">
                  <div class="info-row">
                    <span><strong>Account:</strong></span>
                    <span>${locationName}</span>
                  </div>
                  <div class="info-row">
                    <span><strong>Disconnected:</strong></span>
                    <span>${new Date().toLocaleString()}</span>
                  </div>
                  <div class="info-row">
                    <span><strong>Reason:</strong></span>
                    <span>${reason === 'mobile' ? 'Mobile disconnect' : 'Dashboard logout'}</span>
                  </div>
                </div>
                
                <p><strong>To reconnect your WhatsApp:</strong></p>
                <ol class="steps">
                  <li>Go to your <strong>Dashboard</strong></li>
                  <li>Find your subaccount: <strong>${locationName}</strong></li>
                  <li>Click the <strong>"QR Code"</strong> button</li>
                  <li>Scan the QR code with your WhatsApp mobile app</li>
                  <li>Wait for the connection to be established</li>
                </ol>
                
                <div style="text-align: center; margin: 30px 0;">
                  <a href="${process.env.FRONTEND_URL || 'https://dashboard.octendr.com'}/dashboard" class="button">
                    Open Dashboard
                  </a>
                </div>
                
                <p style="color: #54656F; font-size: 14px; margin-top: 30px;">
                  <strong>Need help?</strong> If you continue to experience connection issues, please contact support.
                </p>
              </div>
              
              <div class="footer">
                <p>This is an automated notification from <strong>Octendr</strong></p>
                <p>WhatsApp GHL Integration Platform</p>
              </div>
            </div>
          </body>
        </html>
      `;

      const textContent = `
WhatsApp Connection Lost - Please Reconnect

Hello ${userName},

Your WhatsApp connection for ${locationName} has been ${disconnectReason}.

Account: ${locationName}
Disconnected: ${new Date().toLocaleString()}
Reason: ${reason === 'mobile' ? 'Mobile disconnect' : 'Dashboard logout'}

To reconnect:
1. Go to your Dashboard
2. Find your subaccount: ${locationName}
3. Click the "QR Code" button
4. Scan the QR code with your WhatsApp mobile app
5. Wait for connection to be established

Dashboard: ${process.env.FRONTEND_URL || 'https://dashboard.octendr.com'}/dashboard

This is an automated notification from Octendr.
      `;

      // Use Supabase Edge Function or external email service
      // For now, we'll use a simple HTTP email service (Resend, SendGrid, etc.)
      const emailResult = await this.sendEmailViaAPI({
        to: user.email,
        subject: subject,
        html: htmlContent,
        text: textContent
      });

      if (emailResult.success) {
        console.log(`✅ Disconnect email sent successfully to: ${user.email}`);
        return { success: true, email: user.email };
      } else {
        console.error(`❌ Failed to send disconnect email:`, emailResult.error);
        return { success: false, error: emailResult.error };
      }

    } catch (error) {
      console.error('❌ Error sending disconnect email:', error);
      return { success: false, error: error.message };
    }
  }

  /**
   * Send email via external API (Resend, SendGrid, etc.)
   * You can replace this with your preferred email service
   */
  async sendEmailViaAPI({ to, subject, html, text }) {
    try {
      // Option 1: Use Resend API (recommended - free tier available)
      if (process.env.RESEND_API_KEY) {
        // Node.js 18+ has built-in fetch, otherwise use node-fetch
        const fetch = global.fetch || require('node-fetch');
        const response = await fetch('https://api.resend.com/emails', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.RESEND_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM || 'Octendr <notifications@octendr.com>',
            to: [to],
            subject: subject,
            html: html,
            text: text,
          }),
        });

        if (response.ok) {
          const data = await response.json();
          console.log('✅ Email sent via Resend:', data.id);
          return { success: true };
        } else {
          const error = await response.text();
          console.error('❌ Resend API error:', error);
          return { success: false, error: error };
        }
      }

      // Option 2: Use SendGrid API
      if (process.env.SENDGRID_API_KEY) {
        // Node.js 18+ has built-in fetch, otherwise use node-fetch
        const fetch = global.fetch || require('node-fetch');
        const response = await fetch('https://api.sendgrid.com/v3/mail/send', {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${process.env.SENDGRID_API_KEY}`,
            'Content-Type': 'application/json',
          },
          body: JSON.stringify({
            personalizations: [{
              to: [{ email: to }],
            }],
            from: { email: process.env.EMAIL_FROM || 'notifications@octendr.com' },
            subject: subject,
            content: [
              { type: 'text/plain', value: text },
              { type: 'text/html', value: html },
            ],
          }),
        });

        if (response.ok) {
          console.log('✅ Email sent via SendGrid');
          return { success: true };
        } else {
          const error = await response.text();
          console.error('❌ SendGrid API error:', error);
          return { success: false, error: error };
        }
      }

      // Option 3: Use Nodemailer with SMTP (Gmail, etc.)
      if (process.env.SMTP_HOST || process.env.SMTP_USER) {
        // Dynamically require nodemailer (install if needed)
        let nodemailer;
        try {
          nodemailer = require('nodemailer');
        } catch (e) {
          console.error('❌ nodemailer not installed. Run: npm install nodemailer');
          return { success: false, error: 'nodemailer package not installed' };
        }
        
        // Gmail SMTP configuration
        const smtpConfig = {
          host: process.env.SMTP_HOST || 'smtp.gmail.com',
          port: parseInt(process.env.SMTP_PORT || '587'),
          secure: process.env.SMTP_PORT === '465', // true for 465, false for other ports
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
          // Gmail specific settings
          tls: {
            rejectUnauthorized: false, // For development, set to true in production
          },
        };

        // If using Gmail, add service option
        if (smtpConfig.host === 'smtp.gmail.com') {
          smtpConfig.service = 'gmail';
        }

        const transporter = nodemailer.createTransport(smtpConfig);

        // Verify connection
        try {
          await transporter.verify();
          console.log('✅ SMTP server connection verified');
        } catch (verifyError) {
          console.error('❌ SMTP verification failed:', verifyError.message);
          return { 
            success: false, 
            error: `SMTP connection failed: ${verifyError.message}. Check your SMTP credentials.` 
          };
        }

        const mailOptions = {
          from: process.env.EMAIL_FROM || `Octendr <${process.env.SMTP_USER}>`,
          to: to,
          subject: subject,
          html: html,
          text: text,
        };

        const info = await transporter.sendMail(mailOptions);
        console.log('✅ Email sent via SMTP:', info.messageId);
        return { success: true, messageId: info.messageId };
      }

      // If no email service configured, log and return
      console.warn('⚠️ No email service configured. Set RESEND_API_KEY, SENDGRID_API_KEY, or SMTP settings in .env');
      return { success: false, error: 'No email service configured' };

    } catch (error) {
      console.error('❌ Email API error:', error);
      return { success: false, error: error.message };
    }
  }
}

module.exports = new EmailService();

