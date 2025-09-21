import mongoose, { Schema } from 'mongoose';
import { IEmployee, ITask, ILeave, IComplaint, TaskStatus, LeaveStatus, ComplaintStatus } from '../types';

const TaskSchema = new Schema<ITask>({
  taskId: {
    type: String,
    required: true,
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
  status: {
    type: String,
    enum: Object.values(TaskStatus),
    required: true,
    default: TaskStatus.PENDING
  },
  assignedDate: {
    type: Date,
    required: true,
    default: Date.now
  },
  dueDate: {
    type: Date,
    required: true
  },
  completedDate: {
    type: Date
  }
}, { _id: false });

const LeaveSchema = new Schema<ILeave>({
  leaveId: {
    type: String,
    required: true,
    trim: true
  },
  leaveType: {
    type: String,
    required: true,
    trim: true
  },
  fromDate: {
    type: Date,
    required: true
  },
  toDate: {
    type: Date,
    required: true
  },
  reason: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: Object.values(LeaveStatus),
    required: true,
    default: LeaveStatus.PENDING
  },
  appliedDate: {
    type: Date,
    required: true,
    default: Date.now
  }
}, { _id: false });

const ComplaintSchema = new Schema<IComplaint>({
  complaintId: {
    type: String,
    required: true,
    trim: true
  },
  subject: {
    type: String,
    required: true,
    trim: true
  },
  description: {
    type: String,
    required: true,
    trim: true
  },
  status: {
    type: String,
    enum: Object.values(ComplaintStatus),
    required: true,
    default: ComplaintStatus.OPEN
  },
  submittedDate: {
    type: Date,
    required: true,
    default: Date.now
  }
}, { _id: false });

const EmployeeSchema = new Schema<IEmployee>({
  employeeId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  userId: {
    type: Schema.Types.ObjectId,
    ref: 'User',
    required: true,
    unique: true
  },
  designation: {
    type: String,
    required: true,
    trim: true
  },
  department: {
    type: String,
    required: true,
    trim: true
  },
  joiningDate: {
    type: Date,
    required: true
  },
  salary: {
    type: Number,
    required: true,
    min: 0
  },
  tasks: [TaskSchema],
  leaves: [LeaveSchema],
  complaints: [ComplaintSchema],
  branchId: {
    type: String,
    ref: 'Branch',
    required: true
  }
}, {
  timestamps: true,
  versionKey: false
});

EmployeeSchema.index({ employeeId: 1 });
EmployeeSchema.index({ userId: 1 });
EmployeeSchema.index({ branchId: 1 });
EmployeeSchema.index({ department: 1 });
EmployeeSchema.index({ joiningDate: -1 });

export const Employee = mongoose.model<IEmployee>('Employee', EmployeeSchema);