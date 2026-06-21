import { normalizeJob } from './jobNormalizer.js';

const stopWords = new Set([
  'the',
  'and',
  'for',
  'with',
  'that',
  'this',
  'you',
  'are',
  'will',
  'from',
  'your',
  'our',
  'job',
  'role',
  'team',
  'work',
  'have',
  'has',
  'experience',
  'years',
  'using',
  'skills',
  'required',
  'preferred',
  'responsibilities',
  'qualifications'
]);

function tokenize(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[^a-z0-9+#.]+/g, ' ')
    .split(/\s+/)
    .map((token) => token.trim())
    .filter((token) => token.length > 2 && !stopWords.has(token));
}

function uniqueTokens(value) {
  return [...new Set(tokenize(value))];
}

function skillHit(skill, resumeText) {
  const normalizedSkill = String(skill || '').toLowerCase().trim();
  if (!normalizedSkill) return false;
  return resumeText.includes(normalizedSkill) || normalizedSkill.split(/\s+/).every((part) => resumeText.includes(part));
}

export function matchJobToCandidate(job, candidate) {
  const normalized = normalizeJob(job);
  const resumeParts = [
    candidate.masterResume?.text,
    candidate.targetTitles?.join(' '),
    candidate.targetTitle,
    candidate.locations?.join(' '),
    candidate.location,
    candidate.workAuthorization
  ];
  const resumeText = resumeParts.filter(Boolean).join(' ').toLowerCase();
  const jobText = [
    normalized.title,
    normalized.company,
    normalized.location,
    normalized.description,
    normalized.skills.join(' ')
  ].join(' ');

  const resumeTokens = new Set(uniqueTokens(resumeText));
  const jobTokens = uniqueTokens(jobText);
  const overlap = jobTokens.filter((token) => resumeTokens.has(token));
  const contentScore = jobTokens.length ? overlap.length / jobTokens.length : 0;

  const matchedSkills = normalized.skills.filter((skill) => skillHit(skill, resumeText));
  const missingSkills = normalized.skills.filter((skill) => !skillHit(skill, resumeText)).slice(0, 12);
  const skillScore = normalized.skills.length ? matchedSkills.length / normalized.skills.length : contentScore;

  const targetTitles = candidate.targetTitles?.length ? candidate.targetTitles : [candidate.targetTitle].filter(Boolean);
  const targetTitleScore = targetTitles.some((title) => normalized.title.toLowerCase().includes(String(title).toLowerCase()))
    ? 1
    : 0;

  const score = Math.round(Math.min(100, (contentScore * 0.45 + skillScore * 0.45 + targetTitleScore * 0.1) * 100));

  return {
    job: normalized,
    score,
    matchedSkills,
    missingSkills,
    summary:
      score >= 75
        ? 'Strong alignment with resume language and required skills.'
        : 'Below threshold; review missing skills before applying.'
  };
}
