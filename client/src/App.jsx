import {
  ArrowDownUp,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  CalendarX2,
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Download,
  ExternalLink,
  FilePlus2,
  FileText,
  Filter,
  LogOut,
  MapPin,
  Menu,
  Pencil,
  Search,
  ShieldCheck,
  Sparkles,
  Square,
  RotateCcw,
  Trash2,
  UserCog,
  UserPlus,
  UsersRound
} from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { api, getToken, setToken } from './api.js';
import { confirmAction, showError, showInfo, showSuccess, showToast } from './alerts.js';
import { PDFGen } from './pdfGen.js';

const emptyCandidate = {
  firstName: '',
  lastName: '',
  email: '',
  phone: '',
  locations: [],
  targetTitles: [],
  yearsOfExperience: '',
  workAuthorization: '',
  masterResumeText: ''
};

const targetTitleOptions = [
  'Software Engineer',
  'Senior Software Engineer',
  'Staff Software Engineer',
  'Principal Software Engineer',
  'Software Developer',
  'Software Architect',
  'Full Stack Developer',
  'Full Stack Engineer',
  'Frontend Developer',
  'Frontend Engineer',
  'Backend Developer',
  'Backend Engineer',
  'Senior Backend Engineer',
  'React Developer',
  'Java Developer',
  'Python Developer',
  'Data Engineer',
  'Senior Data Engineer',
  'Data Engineer II',
  'Data Engineer III',
  'Lead Data Engineer',
  'Staff Data Engineer',
  'Principal Data Engineer',
  'Analytics Engineer',
  'Senior Analytics Engineer',
  'Data Platform Engineer',
  'Databricks Data Engineer',
  'Snowflake Data Engineer',
  'Cloud Data Engineer',
  'Big Data Engineer',
  'Data Architect',
  'Data Analyst',
  'Business Data Analyst',
  'Data Scientist',
  'Senior Data Scientist',
  'Data Scientist II',
  'Lead Data Scientist',
  'Principal Data Scientist',
  'Machine Learning Engineer',
  'Senior Machine Learning Engineer',
  'Applied Scientist',
  'Applied AI Scientist',
  'Research Scientist',
  'AI Engineer',
  'Applied AI Engineer',
  'AI/ML Engineer',
  'Generative AI Engineer',
  'LLM Engineer',
  'AI Agent Engineer',
  'MLOps Engineer',
  'ML Platform Engineer',
  'Machine Learning Scientist',
  'Deep Learning Engineer',
  'AI Research Engineer',
  'Product Data Scientist',
  'Decision Scientist',
  'Analytics Scientist',
  'Business Analyst',
  'Platform Engineer',
  'DevOps Engineer',
  'Cloud Infrastructure Engineer',
  'Cloud Engineer/DevOps',
  'Cloud Engineer',
  'Site Reliability Engineer',
  'Site Reliability Engineer (SRE)',
  'Infrastructure Engineer',
  'Kubernetes Engineer',
  'DevSecOps Engineer',
  'QA Automation Engineer',
  'Cybersecurity Analyst',
  'Salesforce Developer',
  'Product Manager',
  'Project Manager',
  'UI/UX Designer'
];

const matchPositionOptions = targetTitleOptions;

const workAuthorizationOptions = [
  'US Citizen',
  'Green Card',
  'H-1B',
  'H-1B Transfer',
  'OPT',
  'STEM OPT',
  'CPT',
  'TN Visa',
  'EAD',
  'Requires Sponsorship'
];

const locationOptions = [
  'United States',
  'Remote - United States',
  'Open to relocate',
  'Austin, TX',
  'Dallas, TX',
  'Houston, TX',
  'Chicago, IL',
  'New York, NY',
  'Jersey City, NJ',
  'Atlanta, GA',
  'Charlotte, NC',
  'Raleigh, NC',
  'San Francisco Bay Area, CA',
  'Los Angeles, CA',
  'Seattle, WA',
  'Boston, MA',
  'Phoenix, AZ',
  'Denver, CO',
  'Washington, DC'
];

const matchedJobsPerPage = 4;
const appliedJobsPerPage = 4;
const resumeGenerationTimeoutMs = 180000;

function cx(...classes) {
  return classes.filter(Boolean).join(' ');
}

function Field({ label, children }) {
  return (
    <label className="field">
      <span>{label}</span>
      {children}
    </label>
  );
}

function MultiValueField({ label, value, options, onChange, placeholder = 'Select option', allowCustom = false }) {
  const [query, setQuery] = useState('');
  const selected = Array.isArray(value) ? value : [];
  const available = [...new Set(options)]
    .filter((option) => !selected.includes(option))
    .filter((option) => option.toLowerCase().includes(query.trim().toLowerCase()))
    .slice(0, 8);

  function addItem(item) {
    const cleaned = String(item || '').trim();
    if (!cleaned || selected.includes(cleaned)) return;
    onChange([...selected, cleaned]);
    setQuery('');
  }

  function removeItem(item) {
    onChange(selected.filter((current) => current !== item));
  }

  return (
    <div className="field multi-field">
      <span>{label}</span>
      <div className="multi-control">
        <div className="selected-tags">
          {selected.map((item) => (
            <button key={item} type="button" className="selected-tag" onClick={() => removeItem(item)} title={`Remove ${item}`}>
              {item}
              <span aria-hidden="true">×</span>
            </button>
          ))}
          {!selected.length ? <em>No selections yet</em> : null}
        </div>
        <div className="multi-search">
          <Search size={16} />
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter' && allowCustom) {
                event.preventDefault();
                addItem(query);
              }
            }}
            placeholder={allowCustom ? `${placeholder} or type custom keyword` : placeholder}
          />
          {allowCustom && query.trim() ? (
            <button type="button" className="mini-add" onClick={() => addItem(query)}>
              Add
            </button>
          ) : null}
        </div>
        <div className="option-cloud">
          {available.map((option) => (
            <button key={option} type="button" className="option-chip" onClick={() => addItem(option)}>
              {option}
            </button>
          ))}
          {!available.length ? <span>No matching options</span> : null}
        </div>
      </div>
    </div>
  );
}

function StatusPill({ children, tone = 'neutral' }) {
  return <span className={cx('pill', `pill-${tone}`)}>{children}</span>;
}

function IconAction({ as: Component = 'button', label, children, className, ...props }) {
  return (
    <Component className={cx('icon-action', className)} aria-label={label} title={label} data-tooltip={label} {...props}>
      {children}
    </Component>
  );
}

function safeFileName(value) {
  return String(value || 'resume')
    .replace(/[^a-z0-9]+/gi, '-')
    .replace(/^-+|-+$/g, '')
    .toLowerCase();
}

function formatResumeForDownload(resume) {
  if (!resume || typeof resume !== 'object') return String(resume || '');

  const lines = [];
  if (resume.name) lines.push(String(resume.name));
  if (resume.target_role) lines.push(`Target Role: ${resume.target_role}`);

  const contact = resume.contact || {};
  const contactLine = [contact.email, contact.phone, contact.location, contact.linkedin, contact.github].filter(Boolean).join(' | ');
  if (contactLine) lines.push(contactLine);

  if (resume.summary) {
    lines.push('', 'SUMMARY', String(resume.summary));
  }

  if (Array.isArray(resume.skills) && resume.skills.length) {
    lines.push('', 'SKILLS');
    resume.skills.forEach((row) => {
      if (typeof row === 'string') lines.push(row);
      else lines.push(`${row.category || 'Skills'}: ${Array.isArray(row.items) ? row.items.join(', ') : row.items || ''}`);
    });
  }

  if (Array.isArray(resume.experience) && resume.experience.length) {
    lines.push('', 'EXPERIENCE');
    resume.experience.forEach((role) => {
      lines.push('', [role.title, role.company, role.location, role.dates].filter(Boolean).join(' | '));
      (role.bullets || []).forEach((bullet) => lines.push(`- ${bullet}`));
    });
  }

  if (Array.isArray(resume.projects) && resume.projects.length) {
    lines.push('', 'PROJECTS');
    resume.projects.forEach((project) => {
      lines.push('', [project.name || project.title, project.stack].filter(Boolean).join(' | '));
      (project.bullets || project.details || []).forEach((bullet) => lines.push(`- ${bullet}`));
    });
  }

  if (Array.isArray(resume.education) && resume.education.length) {
    lines.push('', 'EDUCATION');
    resume.education.forEach((edu) => lines.push([edu.degree, edu.school, edu.location, edu.dates, edu.gpa].filter(Boolean).join(' | ')));
  }

  ['certifications', 'achievements', 'publications'].forEach((section) => {
    if (Array.isArray(resume[section]) && resume[section].length) {
      lines.push('', section.toUpperCase());
      resume[section].forEach((item) => lines.push(`- ${typeof item === 'string' ? item : JSON.stringify(item)}`));
    }
  });

  return lines.join('\n').replace(/\n{3,}/g, '\n\n').trim();
}

function Login({ onLogin }) {
  const [email, setEmail] = useState('admin@vayuron.com');
  const [password, setPassword] = useState('admin123');
  const [error, setError] = useState('');
  const [loading, setLoading] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setError('');

    try {
      const data = await api('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ email, password })
      });
      setToken(data.token);
      onLogin(data.user || data.admin);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <main className="login-shell">
      <section className="login-panel">
        <div className="login-brand">
          <div className="brand-mark login-logo">V</div>
          <span>Vayuron</span>
        </div>
        <div className="login-copy">
          <h1>Talent Application Portal</h1>
          <p>Manage candidates, job matches, and application workflows from one workspace.</p>
        </div>
        <form onSubmit={submit} className="stack">
          <Field label="Email">
            <input value={email} onChange={(event) => setEmail(event.target.value)} type="email" required />
          </Field>
          <Field label="Password">
            <input value={password} onChange={(event) => setPassword(event.target.value)} type="password" required />
          </Field>
          {error ? <div className="error">{error}</div> : null}
          <button className="primary" type="submit" disabled={loading}>
            <CheckCircle2 size={18} />
            {loading ? 'Signing in' : 'Sign in'}
          </button>
        </form>
      </section>
    </main>
  );
}

