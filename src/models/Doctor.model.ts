import mongoose, { Schema } from 'mongoose';
import { IDoctor } from '../types';

const DoctorSchema = new Schema<IDoctor>({
  doctorId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  name: {
    type: String,
    required: true,
    trim: true
  },
  specialization: {
    type: String,
    required: true,
    trim: true
  },
  contact: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    required: true,
    trim: true,
    lowercase: true
  },
  consultationFee: {
    type: Number,
    required: true,
    min: 0
  },
  commissionRate: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  availableBranches: [{
    type: String,
    ref: 'Branch'
  }],
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  versionKey: false
});

DoctorSchema.index({ doctorId: 1 });
DoctorSchema.index({ isActive: 1 });
DoctorSchema.index({ availableBranches: 1 });

export const Doctor = mongoose.model<IDoctor>('Doctor', DoctorSchema);