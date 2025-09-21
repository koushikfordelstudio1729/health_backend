import dotenv from 'dotenv';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import { User, Branch } from '../models';
import { EmailService } from '../services/email.service';
import { configureEmail } from '../config/email';
import { IDGenerator } from '../utils/idGenerator';
import { UserRole } from '../types';
import { logger } from '../utils/logger';

// Load environment variables
dotenv.config();

interface AdminData {
  email: string;
  name: string;
  phone: string;
  username: string;
  tempPassword: string;
}

export class AdminSeeder {
  static async createAdminUser(adminData: AdminData): Promise<void> {
    try {
      // Check if admin already exists
      const existingAdmin = await User.findOne({ 
        $or: [
          { email: adminData.email },
          { username: adminData.username },
          { role: UserRole.ADMIN }
        ]
      });

      if (existingAdmin) {
        logger.info('Admin user already exists, skipping creation');
        logger.info(`Existing admin found: ${existingAdmin.userId} - ${existingAdmin.email}`);
        
        // Still send welcome email with new password if requested
        const newTempPassword = this.generateSecurePassword();
        logger.info(`🔑 New temporary password for existing admin: ${newTempPassword}`);
        
        // Update password (trigger hashing middleware)
        existingAdmin.password = newTempPassword;
        existingAdmin.markModified('password');
        await existingAdmin.save();
        
        // Send new welcome email
        await this.sendAdminWelcomeEmail({
          ...adminData,
          tempPassword: newTempPassword
        });
        
        logger.info(`📧 Updated welcome email sent to: ${adminData.email}`);
        return;
      }

      // Generate admin user ID
      const userId = await IDGenerator.generateUserId('ADMIN', 'ADMIN');

      // Hash the temporary password
      const salt = await bcrypt.genSalt(12);
      const hashedPassword = await bcrypt.hash(adminData.tempPassword, salt);

      // Create admin user
      const adminUser = new User({
        userId,
        username: adminData.username,
        password: hashedPassword,
        name: adminData.name,
        email: adminData.email,
        phone: adminData.phone,
        role: UserRole.ADMIN,
        branchId: null, // Admin has access to all branches
        accessLevel: ['ALL'],
        isActive: true
        // createdBy is optional for admin and will default to null
      });

      await adminUser.save();

      logger.info(`Admin user created successfully: ${adminUser.userId}`);

      // Send welcome email with credentials
      await this.sendAdminWelcomeEmail(adminData);

      logger.info(`Welcome email sent to admin: ${adminData.email}`);

    } catch (error) {
      logger.error('Error creating admin user:', error);
      throw error;
    }
  }

