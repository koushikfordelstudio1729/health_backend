import { getTransporter } from '../config/email';
import { logger } from '../utils/logger';

export interface EmailOptions {
  to: string;
  subject: string;
  text?: string;
  html?: string;
}

export class EmailService {
  static async sendEmail(options: EmailOptions): Promise<boolean> {
    try {
      const transporter = getTransporter();
      
      const mailOptions = {
        from: process.env.EMAIL_FROM,
        to: options.to,
        subject: options.subject,
        text: options.text,
        html: options.html || options.text
      };

      await transporter.sendMail(mailOptions);
      logger.info(`Email sent successfully to ${options.to}`);
      return true;
    } catch (error) {
      logger.error('Email sending failed:', error);
      return false;
    }
  }

  static async sendWelcomeEmail(email: string, name: string, username: string, tempPassword: string): Promise<boolean> {
    const subject = 'Welcome to HEAL Diagnostic System';
    const html = `
      <h2>Welcome to HEAL Imaging and Diagnostic System</h2>
      <p>Dear ${name},</p>
      <p>Your account has been created successfully. Here are your login credentials:</p>
      <ul>
        <li><strong>Username:</strong> ${username}</li>
        <li><strong>Temporary Password:</strong> ${tempPassword}</li>
      </ul>
      <p><strong>Important:</strong> Please change your password after your first login for security purposes.</p>
      <p>Best regards,<br>HEAL Diagnostic Team</p>
    `;

    return this.sendEmail({ to: email, subject, html });
  }

  static async sendPasswordResetEmail(email: string, name: string, resetToken: string): Promise<boolean> {
    const subject = 'Password Reset Request';
    const html = `
      <h2>Password Reset Request</h2>
      <p>Dear ${name},</p>
      <p>You have requested to reset your password. Please use the following token to reset your password:</p>
      <p><strong>Reset Token:</strong> ${resetToken}</p>
      <p>This token will expire in 1 hour.</p>
      <p>If you did not request this password reset, please ignore this email.</p>
      <p>Best regards,<br>HEAL Diagnostic Team</p>
    `;

    return this.sendEmail({ to: email, subject, html });
  }

  static async sendTestResultNotification(email: string, patientName: string, orderId: string, qrCode: string): Promise<boolean> {
    const subject = 'Test Results Available';
    const html = `
      <h2>Test Results Available</h2>
      <p>Dear ${patientName},</p>
      <p>Your test results for order <strong>${orderId}</strong> are now available.</p>
      <p>You can access your results using the QR code: <strong>${qrCode}</strong></p>
      <p>Please visit our facility with this QR code to view/download your reports.</p>
      <p>Best regards,<br>HEAL Diagnostic Team</p>
    `;

    return this.sendEmail({ to: email, subject, html });
  }

  static async sendCommissionNotification(email: string, doctorName: string, amount: number, period: string): Promise<boolean> {
    const subject = 'Commission Payment Notification';
    const html = `
      <h2>Commission Payment</h2>
      <p>Dear Dr. ${doctorName},</p>
      <p>Your commission for the period <strong>${period}</strong> has been processed.</p>
      <p><strong>Amount:</strong> ₹${amount.toFixed(2)}</p>
      <p>The payment will be credited to your registered account within 2-3 business days.</p>
      <p>Best regards,<br>HEAL Diagnostic Team</p>
    `;

    return this.sendEmail({ to: email, subject, html });
  }

  static async sendInventoryAlert(email: string, itemName: string, currentStock: number, minStock: number, branchName: string): Promise<boolean> {
    const subject = 'Low Stock Alert';
    const html = `
      <h2>Low Stock Alert</h2>
      <p>This is an automated alert for low inventory stock at <strong>${branchName}</strong>.</p>
      <p><strong>Item:</strong> ${itemName}</p>
      <p><strong>Current Stock:</strong> ${currentStock}</p>
      <p><strong>Minimum Required:</strong> ${minStock}</p>
      <p>Please reorder this item immediately to avoid stock-out situation.</p>
      <p>Best regards,<br>HEAL Diagnostic System</p>
    `;

    return this.sendEmail({ to: email, subject, html });
  }

  static async sendTaskAssignmentEmail(email: string, employeeName: string, taskTitle: string, dueDate: Date): Promise<boolean> {
    const subject = 'New Task Assignment';
    const html = `
      <h2>New Task Assignment</h2>
      <p>Dear ${employeeName},</p>
      <p>You have been assigned a new task:</p>
      <p><strong>Task:</strong> ${taskTitle}</p>
      <p><strong>Due Date:</strong> ${dueDate.toLocaleDateString()}</p>
      <p>Please log into the system to view the complete task details.</p>
      <p>Best regards,<br>HEAL Diagnostic Team</p>
    `;

    return this.sendEmail({ to: email, subject, html });
  }

