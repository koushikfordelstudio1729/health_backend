import mongoose, { Schema } from 'mongoose';
import { ITest, TestCategory } from '../types';

const TestSchema = new Schema<ITest>({
  testId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  testName: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    enum: Object.values(TestCategory),
    required: true
  },
  price: {
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

TestSchema.index({ testId: 1 });
TestSchema.index({ testName: 1 });
TestSchema.index({ category: 1 });
TestSchema.index({ isActive: 1 });
TestSchema.index({ availableBranches: 1 });

export const Test = mongoose.model<ITest>('Test', TestSchema);