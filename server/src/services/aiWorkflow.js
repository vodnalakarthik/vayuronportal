import { env } from '../config/env.js';
import { httpError } from '../shared/utils/httpError.js';
import { normalizeJob } from './jobNormalizer.js';
import { Job } from '../modules/jobs/job.model.js';
import { Application } from '../modules/applications/application.model.js';
import { AiJobAnalysis } from '../modules/matches/ai-job-analysis.model.js';
import { Match } from '../modules/matches/match.model.js';
import { MatchRun } from '../modules/matches/match-run.model.js';
import { ResumeVersion } from '../modules/resumes/resume-version.model.js';
import { Candidate } from '../modules/candidates/candidate.model.js';
import { recordAudit } from '../modules/audit/audit.service.js';

const ANALYSIS_PROMPT_VERSION = 'vayuron-ai-match-v1';
const RESUME_PROMPT_VERSION = 'vayuron-ai-resume-v2';
const PRE_FILTER_POOL_SIZE = 50;
const MAX_FINAL_RESULTS = 35;
const MIN_JD_SKILLS = 3;
const NEUTRAL_PRE_FILTER_SCORE = 50;

const SPONSORSHIP_EXEMPT_AUTHORIZATIONS = [
  'us citizen',
  'u.s. citizen',
  'green card',
  'permanent resident',
  'employment authorization document',
  'ead',
  'gc'
];

const SPONSORSHIP_AND_CLEARANCE_BLOCKERS = [
  'will not sponsor',
  'no sponsorship',
  'cannot sponsor',
  'sponsorship not available',
  'sponsorship is not available',
  'no visa sponsorship',
  'does not offer sponsorship',
  'we are unable to sponsor',
  'unable to provide sponsorship',
  'not able to sponsor',
  'visa sponsorship is not provided',
  'visa sponsorship is not available',
  'must be authorized to work without sponsorship',
  'authorization to work without sponsorship',
  'us citizen or green card only',
  'us citizenship required',
  'must be a us citizen',
  'requires us citizenship',
  'us citizens only',
  'active us citizenship',
  'security clearance required',
  'active clearance',
  'secret clearance',
  'top secret',
  'ts/sci',
  'dod clearance',
  'government clearance required',
  'must hold a clearance'
];

const ATS_SKILL_KEYWORDS = [
  ['Python'],
  ['SQL'],
  ['PySpark'],
  ['Scala'],
  ['Java'],
  ['R'],
  ['Bash'],
  ['Go', 'Golang'],
  ['TypeScript'],
  ['JavaScript'],
  ['C++'],
  ['Ruby'],
  ['Kotlin'],
  ['DAX'],
  ['VBA'],
  ['Apache Kafka', 'Kafka'],
  ['Kafka Streams'],
  ['Apache Airflow', 'Airflow'],
  ['Apache Spark', 'Spark'],
  ['Spark Streaming'],
  ['Apache Flink', 'Flink'],
  ['dbt'],
  ['Delta Lake'],
  ['Pulsar'],
  ['NiFi', 'Apache NiFi'],
  ['Debezium'],
  ['Great Expectations'],
  ['Snowpipe'],
  ['CDC', 'Change Data Capture'],
  ['ETL'],
  ['ELT'],
  ['Azure Data Factory', 'ADF'],
  ['AWS Glue', 'Glue'],
  ['Informatica'],
  ['Talend'],
  ['SSIS'],
  ['Fivetran'],
  ['Airbyte'],
  ['Stitch'],
  ['Snowflake'],
  ['Databricks', 'Azure Databricks'],
  ['Amazon Redshift', 'Redshift'],
  ['Google BigQuery', 'BigQuery'],
  ['PostgreSQL', 'Postgres'],
  ['MySQL'],
  ['SQL Server', 'Microsoft SQL Server'],
  ['Vertica'],
  ['MongoDB'],
  ['Cassandra'],
  ['DynamoDB'],
  ['Elasticsearch'],
  ['OpenSearch'],
  ['Redis'],
  ['Pinecone'],
  ['Neo4j'],
  ['Oracle'],
  ['AWS', 'Amazon Web Services'],
  ['Azure', 'Microsoft Azure'],
  ['GCP', 'Google Cloud', 'Google Cloud Platform'],
  ['S3', 'Amazon S3'],
  ['EC2'],
  ['Lambda', 'AWS Lambda'],
  ['EMR', 'Amazon EMR'],
  ['Azure Data Lake', 'ADLS'],
  ['Cloud Run'],
  ['Dataflow', 'Google Dataflow'],
  ['Kubernetes'],
  ['Docker'],
  ['ECS'],
  ['EKS'],
  ['Astronomer'],
  ['Prefect'],
  ['Dagster'],
  ['Luigi'],
  ['GitHub Actions'],
  ['Jenkins'],
  ['Azure DevOps'],
  ['GitLab CI', 'GitLab CI/CD'],
  ['Tekton'],
  ['ArgoCD', 'Argo CD'],
  ['Helm'],
  ['Terraform'],
  ['Ansible'],
  ['Tableau'],
  ['Power BI'],
  ['Looker'],
  ['Looker Studio'],
  ['Metabase'],
  ['Superset', 'Apache Superset'],
  ['Qlik'],
  ['MicroStrategy'],
  ['Excel'],
  ['Streamlit'],
  ['TensorFlow'],
  ['PyTorch'],
  ['Scikit-learn', 'sklearn'],
  ['XGBoost'],
  ['MLflow'],
  ['Kubeflow'],
  ['SageMaker'],
  ['Vertex AI'],
  ['Hugging Face'],
  ['LangChain'],
  ['OpenAI'],
  ['Spark MLlib', 'MLlib'],
  ['dbt tests'],
  ['Apache Atlas'],
  ['Azure Purview', 'Microsoft Purview', 'Purview'],
  ['Collibra'],
  ['Alation'],
  ['Atlan'],
  ['Unity Catalog'],
  ['Data Lineage'],
  ['Data Contracts'],
  ['GDPR'],
  ['HIPAA'],
  ['SOX'],
  ['PII'],
  ['RBAC']
].map(([name, ...aliases]) => ({ name, aliases: [name, ...aliases] }));

function requireAnthropicKey() {
  if (!env.anthropicApiKey) {
    throw httpError(503, 'Anthropic API key is missing. Add ANTHROPIC_API_KEY to the root .env file and restart the backend.');
  }
}

