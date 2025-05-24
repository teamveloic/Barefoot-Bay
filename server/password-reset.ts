import * as crypto from 'crypto';
import { User } from '@shared/schema';
import { sendEmail } from './email-service';

/**
 * Generate a secure random token for password reset
 * @returns Random token string
 */
export function generateResetToken(): string {
  return crypto.randomBytes(20).toString('hex');
}

/**
 * Send a password reset email with a reset link
 * @param user User object
 * @param resetToken Reset token
 * @param resetTokenExpires Expiration date for the reset token
 * @returns Promise resolving to true if email was sent successfully
 */
export async function sendPasswordResetEmail(
  user: User,
  resetToken: string,
  resetTokenExpires: Date
): Promise<boolean> {
  console.log('=== Starting password reset email function ===');
  console.log(`User: ID:${user.id}, Email:${user.email}, Name:${user.fullName || 'N/A'}`);
  
  // Store the last reset link for development access
  global.lastPasswordResetLink = {
    email: user.email,
    token: resetToken,
    expiresAt: resetTokenExpires
  };
  
  // Get current Replit URL for proper reset links
  let baseUrl;
  
  // Use production URL for the community site
  baseUrl = 'https://barefoot-bay.replit.app';
  console.log(`Using hardcoded production URL for baseUrl: ${baseUrl}`);
  
  // If in development or testing, allow overriding with BASE_URL env var
  if (process.env.BASE_URL) {
    baseUrl = process.env.BASE_URL;
    console.log(`Overriding with BASE_URL env variable: ${baseUrl}`);
  }
  
  const resetUrl = `${baseUrl}/reset-password?token=${resetToken}&email=${encodeURIComponent(user.email)}`;
  console.log(`Generated reset URL: ${resetUrl}`);
  
  const html = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta charset="utf-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Reset Your Barefoot Bay Community Password</title>
      <style>
        body {
          font-family: Arial, sans-serif;
          line-height: 1.6;
          color: #333333;
          margin: 0;
          padding: 0;
          background-color: #f9f9f9;
        }
        .container {
          max-width: 600px;
          margin: 0 auto;
          padding: 20px;
          background-color: #ffffff;
          border-radius: 8px;
          border: 1px solid #e0e0e0;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.05);
        }
        .header {
          text-align: center;
          margin-bottom: 30px;
          border-bottom: 2px solid #4361ee;
          padding-bottom: 20px;
        }
        .logo {
          max-width: 150px;
          margin-bottom: 10px;
        }
        h1 {
          color: #4361ee;
          margin-top: 0;
        }
        .content {
          padding: 0 20px;
        }
        .reset-button {
          display: inline-block;
          background-color: #4361ee;
          color: white !important;
          text-decoration: none;
          padding: 12px 24px;
          border-radius: 4px;
          margin: 20px 0;
          font-weight: bold;
          text-align: center;
        }
        .reset-button:hover {
          background-color: #3451d4;
        }
        .expiry-notice {
          background-color: #fef8e7;
          border-left: 4px solid #f7b500;
          padding: 10px 15px;
          margin: 20px 0;
          font-size: 0.9em;
        }
        .footer {
          margin-top: 30px;
          border-top: 1px solid #e0e0e0;
          padding-top: 20px;
          text-align: center;
          font-size: 0.9em;
          color: #777777;
        }
        .manual-link {
          word-break: break-all;
          font-size: 0.9em;
          background-color: #f5f5f5;
          padding: 10px;
          border-radius: 4px;
          margin-top: 15px;
          border: 1px solid #e0e0e0;
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>Barefoot Bay Community</h1>
          <p>Password Reset Request</p>
        </div>
        
        <div class="content">
          <p>Hello ${user.fullName || 'Community Member'},</p>
          
          <p>We received a request to reset the password for your Barefoot Bay Community account. If you made this request, please click the button below to create a new password.</p>
          
          <div style="text-align: center;">
            <a href="${resetUrl}" target="_blank" class="reset-button">Reset Your Password</a>
          </div>
          
          <div class="expiry-notice">
            <strong>Note:</strong> This password reset link will expire in 1 hour for security reasons.
          </div>
          
          <p>If the button above doesn't work, you can copy and paste the following link into your browser:</p>
          
          <div class="manual-link">
            ${resetUrl}
          </div>
          
          <p>If you didn't request a password reset, please ignore this email or contact support if you have concerns about your account security.</p>
          
          <p>Thank you,<br>
          The Barefoot Bay Community Team</p>
        </div>
        
        <div class="footer">
          <p>This is an automated message, please do not reply to this email.</p>
          <p>&copy; ${new Date().getFullYear()} Barefoot Bay Community. All rights reserved.</p>
        </div>
      </div>
    </body>
    </html>
  `;
  
  const text = `
    BAREFOOT BAY COMMUNITY
    PASSWORD RESET REQUEST
    
    Hello ${user.fullName || 'Community Member'},
    
    We received a request to reset the password for your Barefoot Bay Community account. 
    If you made this request, please use the link below to create a new password.
    
    ${resetUrl}
    
    NOTE: This password reset link will expire in 1 hour for security reasons.
    
    If you didn't request a password reset, please ignore this email or contact 
    support if you have concerns about your account security.
    
    Thank you,
    The Barefoot Bay Community Team
    
    ---
    This is an automated message, please do not reply to this email.
    © ${new Date().getFullYear()} Barefoot Bay Community. All rights reserved.
  `;
  
  console.log('Email content prepared, attempting to send email');
  
  try {
    console.log(`Sending email to: ${user.email}`);
    const emailResult = await sendEmail({
      to: user.email,
      subject: 'Password Reset Request - Barefoot Bay Community',
      html,
      text
    });
    
    console.log(`Email sending result: ${emailResult}`);
    return emailResult;
  } catch (error) {
    console.error('Error sending password reset email:', error);
    // Enhanced error logging
    if (error instanceof Error) {
      console.error('Error details:', error.message);
      console.error('Stack trace:', error.stack);
    }
    
    console.log('Checking email service environment variables:');
    console.log(`- GMAIL_APP_PASSWORD: ${process.env.GMAIL_APP_PASSWORD ? 'Set' : 'Not set'}`);
    console.log(`- GOOGLE_USER_EMAIL: ${process.env.GOOGLE_USER_EMAIL ? 'Set' : 'Not set'}`);
    console.log(`- GOOGLE_CLIENT_ID: ${process.env.GOOGLE_CLIENT_ID ? 'Set' : 'Not set'}`);
    console.log(`- GOOGLE_CLIENT_SECRET: ${process.env.GOOGLE_CLIENT_SECRET ? 'Set' : 'Not set'}`);
    console.log(`- GOOGLE_REFRESH_TOKEN: ${process.env.GOOGLE_REFRESH_TOKEN ? 'Set' : 'Not set'}`);
    console.log(`- SMTP_HOST: ${process.env.SMTP_HOST || 'Not set'}`);
    
    return false;
  }
}