import mongoose, { Schema } from 'mongoose';
import { IInventory, InventoryCategory } from '../types';

const InventorySchema = new Schema<IInventory>({
  itemId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  itemName: {
    type: String,
    required: true,
    trim: true
  },
  category: {
    type: String,
    enum: Object.values(InventoryCategory),
    required: true
  },
  quantity: {
    type: Number,
    required: true,
    min: 0
  },
  minStockLevel: {
    type: Number,
    required: true,
    min: 0
  },
  maxStockLevel: {
    type: Number,
    required: true,
    min: 0
  },
  unitPrice: {
    type: Number,
    required: true,
    min: 0
  },
  supplier: {
    type: String,
    required: true,
    trim: true
  },
  expiryDate: {
    type: Date,
    required: true
  },
  branchId: {
    type: String,
    ref: 'Branch',
    required: true
  },
  lastUpdated: {
    type: Date,
    required: true,
    default: Date.now
  }
}, {
  timestamps: true,
  versionKey: false
});

InventorySchema.index({ itemId: 1 });
InventorySchema.index({ branchId: 1 });
InventorySchema.index({ category: 1 });
InventorySchema.index({ quantity: 1 });
InventorySchema.index({ expiryDate: 1 });

InventorySchema.virtual('isLowStock').get(function() {
  return this.quantity <= this.minStockLevel;
});

InventorySchema.virtual('isExpiringSoon').get(function() {
  const thirtyDaysFromNow = new Date();
  thirtyDaysFromNow.setDate(thirtyDaysFromNow.getDate() + 30);
  return this.expiryDate <= thirtyDaysFromNow;
});

export const Inventory = mongoose.model<IInventory>('Inventory', InventorySchema);