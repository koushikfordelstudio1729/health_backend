import mongoose, { Schema } from 'mongoose';
import { IPatient, Gender } from '../types';

const PatientSchema = new Schema<IPatient>({
  patientId: {
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
  age: {
    type: Number,
    required: true,
    min: 0,
    max: 150
  },
  dob: {
    type: Date,
    required: true
  },
  gender: {
    type: String,
    enum: Object.values(Gender),
    required: true
  },
  contact: {
    type: String,
    required: true,
    trim: true
  },
  email: {
    type: String,
    trim: true,
    lowercase: true
  },
  address: {
    type: String,
    required: true,
    trim: true
  },
  branchId: {
    type: String,
    ref: 'Branch',
    required: true
  },
  registeredBy: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  versionKey: false
});

PatientSchema.index({ patientId: 1 });
PatientSchema.index({ branchId: 1 });
PatientSchema.index({ contact: 1 });
PatientSchema.index({ isActive: 1 });
PatientSchema.index({ createdAt: -1 });

export const Patient = mongoose.model<IPatient>('Patient', PatientSchema);