import mongoose, { Schema } from 'mongoose';
import { IExpense, IAttachment } from '../types';

const AttachmentSchema = new Schema<IAttachment>({
  filename: {
    type: String,
    required: true,
    trim: true
  },
  cloudinaryUrl: {
    type: String,
    required: true,
    trim: true
  }
}, { _id: false });

const ExpenseSchema = new Schema<IExpense>({
  expenseId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  title: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  amount: {
    type: Number,
    required: true,
    min: 0
  },
  category: {
    type: String,
    required: true,
    trim: true
  },
  date: {
    type: Date,
    required: true,
    default: Date.now
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
  },
  attachments: [AttachmentSchema]
}, {
  timestamps: true,
  versionKey: false
});

ExpenseSchema.index({ expenseId: 1 });
ExpenseSchema.index({ branchId: 1 });
ExpenseSchema.index({ category: 1 });
ExpenseSchema.index({ date: -1 });
ExpenseSchema.index({ createdAt: -1 });

export const Expense = mongoose.model<IExpense>('Expense', ExpenseSchema);