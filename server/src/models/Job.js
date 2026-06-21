import mongoose from 'mongoose';
import { env } from '../config/env.js';

const jobSchema = new mongoose.Schema({}, { strict: false, timestamps: true });

jobSchema.index({
  title: 'text',
  jobTitle: 'text',
  company: 'text',
  companyName: 'text',
  description: 'text',
  jobDescription: 'text',
  skills: 'text',
  location: 'text'
});

export const Job = mongoose.models.Job || mongoose.model('Job', jobSchema, env.jobsCollection);