function Shell({ admin, page, setPage, children, onLogout }) {
  const [collapsed, setCollapsed] = useState(false);
  const items = [
    { id: 'jobs', label: 'Jobs', icon: BriefcaseBusiness },
    { id: 'candidates', label: 'Candidates', icon: UsersRound },
    { id: 'create', label: 'Create Candidate', icon: UserPlus }
  ];

  if (admin?.role === 'admin') {
    items.push({ id: 'recruiters', label: 'Recruiters', icon: UserCog });
  }

  return (
    <div className={cx('app-shell', collapsed && 'sidebar-collapsed')}>
      <aside className="sidebar">
        <div className="sidebar-top">
          <div className="brand-row">
            <div className="brand-mark small">V</div>
            <div className="brand-text">
              <strong>Vayuron</strong>
              <span>Job Portal</span>
            </div>
          </div>
          <button
            className="sidebar-toggle"
            type="button"
            title={collapsed ? 'Open sidebar' : 'Collapse sidebar'}
            aria-label={collapsed ? 'Open sidebar' : 'Collapse sidebar'}
            onClick={() => setCollapsed((value) => !value)}
          >
            <Menu size={19} />
          </button>
        </div>
        <nav>
          {items.map((item) => {
            const Icon = item.icon;
            return (
              <button
                key={item.id}
                className={cx('nav-item', page === item.id && 'active')}
                title={collapsed ? item.label : undefined}
                onClick={() => setPage(item.id)}
              >
                <Icon size={18} />
                <span>{item.label}</span>
              </button>
            );
          })}
        </nav>
        <div className="sidebar-footer">
          <div className="sidebar-user">
            <span>{admin?.role === 'admin' ? 'Master admin' : 'Recruiter'}</span>
            <strong>{admin?.email}</strong>
          </div>
          <button className="icon-button" title="Sign out" onClick={onLogout}>
            <LogOut size={18} />
          </button>
        </div>
      </aside>
      <section className="main-area">{children}</section>
    </div>
  );
}

function JobsPage({ isAdmin = false }) {
  const [jobs, setJobs] = useState([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [refreshVersion, setRefreshVersion] = useState(0);
  const [cleaningOldJobs, setCleaningOldJobs] = useState(false);
  const [cleaningAllJobs, setCleaningAllJobs] = useState(false);
  const [filters, setFilters] = useState({
    search: '',
    title: '',
    location: '',
    postedWithin: '',
    fetchedToday: '',
    sortBy: 'createdAt',
    sortDir: 'desc'
  });
  const [selectedJob, setSelectedJob] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    const controller = new AbortController();

    async function loadJobs() {
      setLoading(true);
      setError('');
      try {
        const params = new URLSearchParams({ ...filters, page, limit: '18' });
        const data = await api(`/jobs?${params.toString()}`, { signal: controller.signal });
        setJobs(data.jobs);
        setTotal(data.total);
      } catch (err) {
        if (err.name !== 'AbortError') setError(err.message);
      } finally {
        setLoading(false);
      }
    }

    loadJobs();
    return () => controller.abort();
  }, [filters, page, refreshVersion]);

  const pages = Math.max(1, Math.ceil(total / 18));

  function updateFilter(key, value) {
    setPage(1);
    setFilters((current) => ({ ...current, [key]: value }));
  }

  async function cleanupOldJobs() {
    if (!isAdmin || cleaningOldJobs || cleaningAllJobs) return;

    setCleaningOldJobs(true);
    try {
      const preview = await api('/jobs/cleanup/preview?days=7');

      if (preview.activeRuns) {
        await showInfo(
          'Job cleanup is temporarily unavailable',
          `Wait for ${preview.activeRuns} active AI job analysis run${preview.activeRuns === 1 ? '' : 's'} to finish before deleting old jobs.`
        );
        return;
      }

      if (!preview.jobs) {
        await showInfo('No old jobs found', 'There are no jobs with a posted date older than 7 days.');
        return;
      }

      const confirmed = await confirmAction({
        title: `Delete ${preview.jobs.toLocaleString()} old jobs?`,
        text: `${preview.matches.toLocaleString()} matched-job records and ${preview.analyses.toLocaleString()} cached analyses will also be removed. ${preview.applicationsPreserved.toLocaleString()} applied-job records and ${preview.resumeVersionsPreserved.toLocaleString()} related resume versions will be preserved. This cleanup cannot be undone.`,
        confirmText: 'Delete old jobs',
        danger: true,
        requireExplicit: true
      });
      if (!confirmed) return;

      const result = await api('/jobs/cleanup?days=7', { method: 'DELETE' });
      setSelectedJob(null);
      setPage(1);
      setRefreshVersion((value) => value + 1);
      await showSuccess(
        'Old jobs deleted',
        `${result.deleted.jobs.toLocaleString()} jobs and ${result.deleted.matches.toLocaleString()} matched-job records were removed. ${result.applicationsPreserved.toLocaleString()} applied-job records were preserved.`
      );
    } catch (error) {
      await showError('Old-job cleanup failed', error.message || 'Unable to delete jobs older than 7 days.');
    } finally {
      setCleaningOldJobs(false);
    }
  }

  async function cleanupAllJobs() {
    if (!isAdmin || cleaningAllJobs || cleaningOldJobs) return;

    setCleaningAllJobs(true);
    try {
      const preview = await api('/jobs/cleanup/preview?scope=all');

      if (preview.activeRuns) {
        await showInfo(
          'Job cleanup is temporarily unavailable',
          `Wait for ${preview.activeRuns} active AI job analysis run${preview.activeRuns === 1 ? '' : 's'} to finish before deleting jobs.`
        );
        return;
      }

      if (!preview.jobs) {
        await showInfo('No jobs found', 'The jobs database is already empty.');
        return;
      }

      const confirmed = await confirmAction({
        title: `Delete all ${preview.jobs.toLocaleString()} jobs?`,
        text: `${preview.matches.toLocaleString()} matched-job records, ${preview.analyses.toLocaleString()} cached analyses, and ${preview.resumeDraftsToDelete.toLocaleString()} unapplied resume drafts will also be removed. ${preview.applicationsPreserved.toLocaleString()} applied-job records and ${preview.resumeVersionsPreserved.toLocaleString()} related resume versions will be preserved. This operation cannot be undone.`,
        confirmText: 'Delete all jobs',
        danger: true,
        requireExplicit: true
      });
      if (!confirmed) return;

      const result = await api('/jobs/cleanup?scope=all', { method: 'DELETE' });
      setSelectedJob(null);
      setPage(1);
      setRefreshVersion((value) => value + 1);
      await showSuccess(
        'All jobs deleted',
        `${result.deleted.jobs.toLocaleString()} jobs and ${result.deleted.matches.toLocaleString()} matched-job records were removed. ${result.applicationsPreserved.toLocaleString()} applied-job records were preserved.`
      );
    } catch (error) {
      await showError('Delete-all cleanup failed', error.message || 'Unable to delete all jobs.');
    } finally {
      setCleaningAllJobs(false);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Jobs</h1>
          <p>{total.toLocaleString()} roles in the current database view</p>
        </div>
        {isAdmin ? (
          <div className="page-header-actions">
            <button
              className="secondary destructive-secondary"
              onClick={cleanupOldJobs}
              disabled={cleaningOldJobs || cleaningAllJobs}
            >
              <CalendarX2 size={17} />
              {cleaningOldJobs ? 'Checking old jobs' : 'Delete jobs older than 7 days'}
            </button>
            <button
              className="secondary destructive-secondary destructive-strong"
              onClick={cleanupAllJobs}
              disabled={cleaningAllJobs || cleaningOldJobs}
            >
              <Trash2 size={17} />
              {cleaningAllJobs ? 'Checking all jobs' : 'Delete all jobs'}
            </button>
          </div>
        ) : null}
      </header>

      <section className="toolbar">
        <div className="search-box">
          <Search size={18} />
          <input
            value={filters.search}
            onChange={(event) => updateFilter('search', event.target.value)}
            placeholder="Search company, title, skill"
          />
        </div>
        <div className="inline-field">
          <Filter size={18} />
          <input value={filters.title} onChange={(event) => updateFilter('title', event.target.value)} placeholder="Job title" />
        </div>
        <div className="inline-field">
          <input
            value={filters.location}
            onChange={(event) => updateFilter('location', event.target.value)}
            placeholder="Location"
          />
        </div>
        <select value={filters.postedWithin} onChange={(event) => updateFilter('postedWithin', event.target.value)}>
          <option value="">All posted dates</option>
          <option value="today">Posted today</option>
          <option value="last24h">Posted last 24h</option>
          <option value="last7d">Posted last 7 days</option>
          <option value="last30d">Posted last 30 days</option>
        </select>
        <button
          type="button"
          className={cx('toggle-filter', filters.fetchedToday === 'true' && 'active')}
          onClick={() => updateFilter('fetchedToday', filters.fetchedToday === 'true' ? '' : 'true')}
          title="Show jobs fetched into the database today"
        >
          <CalendarDays size={17} />
          Fetched today
        </button>
        <select value={filters.sortBy} onChange={(event) => updateFilter('sortBy', event.target.value)}>
          <option value="createdAt">Newest</option>
          <option value="title">Title</option>
          <option value="company">Company</option>
          <option value="postedAt">Posted</option>
        </select>
        <select value={filters.sortDir} onChange={(event) => updateFilter('sortDir', event.target.value)}>
          <option value="desc">Desc</option>
          <option value="asc">Asc</option>
        </select>
      </section>

      {error ? <div className="error">{error}</div> : null}
      {loading ? <div className="loading">Loading jobs</div> : null}

      <section className="job-grid">
        {jobs.map((job) => (
          <article className="job-card" key={job.id}>
            <div className="job-card-head">
              <div className="company-lockup">
                <div className="company-logo">
                  {job.logo ? <img src={job.logo} alt="" /> : <Building2 size={20} />}
                </div>
                <div>
                  <strong>{job.company}</strong>
                  <span>{job.publisher || 'Direct listing'}</span>
                </div>
              </div>
              <div className="card-actions">
                <IconAction label="View job" onClick={() => setSelectedJob(job)}>
                  <FileText size={18} />
                </IconAction>
                {job.applyUrl || job.url ? (
                  <IconAction
                    as="a"
                    label="Apply job"
                    href={job.applyUrl || job.url}
                    target="_blank"
                    rel="noreferrer"
                    className="icon-action-strong"
                  >
                    <ExternalLink size={18} />
                  </IconAction>
                ) : null}
                <IconAction label="Generate curated resume" onClick={() => setSelectedJob({ ...job, resumePlaceholder: true })}>
                  <Sparkles size={18} />
                </IconAction>
              </div>
            </div>

            <div className="job-card-body">
              <h2>{job.title}</h2>
              <div className="job-meta">
                <span>
                  <MapPin size={15} />
                  {job.location || 'Location open'}
                </span>
                {job.postedAt ? (
                  <span>
                    <CalendarDays size={15} />
                    {new Date(job.postedAt).toLocaleDateString()}
                  </span>
                ) : null}
              </div>
              <p>{job.description || 'No description available from source.'}</p>
            </div>

            <div className="skill-row">
              {(job.skills || []).slice(0, 5).map((skill) => (
                <span key={skill}>{skill}</span>
              ))}
            </div>
          </article>
        ))}
      </section>

      <div className="pagination">
        <button className="icon-button" onClick={() => setPage((value) => Math.max(1, value - 1))} disabled={page === 1}>
          <ChevronLeft size={18} />
        </button>
        <span>
          {page} / {pages}
        </span>
        <button className="icon-button" onClick={() => setPage((value) => Math.min(pages, value + 1))} disabled={page === pages}>
          <ChevronRight size={18} />
        </button>
      </div>

      {selectedJob ? <JobModal job={selectedJob} onClose={() => setSelectedJob(null)} /> : null}
    </>
  );
}

function JobModal({ job, onClose }) {
  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>{job.title}</h2>
            <p>
              {job.company} · {job.location}
            </p>
          </div>
          <button className="icon-button" onClick={onClose}>
            ×
          </button>
        </div>
        {job.resumePlaceholder ? (
          <div className="placeholder-box">
            <Sparkles size={22} />
            <strong>Curated resume generator placeholder</strong>
            <p>The backend candidate workflow has the integration point ready for your generation code.</p>
          </div>
        ) : null}
        <div className="skill-row spacious">
          {(job.skills || []).map((skill) => (
            <span key={skill}>{skill}</span>
          ))}
        </div>
        <p className="job-description">{job.description || 'No description available.'}</p>
        {job.applyUrl || job.url ? (
          <a className="primary link-button" href={job.applyUrl || job.url} target="_blank" rel="noreferrer">
            <ExternalLink size={18} />
            Apply job
          </a>
        ) : null}
      </section>
    </div>
  );
}

