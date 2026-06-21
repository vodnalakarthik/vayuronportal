import he from 'he';
import { convert } from 'html-to-text';

const firstValue = (source, keys, fallback = '') => {
  for (const key of keys) {
    const value = source?.[key];
    if (Array.isArray(value) && value.length) return value.join(', ');
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return fallback;
};

function descriptionValue(value) {
  if (typeof value === 'string' || typeof value === 'number') return String(value);
  if (!value || typeof value !== 'object') return '';

  return firstValue(value, ['content', 'html', 'text', 'value', 'body'], '');
}

function normalizeLocation(raw) {
  const direct = firstValue(
    raw,
    ['location', 'jobLocation', 'job_location', 'workLocation', 'work_location'],
    ''
  );
  const directText = String(direct || '').trim();
  if (/[a-z0-9]/i.test(directText)) return directText;

  const parts = [
    firstValue(raw, ['city', 'job_city'], ''),
    firstValue(raw, ['state', 'job_state'], ''),
    firstValue(raw, ['country', 'job_country'], '')
  ]
    .map(String)
    .map((part) => part.trim())
    .filter((part) => /[a-z0-9]/i.test(part))
    .map((part) => (/^us(a)?$/i.test(part) ? 'United States' : part));

  if (parts.length) return [...new Set(parts)].join(', ');
  if (raw?.job_is_remote === true || raw?.is_remote === true || raw?.remote === true) return 'Remote';
  return firstValue(raw, ['remote'], 'Not specified');
}

export function normalizeJobDescription(value) {
  let decoded = descriptionValue(value);
  if (!decoded.trim()) return '';

  // Greenhouse content may be entity-encoded more than once by ingestion pipelines.
  for (let pass = 0; pass < 3; pass += 1) {
    const next = he.decode(decoded);
    if (next === decoded) break;
    decoded = next;
  }

  const text = /<[^>]+>/.test(decoded)
    ? convert(decoded, {
        wordwrap: false,
        selectors: [
          { selector: 'a', options: { ignoreHref: true } },
          { selector: 'img', format: 'skip' }
        ]
      })
    : decoded;

  return text
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+\n/g, '\n')
    .replace(/\n[ \t]+/g, '\n')
    .replace(/[ \t]{2,}/g, ' ')
    .replace(/\n{3,}/g, '\n\n')
    .trim();
}

export function normalizeJob(job) {
  const raw = job?.toObject ? job.toObject() : job;
  const title = firstValue(raw, ['title', 'jobTitle', 'job_title', 'position', 'role', 'name'], 'Untitled role');
  const company = firstValue(
    raw,
    ['company', 'companyName', 'company_name', 'employer_name', 'organization', 'employer'],
    'Unknown company'
  );
  const location = normalizeLocation(raw);
  const description = firstValue(
    raw,
    ['description', 'jobDescription', 'job_description', 'content', 'summary', 'details', 'responsibilities']
  );
  const url = firstValue(
    raw,
    [
      'url',
      'jobUrl',
      'job_url',
      'applyUrl',
      'apply_url',
      'job_apply_link',
      'job_google_link',
      'direct_apply_url',
      'absolute_url',
      'link',
      'sourceUrl',
      'source_url'
    ]
  );
  const postedAt = firstValue(
    raw,
    [
      'postedAt',
      'posted_at',
      'datePosted',
      'date_posted',
      'job_posted_at_datetime_utc',
      'job_posted_at_timestamp',
      'createdAt',
      'publishedAt'
    ]
  );
  const skills = extractSkills(raw);

  return {
    ...raw,
    id: String(raw._id),
    title: String(title),
    company: String(company),
    location: String(location),
    description: normalizeJobDescription(description),
    url: String(url || ''),
    applyUrl: String(url || ''),
    logo: firstValue(raw, ['company_logo', 'companyLogo', 'employer_logo', 'logo'], ''),
    publisher: firstValue(raw, ['job_publisher', 'publisher', 'source'], ''),
    postedAt,
    skills
  };
}

export function extractSkills(raw) {
  const directSkills = raw?.skills || raw?.requiredSkills || raw?.required_skills || raw?.technologies;
  if (Array.isArray(directSkills)) return directSkills.map(String).filter(Boolean);

  const candidate = firstValue(raw, ['skills', 'requiredSkills', 'required_skills', 'technologies', 'requirements'], '');
  if (Array.isArray(candidate)) return candidate.map(String).filter(Boolean);

  return String(candidate)
    .split(/[,;|/\n]/)
    .map((skill) => skill.trim())
    .filter((skill) => skill.length > 1)
    .slice(0, 40);
}
