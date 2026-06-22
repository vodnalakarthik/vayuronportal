import assert from 'node:assert/strict';
import test from 'node:test';
import {
  assessJobDescriptionQuality,
  layer1SponsorshipCheck,
  layer2SkillsScore,
  normalizeAnalysis,
  preFilterAndScore
} from './aiWorkflow.js';

function validDescription(extra = '') {
  return `
    About the role: This engineering position builds reliable data products for customer-facing analytics and operational reporting.
    Responsibilities include designing scalable batch and streaming pipelines, developing tested transformation services, implementing
    monitoring and data-quality controls, maintaining production workflows, collaborating with product and platform teams, and delivering
    documented solutions that improve reliability, performance, governance, and stakeholder access to trusted information.
    Minimum qualifications require professional experience with Python, SQL, Apache Kafka, Apache Airflow, and cloud infrastructure.
    Candidates should have strong problem-solving skills, knowledge of distributed systems, clear communication, and a bachelor's degree
    in computer science or a related technical discipline. Preferred qualifications include experience with Docker, Kubernetes, Spark,
    automated testing, CI/CD, incident response, architecture reviews, mentoring, and secure production operations.
    ${extra}
  `;
}

function job({ id, title = 'Data Engineer', description = '', postedAt = '2026-06-18T12:00:00.000Z' }) {
  return {
    _id: id,
    title,
    description,
    postedAt
  };
}

test('Layer 1 rejects sponsorship blockers for candidates who need sponsorship', () => {
  const result = layer1SponsorshipCheck(
    job({ id: '1', description: 'Visa sponsorship is not provided for this role.' }),
    { workAuthorization: 'STEM OPT' }
  );

  assert.equal(result.pass, false);
  assert.equal(result.blocker, 'visa sponsorship is not provided');
});

test('Layer 1 skips scanning for sponsorship-exempt candidates', () => {
  const result = layer1SponsorshipCheck(
    job({ id: '2', description: 'US citizenship required and active clearance required.' }),
    { workAuthorization: 'US Citizen' }
  );

  assert.deepEqual(result, { pass: true, skipped: true, blocker: null });
});

test('Layer 2 scores only JD skills against skills evidenced in the master resume', () => {
  const result = layer2SkillsScore(
    job({ id: '3', description: 'Requires Python, SQL, Kafka, Airflow, and Flink.' }),
    { masterResume: { text: 'Built Python and SQL pipelines with Kafka and Airflow.' } }
  );

  assert.equal(result.total, 5);
  assert.equal(result.matched, 4);
  assert.equal(result.score, 80);
  assert.deepEqual(result.missingSkills, ['Apache Flink']);
});

test('Layer 2 uses a neutral score when fewer than three JD skills are detected', () => {
  const result = layer2SkillsScore(
    job({ id: '4', description: 'Experience with Python and SQL.' }),
    { masterResume: { text: 'Python and SQL.' } }
  );

  assert.equal(result.total, 2);
  assert.equal(result.score, 50);
});

test('Layer 2 extracts skills from the JD description, not the job title', () => {
  const result = layer2SkillsScore(
    job({ id: 'title-only', title: 'Python SQL Kafka Engineer', description: 'Build reliable data products.' }),
    { masterResume: { text: 'Python SQL Kafka.' } }
  );

  assert.equal(result.total, 0);
  assert.equal(result.score, 50);
});

test('Description quality rejects missing, placeholder, and underspecified jobs', () => {
  assert.equal(assessJobDescriptionQuality(job({ id: 'missing' })).pass, false);
  assert.equal(
    assessJobDescriptionQuality(job({ id: 'placeholder', description: 'Job description is not available. Apply on the company website.' })).pass,
    false
  );
  assert.equal(
    assessJobDescriptionQuality(job({ id: 'thin', description: 'We are a great company looking for talented people to join our team.' })).pass,
    false
  );
  assert.equal(
    assessJobDescriptionQuality(job({
      id: 'expired-page',
      description: `We're sorry, this link is no longer valid. Your session has expired due to inactivity. ${validDescription()}`
    })).pass,
    false
  );
});