function CandidateForm({ onCreated }) {
  const [form, setForm] = useState(emptyCandidate);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState('');

  function setValue(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setLoading(true);
    setMessage('');

    try {
      if (!form.targetTitles.length || !form.locations.length) {
        setMessage('Please select at least one target title and location.');
        await showInfo('Candidate details incomplete', 'Select at least one target title and one location before creating the profile.');
        return;
      }

      const payload = {
        ...form,
        targetTitle: form.targetTitles[0] || '',
        location: form.locations[0] || ''
      };
      const data = await api('/candidates', {
        method: 'POST',
        body: JSON.stringify(payload)
      });
      const candidateName = `${data.candidate.firstName} ${data.candidate.lastName}`;
      setMessage(`${candidateName} created.`);
      setForm(emptyCandidate);
      await showSuccess('Candidate created', `${candidateName} is ready for job matching.`);
      onCreated?.();
    } catch (err) {
      setMessage(err.message);
      await showError('Candidate creation failed', err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Create candidate</h1>
          <p>Profile details, target roles, and resume source</p>
        </div>
      </header>
      <form className="profile-form candidate-create-form" onSubmit={submit}>
        <section className="form-section">
          <div className="form-section-head">
            <h2>Profile</h2>
            <span>Identity and contact details</span>
          </div>
          <div className="form-grid">
            <Field label="First name">
              <input value={form.firstName} onChange={(event) => setValue('firstName', event.target.value)} required />
            </Field>
            <Field label="Last name">
              <input value={form.lastName} onChange={(event) => setValue('lastName', event.target.value)} required />
            </Field>
            <Field label="Email">
              <input value={form.email} onChange={(event) => setValue('email', event.target.value)} type="email" required />
            </Field>
            <Field label="Phone">
              <input value={form.phone} onChange={(event) => setValue('phone', event.target.value)} type="tel" />
            </Field>
          </div>
        </section>

        <section className="form-section">
          <div className="form-section-head">
            <h2>Job targeting</h2>
            <span>Roles, locations, and authorization</span>
          </div>
          <div className="form-grid three-col">
            <MultiValueField
              label="Target titles"
              value={form.targetTitles}
              options={targetTitleOptions}
              onChange={(value) => setValue('targetTitles', value)}
              placeholder="Add target title"
            />
            <MultiValueField
              label="Locations"
              value={form.locations}
              options={locationOptions}
              onChange={(value) => setValue('locations', value)}
              placeholder="Add location"
            />
            <Field label="Work authorization">
              <select
                value={form.workAuthorization}
                onChange={(event) => setValue('workAuthorization', event.target.value)}
                required
              >
                <option value="">Select authorization</option>
                {workAuthorizationOptions.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </Field>
            <Field label="Years of experience">
              <input
                value={form.yearsOfExperience}
                onChange={(event) => setValue('yearsOfExperience', event.target.value)}
                type="number"
                min="0"
                max="40"
              />
            </Field>
          </div>
        </section>

        <section className="form-section">
          <div className="form-section-head">
            <h2>Master resume</h2>
            <span>Source content for curated resumes</span>
          </div>
          <Field label="Master resume">
            <textarea
              value={form.masterResumeText}
              onChange={(event) => setValue('masterResumeText', event.target.value)}
              rows={12}
              required
            />
          </Field>
        </section>

        <div className="form-footer">
          {message ? <div className={message.includes('created') ? 'success' : 'error'}>{message}</div> : null}
          <button className="primary form-submit" disabled={loading}>
            <FilePlus2 size={18} />
            {loading ? 'Saving' : 'Create profile'}
          </button>
        </div>
      </form>
    </>
  );
}

function candidateToForm(candidate) {
  return {
    firstName: candidate?.firstName || '',
    lastName: candidate?.lastName || '',
    email: candidate?.email || '',
    phone: candidate?.phone || '',
    locations: candidate?.locations?.length ? candidate.locations : [candidate?.location].filter(Boolean),
    targetTitles: candidate?.targetTitles?.length ? candidate.targetTitles : [candidate?.targetTitle].filter(Boolean),
    yearsOfExperience: candidate?.yearsOfExperience ?? '',
    workAuthorization: candidate?.workAuthorization || '',
    masterResumeText: candidate?.masterResume?.text || ''
  };
}

function CandidateEditModal({ candidateId, onClose, onSaved }) {
  const [form, setForm] = useState(emptyCandidate);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState('');

  function setValue(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  useEffect(() => {
    let alive = true;

    async function loadCandidate() {
      setLoading(true);
      setMessage('');
      try {
        const data = await api(`/candidates/${candidateId}`);
        if (alive) setForm(candidateToForm(data.candidate));
      } catch (error) {
        if (alive) setMessage(error.message || 'Unable to load candidate.');
      } finally {
        if (alive) setLoading(false);
      }
    }

    loadCandidate();
    return () => {
      alive = false;
    };
  }, [candidateId]);

  async function submit(event) {
    event.preventDefault();
    setSaving(true);
    setMessage('');

    try {
      if (!form.targetTitles.length || !form.locations.length) {
        setMessage('Please select at least one target title and location.');
        await showInfo('Candidate details incomplete', 'Select at least one target title and one location before saving.');
        return;
      }

      const payload = {
        ...form,
        targetTitle: form.targetTitles[0] || '',
        location: form.locations[0] || ''
      };

      await api(`/candidates/${candidateId}`, {
        method: 'PUT',
        body: JSON.stringify(payload)
      });

      setMessage('Candidate profile updated.');
      await showSuccess('Profile updated', 'The candidate profile and master resume were saved successfully.');
      onSaved?.();
    } catch (error) {
      setMessage(error.message || 'Unable to update candidate.');
      await showError('Profile update failed', error.message || 'Unable to update candidate.');
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="modal-backdrop" onMouseDown={onClose}>
      <section className="modal candidate-edit-modal" onMouseDown={(event) => event.stopPropagation()}>
        <div className="modal-header">
          <div>
            <h2>Edit candidate</h2>
            <p>Update profile details, targets, and resume source</p>
          </div>
          <button className="icon-button" onClick={onClose}>
            ×
          </button>
        </div>

        {loading ? (
          <div className="loading">Loading candidate</div>
        ) : (
          <form className="profile-form candidate-edit-form" onSubmit={submit}>
            <div className="form-grid">
              <Field label="First name">
                <input value={form.firstName} onChange={(event) => setValue('firstName', event.target.value)} required />
              </Field>
              <Field label="Last name">
                <input value={form.lastName} onChange={(event) => setValue('lastName', event.target.value)} required />
              </Field>
              <Field label="Email">
                <input value={form.email} onChange={(event) => setValue('email', event.target.value)} type="email" required />
              </Field>
              <Field label="Phone">
                <input value={form.phone} onChange={(event) => setValue('phone', event.target.value)} type="tel" />
              </Field>
            </div>

            <div className="form-grid three-col">
              <MultiValueField
                label="Target titles"
                value={form.targetTitles}
                options={targetTitleOptions}
                onChange={(value) => setValue('targetTitles', value)}
                placeholder="Add target title"
              />
              <MultiValueField
                label="Locations"
                value={form.locations}
                options={locationOptions}
                onChange={(value) => setValue('locations', value)}
                placeholder="Add location"
              />
              <Field label="Work authorization">
                <select value={form.workAuthorization} onChange={(event) => setValue('workAuthorization', event.target.value)} required>
                  <option value="">Select authorization</option>
                  {workAuthorizationOptions.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Years of experience">
                <input
                  value={form.yearsOfExperience}
                  onChange={(event) => setValue('yearsOfExperience', event.target.value)}
                  type="number"
                  min="0"
                  max="40"
                />
              </Field>
            </div>

            <Field label="Master resume">
              <textarea
                value={form.masterResumeText}
                onChange={(event) => setValue('masterResumeText', event.target.value)}
                rows={10}
                required
              />
            </Field>

            <div className="form-footer">
              {message ? <div className={message.includes('updated') ? 'success' : 'error'}>{message}</div> : null}
              <button className="primary form-submit" disabled={saving}>
                <FilePlus2 size={18} />
                {saving ? 'Saving' : 'Save changes'}
              </button>
            </div>
          </form>
        )}
      </section>
    </div>
  );
}

function CandidatesPage({ isAdmin = false }) {
  const [candidates, setCandidates] = useState([]);
  const [selectedId, setSelectedId] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [deletingId, setDeletingId] = useState(null);
  const [search, setSearch] = useState('');
  const [loading, setLoading] = useState(true);
  const [populating, setPopulating] = useState(false);
  const [message, setMessage] = useState('');

  async function loadCandidates() {
    setLoading(true);
    const params = new URLSearchParams({ search });
    const data = await api(`/candidates?${params.toString()}`);
    setCandidates(data.candidates);
    setLoading(false);
  }

  async function populateSampleMatches() {
    const confirmed = await confirmAction({
      title: 'Generate sample matches?',
      text: 'This will add local sample matches across the visible candidate profiles.',
      confirmText: 'Generate matches'
    });
    if (!confirmed) return;

    setPopulating(true);
    setMessage('');

    try {
      const data = await api('/matches/populate-samples', {
        method: 'POST',
        body: JSON.stringify({ matchesPerCandidate: 3, threshold: 0, limit: 250 })
      });
      setMessage(`Added sample matched jobs for ${data.totalCandidates} candidates.`);
      await showSuccess('Sample matches added', `Added sample matched jobs for ${data.totalCandidates} candidates.`);
      if (selectedId) {
        setSelectedId(null);
        setTimeout(() => setSelectedId(selectedId), 0);
      }
    } catch (err) {
      setMessage(err.message);
      await showError('Sample matching failed', err.message || 'Unable to generate sample matches.');
    } finally {
      setPopulating(false);
    }
  }

  async function deleteCandidate(candidate) {
    if (!candidate || !isAdmin || deletingId) return;

    const candidateName = `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || candidate.email;
    const confirmed = await confirmAction({
      title: `Delete ${candidateName}?`,
      text: 'This operation is permanent and cannot be recovered. The candidate, matched jobs, analysis history, generated resumes, and applications will all be deleted.',
      confirmText: 'Delete permanently',
      danger: true,
      requireExplicit: true
    });

    if (!confirmed) return;

    setDeletingId(candidate._id);
    setMessage('');

    try {
      const data = await api(`/candidates/${candidate._id}`, { method: 'DELETE' });
      if (selectedId === candidate._id) setSelectedId(null);
      if (editingId === candidate._id) setEditingId(null);
      setMessage(`${data.candidateName || 'Candidate'} deleted with all related records.`);
      await loadCandidates();
      await showSuccess('Candidate deleted', `${data.candidateName || candidateName} and all related records were permanently removed.`);
    } catch (error) {
      setMessage(error.message || 'Unable to delete candidate.');
      await showError('Candidate deletion failed', error.message || 'Unable to delete candidate.');
    } finally {
      setDeletingId(null);
    }
  }

  useEffect(() => {
    loadCandidates();
  }, [search]);

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Candidates</h1>
          <p>{candidates.length} candidate profiles in your current access view</p>
        </div>
        <button className="secondary" onClick={populateSampleMatches} disabled={populating || !candidates.length}>
          <Sparkles size={17} />
          {populating ? 'Matching jobs' : 'Show sample matches'}
        </button>
      </header>
      {message ? <div className={message.includes('Added') || message.includes('deleted') ? 'success' : 'error'}>{message}</div> : null}
      <section className="split-view">
        <div className="candidate-list-panel">
          <div className="search-box compact">
            <Search size={18} />
            <input value={search} onChange={(event) => setSearch(event.target.value)} placeholder="Search candidates" />
          </div>
          {loading ? <div className="loading">Loading candidates</div> : null}
          <div className="candidate-list">
            {candidates.map((candidate) => {
              const fullName = `${candidate.firstName || ''} ${candidate.lastName || ''}`.trim() || candidate.email;
              const initials = `${candidate.firstName?.[0] || ''}${candidate.lastName?.[0] || ''}`.toUpperCase() || 'C';
              const targetText = (candidate.targetTitles?.length ? candidate.targetTitles.join(', ') : candidate.targetTitle) || 'Target role open';
              const locationText = (candidate.locations?.length ? candidate.locations[0] : candidate.location) || 'Location open';

              return (
                <div
                  key={candidate._id}
                  className={cx('candidate-row', 'candidate-row-with-action', selectedId === candidate._id && 'selected')}
                >
                  <button className="candidate-row-main" onClick={() => setSelectedId(candidate._id)}>
                    <span className="candidate-avatar">{initials}</span>
                    <span className="candidate-summary">
                      <strong>{fullName}</strong>
                      <span>{targetText}</span>
                    </span>
                    <span className="candidate-meta-row">
                      <small>{candidate.yearsOfExperience || 0} yrs</small>
                      {candidate.createdBy?.name ? <small>{candidate.createdBy.name}</small> : null}
                    </span>
                    <span className="candidate-attribute-row">
                      <small>{locationText}</small>
                      {candidate.workAuthorization ? <small>{candidate.workAuthorization}</small> : null}
                    </span>
                  </button>
                  <div className="candidate-card-actions">
                    <IconAction label="Edit candidate" onClick={() => setEditingId(candidate._id)}>
                      <Pencil size={17} />
                    </IconAction>
                    {isAdmin ? (
                      <IconAction
                        label="Delete candidate"
                        className="icon-action-danger"
                        onClick={() => deleteCandidate(candidate)}
                        disabled={Boolean(deletingId)}
                      >
                        <Trash2 size={17} />
                      </IconAction>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
        <div className="candidate-detail-panel">
          {selectedId ? <CandidateDetail id={selectedId} onUpdated={loadCandidates} /> : <EmptyState />}
        </div>
      </section>
      {editingId ? (
        <CandidateEditModal
          candidateId={editingId}
          onClose={() => setEditingId(null)}
          onSaved={() => {
            setEditingId(null);
            loadCandidates();
            if (selectedId === editingId) {
              setSelectedId(null);
              setTimeout(() => setSelectedId(editingId), 0);
            }
          }}
        />
      ) : null}
    </>
  );
}

function EmptyState() {
  return (
    <div className="empty-state">
      <UsersRound size={36} />
      <strong>Select a candidate</strong>
    </div>
  );
}

function CandidateDetail({ id, onUpdated }) {
  const [candidate, setCandidate] = useState(null);
  const [matches, setMatches] = useState([]);
  const [loading, setLoading] = useState(true);
  const [matching, setMatching] = useState(false);
  const [matchRun, setMatchRun] = useState(null);
  const [matchDateScope, setMatchDateScope] = useState('');
  const [matchKeywords, setMatchKeywords] = useState([]);
  const [matchKeywordsInitialized, setMatchKeywordsInitialized] = useState(false);
  const [resumeDraft, setResumeDraft] = useState(null);
  const [actionMessage, setActionMessage] = useState('');
  const [actionType, setActionType] = useState('success');
  const [matchedSortDir, setMatchedSortDir] = useState('desc');
  const [matchedPage, setMatchedPage] = useState(1);
  const [appliedPage, setAppliedPage] = useState(1);
  const [expandedMatches, setExpandedMatches] = useState({});
  const [expandedCheckpoints, setExpandedCheckpoints] = useState({});
  const [resumeGenerating, setResumeGenerating] = useState(null);
  const [stoppingMatch, setStoppingMatch] = useState(false);
  const currentCandidateIdRef = useRef(id);

  const isRunActive = (run) => ['queued', 'running', 'cancelling'].includes(run?.status);

  function runBelongsToCandidate(run, candidateId) {
    const runCandidateId = run?.candidateId?._id || run?.candidateId;
    return runCandidateId && String(runCandidateId) === String(candidateId);
  }

  function runProgressText(run) {
    if (!run) return '';
    if (run.status === 'failed') return `AI matching failed${run.error ? `: ${run.error}` : '.'}`;
    if (run.status === 'cancelled') return `AI matching stopped after ${run.processed || 0} analyses. ${run.matched || 0} saved matches were preserved.`;
    if (run.status === 'cancelling') return 'Stopping AI matching after the current job finishes. Matches already found will be preserved.';
    if (run.status === 'completed') {
      return `${run.matched || 0} top matches saved from ${run.totalFetched || 0} fetched jobs and ${run.totalScanned || 0} Claude analyses.`;
    }
    return `Analyzing ${run.processed || 0} of ${run.totalScanned || '...'} pre-ranked jobs. ${run.matched || 0} Claude-qualified so far.`;
  }

  function defaultMatchKeywords(profile) {
    const targets = profile?.targetTitles?.length ? profile.targetTitles : [profile?.targetTitle].filter(Boolean);
    return targets.length ? targets : ['Data Engineer'];
  }

  function dateScopeLabel(scope) {
    if (scope === 'all') return 'All jobs';
    if (scope === 'last1d') return 'Last 1 day';
    if (scope === 'last2d') return 'Last 2 days';
    return 'Date filter';
  }

  function itemTimeValue(item) {
    const rawDate = item?.matchedAt || item?.createdAt || item?.updatedAt || item?.appliedAt;
    const parsedDate = rawDate ? new Date(rawDate).getTime() : 0;
    if (Number.isFinite(parsedDate) && parsedDate > 0) return parsedDate;

    const rawId = String(item?._id || item?.id || '');
    if (/^[a-f\d]{24}$/i.test(rawId)) return parseInt(rawId.slice(0, 8), 16) * 1000;
    return 0;
  }

  function isJobOlderThan(job, days) {
    const postedTime = job?.postedAt ? new Date(job.postedAt).getTime() : 0;
    if (!Number.isFinite(postedTime) || postedTime <= 0) return false;
    return postedTime < Date.now() - days * 24 * 60 * 60 * 1000;
  }

  function paginate(items, page, perPage) {
    const totalPages = Math.max(1, Math.ceil(items.length / perPage));
    const safePage = Math.min(Math.max(1, page), totalPages);
    const start = (safePage - 1) * perPage;
    return {
      items: items.slice(start, start + perPage),
      page: safePage,
      totalPages
    };
  }

  function PaginationControls({ page, totalPages, onPageChange }) {
    if (totalPages <= 1) return null;

    return (
      <div className="compact-pagination">
        <button className="icon-button" onClick={() => onPageChange(Math.max(1, page - 1))} disabled={page === 1}>
          <ChevronLeft size={17} />
        </button>
        <span>
          {page} / {totalPages}
        </span>
        <button className="icon-button" onClick={() => onPageChange(Math.min(totalPages, page + 1))} disabled={page === totalPages}>
          <ChevronRight size={17} />
        </button>
      </div>
    );
  }

  function updateMatchedSort(value) {
    setMatchedSortDir(value);
    setMatchedPage(1);
  }

  function toggleMatchExpanded(matchId) {
    setExpandedMatches((current) => ({ ...current, [matchId]: !current[matchId] }));
  }

  function toggleCheckpoint(matchId, checkpointKey) {
    const key = `${matchId}:${checkpointKey}`;
    setExpandedCheckpoints((current) => ({ ...current, [key]: !current[key] }));
  }

  function isResumeBusy() {
    return Boolean(resumeGenerating);
  }

  function resumeDataFromVersion(version) {
    if (!version) return null;
    if (version.structuredContent) return version.structuredContent;
    if (version.structuredResume) return version.structuredResume;

    try {
      return JSON.parse(version.content || version.resume || '');
    } catch {
      return null;
    }
  }

  function resumeFileBase(job, resumeData) {
    const candidateLabel = resumeData?.name || `${candidate?.firstName || ''} ${candidate?.lastName || ''}`.trim() || 'candidate';
    const targetRole = resumeData?.target_role || job?.title || 'tailored-resume';
    return `${safeFileName(candidateLabel)}-${safeFileName(targetRole)}-resume`;
  }

  async function downloadResumePdf({ resumeData, job, version }) {
    const structuredResume = resumeData || resumeDataFromVersion(version);
    if (!structuredResume) {
      setActionType('error');
      setActionMessage('Resume PDF is not available yet. Generate the tailored resume first.');
      await showInfo('Resume not available', 'Generate the tailored resume before downloading its PDF.');
      return;
    }

    try {
      await PDFGen.downloadPDF(structuredResume, resumeFileBase(job || version?.jobSnapshot, structuredResume));
      setActionType('success');
      setActionMessage('Tailored resume PDF downloaded.');
      await showToast('Tailored resume PDF downloaded');
    } catch (error) {
      setActionType('error');
      setActionMessage(error.message || 'PDF download failed.');
      await showError('PDF download failed', error.message || 'Unable to download the tailored resume.');
    }
  }

  async function load({ showLoading = true, candidateId = id } = {}) {
    if (showLoading) setLoading(true);
    const [data, runData] = await Promise.all([
      api(`/candidates/${candidateId}`),
      api(`/matches/candidates/${candidateId}/runs/latest`).catch(() => ({ run: null }))
    ]);

    if (String(currentCandidateIdRef.current) !== String(candidateId)) return;

    const candidateRun = runBelongsToCandidate(runData.run, candidateId) ? runData.run : null;
    setCandidate(data.candidate);
    setMatches(data.candidate.matchedJobs || data.candidate.matches || []);
    setMatchRun(candidateRun);
    if (candidateRun?.dateScope) setMatchDateScope(candidateRun.dateScope);
    setMatching(isRunActive(candidateRun));
    if (candidateRun && isRunActive(candidateRun)) {
      setActionType('success');
      setActionMessage(runProgressText(candidateRun));
    } else if (candidateRun && ['cancelled', 'failed'].includes(candidateRun.status)) {
      setActionType(candidateRun.status === 'failed' ? 'error' : 'success');
      setActionMessage(runProgressText(candidateRun));
    }
    if (showLoading) setLoading(false);
  }

  useEffect(() => {
    currentCandidateIdRef.current = id;
    setCandidate(null);
    setMatches([]);
    setMatchRun(null);
    setMatching(false);
    setActionMessage('');
    setActionType('success');
    setResumeDraft(null);
    setMatchedSortDir('desc');
    setMatchedPage(1);
    setAppliedPage(1);
    setExpandedMatches({});
    setExpandedCheckpoints({});
    setResumeGenerating(null);
    setStoppingMatch(false);
    setMatchDateScope('');
    setMatchKeywords([]);
    setMatchKeywordsInitialized(false);
    load({ candidateId: id });
  }, [id]);

  useEffect(() => {
    if (!candidate || matchKeywordsInitialized) return;
    setMatchKeywords(defaultMatchKeywords(candidate));
    setMatchKeywordsInitialized(true);
  }, [candidate, matchKeywordsInitialized]);

  useEffect(() => {
    const runId = matchRun?._id || matchRun?.id;
    if (!runId || !isRunActive(matchRun)) return undefined;

    const timer = setInterval(async () => {
      try {
        const data = await api(`/matches/runs/${runId}`);
        if (!runBelongsToCandidate(data.run, id) || String(currentCandidateIdRef.current) !== String(id)) return;
        setMatchRun(data.run);
        setMatching(isRunActive(data.run));
        setActionType(data.run.status === 'failed' ? 'error' : 'success');
        setActionMessage(runProgressText(data.run));
        await load({ showLoading: false, candidateId: id });
      } catch (error) {
        setActionType('error');
        setActionMessage(error.message || 'Unable to refresh AI matching progress.');
      }
    }, 2500);

    return () => clearInterval(timer);
  }, [matchRun?._id, matchRun?.status, id]);

  useEffect(() => {
    setMatchedPage((current) => Math.min(current, Math.max(1, Math.ceil(matches.length / matchedJobsPerPage))));
  }, [matches.length]);

  useEffect(() => {
    const applicationCount = (candidate?.applications || candidate?.appliedJobs || []).length;
    setAppliedPage((current) => Math.min(current, Math.max(1, Math.ceil(applicationCount / appliedJobsPerPage))));
  }, [candidate?.applications?.length, candidate?.appliedJobs?.length]);

  async function matchJobs() {
    if (isResumeBusy()) return;

    if (!matchDateScope) {
      setActionType('error');
      setActionMessage('Select a posting date filter before matching.');
      return;
    }

    if (!matchKeywords.length) {
      setActionType('error');
      setActionMessage('Select at least one position keyword before matching.');
      return;
    }

    setMatching(true);
    setActionType('success');
    setActionMessage('AI matching has started. You can leave this page and come back later.');
    try {
      const data = await api(`/candidates/${id}/match`, {
        method: 'POST',
        body: JSON.stringify({
          dateScope: matchDateScope,
          titleKeywords: matchKeywords
        })
      });
      if (String(currentCandidateIdRef.current) !== String(id) || !runBelongsToCandidate(data.run, id)) return;
      setMatchRun(data.run);
      setActionMessage(runProgressText(data.run) || 'AI matching is queued.');
      await showToast('AI job matching started', 'info');
      onUpdated?.();
    } catch (error) {
      setActionType('error');
      setActionMessage(error.message || 'AI matching failed. Check backend configuration and try again.');
      setMatching(false);
      await showError('Job matching failed', error.message || 'Check the backend configuration and try again.');
    } finally {
      // The background run controls the final matching state through polling.
    }
  }

  async function stopMatchRun() {
    const runId = matchRun?._id || matchRun?.id;
    if (!runId || !isRunActive(matchRun) || stoppingMatch) return;

    const confirmed = await confirmAction({
      title: 'Stop job analysis?',
      text: 'Claude will finish the job currently being analyzed, then stop. All matched jobs already found will remain available.',
      confirmText: 'Stop analysis',
      danger: true
    });
    if (!confirmed) return;

    setStoppingMatch(true);
    try {
      const data = await api(`/matches/runs/${runId}/cancel`, { method: 'POST' });
      setMatchRun(data.run);
      setMatching(isRunActive(data.run));
      setActionType('success');
      setActionMessage(runProgressText(data.run));
      await showToast('Stopping after the current job', 'info');
    } catch (error) {
      setActionType('error');
      setActionMessage(error.message || 'Unable to stop AI matching.');
      await showError('Unable to stop analysis', error.message || 'The cancellation request could not be completed.');
    } finally {
      setStoppingMatch(false);
    }
  }

  async function generateResume(jobId, matchId, job = {}) {
    if (isResumeBusy()) return;

    const controller = new AbortController();
    const timeoutId = setTimeout(() => controller.abort(), resumeGenerationTimeoutMs);
    const jobLabel = [job.title, job.company].filter(Boolean).join(' at ') || 'this job';

    setResumeGenerating({
      jobTitle: job.title || 'Matched job',
      company: job.company || '',
      timeoutSeconds: Math.round(resumeGenerationTimeoutMs / 1000)
    });
    setActionType('success');
    setActionMessage(`AI is creating a tailored resume for ${jobLabel}. Please wait until it finishes.`);
    try {
      const data = await api(`/candidates/${id}/jobs/${jobId}/generate-resume`, {
        method: 'POST',
        body: JSON.stringify({ matchId }),
        signal: controller.signal
      });

      if (String(currentCandidateIdRef.current) !== String(id)) return;

      let structuredResume = data.structuredResume;
      if (!structuredResume) {
        try {
          structuredResume = JSON.parse(data.resume);
        } catch {
          structuredResume = null;
        }
      }
      const targetRole = structuredResume?.target_role || data.resumeVersion?.jobSnapshot?.title || 'tailored-resume';
      const candidateLabel = `${candidate.firstName || ''}-${candidate.lastName || ''}`.trim() || 'candidate';
      setResumeDraft({
        content: data.resume,
        structuredResume,
        text: structuredResume ? formatResumeForDownload(structuredResume) : data.resume,
        fileName: `${safeFileName(candidateLabel)}-${safeFileName(targetRole)}-resume`,
        job: data.resumeVersion?.jobSnapshot,
        version: data.resumeVersion
      });
      setActionMessage('Tailored resume generated. Use Download PDF to save it.');
      await load();
      await showSuccess('Tailored resume ready', 'The curated resume was generated and is ready to download as a PDF.');
    } catch (error) {
      setActionType('error');
      const message = error.name === 'AbortError'
        ? 'Resume generation timed out after 3 minutes. The server may still finish saving it; refresh this profile before trying again.'
        : error.message || 'Resume generation failed. Check backend configuration and try again.';
      setActionMessage(message);
      await showError('Resume generation failed', message);
    } finally {
      clearTimeout(timeoutId);
      if (String(currentCandidateIdRef.current) === String(id)) setResumeGenerating(null);
    }
  }

  function downloadResumeDraft() {
    if (!resumeDraft) return;
    downloadResumePdf({ resumeData: resumeDraft.structuredResume, job: resumeDraft.job, version: resumeDraft.version });
  }

  async function applyForRole(jobId, matchId, job = {}) {
    if (isResumeBusy()) return;

    const jobLabel = [job.title, job.company].filter(Boolean).join(' at ') || 'this role';
    const confirmed = await confirmAction({
      title: 'Mark job as applied?',
      text: `This will add ${jobLabel} to the candidate's application history.`,
      confirmText: 'Mark as applied'
    });
    if (!confirmed) return;

    setActionType('success');
    setActionMessage('');
    try {
      const data = await api(`/candidates/${id}/jobs/${jobId}/apply`, {
        method: 'POST',
        body: JSON.stringify({ matchId, status: 'applied' })
      });
      const appliedTitle = data.application.jobSnapshot?.title || job.title || 'this role';
      setActionMessage(`Application recorded for ${appliedTitle}.`);
      await load();
      onUpdated?.();
      await showSuccess('Application recorded', `${appliedTitle} was added to the candidate's application history.`);
    } catch (error) {
      setActionType('error');
      setActionMessage(error.message || 'Unable to record the application.');
      await showError('Application update failed', error.message || 'Unable to record the application.');
    }
  }

  async function removeMatch(matchId, job = {}) {
    if (!matchId || isResumeBusy()) return;

    const jobLabel = [job.title, job.company].filter(Boolean).join(' at ') || 'this matched job';
    const confirmed = await confirmAction({
      title: 'Remove matched job?',
      text: `${jobLabel} will be removed from this candidate's matched jobs. This action cannot be undone.`,
      confirmText: 'Remove match',
      danger: true
    });
    if (!confirmed) return;

    setActionType('success');
    setActionMessage('');
    try {
      await api(`/matches/${matchId}`, { method: 'DELETE' });
      setActionMessage('Matched job removed.');
      await load();
      onUpdated?.();
      await showSuccess('Matched job removed', `${jobLabel} was removed from the candidate.`);
    } catch (error) {
      setActionType('error');
      setActionMessage(error.message || 'Unable to remove the matched job.');
      await showError('Match removal failed', error.message || 'Unable to remove the matched job.');
    }
  }

  async function clearMatches() {
    if (isResumeBusy()) return;

    const confirmed = await confirmAction({
      title: 'Clear all matched jobs?',
      text: `This permanently removes all ${matches.length} matched jobs from this candidate. Generated resume and application records are not removed.`,
      confirmText: 'Clear all matches',
      danger: true,
      requireExplicit: true
    });
    if (!confirmed) return;

    setActionType('success');
    setActionMessage('');
    try {
      const data = await api(`/matches/candidates/${id}`, { method: 'DELETE' });
      setActionMessage(`${data.deleted || 0} matched jobs cleared.`);
      await load();
      onUpdated?.();
      await showSuccess('Matched jobs cleared', `${data.deleted || 0} matched jobs were removed.`);
    } catch (error) {
      setActionType('error');
      setActionMessage(error.message || 'Unable to clear matched jobs.');
      await showError('Unable to clear matches', error.message || 'Unable to clear matched jobs.');
    }
  }

  async function clearOldMatches() {
    if (isResumeBusy()) return;

    const oldMatchCount = matches.filter((match) => isJobOlderThan(match.job, 7)).length;
    const confirmed = await confirmAction({
      title: 'Clear matched jobs older than 7 days?',
      text: `${oldMatchCount || 'All qualifying'} matched jobs with a posted date older than 7 days will be removed. Applications and generated resumes will be preserved.`,
      confirmText: 'Clear old matches',
      danger: true
    });
    if (!confirmed) return;

    setActionType('success');
    setActionMessage('');
    try {
      const data = await api(`/matches/candidates/${id}?olderThanDays=7`, { method: 'DELETE' });
      setActionMessage(`${data.deleted || 0} old matched jobs cleared.`);
      await load();
      onUpdated?.();
      await showSuccess('Old matched jobs cleared', `${data.deleted || 0} matched jobs older than 7 days were removed. Applications and resumes were preserved.`);
    } catch (error) {
      setActionType('error');
      setActionMessage(error.message || 'Unable to clear old matched jobs.');
      await showError('Unable to clear old matches', error.message || 'Unable to clear matched jobs older than 7 days.');
    }
  }

  async function undoApplication(applicationId, application = {}) {
    if (!applicationId || isResumeBusy()) return;

    const title = application.jobSnapshot?.title || application.jobTitle || 'this job';
    const confirmed = await confirmAction({
      title: 'Undo application?',
      text: `${title} will be removed from the candidate's application history and returned to matched status.`,
      confirmText: 'Undo application',
      danger: true
    });
    if (!confirmed) return;

    setActionType('success');
    setActionMessage('');
    try {
      await api(`/applications/${applicationId}`, { method: 'DELETE' });
      setActionMessage('Application removed from this candidate.');
      await load();
      onUpdated?.();
      await showSuccess('Application undone', `${title} was removed from the candidate's application history.`);
    } catch (error) {
      setActionType('error');
      setActionMessage(error.message || 'Unable to undo the application.');
      await showError('Unable to undo application', error.message || 'Unable to undo the application.');
    }
  }

  if (loading || !candidate) return <div className="loading">Loading profile</div>;

  const targetTitleText = candidate.targetTitles?.length ? candidate.targetTitles.join(', ') : candidate.targetTitle || 'Open target';
  const locationText = candidate.locations?.length ? candidate.locations.join(', ') : candidate.location || 'Location open';
  const sortedMatches = [...matches].sort((left, right) => {
    const timeDiff = itemTimeValue(right) - itemTimeValue(left);
    return matchedSortDir === 'desc' ? timeDiff : -timeDiff;
  });
  const matchedPageData = paginate(sortedMatches, matchedPage, matchedJobsPerPage);
  const oldMatchesCount = matches.filter((match) => isJobOlderThan(match.job, 7)).length;
  const appliedJobs = candidate.applications || candidate.appliedJobs || [];
  const appliedPageData = paginate(appliedJobs, appliedPage, appliedJobsPerPage);
  const resumeBusy = isResumeBusy();
  const resumesByJobId = (candidate.resumes || []).reduce((map, version) => {
    const jobId = String(version.jobId?._id || version.jobId || '');
    if (!jobId) return map;

    const current = map.get(jobId);
    const currentTime = itemTimeValue(current);
    const versionTime = itemTimeValue(version);
    if (!current || version.version > current.version || versionTime > currentTime) {
      map.set(jobId, version);
    }
    return map;
  }, new Map());

  return (
    <article className="candidate-detail">
      {resumeBusy ? (
        <div className="resume-busy-backdrop" role="alert" aria-live="assertive">
          <div className="resume-busy-panel">
            <div className="resume-spinner" aria-hidden="true" />
            <div>
              <strong>Creating tailored resume</strong>
              <span>
                {resumeGenerating.jobTitle}
                {resumeGenerating.company ? ` at ${resumeGenerating.company}` : ''}
              </span>
              <small>This can take up to {resumeGenerating.timeoutSeconds} seconds. Actions are paused until generation finishes.</small>
            </div>
          </div>
        </div>
      ) : null}
      <div className="detail-header">
        <div>
          <h2>
            {candidate.firstName} {candidate.lastName}
          </h2>
          <p>
            {targetTitleText} · {locationText}
          </p>
        </div>
        <button className="primary" onClick={matchJobs} disabled={resumeBusy || matching || !matchDateScope || !matchKeywords.length}>
          <Sparkles size={18} />
          {matching ? 'Matching' : 'Match'}
        </button>
      </div>
      <div className="stats-row">
        <StatusPill tone="gold">{candidate.yearsOfExperience || 0} yrs</StatusPill>
        <StatusPill>{candidate.email}</StatusPill>
        <StatusPill>{candidate.applications?.length || candidate.appliedJobs?.length || 0} applications</StatusPill>
      </div>
      {candidate.createdBy?.name ? <span className="muted">Owner: {candidate.createdBy.name}</span> : null}
      <div className="match-keyword-panel">
        <Field label="Job posting date filter">
          <select value={matchDateScope} onChange={(event) => setMatchDateScope(event.target.value)}>
            <option value="">Choose date range</option>
            <option value="all">Analyze all jobs</option>
            <option value="last2d">Jobs posted in last 2 days</option>
            <option value="last1d">Jobs posted in last 1 day</option>
          </select>
        </Field>
        <MultiValueField
          label="AI match position keywords"
          value={matchKeywords}
          options={matchPositionOptions}
          onChange={setMatchKeywords}
          placeholder="Search job titles"
          allowCustom
        />
        <p>All date/title matches are pre-filtered for sponsorship and ATS skill coverage. Only the top 50 ranked jobs are sent to Claude, and the top 35 are saved.</p>
      </div>
      {actionMessage ? <div className={actionType === 'error' ? 'error' : 'success'}>{actionMessage}</div> : null}
      {matchRun ? (
        <div className="ai-run-panel">
          <div className="ai-run-header">
            <strong>AI job analysis</strong>
            <div className="ai-run-header-actions">
              {isRunActive(matchRun) ? (
                <button
                  type="button"
                  className="stop-analysis-button"
                  onClick={stopMatchRun}
                  disabled={stoppingMatch || matchRun.status === 'cancelling'}
                >
                  <Square size={14} fill="currentColor" />
                  {matchRun.status === 'cancelling' ? 'Stopping' : 'Stop'}
                </button>
              ) : null}
              <StatusPill tone={matchRun.status === 'completed' ? 'green' : matchRun.status === 'failed' ? 'gold' : 'gold'}>
                {matchRun.status}
              </StatusPill>
            </div>
          </div>
          <div className="ai-run-track">
            <span
              style={{
                width: `${Math.min(100, Math.round(((matchRun.processed || 0) / Math.max(1, matchRun.totalScanned || 1)) * 100))}%`
              }}
            />
          </div>
          <div className="ai-run-meta">
            <span>{matchRun.totalFetched || 0} fetched</span>
            <span>{matchRun.layer1Passed || 0} sponsorship-safe</span>
            <span>{matchRun.layer1Discarded || 0} blocked</span>
            <span>{matchRun.preFilterPoolSize || matchRun.totalScanned || 0} sent to Claude</span>
            <span>{matchRun.processed || 0}/{matchRun.totalScanned || 0} analyzed</span>
            <span>{matchRun.matched || 0} matched</span>
            <span>{matchRun.cached || 0} reused</span>
            <span>{dateScopeLabel(matchRun.dateScope)}</span>
            {matchRun.titleKeywords?.length ? <span>{matchRun.titleKeywords.join(', ')}</span> : null}
            {matchRun.currentJobTitle && isRunActive(matchRun) ? <span>Current: {matchRun.currentJobTitle}</span> : null}
          </div>
        </div>
      ) : null}

      <div className="section-title-row">
        <div>
          <h3>Matched jobs</h3>
          {matches.length ? <span className="section-count">{matches.length} total</span> : null}
        </div>
        <div className="section-actions match-list-tools">
          {matches.length ? (
            <label className="compact-sort-control" title="Sort matched jobs">
              <ArrowDownUp size={17} />
              <select
                aria-label="Sort matched jobs"
                value={matchedSortDir}
                onChange={(event) => updateMatchedSort(event.target.value)}
                disabled={resumeBusy}
              >
                <option value="desc">Latest</option>
                <option value="asc">Oldest</option>
              </select>
            </label>
          ) : null}
          {matches.length ? (
            <IconAction
              label={`Clear ${oldMatchesCount} matched job${oldMatchesCount === 1 ? '' : 's'} older than 7 days`}
              className="match-tool-action match-tool-action-warning"
              onClick={clearOldMatches}
              disabled={resumeBusy || !oldMatchesCount}
            >
              <CalendarX2 size={18} />
            </IconAction>
          ) : null}
          {matches.length ? (
            <IconAction
              label="Clear all matched jobs"
              className="match-tool-action icon-action-danger"
              onClick={clearMatches}
              disabled={resumeBusy}
            >
              <Trash2 size={17} />
            </IconAction>
          ) : null}
        </div>
      </div>
      <div className="match-list">
        {matches.length ? (
          matchedPageData.items.map((match) => {
            const job = match.job || {};
            const jobId = job.id || match.jobId;
            const matchId = match._id;
            const matchKey = matchId || jobId;
            const resumeVersion = resumesByJobId.get(String(jobId));
            const isExpanded = Boolean(expandedMatches[matchKey]);
            const matchedSkills = match.matchedSkills || [];
            const missingSkills = match.missingSkills || [];
            const checkpoints = match.checkpoints || match.aiAnalysis?.checkpoints || {};
            const checkpointRows = [
              { key: 'cp1', label: 'Category', checkpoint: checkpoints.cp1 },
              { key: 'cp2', label: 'Experience', checkpoint: checkpoints.cp2 },
              { key: 'cp3', label: 'Authorization', checkpoint: checkpoints.cp3 },
              { key: 'cp4', label: 'Domain', checkpoint: checkpoints.cp4 }
            ].filter((row) => row.checkpoint);
            const criteriaMatched = match.criteriaMatched ?? match.aiAnalysis?.criteria_matched;
            const verdict = match.verdict || match.aiAnalysis?.verdict;
            const summaryText = match.summary || match.reasonSummary || 'Candidate profile overlaps with this job.';
            return (
              <article className="matched-job-card" key={matchKey}>
                <div className="matched-job-main">
                  <div className="matched-job-heading">
                    <div>
                      <strong>{job.title || 'Matched job'}</strong>
                      <span>
                        {job.company || 'Company'} {job.location ? `· ${job.location}` : ''}
                      </span>
                    </div>
                    <StatusPill tone={match.score >= 85 ? 'green' : 'gold'}>{match.score}% match</StatusPill>
                  </div>
                  <div className="analysis-bar">
                    <div className="analysis-bar-main">
                      <StatusPill tone={verdict === 'QUALIFIED' ? 'green' : 'gold'}>{verdict || 'AI match'}</StatusPill>
                      <span>{criteriaMatched || 3}/4 criteria</span>
                      {Number.isFinite(match.preFilterScore) ? (
                        <span>ATS {match.preFilterScore}%{match.preFilterRank ? ` · pre-rank #${match.preFilterRank}` : ''}</span>
                      ) : null}
                      <small>{summaryText}</small>
                    </div>
                    <button type="button" className="analysis-toggle" onClick={() => toggleMatchExpanded(matchKey)}>
                      {isExpanded ? 'Show less' : 'See more'}
                    </button>
                  </div>
                  {isExpanded ? (
                    <div className="analysis-panel">
                      <p>{job.description || 'No job description available.'}</p>
                      <div className="match-reason">
                        <span>{summaryText}</span>
                      </div>
                      {checkpointRows.length ? (
                        <div className="checkpoint-bars">
                          {checkpointRows.map(({ key, label, checkpoint }) => {
                            const checkpointKey = `${matchKey}:${key}`;
                            const passed = checkpoint.passed === true || checkpoint.flag === false;
                            const isCheckpointOpen = Boolean(expandedCheckpoints[checkpointKey]);
                            const checkpointTitle = checkpoint.name || label;
                            return (
                              <div className="checkpoint-bar-wrap" key={checkpointKey}>
                                <button
                                  type="button"
                                  className={cx('checkpoint-bar', passed ? 'checkpoint-bar-ok' : 'checkpoint-bar-review')}
                                  onClick={() => toggleCheckpoint(matchKey, key)}
                                >
                                  <span>{checkpointTitle}</span>
                                  <strong>{passed ? 'Pass' : 'Review'}</strong>
                                </button>
                                {isCheckpointOpen ? <small>{checkpoint.reason || 'Reviewed by AI.'}</small> : null}
                              </div>
                            );
                          })}
                        </div>
                      ) : null}
                      {matchedSkills.length ? (
                        <div className="match-skill-block">
                          <small>Matched skills</small>
                          <div className="skill-row">
                            {matchedSkills.slice(0, 8).map((skill) => (
                              <span key={skill}>{skill}</span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {missingSkills.length ? (
                        <div className="match-skill-block muted-skills">
                          <small>Skills to review</small>
                          <div className="skill-row">
                            {missingSkills.slice(0, 6).map((skill) => (
                              <span key={skill}>{skill}</span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                      {!matchedSkills.length && job.skills?.length ? (
                        <div className="match-skill-block">
                          <small>Job keywords</small>
                          <div className="skill-row">
                            {job.skills.slice(0, 8).map((skill) => (
                              <span key={skill}>{skill}</span>
                            ))}
                          </div>
                        </div>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                <div className="matched-job-actions">
                  <IconAction
                    className="icon-action-strong"
                    label="Generate curated resume"
                    onClick={() => generateResume(jobId, matchId, job)}
                    disabled={resumeBusy}
                  >
                    <Sparkles size={17} />
                  </IconAction>
                  {resumeVersion ? (
                    <IconAction
                      className="icon-action-strong"
                      label="Download tailored resume PDF"
                      onClick={() => downloadResumePdf({ version: resumeVersion, job })}
                      disabled={resumeBusy}
                    >
                      <Download size={17} />
                    </IconAction>
                  ) : null}
                  <IconAction label="Mark applied" onClick={() => applyForRole(jobId, matchId, job)} disabled={resumeBusy}>
                    <CheckCircle2 size={17} />
                  </IconAction>
                  {job.applyUrl ? (
                    <IconAction as="a" label="View job" href={job.applyUrl} target="_blank" rel="noreferrer">
                      <ExternalLink size={17} />
                    </IconAction>
                  ) : null}
                  <IconAction label="Remove from matched jobs" onClick={() => removeMatch(matchId, job)} disabled={resumeBusy}>
                    <Trash2 size={17} />
                  </IconAction>
                </div>
              </article>
            );
          })
        ) : (
          <div className="empty-state small">
            <BriefcaseBusiness size={28} />
            <strong>No matches yet</strong>
          </div>
        )}
      </div>
      <PaginationControls page={matchedPageData.page} totalPages={matchedPageData.totalPages} onPageChange={setMatchedPage} />

      <div className="section-title-row">
        <div>
          <h3>Candidate Applications</h3>
          {appliedJobs.length ? <span className="section-count">{appliedJobs.length} total</span> : null}
        </div>
      </div>
      <div className="applied-list">
        {appliedJobs.length ? (
          appliedPageData.items.map((job) => (
            <div className="applied-row" key={job._id}>
              <div>
                <strong>{job.jobSnapshot?.title || job.jobTitle}</strong>
                <span>
                  {job.jobSnapshot?.company || job.company} · {job.jobSnapshot?.location || 'Location open'}
                </span>
              </div>
              <StatusPill tone={job.status === 'applied' ? 'green' : 'gold'}>{job.status}</StatusPill>
              {job.jobSnapshot?.applyUrl ? (
                <a className="secondary" href={job.jobSnapshot.applyUrl} target="_blank" rel="noreferrer">
                  <ExternalLink size={17} />
                  Apply job
                </a>
              ) : null}
              <button className="secondary" onClick={() => undoApplication(job._id, job)} disabled={resumeBusy}>
                <RotateCcw size={17} />
                Undo
              </button>
            </div>
          ))
        ) : (
          <span className="muted">No applications recorded for this candidate.</span>
        )}
      </div>
      <PaginationControls page={appliedPageData.page} totalPages={appliedPageData.totalPages} onPageChange={setAppliedPage} />

      {resumeDraft ? (
        <div className="resume-draft">
          <div className="modal-header">
            <h3>Resume Draft</h3>
            <button className="secondary" onClick={downloadResumeDraft} disabled={resumeBusy}>
              <Download size={17} />
              Download PDF
            </button>
            <button className="icon-button" onClick={() => setResumeDraft('')}>
              ×
            </button>
          </div>
          <pre>{resumeDraft.content}</pre>
        </div>
      ) : null}
    </article>
  );
}

function RecruitersPage() {
  const [users, setUsers] = useState([]);
  const [form, setForm] = useState({ name: '', email: '', password: '', role: 'recruiter' });
  const [resetPasswords, setResetPasswords] = useState({});
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(true);

  async function load() {
    setLoading(true);
    const data = await api('/users?role=recruiter');
    setUsers(data.users);
    setLoading(false);
  }

  useEffect(() => {
    load();
  }, []);

  function setValue(key, value) {
    setForm((current) => ({ ...current, [key]: value }));
  }

  async function submit(event) {
    event.preventDefault();
    setMessage('');
    try {
      const data = await api('/users', {
        method: 'POST',
        body: JSON.stringify(form)
      });
      setMessage(`${data.user.name} created as recruiter.`);
      setForm({ name: '', email: '', password: '', role: 'recruiter' });
      await load();
      await showSuccess('Recruiter created', `${data.user.name} can now sign in using the configured temporary password.`);
    } catch (error) {
      setMessage(error.message || 'Unable to create recruiter.');
      await showError('Recruiter creation failed', error.message || 'Unable to create recruiter.');
    }
  }

  function setResetPassword(userId, value) {
    setResetPasswords((current) => ({ ...current, [userId]: value }));
  }

  async function resetPassword(user) {
    const password = resetPasswords[user.id] || '';
    setMessage('');

    if (password.length < 6) {
      setMessage('Password reset requires at least 6 characters.');
      await showInfo('Password is too short', 'Enter a temporary password with at least 6 characters.');
      return;
    }

    const confirmed = await confirmAction({
      title: `Reset password for ${user.name}?`,
      text: 'Their current password will stop working immediately.',
      confirmText: 'Reset password',
      danger: true
    });
    if (!confirmed) return;

    try {
      await api(`/users/${user.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password })
      });

      setResetPassword(user.id, '');
      setMessage(`Password reset for ${user.name}.`);
      await showSuccess('Password reset', `${user.name}'s temporary password is now active.`);
    } catch (error) {
      setMessage(error.message || 'Unable to reset password.');
      await showError('Password reset failed', error.message || 'Unable to reset password.');
    }
  }

  return (
    <>
      <header className="page-header">
        <div>
          <h1>Recruiters</h1>
          <p>Master admin controls recruiter access and candidate ownership</p>
        </div>
      </header>
      <section className="admin-grid">
        <form className="profile-form compact-form" onSubmit={submit}>
          <h2>Create Recruiter</h2>
          <Field label="Name">
            <input value={form.name} onChange={(event) => setValue('name', event.target.value)} required />
          </Field>
          <Field label="Email">
            <input value={form.email} onChange={(event) => setValue('email', event.target.value)} type="email" required />
          </Field>
          <Field label="Temporary password">
            <input value={form.password} onChange={(event) => setValue('password', event.target.value)} type="password" required />
          </Field>
          {message ? <div className="success">{message}</div> : null}
          <button className="primary">
            <ShieldCheck size={18} />
            Create recruiter
          </button>
        </form>
        <div className="candidate-list-panel">
          <h2>Active Recruiters</h2>
          {loading ? <div className="loading">Loading recruiters</div> : null}
          <div className="candidate-list">
            {users.map((user) => (
              <div className="candidate-row recruiter-row static-row" key={user.id}>
                <div className="recruiter-summary">
                  <strong>{user.name}</strong>
                  <span>{user.email}</span>
                  <small>{user.status}</small>
                </div>
                <div className="password-reset-row">
                  <input
                    value={resetPasswords[user.id] || ''}
                    onChange={(event) => setResetPassword(user.id, event.target.value)}
                    type="password"
                    placeholder="New temporary password"
                  />
                  <button type="button" className="secondary" onClick={() => resetPassword(user)}>
                    Reset password
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>
    </>
  );
}

export default function App() {
  const [admin, setAdmin] = useState(null);
  const [page, setPage] = useState('jobs');
  const [booting, setBooting] = useState(Boolean(getToken()));

  useEffect(() => {
    async function hydrate() {
      if (!getToken()) return;

      try {
        const data = await api('/auth/me');
        setAdmin(data.user || data.admin);
      } catch {
        setToken(null);
      } finally {
        setBooting(false);
      }
    }

    hydrate();
  }, []);

  const content = useMemo(() => {
    if (page === 'candidates') return <CandidatesPage isAdmin={admin?.role === 'admin'} />;
    if (page === 'create') return <CandidateForm onCreated={() => setPage('candidates')} />;
    if (page === 'recruiters' && admin?.role === 'admin') return <RecruitersPage />;
    return <JobsPage isAdmin={admin?.role === 'admin'} />;
  }, [page, admin?.role]);

  if (booting) return <div className="loading full">Loading</div>;
  if (!admin) return <Login onLogin={setAdmin} />;

  return (
    <Shell
      admin={admin}
      page={page}
      setPage={setPage}
      onLogout={() => {
        setToken(null);
        setAdmin(null);
      }}
    >
      {content}
    </Shell>
  );
}
