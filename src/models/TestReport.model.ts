import mongoose, { Schema } from 'mongoose';
import { ITestReport, IReportFile } from '../types';

const ReportFileSchema = new Schema<IReportFile>({
  filename: {
    type: String,
    required: true,
    trim: true
  },
  originalName: {
    type: String,
    required: true,
    trim: true
  },
  cloudinaryUrl: {
    type: String,
    required: true,
    trim: true
  },
  fileSize: {
    type: Number,
    required: true,
    min: 0
  },
  mimeType: {
    type: String,
    required: true,
    trim: true
  }
}, { _id: false });

const TestReportSchema = new Schema<ITestReport>({
  reportId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  orderId: {
    type: Schema.Types.ObjectId,
    ref: 'TestOrder',
    required: true
  },
  testId: {
    type: Schema.Types.ObjectId,
    ref: 'Test',
    required: true
  },
  patientId: {
    type: String,
    ref: 'Patient',
    required: true
  },
  reportFile: {
    type: ReportFileSchema,
    required: true
  },
  uploadedBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  uploadedAt: {
    type: Date,
    required: true,
    default: Date.now
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  versionKey: false
});

TestReportSchema.index({ reportId: 1 });
TestReportSchema.index({ orderId: 1 });
TestReportSchema.index({ testId: 1 });
TestReportSchema.index({ patientId: 1 });
TestReportSchema.index({ isActive: 1 });
TestReportSchema.index({ uploadedAt: -1 });

export const TestReport = mongoose.model<ITestReport>('TestReport', TestReportSchema);