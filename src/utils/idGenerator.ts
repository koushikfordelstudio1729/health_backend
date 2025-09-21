import { Branch, Patient, PatientVisit, TestOrder, Prescription, TestReport, Expense, Employee } from '../models';
import mongoose, { Document, Model } from 'mongoose';

interface CounterDoc extends Document {
  _id: string;
  sequence: number;
}

// Create Counter model once to avoid "Cannot overwrite model" error
const CounterSchema = new mongoose.Schema<CounterDoc>({
  _id: { type: String, required: true },
  sequence: { type: Number, default: 0 }
});

const Counter: Model<CounterDoc> = mongoose.models.Counter || mongoose.model<CounterDoc>('Counter', CounterSchema);

const getNextSequence = async (name: string): Promise<number> => {
  const result = await Counter.findOneAndUpdate(
    { _id: name },
    { $inc: { sequence: 1 } },
    { new: true, upsert: true }
  );

  if (!result) {
    throw new Error(`Failed to generate sequence for ${name}`);
  }

  return result.sequence;
};

export class IDGenerator {
  static async generateBranchId(): Promise<string> {
    const sequence = await getNextSequence('branchId');
    return `BR${sequence.toString().padStart(3, '0')}`;
  }

  static async generateUserId(branchId: string, role: string): Promise<string> {
    const rolePrefix = role.split('_')[0]; // ADMIN -> ADMIN, OPD_STAFF -> OPD
    const sequence = await getNextSequence(`userId_${branchId}_${rolePrefix}`);
    return `${branchId}-${rolePrefix}${sequence.toString().padStart(3, '0')}`;
  }

  static async generatePatientId(branchId: string): Promise<string> {
    const sequence = await getNextSequence(`patientId_${branchId}`);
    return `${branchId}-PAT${sequence.toString().padStart(3, '0')}`;
  }

  static async generateVisitId(branchId: string): Promise<string> {
    const sequence = await getNextSequence(`visitId_${branchId}`);
    return `${branchId}-VIS${sequence.toString().padStart(3, '0')}`;
  }

  static async generateDoctorId(): Promise<string> {
    const sequence = await getNextSequence('doctorId');
    return `DOC${sequence.toString().padStart(3, '0')}`;
  }

  static async generateTestId(): Promise<string> {
    const sequence = await getNextSequence('testId');
    return `TST${sequence.toString().padStart(3, '0')}`;
  }

  static async generateOrderId(branchId: string): Promise<string> {
    const sequence = await getNextSequence(`orderId_${branchId}`);
    return `${branchId}-ORD${sequence.toString().padStart(3, '0')}`;
  }

  static async generatePrescriptionId(branchId: string): Promise<string> {
    const sequence = await getNextSequence(`prescriptionId_${branchId}`);
    return `${branchId}-PRE${sequence.toString().padStart(3, '0')}`;
  }

  static async generateReportId(branchId: string): Promise<string> {
    const sequence = await getNextSequence(`reportId_${branchId}`);
    return `${branchId}-REP${sequence.toString().padStart(3, '0')}`;
  }

  static async generateExpenseId(branchId: string): Promise<string> {
    const sequence = await getNextSequence(`expenseId_${branchId}`);
    return `${branchId}-EXP${sequence.toString().padStart(3, '0')}`;
  }

  static async generateEmployeeId(branchId: string): Promise<string> {
    const sequence = await getNextSequence(`employeeId_${branchId}`);
    return `${branchId}-EMP${sequence.toString().padStart(3, '0')}`;
  }

  static async generateTaskId(branchId: string): Promise<string> {
    const sequence = await getNextSequence(`taskId_${branchId}`);
    return `${branchId}-TSK${sequence.toString().padStart(3, '0')}`;
  }

  static async generateLeaveId(branchId: string): Promise<string> {
    const sequence = await getNextSequence(`leaveId_${branchId}`);
    return `${branchId}-LEV${sequence.toString().padStart(3, '0')}`;
  }

  static async generateComplaintId(branchId: string): Promise<string> {
    const sequence = await getNextSequence(`complaintId_${branchId}`);
    return `${branchId}-CMP${sequence.toString().padStart(3, '0')}`;
  }

  static async generateItemId(branchId: string): Promise<string> {
    const sequence = await getNextSequence(`itemId_${branchId}`);
    return `${branchId}-ITM${sequence.toString().padStart(3, '0')}`;
  }
}