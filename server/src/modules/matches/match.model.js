import mongoose from 'mongoose';

const matchSchema = new mongoose.Schema(
  {
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    score: { type: Number, required: true, min: 0, max: 100, index: true },
    threshold: { type: Number, default: 75 },
    status: {
      type: String,
      enum: ['matched', 'below_threshold', 'resume_pending', 'resume_generated', 'applied', 'archived'],
      default: 'matched',
      index: true
    },
    matchedSkills: [String],
    missingSkills: [String],
    aiProvider: String,
    aiModel: String,
    criteriaMatched: { type: Number, min: 0, max: 4 },
    verdict: String,
    preFilterScore: { type: Number, min: 0, max: 100 },
    preFilterRank: Number,
    preFilterMatchedSkills: [String],
    preFilterMissingSkills: [String],
    checkpoints: mongoose.Schema.Types.Mixed,
    jobDna: mongoose.Schema.Types.Mixed,
    aiAnalysis: mongoose.Schema.Types.Mixed,
    titleMatch: Number,
    locationMatch: Number,
    experienceMatch: Number,
    reasonSummary: String,
    jobSnapshot: {
      title: String,
      company: String,
      location: String,
      applyUrl: String
    },
    matchedAt: { type: Date, default: Date.now }
  },
  { timestamps: true }
);

matchSchema.index({ candidateId: 1, jobId: 1 }, { unique: true });
matchSchema.index({ candidateId: 1, score: -1 });
matchSchema.index({ requestedBy: 1, createdAt: -1 });

export const Match = mongoose.model('Match', matchSchema);
