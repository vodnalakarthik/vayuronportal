import mongoose from 'mongoose';

const matchRunSchema = new mongoose.Schema(
  {
    candidateId: { type: mongoose.Schema.Types.ObjectId, ref: 'Candidate', required: true, index: true },
    requestedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    status: {
      type: String,
      enum: ['queued', 'running', 'cancelling', 'cancelled', 'completed', 'failed'],
      default: 'queued',
      index: true
    },
    cancelRequested: { type: Boolean, default: false },
    days: { type: Number, default: 2 },
    dateScope: { type: String, enum: ['all', 'last2d', 'last1d'], default: 'last2d' },
    titleKeywords: [String],
    totalFetched: { type: Number, default: 0 },
    layer1Passed: { type: Number, default: 0 },
    layer1Discarded: { type: Number, default: 0 },
    preFilterPoolSize: { type: Number, default: 0 },
    qualifiedByClaude: { type: Number, default: 0 },
    totalScanned: { type: Number, default: 0 },
    processed: { type: Number, default: 0 },
    matched: { type: Number, default: 0 },
    cached: { type: Number, default: 0 },
    failed: { type: Number, default: 0 },
    currentJobTitle: String,
    error: String,
    startedAt: Date,
    cancelledAt: Date,
    completedAt: Date
  },
  { timestamps: true }
);

matchRunSchema.index({ candidateId: 1, createdAt: -1 });
matchRunSchema.index({ requestedBy: 1, createdAt: -1 });

export const MatchRun = mongoose.model('MatchRun', matchRunSchema);
