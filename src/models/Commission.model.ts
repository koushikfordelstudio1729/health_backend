import mongoose, { Schema } from 'mongoose';
import { ICommission, CommissionType, PaymentStatus } from '../types';

const CommissionSchema = new Schema<ICommission>({
  doctorId: {
    type: Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },
  patientId: {
    type: String,
    ref: 'Patient',
    required: true
  },
  orderId: {
    type: Schema.Types.ObjectId,
    ref: 'TestOrder',
    required: true
  },
  commissionType: {
    type: String,
    enum: Object.values(CommissionType),
    required: true,
    default: CommissionType.TEST_REFERRAL
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  percentage: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  calculatedDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  paymentStatus: {
    type: String,
    enum: Object.values(PaymentStatus),
    required: true,
    default: PaymentStatus.PENDING
  },
  paymentDate: {
    type: Date
  },
  branchId: {
    type: String,
    ref: 'Branch',
    required: true
  }
}, {
  timestamps: true,
  versionKey: false
});

CommissionSchema.index({ doctorId: 1 });
CommissionSchema.index({ orderId: 1 });
CommissionSchema.index({ branchId: 1 });
CommissionSchema.index({ paymentStatus: 1 });
CommissionSchema.index({ calculatedDate: -1 });

export const Commission = mongoose.model<ICommission>('Commission', CommissionSchema);