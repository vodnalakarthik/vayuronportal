import mongoose from 'mongoose';
import { Candidate } from './candidate.model.js';
import { httpError } from '../../shared/utils/httpError.js';
import { safeRegex } from '../../shared/utils/safeRegex.js';

function normalizeList(value) {
  if (Array.isArray(value)) {
    return [...new Set(value.map((item) => String(item || '').trim()).filter(Boolean))];
  }

  return [
    ...new Set(
      String(value || '')
        .split(',')
        .map((item) => item.trim())
        .filter(Boolean)
    )
  ];
}

export function cleanCandidatePayload(body, actor) {
  const targetTitles = normalizeList(body.targetTitles?.length ? body.targetTitles : body.targetTitle);
  const locations = normalizeList(body.locations?.length ? body.locations : body.location);

  const payload = {
    firstName: body.firstName,
    lastName: body.lastName,
    email: body.email,
    phone: body.phone,
    location: locations[0] || '',
    locations,
    targetTitle: targetTitles[0] || '',
    targetTitles,
    yearsOfExperience: Number(body.yearsOfExperience || 0),
    workAuthorization: body.workAuthorization,
    status: body.status || 'active',
    masterResume: {
      text: body.masterResumeText || body.masterResume?.text,
      fileName: body.masterResumeFileName || body.masterResume?.fileName,
      updatedAt: new Date()
    }
  };

  if (actor) {
    payload.createdBy = actor.id;
    payload.createdByRole = actor.role;
  }

  return payload;
}

export function candidateVisibilityQuery(actor) {
  if (actor?.role === 'admin') return {};
  return { createdBy: actor.id };
}

export async function findAccessibleCandidate(id, actor, options = {}) {
  if (!mongoose.isValidObjectId(id)) throw httpError(404, 'Candidate not found.');

  const query = { _id: id, ...candidateVisibilityQuery(actor) };
  const candidate = options.lean ? await Candidate.findOne(query).lean({ virtuals: true }) : await Candidate.findOne(query);

  if (!candidate) throw httpError(404, 'Candidate not found.');
  return candidate;
}

export function buildCandidateSearchQuery(search, actor) {
  const query = { ...candidateVisibilityQuery(actor) };

  if (!search) return query;

  const regex = safeRegex(search);
  query.$or = [
    { firstName: regex },
    { lastName: regex },
    { email: regex },
    { targetTitle: regex },
    { targetTitles: regex },
    { location: regex },
    { locations: regex }
  ];

  return query;
}
