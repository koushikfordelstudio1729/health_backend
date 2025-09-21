import mongoose, { Schema } from 'mongoose';
import { ITestOrder, IOrderTest, PaymentMode, PaymentStatus, TestStatus } from '../types';

const OrderTestSchema = new Schema<IOrderTest>({
  testId: {
    type: Schema.Types.ObjectId,
    ref: 'Test',
    required: true
  },
  testName: {
    type: String,
    required: true,
    trim: true
  },
  price: {
    type: Number,
    required: true,
    min: 0
  },
  status: {
    type: String,
    enum: Object.values(TestStatus),
    required: true,
    default: TestStatus.PENDING
  },
  collectionDate: {
    type: Date
  },
  completionDate: {
    type: Date
  }
}, { _id: false });

const TestOrderSchema = new Schema<ITestOrder>({
  orderId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  patientId: {
    type: String,
    ref: 'Patient',
    required: true
  },
  visitId: {
    type: Schema.Types.ObjectId,
    ref: 'PatientVisit',
    required: true
  },
  referringDoctorId: {
    type: Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },
  tests: [OrderTestSchema],
  totalAmount: {
    type: Number,
    required: true,
    min: 0
  },
  commissionAmount: {
    type: Number,
    required: true,
    min: 0
  },
  paymentMode: {
    type: String,
    enum: Object.values(PaymentMode),
    required: true
  },
  paymentStatus: {
    type: String,
    enum: Object.values(PaymentStatus),
    required: true,
    default: PaymentStatus.PENDING
  },
  qrCode: {
    type: String,
    required: true,
    trim: true
  },
  labId: {
    type: String,
    required: true,
    trim: true
  },
  branchId: {
    type: String,
    ref: 'Branch',
    required: true
  },
  createdBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  }
}, {
  timestamps: true,
  versionKey: false
});

TestOrderSchema.index({ orderId: 1 });
TestOrderSchema.index({ patientId: 1 });
TestOrderSchema.index({ visitId: 1 });
TestOrderSchema.index({ referringDoctorId: 1 });
TestOrderSchema.index({ branchId: 1 });
TestOrderSchema.index({ paymentStatus: 1 });
TestOrderSchema.index({ qrCode: 1 });
TestOrderSchema.index({ createdAt: -1 });

export const TestOrder = mongoose.model<ITestOrder>('TestOrder', TestOrderSchema);