test('Description quality accepts a detailed role with responsibilities and qualifications', () => {
  const result = assessJobDescriptionQuality(job({ id: 'valid', description: validDescription() }));

  assert.equal(result.pass, true);
  assert.ok(result.metrics.words >= 80);
  assert.ok(result.metrics.responsibilities >= 3);
});

test('Pre-filter discards blockers and ranks equal scores by newest posting date', () => {
  const candidate = {
    workAuthorization: 'H-1B',
    masterResume: { text: 'Python SQL Kafka Airflow Docker Kubernetes Tableau Spark' }
  };
  const result = preFilterAndScore([
    job({
      id: 'blocked',
      description: validDescription('We are unable to sponsor applicants for this position.'),
      postedAt: '2026-06-19T12:00:00.000Z'
    }),
    job({
      id: 'older',
      description: validDescription('The primary stack uses Python, SQL, Kafka, Airflow, Docker, and Kubernetes.'),
      postedAt: '2026-06-17T12:00:00.000Z'
    }),
    job({
      id: 'newer',
      description: validDescription('The primary stack uses Python, SQL, and Kafka.'),
      postedAt: '2026-06-18T12:00:00.000Z'
    })
  ], candidate, 2);

  assert.equal(result.totalFetched, 3);
  assert.equal(result.layer1Discarded, 1);
  assert.equal(result.jobs.length, 2);
  assert.equal(String(result.jobs[0].rawJob._id), 'newer');
  assert.equal(String(result.jobs[1].rawJob._id), 'older');
});

test('Pre-filter rejects invalid descriptions before sponsorship and skill scoring', () => {
  const result = preFilterAndScore([
    job({ id: 'invalid', description: 'Apply now.' }),
    job({ id: 'valid', description: validDescription() })
  ], {
    workAuthorization: 'US Citizen',
    masterResume: { text: 'Python SQL Kafka Airflow Docker Kubernetes Spark' }
  });

  assert.equal(result.invalidDescriptionDiscarded, 1);
  assert.equal(result.layer1Passed, 1);
  assert.deepEqual(result.rejectedJobIds.map(String), ['invalid']);
});

function analysisWith(checkpointOverrides = {}) {
  return {
    verdict: 'QUALIFIED',
    relatedness_score: 0.9,
    checkpoints: {
      cp1: { passed: true },
      cp2: { passed: true, jd_required_years: 5, candidate_years: 5 },
      cp3: { passed: true },
      cp4: { passed: true },
      ...checkpointOverrides
    }
  };
}

test('AI normalization requires all four checkpoints to pass and ignores review flags', () => {
  const result = normalizeAnalysis(
    analysisWith({ cp4: { passed: false, flag: true, reason: 'Different required domain.' } }),
    { yearsOfExperience: 5 }
  );

  assert.equal(result.criteria_matched, 3);
  assert.equal(result.qualified, false);
  assert.equal(result.verdict, 'DISQUALIFIED');
});

test('Experience checkpoint rejects candidates overqualified by more than three years', () => {
  const result = normalizeAnalysis(analysisWith(), { yearsOfExperience: 9 });

  assert.equal(result.checkpoints.cp2.gap, -4);
  assert.equal(result.checkpoints.cp2.passed, false);
  assert.equal(result.qualified, false);
  assert.match(result.checkpoints.cp2.reason, /overqualified by 4 years/i);
});

test('Experience checkpoint permits candidates overqualified by exactly three years', () => {
  const result = normalizeAnalysis(analysisWith(), { yearsOfExperience: 8 });

  assert.equal(result.checkpoints.cp2.gap, -3);
  assert.equal(result.checkpoints.cp2.passed, true);
  assert.equal(result.qualified, true);
  assert.equal(result.verdict, 'QUALIFIED');
});
