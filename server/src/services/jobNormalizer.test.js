import assert from 'node:assert/strict';
import test from 'node:test';
import { normalizeJob, normalizeJobDescription } from './jobNormalizer.js';

test('Greenhouse entity-encoded HTML becomes readable plain text', () => {
  const input = '&lt;h3&gt;About the role&lt;/h3&gt;&lt;p&gt;Build &amp;amp; scale systems.&lt;/p&gt;&lt;ul&gt;&lt;li&gt;Own APIs&lt;/li&gt;&lt;li&gt;Improve reliability&lt;/li&gt;&lt;/ul&gt;';
  const result = normalizeJobDescription(input);

  assert.match(result, /About the role/i);
  assert.match(result, /Build & scale systems\./);
  assert.match(result, /Own APIs/);
  assert.doesNotMatch(result, /&lt;|<h3>|<p>/);
});

test('Greenhouse fields are normalized for description and apply URL', () => {
  const result = normalizeJob({
    _id: 'greenhouse-job',
    title: 'Data Engineer',
    company: 'Example',
    content: { content: '&lt;p&gt;Build pipelines with SQL.&lt;/p&gt;' },
    absolute_url: 'https://boards.greenhouse.io/example/jobs/123'
  });

  assert.equal(result.description, 'Build pipelines with SQL.');
  assert.equal(result.applyUrl, 'https://boards.greenhouse.io/example/jobs/123');
});

test('JSearch fields are normalized into the common job shape', () => {
  const result = normalizeJob({
    _id: 'jsearch-job',
    job_title: 'Senior Data Engineer',
    employer_name: 'Example Data',
    job_city: 'Austin',
    job_state: 'Texas',
    job_country: 'United States',
    job_description: 'Build reliable data platforms with Python and SQL.',
    job_apply_link: 'https://example.com/apply',
    job_posted_at_datetime_utc: '2026-06-21T10:00:00.000Z',
    employer_logo: 'https://example.com/logo.png',
    job_publisher: 'JSearch'
  });

  assert.equal(result.title, 'Senior Data Engineer');
  assert.equal(result.company, 'Example Data');
  assert.equal(result.location, 'Austin, Texas, United States');
  assert.equal(result.description, 'Build reliable data platforms with Python and SQL.');
  assert.equal(result.applyUrl, 'https://example.com/apply');
  assert.equal(result.postedAt, '2026-06-21T10:00:00.000Z');
  assert.equal(result.logo, 'https://example.com/logo.png');
  assert.equal(result.publisher, 'JSearch');
});

test('JSearch ignores punctuation-only locations and falls back to country', () => {
  const result = normalizeJob({
    _id: 'jsearch-location',
    job_title: 'Data Engineer',
    employer_name: 'Example',
    location: ',',
    job_country: 'US',
    is_remote: false
  });

  assert.equal(result.location, 'United States');
});
