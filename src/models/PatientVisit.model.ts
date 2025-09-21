import mongoose, { Schema } from 'mongoose';
import { IPatientVisit, PaymentMode, PaymentStatus, VisitType } from '../types';

const PatientVisitSchema = new Schema<IPatientVisit>({
  visitId: {
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
  doctorId: {
    type: Schema.Types.ObjectId,
    ref: 'Doctor',
    required: true
  },
  branchId: {
    type: String,
    ref: 'Branch',
    required: true
  },
  visitDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  consultationFee: {
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
  nextVisitDate: {
    type: Date
  },
  visitType: {
    type: String,
    enum: Object.values(VisitType),
    required: true,
    default: VisitType.CONSULTATION
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

PatientVisitSchema.index({ visitId: 1 });
PatientVisitSchema.index({ patientId: 1 });
PatientVisitSchema.index({ doctorId: 1 });
PatientVisitSchema.index({ branchId: 1 });
PatientVisitSchema.index({ visitDate: -1 });
PatientVisitSchema.index({ paymentStatus: 1 });

export const PatientVisit = mongoose.model<IPatientVisit>('PatientVisit', PatientVisitSchema);