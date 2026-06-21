const firstValue = (source, keys, fallback = '') => {
  for (const key of keys) {
    const value = source?.[key];
    if (Array.isArray(value) && value.length) return value.join(', ');
    if (value !== undefined && value !== null && String(value).trim()) return value;
  }
  return fallback;
};

export function normalizeJob(job) {
  const raw = job?.toObject ? job.toObject() : job;
  const title = firstValue(raw, ['title', 'jobTitle', 'position', 'role', 'name'], 'Untitled role');
  const company = firstValue(raw, ['company', 'companyName', 'company_name', 'organization', 'employer'], 'Unknown company');
  const location = firstValue(
    raw,
    ['location', 'jobLocation', 'job_location', 'city', 'job_city', 'workLocation', 'work_location', 'remote'],
    'Not specified'
  );
  const description = firstValue(raw, ['description', 'jobDescription', 'summary', 'details', 'responsibilities']);
  const url = firstValue(raw, ['url', 'jobUrl', 'job_url', 'applyUrl', 'apply_url', 'link', 'sourceUrl', 'source_url']);
  const postedAt = firstValue(raw, ['postedAt', 'posted_at', 'datePosted', 'date_posted', 'createdAt', 'publishedAt']);
  const skills = extractSkills(raw);

  return {
    ...raw,
    id: String(raw._id),
    title: String(title),
    company: String(company),
    location: String(location),
    description: String(description || ''),
    url: String(url || ''),
    applyUrl: String(url || ''),
    logo: firstValue(raw, ['company_logo', 'companyLogo', 'logo'], ''),
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
