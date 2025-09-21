import nodemailer from 'nodemailer';
import { logger } from '../utils/logger';

export interface EmailConfig {
  host: string;
  port: number;
  user: string;
  pass: string;
  from: string;
}

let transporter: nodemailer.Transporter;

const configureEmail = (): void => {
  const { EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_FROM } = process.env;

  if (!EMAIL_HOST || !EMAIL_PORT || !EMAIL_USER || !EMAIL_PASS || !EMAIL_FROM) {
    throw new Error('Email configuration missing in environment variables');
  }

  transporter = nodemailer.createTransport({
    host: EMAIL_HOST,
    port: parseInt(EMAIL_PORT),
    secure: false,
    auth: {
      user: EMAIL_USER,
      pass: EMAIL_PASS
    }
  });

  logger.info('Email configuration initialized');
};

const getTransporter = (): nodemailer.Transporter => {
  if (!transporter) {
    throw new Error('Email transporter not initialized. Call configureEmail first.');
  }
  return transporter;
};

export { configureEmail, getTransporter };