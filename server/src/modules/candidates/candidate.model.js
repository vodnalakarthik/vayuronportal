import mongoose from 'mongoose';

const candidateSchema = new mongoose.Schema(
  {
    firstName: { type: String, required: true, trim: true },
    lastName: { type: String, required: true, trim: true },
    email: { type: String, required: true, unique: true, lowercase: true, trim: true },
    phone: { type: String, trim: true },
    location: { type: String, trim: true },
    locations: [{ type: String, trim: true }],
    targetTitle: { type: String, trim: true },
    targetTitles: [{ type: String, trim: true }],
    yearsOfExperience: { type: Number, min: 0, default: 0 },
    workAuthorization: { type: String, trim: true },
    masterResume: {
      text: { type: String, required: true },
      fileName: String,
      updatedAt: Date
    },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', index: true },
    createdByRole: { type: String, enum: ['admin', 'recruiter'] },
    status: { type: String, enum: ['active', 'archived'], default: 'active', index: true }
  },
  { timestamps: true }
);

candidateSchema.virtual('fullName').get(function getFullName() {
  return `${this.firstName} ${this.lastName}`.trim();
});

candidateSchema.index({ createdBy: 1, createdAt: -1 });
candidateSchema.index({ firstName: 1, lastName: 1 });
candidateSchema.index({ targetTitle: 1, location: 1 });
candidateSchema.set('toJSON', { virtuals: true });
candidateSchema.set('toObject', { virtuals: true });

export const Candidate = mongoose.model('Candidate', candidateSchema);
