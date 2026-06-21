import mongoose from 'mongoose';

const applicationSchema = new mongoose.Schema(
  {
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    recruiterId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    matchId: { type: mongoose.Schema.Types.ObjectId, ref: 'Match', index: true },
    resumeVersionId: { type: mongoose.Schema.Types.ObjectId, ref: 'ResumeVersion', index: true },
    status: {
      type: String,
      enum: ['matched', 'resume_pending', 'resume_generated', 'ready_to_apply', 'applied', 'interview', 'offer', 'rejected', 'archived'],
      default: 'ready_to_apply',
      index: true
    },
    jobSnapshot: {
      title: String,
      company: String,
      location: String,
      applyUrl: String
    },
    candidateSnapshot: {
      fullName: String,
      email: String,
      targetTitle: String
    },
    notes: String,
    appliedAt: Date
  },
  { timestamps: true }
);

applicationSchema.index({ candidateId: 1, jobId: 1 }, { unique: true });
applicationSchema.index({ recruiterId: 1, status: 1, createdAt: -1 });
applicationSchema.index({ createdAt: -1 });

export const Application = mongoose.model('Application', applicationSchema);