function candidateName(candidate) {
  return candidate.fullName || `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || 'Candidate';
}

function candidateCacheKey(candidate) {
  const resumeUpdatedAt = candidate.masterResume?.updatedAt ? new Date(candidate.masterResume.updatedAt).toISOString() : '';
  const profileUpdatedAt = candidate.updatedAt ? new Date(candidate.updatedAt).toISOString() : '';
  return `${resumeUpdatedAt}:${profileUpdatedAt}`;
}

function normalizeSearchText(value) {
  return String(value || '')
    .toLowerCase()
    .replace(/[’‘`]/g, "'")
    .replace(/[–—]/g, '-')
    .replace(/\s+/g, ' ')
    .trim();
}

function phraseInText(text, phrase) {
  const escaped = String(phrase || '')
    .toLowerCase()
    .replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
    .replace(/\s+/g, '\\s+');
  if (!escaped) return false;
  return new RegExp(`(^|[^a-z0-9])${escaped}($|[^a-z0-9])`, 'i').test(text);
}

export function extractAtsSkills(value) {
  const text = normalizeSearchText(value);
  return ATS_SKILL_KEYWORDS
    .filter((skill) => skill.aliases.some((alias) => phraseInText(text, alias)))
    .map((skill) => skill.name);
}

export function layer1SponsorshipCheck(job, candidate) {
  const authorization = normalizeSearchText(candidate?.workAuthorization);
  const sponsorshipExempt = SPONSORSHIP_EXEMPT_AUTHORIZATIONS.some((value) => authorization.includes(value));

  if (sponsorshipExempt) {
    return { pass: true, skipped: true, blocker: null };
  }

  const description = normalizeSearchText(normalizeJob(job).description);
  const blocker = SPONSORSHIP_AND_CLEARANCE_BLOCKERS.find((phrase) => description.includes(phrase));
  return blocker
    ? { pass: false, skipped: false, blocker }
    : { pass: true, skipped: false, blocker: null };
}

export function layer2SkillsScore(job, candidate, extractedCandidateSkills) {
  const normalizedJob = normalizeJob(job);
  const jobSkills = extractAtsSkills(normalizedJob.description);
  const candidateSkills = extractedCandidateSkills || extractAtsSkills(candidate?.masterResume?.text || '');
  const candidateSkillSet = new Set(candidateSkills);
  const matchedSkills = jobSkills.filter((skill) => candidateSkillSet.has(skill));
  const missingSkills = jobSkills.filter((skill) => !candidateSkillSet.has(skill));
  const score = jobSkills.length < MIN_JD_SKILLS
    ? NEUTRAL_PRE_FILTER_SCORE
    : Math.round((matchedSkills.length / jobSkills.length) * 100);

  return {
    score,
    matched: matchedSkills.length,
    total: jobSkills.length,
    matchedSkills,
    missingSkills,
    candidateSkills
  };
}

function postedTime(job) {
  const value = normalizeJob(job).postedAt;
  const parsed = value ? new Date(value).getTime() : 0;
  return Number.isFinite(parsed) ? parsed : 0;
}

export function preFilterAndScore(jobs, candidate, maxPool = PRE_FILTER_POOL_SIZE) {
  const ranked = [];
  let layer1Discarded = 0;
  let layer1Skipped = 0;
  const candidateSkills = extractAtsSkills(candidate?.masterResume?.text || '');

  for (const job of jobs) {
    const sponsorship = layer1SponsorshipCheck(job, candidate);
    if (!sponsorship.pass) {
      layer1Discarded += 1;
      continue;
    }

    if (sponsorship.skipped) layer1Skipped += 1;
    ranked.push({
      rawJob: job,
      preFilter: layer2SkillsScore(job, candidate, candidateSkills),
      postedTime: postedTime(job)
    });
  }

  ranked.sort((left, right) => (
    right.preFilter.score - left.preFilter.score
    || right.postedTime - left.postedTime
  ));

  return {
    jobs: ranked.slice(0, Math.max(1, Number(maxPool) || PRE_FILTER_POOL_SIZE)),
    totalFetched: jobs.length,
    layer1Passed: ranked.length,
    layer1Discarded,
    layer1Skipped
  };
}

function candidateProfile(candidate, { includeResume = true } = {}) {
  const lines = [
    `Candidate: ${candidateName(candidate)}`,
    `Target titles: ${(candidate.targetTitles?.length ? candidate.targetTitles : [candidate.targetTitle]).filter(Boolean).join(', ') || 'Open'}`,
    `Preferred locations: ${(candidate.locations?.length ? candidate.locations : [candidate.location]).filter(Boolean).join(', ') || 'Open'}`,
    `Experience: ${candidate.yearsOfExperience || 0} years`,
    `Work authorization: ${candidate.workAuthorization || 'Not specified'}`
  ];

  if (includeResume) {
    lines.push('', 'MASTER RESUME:', candidate.masterResume?.text || '');
  }

  return lines.join('\n');
}

function jobProfile(job) {
  const normalized = normalizeJob(job);
  return [
    `Title: ${normalized.title}`,
    `Company: ${normalized.company}`,
    `Location: ${normalized.location}`,
    `Apply URL: ${normalized.applyUrl || normalized.url || ''}`,
    `Posted: ${normalized.postedAt || ''}`,
    `Known skills: ${(normalized.skills || []).join(', ')}`,
    '',
    'JOB DESCRIPTION:',
    normalized.description || ''
  ].join('\n');
}

function extractText(responseJson) {
  return (responseJson.content || [])
    .map((part) => (part.type === 'text' ? part.text : ''))
    .filter(Boolean)
    .join('\n')
    .trim();
}

function parseJsonText(text) {
  const direct = text.trim();
  try {
    return JSON.parse(direct);
  } catch {
    const match = direct.match(/\{[\s\S]*\}/);
    if (!match) throw new Error('Claude returned non-JSON output.');
    return JSON.parse(match[0]);
  }
}

