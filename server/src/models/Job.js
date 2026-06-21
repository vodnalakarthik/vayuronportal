import mongoose from 'mongoose';
import { env } from '../config/env.js';

const jobSchema = new mongoose.Schema({}, { strict: false, timestamps: true });

jobSchema.index({
  title: 'text',
  jobTitle: 'text',
  job_title: 'text',
  company: 'text',
  companyName: 'text',
  employer_name: 'text',
  description: 'text',
  jobDescription: 'text',
  job_description: 'text',
  skills: 'text',
  location: 'text'
});

export const Job = mongoose.models.Job || mongoose.model('Job', jobSchema, env.jobsCollection);
