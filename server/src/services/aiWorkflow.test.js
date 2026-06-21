import assert from 'node:assert/strict';
import test from 'node:test';
import {
  layer1SponsorshipCheck,
  layer2SkillsScore,
  preFilterAndScore
} from './aiWorkflow.js';

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

test('Pre-filter discards blockers and ranks equal scores by newest posting date', () => {
  const candidate = {
    workAuthorization: 'H-1B',
    masterResume: { text: 'Python SQL Kafka Airflow Docker Kubernetes Tableau Spark' }
  };
  const result = preFilterAndScore([
    job({
      id: 'blocked',
      description: 'Python SQL Kafka. We are unable to sponsor.',
      postedAt: '2026-06-19T12:00:00.000Z'
    }),
    job({
      id: 'older',
      description: 'Python SQL Kafka Airflow Docker Kubernetes.',
      postedAt: '2026-06-17T12:00:00.000Z'
    }),
    job({
      id: 'newer',
      description: 'Python SQL Kafka.',
      postedAt: '2026-06-18T12:00:00.000Z'
    })
  ], candidate, 2);

  assert.equal(result.totalFetched, 3);
  assert.equal(result.layer1Discarded, 1);
  assert.equal(result.jobs.length, 2);
  assert.equal(String(result.jobs[0].rawJob._id), 'newer');
  assert.equal(String(result.jobs[1].rawJob._id), 'older');
});
