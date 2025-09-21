import mongoose, { Schema } from 'mongoose';
import { IBranch } from '../types';

const BranchSchema = new Schema<IBranch>({
  branchId: {
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
  address: {
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
  isActive: {
    type: Boolean,
    default: true
  }
}, {
  timestamps: true,
  versionKey: false
});

BranchSchema.index({ branchId: 1 });
BranchSchema.index({ isActive: 1 });

export const Branch = mongoose.model<IBranch>('Branch', BranchSchema);