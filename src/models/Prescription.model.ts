import mongoose, { Schema } from 'mongoose';
import { IPrescription, IVitals, IExamination, IMedicine } from '../types';

const VitalsSchema = new Schema<IVitals>({
  height: {
    type: Number,
    required: true,
    min: 0
  },
  weight: {
    type: Number,
    required: true,
    min: 0
  },
  bp: {
    type: String,
    required: true,
    trim: true
  },
  spo2: {
    type: Number,
    required: true,
    min: 0,
    max: 100
  },
  temperature: {
    type: Number,
    required: true,
    min: 0
  }
}, { _id: false });

const ExaminationSchema = new Schema<IExamination>({
  complaints: {
    type: String,
    required: true,
    trim: true
  },
  findings: {
    type: String,
    required: true,
    trim: true
  },
  diagnosis: {
    type: String,
    required: true,
    trim: true
  }
}, { _id: false });

const MedicineSchema = new Schema<IMedicine>({
  medicineName: {
    type: String,
    required: true,
    trim: true
  },
  dosage: {
    type: String,
    required: true,
    trim: true
  },
  duration: {
    type: String,
    required: true,
    trim: true
  },
  instructions: {
    type: String,
    required: true,
    trim: true
  }
}, { _id: false });

const PrescriptionSchema = new Schema<IPrescription>({
  prescriptionId: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  visitId: {
    type: Schema.Types.ObjectId,
    ref: 'PatientVisit',
    required: true
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
  vitals: {
    type: VitalsSchema,
    required: true
  },
  examination: {
    type: ExaminationSchema,
    required: true
  },
  testsRecommended: [{
    type: Schema.Types.ObjectId,
    ref: 'Test'
  }],
  medicinesRecommended: [MedicineSchema]
}, {
  timestamps: true,
  versionKey: false
});

PrescriptionSchema.index({ prescriptionId: 1 });
PrescriptionSchema.index({ visitId: 1 });
PrescriptionSchema.index({ patientId: 1 });
PrescriptionSchema.index({ doctorId: 1 });
PrescriptionSchema.index({ createdAt: -1 });

export const Prescription = mongoose.model<IPrescription>('Prescription', PrescriptionSchema);