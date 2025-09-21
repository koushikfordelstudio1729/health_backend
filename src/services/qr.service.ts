import QRCode from 'qrcode';
import { logger } from '../utils/logger';

export class QRService {
  static async generateQRCode(data: string): Promise<string | null> {
    try {
      const qrCodeDataURL = await QRCode.toDataURL(data);
      logger.info('QR code generated successfully');
      return qrCodeDataURL;
    } catch (error) {
      logger.error('QR code generation failed:', error);
      return null;
    }
  }

  static async generateTestOrderQR(orderId: string, patientId: string): Promise<string | null> {
    try {
      const baseURL = process.env.FRONTEND_URL || 'http://localhost:3000';
      const qrData = `${baseURL}/reports/qr/${orderId}?patient=${patientId}`;
      
      return await this.generateQRCode(qrData);
    } catch (error) {
      logger.error('Test order QR generation failed:', error);
      return null;
    }
  }

  static generateQRString(orderId: string, patientId: string): string {
    const timestamp = Date.now();
    return `HEAL-${orderId}-${patientId}-${timestamp}`;
  }

  static parseQRString(qrString: string): { orderId: string; patientId: string; timestamp: number } | null {
    try {
      const parts = qrString.split('-');
      if (parts.length >= 4 && parts[0] === 'HEAL') {
        return {
          orderId: parts[1],
          patientId: parts[2],
          timestamp: parseInt(parts[3])
        };
      }
      return null;
    } catch (error) {
      logger.error('QR string parsing failed:', error);
      return null;
    }
  }
}