async function callClaude({ model, systemPrompt, userPrompt, maxTokens }) {
  requireAnthropicKey();

  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      const response = await fetch(env.anthropicApiUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'x-api-key': env.anthropicApiKey,
          'anthropic-version': '2023-06-01',
          'anthropic-beta': 'prompt-caching-2024-07-31'
        },
        body: JSON.stringify({
          model,
          max_tokens: maxTokens,
          temperature: 0,
          system: [
            {
              type: 'text',
              text: systemPrompt,
              cache_control: { type: 'ephemeral' }
            }
          ],
          messages: [{ role: 'user', content: userPrompt }]
        })
      });

      const data = await response.json().catch(() => ({}));
      if (response.ok) return parseJsonText(extractText(data));

      const message = data?.error?.message || `Anthropic request failed with HTTP ${response.status}.`;
      if (![429, 500, 502, 503, 504].includes(response.status)) throw new Error(message);
      lastError = new Error(message);
    } catch (error) {
      lastError = error;
    }

    await new Promise((resolve) => setTimeout(resolve, 600 * attempt));
  }

  throw httpError(502, `Anthropic request failed: ${lastError?.message || 'Unknown error'}`);
}

const analysisSystemPrompt = `You are Vayuron, a precise job qualification analyzer and resume intelligence engine.

You receive one job description and one candidate master resume. Analyze the role using exactly four criteria:

1. Job category and functional match.
   Check title-family alignment and core daily work. Functions matter more than exact tools. Equivalent tools count when they prove the same function.

2. Experience fit.
   Extract JD required years and candidate total professional years. Apply this formula exactly:
   gap = required_years - candidate_years.
   Pass when -2 <= gap <= 2. Fail when gap is outside that range.

3. Sponsorship, authorization, clearance, and location.
   Hard fail for no sponsorship, no visa support, US citizens only, required security clearance, or foreign work authorization the candidate does not have.
   Location-only onsite/hybrid mismatch is a flag, not a hard fail, because the candidate may relocate.

4. Domain and industry.
   Same or neutral technology domain passes. Different industry but same professional function is a flag, not a hard fail. Hard fail only when the profession itself is wrong.

The portal should list a job when at least 3 of the 4 criteria match and there is no hard blocker from sponsorship, clearance, work authorization, or completely wrong profession.

Extract Job DNA for resume tailoring:
- all_work: core daily work in priority order
- tool_slots: each JD tool with category, match tier EXACT/EQUIVALENT/ADJACENT/MISSING, candidate_tool, and is_core_requirement
- required_skills: JD skills/tools that matter for ATS
- preferred_skills: preferred qualifications that candidate can truthfully support
- soft_skills, communication, work_style, employer_vocabulary, domain_keywords, immediate_needs

Return only valid JSON with this shape:
{
  "job_title": "",
  "company": "",
  "location": "",
  "role_type": "",
  "seniority": "",
  "domain": "",
  "verdict": "QUALIFIED | PARTIAL_MATCH | DISQUALIFIED",
  "criteria_matched": 0,
  "qualified": false,
  "overall_assessment": "",
  "skills_gap": "None",
  "relatedness_score": 0.0,
  "checkpoints": {
    "cp1": { "name": "Job Category", "passed": true, "flag": false, "reason": "", "matched_functions": [], "missing_functions": [], "tool_slots": [] },
    "cp2": { "name": "Experience", "passed": true, "flag": false, "jd_required_years": 0, "candidate_years": 0, "gap": 0, "reason": "" },
    "cp3": { "name": "Sponsorship & Location", "passed": true, "flag": false, "hard_blocker": false, "reason": "" },
    "cp4": { "name": "Domain / Industry", "passed": true, "flag": false, "hard_blocker": false, "domain_match": "HIGH | MEDIUM | LOW", "reason": "" }
  },
  "matched_skills": [],
  "missing_skills": [],
  "job_dna": {
    "match_signals": { "all_work": [], "tool_slots": [], "required_skills": [], "preferred_skills": [] },
    "tailoring_signals": { "soft_skills": [], "communication": [], "work_style": [] },
    "employer_vocabulary": {},
    "domain_keywords": [],
    "immediate_needs": ""
  }
}`;

function normalizeAnalysis(raw) {
  const checkpoints = raw.checkpoints || {};
  const cp1 = checkpoints.cp1 || raw.cp1 || {};
  const cp2 = checkpoints.cp2 || raw.cp2 || {};
  const cp3 = checkpoints.cp3 || raw.cp3 || {};
  const cp4 = checkpoints.cp4 || raw.cp4 || {};

  const criteria = [cp1, cp2, cp3, cp4].filter((checkpoint) => checkpoint.passed === true || checkpoint.flag === true).length;
  const hardBlocker = (cp3.passed === false && cp3.flag !== true) || cp3.hard_blocker === true || cp4.hard_blocker === true;
  const qualified = !hardBlocker && criteria >= 3 && raw.verdict !== 'DISQUALIFIED';
  const relatedness = Number(raw.relatedness_score || 0);

  return {
    ...raw,
    checkpoints: { cp1, cp2, cp3, cp4 },
    criteria_matched: criteria,
    qualified,
    verdict: qualified ? (criteria === 4 ? 'QUALIFIED' : 'PARTIAL_MATCH') : 'DISQUALIFIED',
    relatedness_score: Number.isFinite(relatedness) ? relatedness : 0,
    matched_skills: raw.matched_skills || cp1.matched_skills || (cp1.tool_slots || []).filter((tool) => tool.match !== 'MISSING').map((tool) => tool.jd_tool).filter(Boolean),
    missing_skills: raw.missing_skills || cp1.missing_skills || (cp1.tool_slots || []).filter((tool) => tool.match === 'MISSING' && !tool.is_core_requirement).map((tool) => tool.jd_tool).filter(Boolean)
  };
}

async function analyzeCandidateJob(candidate, job) {
  const raw = await callClaude({
    model: env.anthropicAnalysisModel,
    maxTokens: 5000,
    systemPrompt: analysisSystemPrompt,
    userPrompt: [
      'CANDIDATE PROFILE AND MASTER RESUME:',
      candidateProfile(candidate),
      '',
      'JOB TO ANALYZE:',
      jobProfile(job)
    ].join('\n')
  });

  return normalizeAnalysis(raw);
}

