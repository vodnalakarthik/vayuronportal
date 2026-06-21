import mongoose from 'mongoose';

const aiJobAnalysisSchema = new mongoose.Schema(
  {
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
    jobId: { type: mongoose.Schema.Types.ObjectId, ref: 'Job', required: true, index: true },
    candidateCacheKey: { type: String, required: true, index: true },
    provider: { type: String, default: 'anthropic' },
    model: String,
    promptVersion: String,
    qualified: { type: Boolean, default: false, index: true },
    verdict: String,
    criteriaMatched: Number,
    score: Number,
    analysis: mongoose.Schema.Types.Mixed,
    jobDna: mongoose.Schema.Types.Mixed,
    jobSnapshot: {
      title: String,
      company: String,
      location: String,
      applyUrl: String
    }
  },
  { timestamps: true }
);

aiJobAnalysisSchema.index({ candidateId: 1, jobId: 1, candidateCacheKey: 1 }, { unique: true });

export const AiJobAnalysis = mongoose.model('AiJobAnalysis', aiJobAnalysisSchema);
