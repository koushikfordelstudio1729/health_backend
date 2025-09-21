import { Document, ObjectId } from 'mongoose';

export enum UserRole {
  ADMIN = 'ADMIN',
  BRANCH_MANAGER = 'BRANCH_MANAGER',
  OPD_STAFF = 'OPD_STAFF',
  LAB_STAFF = 'LAB_STAFF',
  PHARMACY_STAFF = 'PHARMACY_STAFF',
  MARKETING_EMPLOYEE = 'MARKETING_EMPLOYEE',
  GENERAL_EMPLOYEE = 'GENERAL_EMPLOYEE'
}

export enum Gender {
  MALE = 'Male',
  FEMALE = 'Female',
  OTHER = 'Other'
}

export enum PaymentMode {
  CASH = 'CASH',
  CARD = 'CARD',
  ONLINE = 'ONLINE',
  CASH_ONLINE = 'CASH_ONLINE',
  CASH_CARD = 'CASH_CARD',
  INSURANCE = 'INSURANCE',
  DUE = 'DUE'
}

export enum PaymentStatus {
  PAID = 'PAID',
  PENDING = 'PENDING',
  PARTIAL = 'PARTIAL'
}

export enum VisitType {
  CONSULTATION = 'CONSULTATION',
  FOLLOW_UP = 'FOLLOW_UP'
}

export enum TestCategory {
  PATHOLOGY = 'PATHOLOGY',
  RADIOLOGY = 'RADIOLOGY',
  CARDIOLOGY = 'CARDIOLOGY',
  OTHER = 'OTHER'
}

export enum TestStatus {
  PENDING = 'PENDING',
  COLLECTED = 'COLLECTED',
  PROCESSING = 'PROCESSING',
  COMPLETED = 'COMPLETED'
}

export enum CommissionType {
  TEST_REFERRAL = 'TEST_REFERRAL'
}

export enum InventoryCategory {
  MEDICINE = 'MEDICINE',
  LAB_SUPPLY = 'LAB_SUPPLY',
  EQUIPMENT = 'EQUIPMENT',
  OTHER = 'OTHER'
}

export enum TaskStatus {
  PENDING = 'PENDING',
  IN_PROGRESS = 'IN_PROGRESS',
  COMPLETED = 'COMPLETED'
}

export enum LeaveStatus {
  PENDING = 'PENDING',
  APPROVED = 'APPROVED',
  REJECTED = 'REJECTED'
}

export enum ComplaintStatus {
  OPEN = 'OPEN',
  IN_PROGRESS = 'IN_PROGRESS',
  RESOLVED = 'RESOLVED'
}

export interface IBranch extends Document {
  branchId: string;
  name: string;
  address: string;
  contact: string;
  email: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IUser extends Document {
  userId: string;
  username: string;
  password: string;
  name: string;
  email: string;
  phone: string;
  role: UserRole;
  branchId?: string;
  accessLevel: string[];
  isActive: boolean;
  lastLogin?: Date;
  refreshToken?: string;
  createdBy?: ObjectId;
  createdAt: Date;
  updatedAt: Date;
  comparePassword(candidatePassword: string): Promise<boolean>;
}

export interface IDoctor extends Document {
  doctorId: string;
  name: string;
  specialization: string;
  contact: string;
  email: string;
  consultationFee: number;
  commissionRate: number;
  availableBranches: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPatient extends Document {
  patientId: string;
  name: string;
  age: number;
  dob: Date;
  gender: Gender;
  contact: string;
  email?: string;
  address: string;
  branchId: string;
  registeredBy: ObjectId;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IPatientVisit extends Document {
  visitId: string;
  patientId: string;
  doctorId: ObjectId;
  branchId: string;
  visitDate: Date;
  consultationFee: number;
  paymentMode: PaymentMode;
  paymentStatus: PaymentStatus;
  nextVisitDate?: Date;
  visitType: VisitType;
  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IMedicine {
  medicineName: string;
  dosage: string;
  duration: string;
  instructions: string;
}

export interface IVitals {
  height: number;
  weight: number;
  bp: string;
  spo2: number;
  temperature: number;
}

export interface IExamination {
  complaints: string;
  findings: string;
  diagnosis: string;
}

export interface IPrescription extends Document {
  prescriptionId: string;
  visitId: ObjectId;
  patientId: string;
  doctorId: ObjectId;
  vitals: IVitals;
  examination: IExamination;
  testsRecommended: ObjectId[];
  medicinesRecommended: IMedicine[];
  createdAt: Date;
  updatedAt: Date;
}

export interface ITest extends Document {
  testId: string;
  testName: string;
  category: TestCategory;
  price: number;
  commissionRate: number;
  availableBranches: string[];
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface IOrderTest {
  testId: ObjectId;
  testName: string;
  price: number;
  status: TestStatus;
  collectionDate?: Date;
  completionDate?: Date;
}

export interface ITestOrder extends Document {
  orderId: string;
  patientId: string;
  visitId: ObjectId;
  referringDoctorId: ObjectId;
  tests: IOrderTest[];
  totalAmount: number;
  commissionAmount: number;
  paymentMode: PaymentMode;
  paymentStatus: PaymentStatus;
  qrCode: string;
  labId: string;
  branchId: string;
  createdBy: ObjectId;
  createdAt: Date;
  updatedAt: Date;
}

export interface IReportFile {
  filename: string;
  originalName: string;
  cloudinaryUrl: string;
  fileSize: number;
  mimeType: string;
}

export interface ITestReport extends Document {
  reportId: string;
  orderId: ObjectId;
  testId: ObjectId;
  patientId: string;
  reportFile: IReportFile;
  uploadedBy: ObjectId;
  uploadedAt: Date;
  isActive: boolean;
}

export interface ICommission extends Document {
  doctorId: ObjectId;
  patientId: string;
  orderId: ObjectId;
  commissionType: CommissionType;
  amount: number;
  percentage: number;
  calculatedDate: Date;
  paymentStatus: PaymentStatus;
  paymentDate?: Date;
  branchId: string;
  createdAt: Date;
}

export interface IInventory extends Document {
  itemId: string;
  itemName: string;
  category: InventoryCategory;
  quantity: number;
  minStockLevel: number;
  maxStockLevel: number;
  unitPrice: number;
  supplier: string;
  expiryDate: Date;
  branchId: string;
  lastUpdated: Date;
  createdAt: Date;
}

export interface IAttachment {
  filename: string;
  cloudinaryUrl: string;
}

export interface IExpense extends Document {
  expenseId: string;
  title: string;
  description: string;
  amount: number;
  category: string;
  date: Date;
  branchId: string;
  createdBy: ObjectId;
  attachments: IAttachment[];
  createdAt: Date;
}

export interface ITask {
  taskId: string;
  title: string;
  description: string;
  status: TaskStatus;
  assignedDate: Date;
  dueDate: Date;
  completedDate?: Date;
}

export interface ILeave {
  leaveId: string;
  leaveType: string;
  fromDate: Date;
  toDate: Date;
  reason: string;
  status: LeaveStatus;
  appliedDate: Date;
}

export interface IComplaint {
  complaintId: string;
  subject: string;
  description: string;
  status: ComplaintStatus;
  submittedDate: Date;
}

export interface IEmployee extends Document {
  employeeId: string;
  userId: ObjectId;
  designation: string;
  department: string;
  joiningDate: Date;
  salary: number;
  tasks: ITask[];
  leaves: ILeave[];
  complaints: IComplaint[];
  branchId: string;
  createdAt: Date;
}