function postedDateQuery({ days = 2, dateScope = 'last2d' } = {}) {
  if (dateScope === 'all') return null;

  const safeDays = dateScope === 'last1d' ? 1 : Number(days || 2);
  const start = new Date();
  start.setDate(start.getDate() - safeDays);
  const iso = start.toISOString();
  const fields = [
    'postedAt',
    'posted_at',
    'datePosted',
    'date_posted',
    'job_posted_at_datetime_utc',
    'publishedAt',
    'ingested_at',
    'ingestedAt',
    'fetchedAt',
    'createdAt'
  ];

  return {
    $or: [
      ...fields.flatMap((field) => [
        { [field]: { $gte: start } },
        { [field]: { $gte: iso } }
      ]),
      { job_posted_at_timestamp: { $gte: start.getTime() } }
    ]
  };
}

function normalizeDateScope(dateScope, days) {
  if (dateScope === 'all') return { dateScope: 'all', days: 0 };
  if (dateScope === 'last1d' || Number(days) === 1) return { dateScope: 'last1d', days: 1 };
  return { dateScope: 'last2d', days: 2 };
}

function escapeRegex(value) {
  return String(value || '').replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function normalizeKeywords(keywords = []) {
  return [
    ...new Set(
      keywords
        .map((keyword) => String(keyword || '').trim())
        .filter(Boolean)
    )
  ].slice(0, 20);
}

function titleKeywordQuery(keywords) {
  const fields = ['title', 'jobTitle', 'job_title', 'position', 'role', 'name'];
  const regexes = keywords.map((keyword) => new RegExp(escapeRegex(keyword), 'i'));

  return {
    $or: regexes.flatMap((regex) => fields.map((field) => ({ [field]: regex })))
  };
}

export function getAiMatchPlan({ candidate, days = 2, dateScope = 'last2d', titleKeywords = [] }) {
  const selectedKeywords = normalizeKeywords(titleKeywords.length ? titleKeywords : candidate.targetTitles || []);
  if (!selectedKeywords.length) {
    throw httpError(400, 'Select at least one position keyword before running AI match.');
  }

  const normalizedScope = normalizeDateScope(dateScope, days);
  const filters = [titleKeywordQuery(selectedKeywords)];
  const dateFilter = postedDateQuery(normalizedScope);
  if (dateFilter) filters.unshift(dateFilter);

  return {
    query: filters.length === 1 ? filters[0] : { $and: filters },
    titleKeywords: selectedKeywords,
    ...normalizedScope
  };
}

function analysisScore(analysis) {
  const criteriaScore = Number(analysis.criteria_matched || 0) * 25;
  const relatednessScore = Math.round(Number(analysis.relatedness_score || 0) * 100);
  return Math.max(criteriaScore, Math.min(100, relatednessScore || criteriaScore));
}

async function saveMatchFromAnalysis({ candidate, actor, job, analysis, preFilter, preFilterRank }) {
  const normalizedJob = normalizeJob(job);
  const score = analysisScore(analysis);
  const jobDna = {
    ...(analysis.job_dna || {}),
    job_title: analysis.job_title || normalizedJob.title,
    company: analysis.company || normalizedJob.company,
    location: analysis.location || normalizedJob.location,
    role_type: analysis.role_type,
    seniority: analysis.seniority,
    domain: analysis.domain,
    tool_slots: analysis.checkpoints?.cp1?.tool_slots || analysis.job_dna?.match_signals?.tool_slots || []
  };

  const matchDoc = await Match.findOneAndUpdate(
    { candidateId: candidate._id, jobId: normalizedJob.id },
    {
      candidateId: candidate._id,
      jobId: normalizedJob.id,
      requestedBy: actor.id,
      score,
      threshold: 75,
      status: 'matched',
      matchedSkills: analysis.matched_skills || [],
      missingSkills: analysis.missing_skills || [],
      aiProvider: 'anthropic',
      aiModel: env.anthropicAnalysisModel,
      criteriaMatched: analysis.criteria_matched,
      verdict: analysis.verdict,
      preFilterScore: preFilter?.score,
      preFilterRank,
      preFilterMatchedSkills: preFilter?.matchedSkills || [],
      preFilterMissingSkills: preFilter?.missingSkills || [],
      checkpoints: analysis.checkpoints,
      jobDna,
      aiAnalysis: analysis,
      reasonSummary: analysis.overall_assessment,
      jobSnapshot: {
        title: normalizedJob.title,
        company: normalizedJob.company,
        location: normalizedJob.location,
        applyUrl: normalizedJob.applyUrl || normalizedJob.url
      },
      matchedAt: new Date()
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  ).lean();

  return { ...matchDoc, job: normalizedJob };
}

async function cacheAnalysis({ candidate, job, analysis }) {
  const normalizedJob = normalizeJob(job);
  const jobDna = {
    ...(analysis.job_dna || {}),
    job_title: analysis.job_title || normalizedJob.title,
    company: analysis.company || normalizedJob.company,
    location: analysis.location || normalizedJob.location,
    role_type: analysis.role_type,
    seniority: analysis.seniority,
    domain: analysis.domain,
    tool_slots: analysis.checkpoints?.cp1?.tool_slots || analysis.job_dna?.match_signals?.tool_slots || []
  };

  await AiJobAnalysis.findOneAndUpdate(
    {
      candidateId: candidate._id,
      jobId: normalizedJob.id,
      candidateCacheKey: candidateCacheKey(candidate)
    },
    {
      candidateId: candidate._id,
      jobId: normalizedJob.id,
      candidateCacheKey: candidateCacheKey(candidate),
      provider: 'anthropic',
      model: env.anthropicAnalysisModel,
      promptVersion: ANALYSIS_PROMPT_VERSION,
      qualified: analysis.qualified,
      verdict: analysis.verdict,
      criteriaMatched: analysis.criteria_matched,
      score: analysisScore(analysis),
      analysis,
      jobDna,
      jobSnapshot: {
        title: normalizedJob.title,
        company: normalizedJob.company,
        location: normalizedJob.location,
        applyUrl: normalizedJob.applyUrl || normalizedJob.url
      }
    },
    { upsert: true, new: true, setDefaultsOnInsert: true }
  );
}

export async function runAiCandidateMatch({
  candidate,
  actor,
  days = 2,
  dateScope = 'last2d',
  maxMatches = 0,
  titleKeywords = [],
  onProgress,
  shouldCancel
}) {
  requireAnthropicKey();
  const { query, titleKeywords: selectedKeywords, days: normalizedDays, dateScope: normalizedDateScope } = getAiMatchPlan({
    candidate,
    days,
    dateScope,
    titleKeywords
  });
  const appliedJobIds = await Application.find({ candidateId: candidate._id }).distinct('jobId');
  const sourceQuery = appliedJobIds.length
    ? { $and: [query, { _id: { $nin: appliedJobIds } }] }
    : query;
  const sourceJobs = await Job.find(sourceQuery).sort({ posted_at: -1, createdAt: -1 }).lean();
  const preFiltered = preFilterAndScore(sourceJobs, candidate, PRE_FILTER_POOL_SIZE);
  const claudePool = preFiltered.jobs;
  const qualified = [];
  let processed = 0;
  let failed = 0;
  let cached = 0;
  let cancelled = false;
  const cacheKey = candidateCacheKey(candidate);

  console.log(
    `[pre-filter] ${preFiltered.totalFetched} fetched -> `
    + `${preFiltered.layer1Passed} passed sponsorship -> `
    + `${claudePool.length} sent to Claude`
  );

  await onProgress?.({
    totalFetched: preFiltered.totalFetched,
    layer1Passed: preFiltered.layer1Passed,
    layer1Discarded: preFiltered.layer1Discarded,
    preFilterPoolSize: claudePool.length,
    totalScanned: claudePool.length,
    processed,
    matched: qualified.length,
    failed,
    cached,
    titleKeywords: selectedKeywords,
    dateScope: normalizedDateScope,
    days: normalizedDays
  });

  for (let index = 0; index < claudePool.length; index += 1) {
    if (await shouldCancel?.()) {
      cancelled = true;
      break;
    }

    const { rawJob, preFilter, postedTime: jobPostedTime } = claudePool[index];
    const job = normalizeJob(rawJob);
    const commonProgress = {
      totalFetched: preFiltered.totalFetched,
      layer1Passed: preFiltered.layer1Passed,
      layer1Discarded: preFiltered.layer1Discarded,
      preFilterPoolSize: claudePool.length,
      totalScanned: claudePool.length
    };
    await onProgress?.({
      ...commonProgress,
      currentJobTitle: job.title,
      processed,
      matched: qualified.length,
      failed,
      cached
    });

    let analysis;
    try {
      const cachedAnalysis = await AiJobAnalysis.findOne({
        candidateId: candidate._id,
        jobId: job.id,
        candidateCacheKey: cacheKey
      }).lean();

      if (cachedAnalysis?.analysis) {
        analysis = cachedAnalysis.analysis;
        cached += 1;
      } else {
        analysis = await analyzeCandidateJob(candidate, rawJob);
        await cacheAnalysis({ candidate, job: rawJob, analysis });
      }
    } catch (error) {
      processed += 1;
      failed += 1;
      await onProgress?.({
        ...commonProgress,
        processed,
        matched: qualified.length,
        failed,
        cached,
        currentJobTitle: job.title,
        lastError: error.message
      });
      continue;
    }

    if (!analysis.qualified) {
      processed += 1;
      await onProgress?.({
        ...commonProgress,
        processed,
        matched: qualified.length,
        failed,
        cached,
        currentJobTitle: job.title
      });
      continue;
    }

    const savedMatch = await saveMatchFromAnalysis({
      candidate,
      actor,
      job: rawJob,
      analysis,
      preFilter,
      preFilterRank: index + 1
    });
    qualified.push({
      savedMatch,
      rawJob,
      analysis,
      preFilter,
      preFilterRank: index + 1,
      aiScore: analysisScore(analysis),
      postedTime: jobPostedTime
    });
    processed += 1;
    await onProgress?.({
      ...commonProgress,
      processed,
      matched: qualified.length,
      failed,
      cached,
      currentJobTitle: job.title
    });
  }

  const requestedMax = Number(maxMatches) > 0 ? Number(maxMatches) : MAX_FINAL_RESULTS;
  const finalLimit = Math.min(MAX_FINAL_RESULTS, requestedMax);

  const recommendationMatches = await Match.find({
    candidateId: candidate._id,
    status: { $ne: 'applied' }
  })
    .sort({ score: -1, preFilterScore: -1, matchedAt: -1 })
    .select('_id')
    .lean();
  const staleMatches = recommendationMatches.slice(finalLimit);
  const staleMatchIds = staleMatches.map((match) => match._id);

  if (staleMatchIds.length) {
    await Promise.all([
      Match.deleteMany({ _id: { $in: staleMatchIds } }),
      ResumeVersion.updateMany({ matchId: { $in: staleMatchIds } }, { $unset: { matchId: 1 } }),
      Application.updateMany({ matchId: { $in: staleMatchIds } }, { $unset: { matchId: 1 } })
    ]);
  }

  const finalRecommendations = await Match.find({
    candidateId: candidate._id,
    status: { $ne: 'applied' }
  })
    .sort({ score: -1, preFilterScore: -1, matchedAt: -1 })
    .limit(MAX_FINAL_RESULTS)
    .lean();

  return {
    matches: finalRecommendations,
    totalFetched: preFiltered.totalFetched,
    layer1Passed: preFiltered.layer1Passed,
    layer1Discarded: preFiltered.layer1Discarded,
    preFilterPoolSize: claudePool.length,
    qualifiedByClaude: qualified.length,
    totalScanned: claudePool.length,
    processed,
    cancelled,
    cached,
    days: normalizedDays,
    dateScope: normalizedDateScope,
    titleKeywords: selectedKeywords,
    aiModel: env.anthropicAnalysisModel,
    criteriaRequired: 3,
    finalLimit: MAX_FINAL_RESULTS
  };
}

export async function prepareCandidateMatchWorkflow({
  runId,
  candidateId,
  days = 2,
  dateScope = 'last2d',
  titleKeywords = []
}) {
  requireAnthropicKey();
  const currentRun = await MatchRun.findById(runId).select('cancelRequested').lean();
  if (!currentRun || currentRun.cancelRequested) {
    return {
      jobs: [],
      totalFetched: 0,
      layer1Passed: 0,
      layer1Discarded: 0,
      days,
      dateScope,
      titleKeywords
    };
  }

  const candidate = await Candidate.findById(candidateId).lean();
  if (!candidate) throw httpError(404, 'Candidate not found.');

  const plan = getAiMatchPlan({ candidate, days, dateScope, titleKeywords });
  const appliedJobIds = await Application.find({ candidateId }).distinct('jobId');
  const sourceQuery = appliedJobIds.length
    ? { $and: [plan.query, { _id: { $nin: appliedJobIds } }] }
    : plan.query;
  const sourceJobs = await Job.find(sourceQuery).sort({ posted_at: -1, createdAt: -1 }).lean();
  const preFiltered = preFilterAndScore(sourceJobs, candidate, PRE_FILTER_POOL_SIZE);
  const jobs = preFiltered.jobs.map(({ rawJob, preFilter }, index) => ({
    jobId: String(rawJob._id),
    preFilter,
    preFilterRank: index + 1
  }));

  await MatchRun.findByIdAndUpdate(runId, {
    status: 'running',
    startedAt: new Date(),
    totalFetched: preFiltered.totalFetched,
    layer1Passed: preFiltered.layer1Passed,
    layer1Discarded: preFiltered.layer1Discarded,
    preFilterPoolSize: jobs.length,
    totalScanned: jobs.length,
    days: plan.days,
    dateScope: plan.dateScope,
    titleKeywords: plan.titleKeywords,
    currentJobTitle: ''
  });

  console.log(
    `[pre-filter] ${preFiltered.totalFetched} fetched -> `
    + `${preFiltered.layer1Passed} passed sponsorship -> `
    + `${jobs.length} sent to Claude`
  );

  return {
    jobs,
    totalFetched: preFiltered.totalFetched,
    layer1Passed: preFiltered.layer1Passed,
    layer1Discarded: preFiltered.layer1Discarded,
    days: plan.days,
    dateScope: plan.dateScope,
    titleKeywords: plan.titleKeywords
  };
}

export async function processCandidateMatchWorkflowJob({
  runId,
  candidateId,
  actor,
  jobId,
  preFilter,
  preFilterRank
}) {
  const run = await MatchRun.findById(runId).select('cancelRequested processedJobIds').lean();
  if (!run || run.cancelRequested) return { continue: false };
  if (run.processedJobIds?.some((id) => String(id) === String(jobId))) return { continue: true };

  const [candidate, rawJob] = await Promise.all([
    Candidate.findById(candidateId).lean(),
    Job.findById(jobId).lean()
  ]);
  if (!candidate || !rawJob) {
    await MatchRun.findOneAndUpdate(
      { _id: runId, processedJobIds: { $ne: jobId } },
      {
        $addToSet: { processedJobIds: jobId },
        $inc: { processed: 1, failed: 1 },
        $set: { error: !candidate ? 'Candidate no longer exists.' : 'Job no longer exists.' }
      }
    );
    return { continue: Boolean(candidate) };
  }

  const job = normalizeJob(rawJob);
  await MatchRun.findByIdAndUpdate(runId, { currentJobTitle: job.title });

  let analysis;
  let cached = 0;
  let failed = 0;
  let matched = 0;
  let lastError = '';

  try {
    const cachedAnalysis = await AiJobAnalysis.findOne({
      candidateId,
      jobId,
      candidateCacheKey: candidateCacheKey(candidate)
    }).lean();

    if (cachedAnalysis?.analysis) {
      analysis = cachedAnalysis.analysis;
      cached = 1;
    } else {
      analysis = await analyzeCandidateJob(candidate, rawJob);
      await cacheAnalysis({ candidate, job: rawJob, analysis });
    }

    if (analysis.qualified) {
      await saveMatchFromAnalysis({
        candidate,
        actor,
        job: rawJob,
        analysis,
        preFilter,
        preFilterRank
      });
      matched = 1;
    }
  } catch (error) {
    failed = 1;
    lastError = error.message;
  }

  const increments = { processed: 1 };
  if (cached) increments.cached = cached;
  if (failed) increments.failed = failed;
  if (matched) increments.matched = matched;

  await MatchRun.findOneAndUpdate(
    { _id: runId, processedJobIds: { $ne: jobId } },
    {
      $addToSet: { processedJobIds: jobId },
      $inc: increments,
      $set: {
        currentJobTitle: job.title,
        ...(lastError ? { error: lastError } : {})
      }
    }
  );

  return { continue: true };
}

export async function finalizeCandidateMatchWorkflow({ runId, candidateId, actor, maxMatches = 0 }) {
  const run = await MatchRun.findById(runId).lean();
  if (!run) return;

  const requestedMax = Number(maxMatches) > 0 ? Number(maxMatches) : MAX_FINAL_RESULTS;
  const finalLimit = Math.min(MAX_FINAL_RESULTS, requestedMax);
  const recommendationMatches = await Match.find({
    candidateId,
    status: { $ne: 'applied' }
  })
    .sort({ score: -1, preFilterScore: -1, matchedAt: -1 })
    .select('_id')
    .lean();
  const staleMatchIds = recommendationMatches.slice(finalLimit).map((match) => match._id);

  if (staleMatchIds.length) {
    await Promise.all([
      Match.deleteMany({ _id: { $in: staleMatchIds } }),
      ResumeVersion.updateMany({ matchId: { $in: staleMatchIds } }, { $unset: { matchId: 1 } }),
      Application.updateMany({ matchId: { $in: staleMatchIds } }, { $unset: { matchId: 1 } })
    ]);
  }

  const cancelled = run.cancelRequested === true;
  const completedAt = new Date();
  await MatchRun.findByIdAndUpdate(runId, {
    status: cancelled ? 'cancelled' : 'completed',
    qualifiedByClaude: run.matched,
    ...(cancelled ? { cancelledAt: completedAt } : {}),
    completedAt,
    currentJobTitle: ''
  });

  await recordAudit({
    actor,
    action: cancelled ? 'match.ai_run_cancelled' : 'match.ai_run',
    entityType: 'candidate',
    entityId: candidateId,
    metadata: {
      matches: run.matched,
      totalScanned: run.totalScanned,
      totalFetched: run.totalFetched,
      layer1Passed: run.layer1Passed,
      layer1Discarded: run.layer1Discarded,
      preFilterPoolSize: run.preFilterPoolSize,
      cancelled,
      cached: run.cached,
      days: run.days,
      dateScope: run.dateScope,
      titleKeywords: run.titleKeywords,
      model: env.anthropicAnalysisModel
    }
  });
}

export async function failCandidateMatchWorkflow({ runId, error }) {
  await MatchRun.findByIdAndUpdate(runId, {
    status: 'failed',
    error: error || 'The durable analysis workflow failed.',
    completedAt: new Date(),
    currentJobTitle: ''
  });
}

function deriveWorkMode(jobDna = {}) {
  const text = [
    ...(jobDna.match_signals?.all_work || []),
    ...(jobDna.matched_work || []),
    jobDna.role_type || '',
    jobDna.job_title || ''
  ].join(' ').toLowerCase();

  if (/analy|insight|dashboard|report|bi|metric|forecast/.test(text)) return 'ANALYZE';
  if (/product|program|roadmap|stakeholder|manage|prioriti/.test(text)) return 'MANAGE';
  if (/research|strategy|consult|synthesi/.test(text)) return 'RESEARCH';
  return 'BUILD';
}

function jobDnaSignals(jobDna = {}) {
  return jobDna.match_signals || jobDna || {};
}

function listLines(items = [], fallback = 'Not specified') {
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  return values.length ? values.map((item, index) => `${index + 1}. ${item}`).join('\n') : fallback;
}

function csv(items = [], fallback = 'Not specified') {
  const values = Array.isArray(items) ? items.filter(Boolean) : [];
  return values.length ? values.join(', ') : fallback;
}

function toolSlotLines(jobDna = {}) {
  const slots = [
    ...(Array.isArray(jobDna.tool_slots) ? jobDna.tool_slots : []),
    ...(Array.isArray(jobDna.match_signals?.tool_slots) ? jobDna.match_signals.tool_slots : [])
  ];

  if (!slots.length) return 'Use required_skills and preferred_skills from Job DNA.';

  return slots.map((tool) => {
    const jdTool = tool.jd_tool || tool.tool || tool.name || 'JD tool';
    const candidateTool = tool.candidate_tool || tool.candidateTool || '';
    const match = tool.match || tool.match_tier || tool.tier || 'UNKNOWN';

    if (match === 'EXACT') return `INCLUDE: ${jdTool} - exact evidence in master resume; use in skills and bullets.`;
    if (match === 'EQUIVALENT') return `INCLUDE: ${jdTool} - ATS label; prove honestly with ${candidateTool || 'the equivalent candidate tool'} in bullets.`;
    if (match === 'ADJACENT') return `INCLUDE: ${jdTool} only if the master resume proves adjacent transferable work; do not invent bullet proof.`;
    if (tool.is_core_requirement) return `REVIEW CAREFULLY: ${jdTool} is a core JD requirement. Include only if the master resume has truthful evidence or an equivalent function.`;
    return `EXCLUDE unless master resume proves it: ${jdTool}.`;
  }).join('\n');
}

const resumeSystemBase = `You are RezRyt, an expert resume writer for Vayuron.

You receive a candidate master resume and structured Job DNA already extracted from a target job.
Build a resume from scratch for this exact job, written in the employer's language, while using only facts from the candidate's master resume.

Core objective:
The resume must convince both ATS and the hiring manager. It should feel like it was written specifically for this job, not like a generic rewrite.

Non-negotiable truth rules:
1. Use only employers, titles, dates, schools, degrees, tools, metrics, awards, publications, certifications, and factual claims present in the master resume.
2. Never invent or modify metrics. If the master resume has no real metric for a claim, write the claim without a metric.
3. Rewrite every bullet from scratch. Do not copy master resume bullets verbatim.
4. Preserve company names, job titles, locations, dates, education, certifications, achievements, and publications exactly as written in the master resume.
5. Keep every past employer in its real industry context. Never apply the target company's industry to a different employer.
6. Return only valid JSON. No markdown, no commentary, no code fences.

Summary rules:
1. Write exactly 4 concise sentences.
2. Sentence 1: JD title/seniority + candidate years + top JD-required tools or functions the master resume can prove.
3. Sentence 2: core specialization using the JD's own vocabulary.
4. Sentence 3: strongest real quantified achievement from the master resume that supports the JD. If no exact JD metric exists, use the strongest relevant real metric.
5. Sentence 4: employer-valued soft signal only if the master resume proves it, such as leadership, mentoring, stakeholder work, governance, or delivery ownership.
6. Avoid "seeking", "passionate", "responsible for", and generic template language.

Skills rules:
1. Build exactly 5 skill rows.
2. Each row must have 4-8 items, ordered by JD importance first.
3. Use the JD's exact tool names for exact or equivalent skills when the candidate has truthful evidence.
4. For equivalent tools, list the JD label in skills for ATS but prove the real candidate tool in bullets.
5. Do not list tools with no evidence in the master resume unless the evidence is a clearly equivalent function.
6. Group skills by function, not brand: platforms/storage, pipeline/orchestration, languages/libraries, data quality/testing, BI/visualization, app/API frameworks, product/management, or domain-specific categories.

Experience bullet rules:
1. Each real employer gets exactly 5 bullets.
2. Every bullet must be one sentence, 150-280 characters, dense enough to print as roughly two resume lines.
3. Bullet formula: strong verb + specific tool/system + work performed + scope/scale + real outcome if present.
4. Assign bullet topics from Job DNA daily work in priority order. The first bullet should address the highest-priority JD work that the master resume can prove.
5. Vary action verbs. Do not begin with Partnered, Supported, Helped, Assisted, Worked with, or Collaborated with.
6. Name specific tools. Avoid vague phrases like "cloud platforms" when the master resume provides Snowflake, AWS, Databricks, Azure, etc.
7. Do not repeat the same phrase, same metric, or same core work function across employers.
8. If a preferred qualification has proof in the master resume, dedicate a bullet to it. If not, skip it.

Domain translation rules:
1. Keep tools, metrics, scale, and universal technical language unchanged.
2. If the candidate's employer domain differs from the target job, translate only opaque source-domain jargon into the target role's natural vocabulary.
3. Translate function, not facts. Example: finance transaction data may become high-volume regulated event data, but the employer remains a finance employer.
4. The final resume should sound natural to the target hiring manager, not like a keyword-stuffed translation.

Output quality rules:
1. Target a polished one-to-two page PDF-ready resume.
2. No filler, no weak bullets, no generic claims.
3. Achievements and publications must be copied exactly if present in the master resume; omit the fields if not present.
4. Education must be one object per real degree; never merge degrees or invent school details.`;

export async function generateTailoredResume({ candidate, job, actor, matchId }) {
  const normalizedJob = normalizeJob(job);
  const latest = await ResumeVersion.findOne({ candidateId: candidate._id, jobId: job._id }).sort({ version: -1 }).lean();
  const match = matchId ? await Match.findById(matchId).lean() : await Match.findOne({ candidateId: candidate._id, jobId: job._id }).lean();
  let analysis = match?.aiAnalysis;
  let jobDna = match?.jobDna;

  if (!jobDna) {
    analysis = await analyzeCandidateJob(candidate, job);
    jobDna = {
      ...(analysis.job_dna || {}),
      job_title: analysis.job_title || normalizedJob.title,
      company: analysis.company || normalizedJob.company,
      location: analysis.location || normalizedJob.location,
      role_type: analysis.role_type,
      seniority: analysis.seniority,
      domain: analysis.domain,
      tool_slots: analysis.checkpoints?.cp1?.tool_slots || []
    };
  }

  const workMode = deriveWorkMode(jobDna);
  const matchSignals = jobDnaSignals(jobDna);
  const resumeJson = await callClaude({
    model: env.anthropicResumeModel,
    maxTokens: 9000,
    systemPrompt: `${resumeSystemBase}\n\nDetected work mode: ${workMode}. Frame bullets for this mode.`,
    userPrompt: [
      'MASTER RESUME - SOURCE OF TRUTH FOR EVERY FACT:',
      candidate.masterResume?.text || '',
      '',
      'CANDIDATE METADATA:',
      candidateProfile(candidate, { includeResume: false }),
      '',
      'TARGET JOB:',
      jobProfile(job),
      '',
      'JOB DNA - WHAT THIS ROLE NEEDS:',
      JSON.stringify(jobDna, null, 2),
      '',
      'DAILY WORK IN PRIORITY ORDER - BULLET SLOTS SHOULD FOLLOW THIS ORDER:',
      listLines(matchSignals.all_work || jobDna.all_work || jobDna.matched_work),
      '',
      'TOOL SLOT STRATEGY - ATS VS RECRUITER:',
      toolSlotLines(jobDna),
      '',
      'REQUIRED SKILLS TO PRIORITIZE:',
      csv(matchSignals.required_skills || jobDna.required_skills),
      '',
      'PREFERRED SKILLS TO SURFACE ONLY IF MASTER RESUME PROVES THEM:',
      csv(matchSignals.preferred_skills || jobDna.preferred_skills),
      '',
      'SOFT SKILLS / COMMUNICATION / WORK STYLE SIGNALS:',
      [
        csv(jobDna.talent_signals?.soft_skills || jobDna.soft_skills, ''),
        csv(jobDna.talent_signals?.communication || jobDna.communication, ''),
        csv(jobDna.talent_signals?.work_style || jobDna.work_style, '')
      ].filter(Boolean).join('\n') || 'Not specified',
      '',
      'EMPLOYER VOCABULARY TO MIRROR NATURALLY:',
      JSON.stringify(jobDna.employer_vocabulary || jobDna.domain_keywords || [], null, 2),
      '',
      'ROLE CONTEXT:',
      `Title: ${jobDna.job_title || normalizedJob.title}`,
      `Company: ${jobDna.company || normalizedJob.company}`,
      `Location: ${jobDna.location || normalizedJob.location || ''}`,
      `Role type: ${jobDna.role_type || 'Not specified'}`,
      `Seniority: ${jobDna.seniority || 'Not specified'}`,
      `Domain: ${jobDna.domain || 'Not specified'}`,
      `Work mode: ${workMode}`,
      '',
      `Build the complete tailored resume for ${normalizedJob.title} at ${normalizedJob.company}.`,
      'Return ONLY valid JSON with this exact shape:',
      '{',
      '  "name": "exact candidate name from master resume",',
      '  "target_role": "clean exact job title from target job",',
      '  "show_location": true,',
      '  "contact": {',
      '    "email": "from master resume or candidate metadata",',
      '    "phone": "from master resume or candidate metadata",',
      '    "location": "from master resume header or candidate metadata",',
      '    "linkedin": "omit key if absent",',
      '    "github": "omit key if absent"',
      '  },',
      '  "summary": "exactly 4 concise JD-specific sentences",',
      '  "skills": [',
      '    { "category": "short recruiter-recognized category", "items": ["4-8 skills in JD priority order"] }',
      '  ],',
      '  "experience": [',
      '    {',
      '      "title": "exact from master resume",',
      '      "company": "exact from master resume",',
      '      "location": "exact from master resume",',
      '      "dates": "exact from master resume",',
      '      "bullets": ["exactly 5 fresh, dense, JD-relevant bullets"]',
      '    }',
      '  ],',
      '  "education": [',
      '    { "degree": "exact from master resume", "school": "exact from master resume", "dates": "exact if present", "gpa": "only if present" }',
      '  ],',
      '  "certifications": ["only real certifications from master resume relevant to the JD"],',
      '  "projects": [',
      '    { "name": "real project only if present", "stack": "real tools only", "bullets": ["fresh JD-relevant project bullets"] }',
      '  ],',
      '  "achievements": ["copy real achievements exactly if present"],',
      '  "publications": ["copy real publications exactly if present"]',
      '}'
    ].join('\n')
  });

  const content = JSON.stringify(resumeJson, null, 2);
  const resumeVersion = await ResumeVersion.create({
    candidateId: candidate._id,
    jobId: job._id,
    matchId: match?._id || matchId,
    createdBy: actor.id,
    version: latest ? latest.version + 1 : 1,
    status: 'draft',
    provider: 'anthropic',
    promptVersion: RESUME_PROMPT_VERSION,
    content,
    structuredContent: resumeJson,
    sourceAnalysis: analysis,
    jobSnapshot: {
      title: normalizedJob.title,
      company: normalizedJob.company,
      location: normalizedJob.location,
      applyUrl: normalizedJob.applyUrl || normalizedJob.url
    }
  });

  if (match?._id || matchId) {
    await Match.findByIdAndUpdate(match?._id || matchId, { status: 'resume_generated' });
  }

  return { resume: content, resumeVersion, structuredResume: resumeJson };
}

export const aiPromptVersions = {
  analysis: ANALYSIS_PROMPT_VERSION,
  resume: RESUME_PROMPT_VERSION
};