  static async sendLeaveStatusUpdate(email: string, employeeName: string, leaveType: string, status: string, fromDate: Date, toDate: Date): Promise<boolean> {
    const subject = `Leave Application ${status}`;
    const html = `
      <h2>Leave Application Update</h2>
      <p>Dear ${employeeName},</p>
      <p>Your leave application has been <strong>${status.toLowerCase()}</strong>.</p>
      <p><strong>Leave Type:</strong> ${leaveType}</p>
      <p><strong>Period:</strong> ${fromDate.toLocaleDateString()} to ${toDate.toLocaleDateString()}</p>
      <p>Please contact HR if you have any questions.</p>
      <p>Best regards,<br>HEAL Diagnostic Team</p>
    `;

    return this.sendEmail({ to: email, subject, html });
  }

  static async sendUserCreationEmail(
    email: string, 
    name: string, 
    username: string, 
    tempPassword: string, 
    role: string, 
    branchName?: string
  ): Promise<boolean> {
    const subject = 'Welcome to HEAL IMAGING AND DIAGNOSTIC - Account Created';
    
    const html = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">🏥 HEAL IMAGING AND DIAGNOSTIC</h1>
          <p style="margin: 10px 0 0; font-size: 16px; opacity: 0.9;">Healthcare Management System</p>
        </div>
        
        <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333; margin-top: 0;">Welcome, ${name}!</h2>
          
          <p style="color: #666; line-height: 1.6;">
            Your account has been successfully created for the HEAL IMAGING AND DIAGNOSTIC management system.
          </p>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0;">
            <h3 style="color: #333; margin-top: 0;">🔐 Your Login Credentials</h3>
            <div style="background: white; padding: 15px; border-radius: 5px; border-left: 4px solid #667eea;">
              <p style="margin: 5px 0;"><strong>Email:</strong> ${email}</p>
              <p style="margin: 5px 0;"><strong>Username:</strong> ${username}</p>
              <p style="margin: 5px 0;"><strong>Role:</strong> ${role.replace('_', ' ')}</p>
              ${branchName ? `<p style="margin: 5px 0;"><strong>Branch:</strong> ${branchName}</p>` : ''}
              <p style="margin: 5px 0;"><strong>Temporary Password:</strong> <code style="background: #f1f3f4; padding: 2px 6px; border-radius: 3px;">${tempPassword}</code></p>
            </div>
          </div>
          
          <div style="background: #fff3cd; border: 1px solid #ffeaa7; padding: 15px; border-radius: 8px; margin: 25px 0;">
            <h4 style="color: #856404; margin-top: 0;">⚠️ Important Security Notice</h4>
            <p style="color: #856404; margin: 5px 0; line-height: 1.5;">
              <strong>Please change your password immediately after your first login</strong> for security purposes. 
              This temporary password should not be shared with anyone.
            </p>
          </div>
          
          <div style="margin: 30px 0;">
            <h3 style="color: #333;">🚀 Getting Started</h3>
            <ul style="color: #666; line-height: 1.8;">
              <li>Login using your credentials</li>
              <li>Change your temporary password immediately</li>
              <li>Explore your dashboard and available features</li>
              <li>Contact your administrator if you need assistance</li>
            </ul>
          </div>
          
          <div style="margin: 30px 0;">
            <h3 style="color: #333;">📋 Your Role: ${role.replace('_', ' ')}</h3>
            <p style="color: #666; line-height: 1.6;">
              ${this.getRoleDescription(role)}
            </p>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="http://localhost:3000/health" 
               style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
              🔗 Login to System
            </a>
          </div>
          
          <div style="border-top: 1px solid #e0e0e0; padding-top: 20px; margin-top: 30px; color: #999; font-size: 14px;">
            <p><strong>Support:</strong> If you need assistance, please contact your system administrator.</p>
            <p><strong>System:</strong> HEAL IMAGING AND DIAGNOSTIC Management System v1.0</p>
            <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>
    `;

    return this.sendEmail({ to: email, subject, html });
  }

  private static getRoleDescription(role: string): string {
    const descriptions: Record<string, string> = {
      'ADMIN': 'You have full system access including user management, branch management, and all administrative functions.',
      'BRANCH_MANAGER': 'You can manage your branch operations, staff, and access financial reports for your branch.',
      'OPD_STAFF': 'You can register patients, create visits, generate test orders, and manage OPD operations.',
      'LAB_STAFF': 'You can manage the test queue, upload reports, update sample collection status, and handle lab operations.',
      'PHARMACY_STAFF': 'You can manage inventory, track medications, and handle pharmacy-related operations.',
      'MARKETING_EMPLOYEE': 'You can access marketing tools, campaign tracking, and performance analytics.',
      'GENERAL_EMPLOYEE': 'You can manage your tasks, apply for leaves, submit complaints, and access employee features.'
    };
    return descriptions[role] || 'Please contact your administrator for more information about your role.';
  }

  static async sendCustomEmail(
    to: string,
    subject: string,
    html: string
  ): Promise<boolean> {
    return this.sendEmail({ to, subject, html });
  }
}