  static async sendAdminWelcomeEmail(adminData: AdminData): Promise<void> {
    const emailSubject = 'Welcome to HEAL IMAGING AND DIAGNOSTIC - Admin Account Created';
    
    const emailBody = `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px;">
        <div style="background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); padding: 30px; text-align: center; color: white; border-radius: 10px 10px 0 0;">
          <h1 style="margin: 0; font-size: 28px;">🏥 HEAL IMAGING AND DIAGNOSTIC</h1>
          <p style="margin: 10px 0 0; font-size: 16px; opacity: 0.9;">Healthcare Management System</p>
        </div>
        
        <div style="background: #ffffff; padding: 30px; border: 1px solid #e0e0e0; border-radius: 0 0 10px 10px;">
          <h2 style="color: #333; margin-top: 0;">Welcome, ${adminData.name}!</h2>
          
          <p style="color: #666; line-height: 1.6;">
            Your administrator account has been successfully created for the HEAL IMAGING AND DIAGNOSTIC management system.
          </p>
          
          <div style="background: #f8f9fa; padding: 20px; border-radius: 8px; margin: 25px 0;">
            <h3 style="color: #333; margin-top: 0;">🔐 Your Login Credentials</h3>
            <div style="background: white; padding: 15px; border-radius: 5px; border-left: 4px solid #667eea;">
              <p style="margin: 5px 0;"><strong>Email:</strong> ${adminData.email}</p>
              <p style="margin: 5px 0;"><strong>Username:</strong> ${adminData.username}</p>
              <p style="margin: 5px 0;"><strong>Temporary Password:</strong> <code style="background: #f1f3f4; padding: 2px 6px; border-radius: 3px;">${adminData.tempPassword}</code></p>
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
              <li>Login to the admin dashboard using your credentials</li>
              <li>Change your temporary password immediately</li>
              <li>Set up branches and create user accounts</li>
              <li>Configure system settings and preferences</li>
              <li>Review and customize the dashboard</li>
            </ul>
          </div>
          
          <div style="margin: 30px 0;">
            <h3 style="color: #333;">📋 Admin Responsibilities</h3>
            <ul style="color: #666; line-height: 1.8;">
              <li><strong>Branch Management:</strong> Create and manage multiple branches</li>
              <li><strong>User Management:</strong> Create staff accounts with appropriate roles</li>
              <li><strong>Doctor Management:</strong> Register doctors and set commission rates</li>
              <li><strong>Test Management:</strong> Configure available tests and pricing</li>
              <li><strong>Financial Reports:</strong> Monitor revenue and commission payments</li>
              <li><strong>System Security:</strong> Ensure proper access controls</li>
            </ul>
          </div>
          
          <div style="text-align: center; margin: 30px 0;">
            <a href="http://localhost:3000/health" 
               style="background: #667eea; color: white; padding: 12px 30px; text-decoration: none; border-radius: 5px; display: inline-block; font-weight: bold;">
              🔗 Access Admin Dashboard
            </a>
          </div>
          
          <div style="border-top: 1px solid #e0e0e0; padding-top: 20px; margin-top: 30px; color: #999; font-size: 14px;">
            <p><strong>Support:</strong> If you need assistance, please contact technical support.</p>
            <p><strong>System:</strong> HEAL IMAGING AND DIAGNOSTIC Management System v1.0</p>
            <p><strong>Generated:</strong> ${new Date().toLocaleString()}</p>
          </div>
        </div>
      </div>
    `;

    await EmailService.sendCustomEmail(
      adminData.email,
      emailSubject,
      emailBody
    );
  }

  static generateSecurePassword(): string {
    const length = 12;
    const charset = 'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789!@#$%^&*';
    let password = '';
    
    // Ensure at least one character from each category
    password += 'ABCDEFGHIJKLMNOPQRSTUVWXYZ'[Math.floor(Math.random() * 26)]; // uppercase
    password += 'abcdefghijklmnopqrstuvwxyz'[Math.floor(Math.random() * 26)]; // lowercase
    password += '0123456789'[Math.floor(Math.random() * 10)]; // number
    password += '!@#$%^&*'[Math.floor(Math.random() * 8)]; // special char
    
    // Fill the rest randomly
    for (let i = 4; i < length; i++) {
      password += charset[Math.floor(Math.random() * charset.length)];
    }
    
    // Shuffle the password
    return password.split('').sort(() => 0.5 - Math.random()).join('');
  }

  static async seedAdmin(): Promise<void> {
    try {
      logger.info('🌱 Starting admin seeding process...');

      // Configure email service
      configureEmail();
      logger.info('📧 Email service configured');

      const adminData: AdminData = {
        email: 'koushikpanda.fs@gmail.com',
        name: 'Koushik Panda',
        phone: '+91-9876543210',
        username: 'admin',
        tempPassword: this.generateSecurePassword()
      };

      logger.info(`🔑 Generated temporary password: ${adminData.tempPassword}`);
      
      await this.createAdminUser(adminData);
      
      logger.info('✅ Admin seeding completed successfully!');
      
    } catch (error) {
      logger.error('❌ Admin seeding failed:', error);
      throw error;
    }
  }
}

// CLI execution
if (require.main === module) {
  (async () => {
    try {
      // Connect to database
      await mongoose.connect(process.env.MONGODB_URI || '');
      logger.info('📊 Connected to MongoDB');
      
      await AdminSeeder.seedAdmin();
      
      logger.info('🎉 Seeding process completed successfully!');
      process.exit(0);
    } catch (error) {
      logger.error('💥 Seeding process failed:', error);
      process.exit(1);
    }
  })();
}