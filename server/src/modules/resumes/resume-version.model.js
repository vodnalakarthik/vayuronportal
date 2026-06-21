import mongoose from 'mongoose';

const resumeVersionSchema = new mongoose.Schema(
  {
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', index: true },
    createdBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    version: { type: Number, required: true, default: 1 },
    status: { type: String, enum: ['draft', 'approved', 'used_for_application'], default: 'draft', index: true },
    provider: { type: String, default: 'placeholder' },
    promptVersion: String,
    content: { type: String, required: true },
    structuredContent: mongoose.Schema.Types.Mixed,
    sourceAnalysis: mongoose.Schema.Types.Mixed,
    jobSnapshot: {
      title: String,
      company: String,
      location: String,
      applyUrl: String
    },
    notes: String
  },
  { timestamps: true }
);

resumeVersionSchema.index({ candidateId: 1, jobId: 1, version: -1 });
resumeVersionSchema.index({ createdBy: 1, createdAt: -1 });

export const ResumeVersion = mongoose.models.ResumeVersion || mongoose.model('ResumeVersion', resumeVersionSchema);
