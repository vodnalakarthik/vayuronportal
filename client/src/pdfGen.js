// pdf_gen.js  v7.0
// Two-page support: if experience has 3+ employers, content
// automatically continues onto page 2. Everything else unchanged.

export const PDFGen = (() => {
  'use strict';

  const PW = 612, PH = 792;
  const ML = 35.28, MR = 35.28, MT = 31.68;
  const MB  = 13.68;
  const BOT = MB + 6;
  const CW  = PW - ML - MR;
  const TOP = PH - MT;
  const LH  = 13;

  const AFM_R = [278,278,355,556,556,889,667,222,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,278,278,584,584,584,556,1015,667,667,722,722,667,611,778,722,278,500,667,556,833,722,778,667,778,722,667,611,722,667,944,667,667,611,278,278,278,469,556,222,556,556,500,556,556,278,556,556,222,222,500,222,833,556,556,556,556,333,500,278,556,500,722,500,500,500,334,260,334,584,278];
  const AFM_B = [278,333,474,556,556,889,722,278,333,333,389,584,278,333,278,278,556,556,556,556,556,556,556,556,556,556,333,333,584,584,584,611,975,722,722,722,722,667,611,778,722,278,556,722,611,833,722,778,667,778,722,667,611,722,667,944,667,667,611,333,278,333,584,556,278,556,611,556,611,556,333,611,611,278,278,556,278,889,611,611,611,611,389,556,333,611,556,778,556,556,500,389,280,389,584,278];

  function toASCII(s) {
    return String(s || '')
      .replace(/[\u2018\u2019\u0060]/g, "'")
      .replace(/[\u201C\u201D]/g, '"')
      .replace(/[\u2013\u2014\u2015]/g, '-')
      .replace(/\u2022/g, '*').replace(/\u00B7/g, '|')
      .replace(/\u00A0/g, ' ').replace(/\u2026/g, '...')
      .replace(/\u00E9/g, 'e').replace(/\u00E0/g, 'a').replace(/\u00FC/g, 'u')
      .replace(/[^\x20-\x7E]/g, '');
  }

  function esc(s) {
    return toASCII(s).replace(/\\/g,'\\\\').replace(/\(/g,'\\(').replace(/\)/g,'\\)');
  }

  function strW(s, bold, sz) {
    let w = 0;
    const t = bold ? AFM_B : AFM_R;
    for (const c of toASCII(String(s||''))) {
      const code = c.charCodeAt(0);
      w += (code >= 32 && code <= 126 ? t[code-32] : 500) / 1000 * sz;
    }
    return w;
  }

  function wrap(s, maxW, bold, sz) {
    const words = toASCII(String(s||'')).split(/\s+/);
    const out = []; let cur = '';
    for (const w of words) {
      const test = cur ? cur+' '+w : w;
      if (strW(test, bold, sz) <= maxW) cur = test;
      else { if (cur) out.push(cur); cur = w; }
    }
    if (cur) out.push(cur);
    return out.length ? out : [''];
  }

  function hasSpace(y, needed) { return y - needed >= BOT; }

  // ── Build streams ─────────────────────────────────────────────────────────
  // Returns { page1: string, page2: string|null }
  // page2 is null when everything fits on one page (1-2 employers)
  function buildStreams(r) {

    // Detect two-page mode: 3+ employers triggers page 2
    const twoPage = r.experience && r.experience.length >= 3;

    // We collect ops into two arrays; current points to whichever is active
    const ops1 = [], ops2 = [];
    let ops = ops1;   // active ops array
    let y = TOP;
    let onPage2 = false;

    // ── Page flip ────────────────────────────────────────────────────────
    function flipPage() {
      if (onPage2) return;   // already on page 2
      onPage2 = true;
      ops = ops2;
      y = TOP;
    }

    // ── Check if we need to flip before drawing ──────────────────────────
    // Call before any draw operation that needs `needed` pts of vertical space
    function ensureSpace(needed) {
      if (twoPage && !onPage2 && y - needed < BOT) {
        flipPage();
      }
    }

    // ── Drawing primitives ───────────────────────────────────────────────
    function drawText(x, yy, s, f, sz) {
      const clean = toASCII(String(s||''));
      if (!clean.trim()) return;
      const fm = { R:'FR', B:'FB', I:'FI' };
      ops.push('BT');
      ops.push(`/${fm[f]||'FR'} ${sz} Tf`);
      ops.push(`1 0 0 1 ${x.toFixed(2)} ${yy.toFixed(2)} Tm`);
      ops.push(`(${esc(clean)}) Tj`);
      ops.push('ET');
    }

    function drawJustLine(x, yy, line, f, sz, maxW, isLast) {
      const bold  = f === 'B';
      const words = line.split(' ');
      if (isLast || words.length <= 1) { drawText(x, yy, line, f, sz); return; }
      const lineW = strW(line, bold, sz);
      const extra = (maxW - lineW) / (words.length - 1);
      if (extra < 0.01 || extra > 8) { drawText(x, yy, line, f, sz); return; }
      const fm = { R:'FR', B:'FB', I:'FI' };
      ops.push('BT');
      ops.push(`/${fm[f]||'FR'} ${sz} Tf`);
      ops.push(`${extra.toFixed(3)} Tw`);
      ops.push(`1 0 0 1 ${x.toFixed(2)} ${yy.toFixed(2)} Tm`);
      ops.push(`(${esc(line)}) Tj`);
      ops.push('0 Tw');
      ops.push('ET');
    }

    function drawBlock(x, yy, s, f, sz, maxW) {
      const lines = wrap(s, maxW, f==='B', sz);
      for (let i = 0; i < lines.length; i++) {
        drawJustLine(x, yy, lines[i], f, sz, maxW, i === lines.length-1);
        yy -= LH;
      }
      return yy;
    }

    function drawCenter(yy, s, f, sz) {
      const w = strW(s, f==='B', sz);
      drawText(Math.max(ML, ML+(CW-w)/2), yy, s, f, sz);
    }

    function drawRight(yy, s, f, sz) {
      drawText(PW - MR - strW(s, f==='B', sz) - 2, yy, s, f, sz);
    }

    function secHeader(s, yy) {
      drawText(ML, yy, toASCII(s).toUpperCase(), 'B', 10);
      return yy - 14;
    }

    function jobHead(title, co, dates, loc, yy) {
      const right = loc ? toASCII(dates) + ' | ' + toASCII(loc) : toASCII(dates);
      const rightW = right ? strW(right, false, 10) + 6 : 0;
      const maxLeftW = CW - rightW;

      drawText(ML, yy, toASCII(title), 'B', 10);
      if (co) {
        const titleW = strW(toASCII(title), true, 10);
        const coStr = ', ' + toASCII(co);
        const coW = strW(coStr, false, 10);
        // Only draw company if it fits without hitting the date
        if (titleW + coW <= maxLeftW) {
          drawText(ML + titleW, yy, coStr, 'R', 10);
        } else {
          // Company too long — put it on the next line
          drawText(ML, yy - LH, toASCII(co), 'R', 10);
          if (right) drawRight(yy, right, 'R', 10);
          return yy - 14 - LH;
        }
      }
      if (right) drawRight(yy, right, 'R', 10);
      return yy - 14;
    }

    function eduRow(deg, sch, gpa, date, yy) {
      let cleanDeg = toASCII(deg)
        .replace(/[\s,\-–—|]+Focus:.*$/i, '')
        .replace(/\s*Focus:.*$/i, '')
        .trim();
      let cleanDate = toASCII(date || '')
        .replace(/\b(current|in progress|expected|anticipated|ongoing)\b[\s,]*/gi, '')
        .trim();
      let left = cleanDeg;
      if (sch) left += ', ' + toASCII(sch);
      if (gpa) left += ' | GPA: ' + toASCII(gpa);

      const dateW = cleanDate ? strW(cleanDate, false, 10) + 6 : 0;
      const maxLeftW = CW - dateW;

      if (strW(left, false, 10) <= maxLeftW) {
        drawText(ML, yy, left, 'R', 10);
        if (cleanDate) drawRight(yy, cleanDate, 'R', 10);
        return yy - LH;
      } else {
        if (cleanDate) drawRight(yy, cleanDate, 'R', 10);
        const lines = wrap(left, CW, false, 10);
        for (const line of lines) { drawText(ML, yy, line, 'R', 10); yy -= LH; }
        return yy;
      }
    }

    function skillRow(cat, items, yy) {
      const label     = toASCII(cat) + ':';
      const lw        = strW(label, true, 10);
      const firstMaxW = PW - MR - ML - lw - 2;
      const words = toASCII(items).split(/\s+/);
      let firstLine = ''; let idx = 0;
      while (idx < words.length) {
        const test = firstLine ? firstLine+' '+words[idx] : words[idx];
        if (strW(test, false, 10) <= firstMaxW) { firstLine = test; idx++; }
        else break;
      }
      ops.push('BT');
      ops.push(`1 0 0 1 ${ML.toFixed(2)} ${yy.toFixed(2)} Tm`);
      ops.push('/FB 10 Tf');
      ops.push(`(${esc(label)}) Tj`);
      if (firstLine) { ops.push('/FR 10 Tf'); ops.push(`(${esc(firstLine)}) Tj`); }
      ops.push('ET');
      yy -= LH;
      if (idx < words.length) {
        const rest = words.slice(idx).join(' ');
        for (const line of wrap(rest, CW, false, 10)) {
          drawText(ML, yy, line, 'R', 10);
          yy -= LH;
        }
      }
      return yy;
    }

    function bulletRow(s, yy) {
      const TX   = ML + 16;
      const maxW = CW - 16;
      ops.push('0 Tw');
      const cx = ML + 5.5, cy2 = yy + 3.2, r2 = 2.2, k = 0.5523;
      ops.push('q');
      ops.push(`${(cx-r2).toFixed(2)} ${cy2.toFixed(2)} m`);
      ops.push(`${(cx-r2).toFixed(2)} ${(cy2+r2*k).toFixed(2)} ${(cx-r2*k).toFixed(2)} ${(cy2+r2).toFixed(2)} ${cx.toFixed(2)} ${(cy2+r2).toFixed(2)} c`);
      ops.push(`${(cx+r2*k).toFixed(2)} ${(cy2+r2).toFixed(2)} ${(cx+r2).toFixed(2)} ${(cy2+r2*k).toFixed(2)} ${(cx+r2).toFixed(2)} ${cy2.toFixed(2)} c`);
      ops.push(`${(cx+r2).toFixed(2)} ${(cy2-r2*k).toFixed(2)} ${(cx+r2*k).toFixed(2)} ${(cy2-r2).toFixed(2)} ${cx.toFixed(2)} ${(cy2-r2).toFixed(2)} c`);
      ops.push(`${(cx-r2*k).toFixed(2)} ${(cy2-r2).toFixed(2)} ${(cx-r2).toFixed(2)} ${(cy2-r2*k).toFixed(2)} ${(cx-r2).toFixed(2)} ${cy2.toFixed(2)} c`);
      ops.push('f Q');
      // Draw complete bullet — never cut mid-sentence
      // Sonnet writes 20-30 word bullets which should naturally fit in 2 lines
      // If a bullet is 3 lines it still renders fully — space algorithm accounts for this
      const allLines = wrap(s, maxW, false, 10);
      let cy = yy;
      for (let i = 0; i < allLines.length; i++) {
        drawJustLine(TX, cy, allLines[i], 'R', 10, maxW, i === allLines.length-1);
        cy -= LH;
      }
      return cy;
    }

    function secH()          { return 14 + 3; }
    function blockH(s, maxW) { return wrap(s, maxW, false, 10).length * LH; }

    // ── RENDER ────────────────────────────────────────────────────────────
    const c = r.contact || {};

    // NAME
    const nameTitleCase = String(r.name||'Candidate').toLowerCase().replace(/\b\w/g, ch=>ch.toUpperCase());
    drawCenter(y, nameTitleCase, 'B', 18);
    y -= 22;

    // CONTACT
    const cp = [c.phone, c.email, c.location, c.linkedin, c.github].filter(Boolean).map(toASCII);
    if (cp.length) {
      const full = cp.join('  |  ');
      if (strW(full, false, 10) <= CW) { drawCenter(y, full, 'R', 10); y -= LH; }
      else {
        const h = Math.ceil(cp.length/2);
        drawCenter(y, cp.slice(0,h).join('  |  '), 'R', 10); y -= LH;
        drawCenter(y, cp.slice(h).join('  |  '),   'R', 10); y -= LH;
      }
    }
    y -= 6;

    // SUMMARY
    if (r.summary) {
      const summaryLabel = r.target_role ? toASCII(r.target_role).toUpperCase() : 'SUMMARY';
      y = secHeader(summaryLabel, y); y -= 2;
      y = drawBlock(ML, y, r.summary, 'R', 10, CW);
      y -= 4;
    }

    // SKILLS
    if (r.skills && r.skills.length) {
      y = secHeader('Technical Skills', y); y -= 2;
      for (const sk of r.skills) {
        if (sk.category && sk.items) { y = skillRow(sk.category, sk.items, y); y -= 2; }
      }
      y -= 2;
    }

    // ── EXPERIENCE ────────────────────────────────────────────────────────
    // For single-page (1-2 employers): original logic — reserved space, MIN 5 MAX 7
    // For two-page (3+ employers): no reserved space needed for page 1;
    //   just draw all bullets and flip to page 2 when needed
    if (r.experience && r.experience.length) {
      y = secHeader('Professional Experience', y);

      // Filter out project entries from experience — projects should never appear
      // as employer sections in a single-page resume
      const allExp = r.experience || [];
      const expList = twoPage
        ? allExp  // two-page: draw everything
        : allExp.filter(exp => {
            const t = (exp.title || '').toLowerCase();
            const c = (exp.company || '').toLowerCase();
            // Exclude entries that are projects, not real employers
            return !t.includes('project') && !c.includes('project') &&
                   !t.includes('personal project') && !c.includes('personal');
          });

      if (!twoPage) {
        // ── SINGLE PAGE: original logic unchanged ──────────────────────
        function calcReserved(resumeData) {
          let reserved = 0;
          if (resumeData.education && resumeData.education.length) {
            reserved += secH() + 3;
            for (const ed of resumeData.education) {
              // measure actual wrapped height of each edu row
              let left = toASCII(ed.degree || '');
              if (ed.school) left += ', ' + toASCII(ed.school);
              if (ed.gpa) left += ' | GPA: ' + toASCII(ed.gpa);
              reserved += Math.max(1, wrap(left, CW, false, 10).length) * LH;
            }
          }
          if (resumeData.certifications && resumeData.certifications.length) {
            const cl = resumeData.certifications.map(toASCII).join('  |  ');
            reserved += secH() + blockH(cl, CW) + 3;
          }
          return reserved;
        }
        const RESERVED = calcReserved(r);
        // Measure actual job header height (may be 2 lines if company name is long)
        function jobHeadH(title, co, dates, loc) {
          const right = loc ? toASCII(dates) + ' | ' + toASCII(loc) : toASCII(dates);
          const rightW = right ? strW(right, false, 10) + 6 : 0;
          const maxLeftW = CW - rightW;
          const titleW = strW(toASCII(title), true, 10);
          const coStr = co ? ', ' + toASCII(co) : '';
          const coW = co ? strW(coStr, false, 10) : 0;
          return (titleW + coW > maxLeftW) ? 14 + LH : 14;
        }

        // Calculate header overhead and available bullet space
        const headerOverhead = expList.reduce((sum, exp) =>
          sum + jobHeadH(exp.title||'', exp.company||'', exp.dates||'', exp.location||'') + 9 + 5 + 2, 0);
        const AVAIL = y - BOT - RESERVED - headerOverhead;

        // Dynamic MIN_B: adjust if space is tight (3-4 line summary may compress space)
        const MIN_B = AVAIL < 120 ? 4 : 5;  // always at least 5, drop to 4 only if critically tight
        const MAX_B = 5;  // never more than 5 bullets per employer

        const allHeights = expList.map(exp =>
          (exp.bullets||[]).filter(b=>b&&b.trim()).slice(0,MAX_B)
            .map(b => wrap(b.trim(), CW-16, false, 10).length * LH + 1)
        );

        // SMART FIT: distribute AVAIL space across employers fairly
        // Each employer gets equal share, then fill remaining space greedily
        const numExp = expList.length;
        const counts = new Array(numExp).fill(0);

        // Pass 1: give each employer as many bullets as fit in equal share
        const sharePerEmp = Math.floor(AVAIL / numExp);
        for (let i = 0; i < numExp; i++) {
          let used = 0;
          const h = allHeights[i];
          for (let j = 0; j < Math.min(MAX_B, h.length); j++) {
            if (used + (h[j]||0) <= sharePerEmp) { counts[i]++; used += h[j]||0; }
            else break;
          }
          // Ensure minimum — at least 3 bullets per employer always
          counts[i] = Math.max(counts[i], Math.min(3, h.length));
        }

        // Pass 2: fill remaining space with more bullets (recency-weighted — recent first)
        let totalUsed = counts.reduce((s, c, i) =>
          s + allHeights[i].slice(0,c).reduce((a,b)=>a+b,0), 0);
        for (let i = 0; i < numExp; i++) {
          const h = allHeights[i];
          while (counts[i] < Math.min(MAX_B, h.length)) {
            const next = h[counts[i]]||0;
            if (totalUsed + next <= AVAIL) { counts[i]++; totalUsed += next; }
            else break;
          }
        }

        for (let ei = 0; ei < expList.length; ei++) {
          const exp = expList[ei];
          y -= 5;
          y = jobHead(exp.title||'', exp.company||'', exp.dates||'', exp.location||'', y);
          y -= 2;
          const bullets = (exp.bullets||[]).filter(b=>b&&b.trim());
          let drawn = 0;
          for (const b of bullets) {
            if (drawn >= counts[ei]) break;
            const bH = allHeights[ei][drawn] || LH*2;
            // Hard stop: always protect education/cert space at bottom
            if (y - bH < BOT + RESERVED) break;
            y = bulletRow(b.trim(), y); y -= 1; drawn++;
          }
        }
        y -= 3;

      } else {
        // ── TWO PAGE: draw everything, flip to page 2 when needed ─────
        const MAX_B = 7;

        for (const exp of expList) {
          // Check if job header fits on current page; if not, flip
          ensureSpace(secH() + 9 + LH * 2);  // header + at least 2 bullets

          y -= 5;
          y = jobHead(exp.title||'', exp.company||'', exp.dates||'', exp.location||'', y);
          y -= 2;

          const bullets = (exp.bullets||[]).filter(b=>b&&b.trim());
          let drawn = 0;
          for (const b of bullets) {
            if (drawn >= MAX_B) break;
            const bH = wrap(b.trim(), CW-16, false, 10).length * LH + 1;
            // If bullet doesn't fit and we're in two-page mode, flip
            if (y - bH < BOT) {
              if (twoPage && !onPage2) {
                flipPage();
              } else {
                break; // no more space even on page 2
              }
            }
            y = bulletRow(b.trim(), y); y -= 1; drawn++;
          }
        }
        y -= 3;
      }
    }

    // ── SECTIONS AFTER EXPERIENCE (Education, Certs, Achievements, Publications)
    // These always go on whatever page we're currently on.
    // In two-page mode they typically land on page 2 naturally.

    // Ensure expList and counts are accessible for fill (defined in experience block above)
    // If experience block didn't run, use safe defaults
    const _fillList = (typeof expList !== 'undefined') ? expList : (r.experience || []);
    const _fillCounts = (typeof counts !== 'undefined') ? counts : null;

    // DYNAMIC BOTTOM FILL
    // Visual bottom margin — stop filling ~40pts above page bottom (same breathing room as a full page)
    const FILL_STOP = BOT + 35;  // stop 35pts above margin — visual breathing room

    // Filter real content — no placeholder text
    function isRealContent(s) {
      if (!s || typeof s !== 'string') return false;
      const low = s.toLowerCase();
      return s.trim().length > 5 &&
        !low.includes('copy all') && !low.includes('do not rephrase') &&
        !low.includes('omit this field') && !low.includes('n/a');
    }

    const realAchs = (r.achievements||[]).filter(a => isRealContent(typeof a==='string' ? a : (a.title||'')));
    const realPubs = (r.publications||[]).filter(p => isRealContent(typeof p==='string' ? p : (p.title||'')));
    const realProjs = (r.projects||[]).filter(p => isRealContent(p.name||''));

    // Check if a section is JD-relevant using job_dna signals
    const jdTools = JSON.stringify(r.job_dna || {}).toLowerCase();
    const jdDomain = (r.job_dna?.domain || '').toLowerCase();

    function isSectionRelevant(items, label) {
      if (!items.length) return false;
      const content = items.map(a => typeof a==='string' ? a : (a.title||a.name||'')).join(' ').toLowerCase();
      // Check if any JD tool or domain keyword appears in the section content
      const jdKeywords = (jdTools + ' ' + jdDomain).split(/[^a-z0-9]+/).filter(w => w.length > 3);
      const matches = jdKeywords.filter(kw => content.includes(kw));
      return matches.length >= 2; // at least 2 JD keywords must appear
    }

    // Render a section with bullet rows, stopping at FILL_STOP
    function renderFillSection(label, items, getText) {
      if (!items.length) return false;
      const lines = items.map(getText).filter(isRealContent);
      if (!lines.length) return false;
      const minH = secH() + wrap(lines[0], CW-16, false, 10).length * LH + 1;
      if (y - minH < FILL_STOP) return false;
      ops.push('0 Tw');
      y = secHeader(label, y); y -= 2;
      for (const line of lines) {
        const lh = wrap(line, CW-16, false, 10).length * LH + 1;
        if (y - lh < FILL_STOP) break;
        y = bulletRow(line, y); y -= 1;
      }
      y -= 2;
      return true;
    }

    // Add extra bullets from most recent employer to fill remaining space
    function fillWithExtraBullets(empList, drawnCounts) {
      if (!empList || !empList.length) return;
      // Fill remaining space with extra bullets from employers
      // Use bullets beyond those already drawn, most recent employer first
      for (let ei = 0; ei < empList.length; ei++) {
        const exp = empList[ei];
        const allBullets = (exp.bullets||[]).filter(b => b && b.trim());
        // Start from after what was already drawn for this employer
        const drawn = drawnCounts ? (drawnCounts[ei] || 5) : 5;
        const extras = allBullets.slice(drawn);
        for (const b of extras) {
          if (y - FILL_STOP < LH * 2) return;
          const bh = wrap(b.trim(), CW-16, false, 10).length * LH + 1;
          if (y - bh < FILL_STOP) return;
          y = bulletRow(b.trim(), y); y -= 1;
        }
      }
    }

    // DECISION LOGIC:
    // Single-page (1-2 employers): ONLY extra bullets fill space. No project/achievement sections.
    //   Reason: projects would overflow a single page easily.
    // Two-page (3+ employers): JD-relevant sections can appear on page 2 if space allows.
    // Always stop at FILL_STOP to maintain visual breathing room.

    let filledWithSection = false;

    if (twoPage && y - FILL_STOP > secH() + LH * 2) {
      // TWO-PAGE ONLY: show JD-relevant sections
      if (realAchs.length > 0 && isSectionRelevant(realAchs, 'achievements')) {
        filledWithSection = renderFillSection('Achievements', realAchs, a => typeof a === 'string' ? a : (a.title||''));
      }
      if (realPubs.length > 0 && y - FILL_STOP > secH() + LH * 2 && isSectionRelevant(realPubs, 'publications')) {
        renderFillSection('Publications', realPubs, p => typeof p === 'string' ? p : (p.title||''));
        filledWithSection = true;
      }
      if (realProjs.length > 0 && y - FILL_STOP > secH() + LH * 2 && isSectionRelevant(realProjs, 'projects')) {
        renderFillSection('Projects', realProjs, p => p.name || '');
        filledWithSection = true;
      }
    }

    // Fill remaining space with extra employer bullets
    // Single-page: always uses this path (no sections allowed)
    // Two-page: uses this if no relevant sections rendered
    if (!filledWithSection && y - FILL_STOP > LH * 2) {
      fillWithExtraBullets(_fillList, _fillCounts);
    }

    // EDUCATION — always render, never skip
    const eduList = (r.education || []).filter(ed => ed && (ed.degree || ed.school));
    if (eduList.length) {
      // Measure actual height — each edu row may wrap to multiple lines
      const eduActualH = secH() + 3 + eduList.reduce((sum, ed) => {
        let left = toASCII(ed.degree || '');
        if (ed.school) left += ', ' + toASCII(ed.school);
        if (ed.gpa) left += ' | GPA: ' + toASCII(ed.gpa);
        return sum + Math.max(1, wrap(left, CW, false, 10).length) * LH;
      }, 0);
      // On two-page: flip if needed. On single-page: RESERVED already made room.
      if (twoPage) ensureSpace(eduActualH);
      ops.push('0 Tw');
      y = secHeader('Education', y); y -= 2;
      for (const ed of eduList) {
        y = eduRow(ed.degree||'', ed.school||'', ed.gpa||'', ed.dates||ed.date||'', y);
      }
      y -= 3;
    }

    // CERTIFICATIONS — names only, pipe-separated, no bullets
    if (r.certifications && r.certifications.length) {
      const certNames = r.certifications
        .map(c => toASCII(typeof c === 'string' ? c : (c.name || c.title || '')))
        .filter(c => c.trim().length > 0);
      if (certNames.length) {
        const cl = certNames.join('  |  ');
        const h = secH() + blockH(cl, CW) + 3;
        ensureSpace(h);
        if (hasSpace(y, h)) {
          ops.push('0 Tw');
          y = secHeader('Certifications', y); y -= 2;
          y = drawBlock(ML, y, cl, 'R', 10, CW);
          y -= 3;
        }
      }
    }

    return {
      page1: ops1.join('\n'),
      page2: onPage2 ? ops2.join('\n') : null
    };
  }

  // ── Assemble single-page PDF (unchanged from v6) ──────────────────────────
  function assembleSingle(stream) {
    const enc = new TextEncoder();
    const sb  = enc.encode(stream);
    const sl  = sb.length;

    const hdr = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const o1  = '1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\n';
    const o2  = '2 0 obj\n<</Type /Pages /Kids [3 0 R] /Count 1>>\nendobj\n';
    const o3  = `3 0 obj\n<</Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Contents 7 0 R /Resources <</Font <</FR 4 0 R /FB 5 0 R /FI 6 0 R>>>>>>\nendobj\n`;
    const o4  = '4 0 obj\n<</Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding>>\nendobj\n';
    const o5  = '5 0 obj\n<</Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding>>\nendobj\n';
    const o6  = '6 0 obj\n<</Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding>>\nendobj\n';
    const o7h = `7 0 obj\n<</Length ${sl}>>\nstream\n`;
    const o7t = '\nendstream\nendobj\n';

    const parts     = [hdr, o1, o2, o3, o4, o5, o6, o7h];
    const partBytes = parts.map(s => enc.encode(s));
    let off = partBytes[0].length;
    const offsets = [];
    for (let i = 1; i < partBytes.length; i++) {
      offsets.push(off); off += partBytes[i].length;
      if (i === partBytes.length-1) off += sl + enc.encode(o7t).length;
    }
    const xrefOff = off;
    let xref = 'xref\n0 8\n0000000000 65535 f \n';
    for (let i = 0; i < 7; i++) xref += String(offsets[i]).padStart(10,'0')+' 00000 n \n';
    const trailer = `trailer\n<</Size 8 /Root 1 0 R>>\nstartxref\n${xrefOff}\n%%EOF\n`;

    const all   = [...partBytes, sb, enc.encode(o7t), enc.encode(xref), enc.encode(trailer)];
    const total = all.reduce((s,b)=>s+b.length,0);
    const out   = new Uint8Array(total);
    let pos = 0;
    for (const b of all) { out.set(b,pos); pos+=b.length; }
    return out;
  }

  // ── Assemble two-page PDF ─────────────────────────────────────────────────
  // Object layout:
  //  1 = Catalog
  //  2 = Pages  (Count: 2, Kids: [3, 4])
  //  3 = Page 1 → Contents: 9
  //  4 = Page 2 → Contents: 10
  //  5 = Font FR
  //  6 = Font FB
  //  7 = Font FI
  //  8 = (unused placeholder — keeps font refs aligned)
  //  9 = Content stream page 1
  // 10 = Content stream page 2
  function assembleTwo(stream1, stream2) {
    const enc = new TextEncoder();
    const sb1 = enc.encode(stream1);
    const sb2 = enc.encode(stream2);
    const sl1 = sb1.length, sl2 = sb2.length;

    const fontRes = `/Resources <</Font <</FR 5 0 R /FB 6 0 R /FI 7 0 R>>>>`;

    const hdr = '%PDF-1.4\n%\xE2\xE3\xCF\xD3\n';
    const o1  = '1 0 obj\n<</Type /Catalog /Pages 2 0 R>>\nendobj\n';
    const o2  = '2 0 obj\n<</Type /Pages /Kids [3 0 R 4 0 R] /Count 2>>\nendobj\n';
    const o3  = `3 0 obj\n<</Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Contents 9 0 R ${fontRes}>>\nendobj\n`;
    const o4  = `4 0 obj\n<</Type /Page /Parent 2 0 R /MediaBox [0 0 ${PW} ${PH}] /Contents 10 0 R ${fontRes}>>\nendobj\n`;
    const o5  = '5 0 obj\n<</Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding>>\nendobj\n';
    const o6  = '6 0 obj\n<</Type /Font /Subtype /Type1 /BaseFont /Helvetica-Bold /Encoding /WinAnsiEncoding>>\nendobj\n';
    const o7  = '7 0 obj\n<</Type /Font /Subtype /Type1 /BaseFont /Helvetica-Oblique /Encoding /WinAnsiEncoding>>\nendobj\n';
    const o8  = '8 0 obj\n<</Type /Font /Subtype /Type1 /BaseFont /Helvetica>>\nendobj\n'; // padding obj
    const o9h = `9 0 obj\n<</Length ${sl1}>>\nstream\n`;
    const o9t = '\nendstream\nendobj\n';
    const o10h= `10 0 obj\n<</Length ${sl2}>>\nstream\n`;
    const o10t= '\nendstream\nendobj\n';

    const parts = [hdr, o1, o2, o3, o4, o5, o6, o7, o8, o9h];
    const partBytes = parts.map(s => enc.encode(s));

    // Calculate offsets
    let off = partBytes[0].length;
    const offsets = [];  // offsets[i] = byte offset of object i+1
    for (let i = 1; i < partBytes.length; i++) {
      offsets.push(off);
      off += partBytes[i].length;
    }
    // After o9h: stream1 bytes + o9t
    off += sl1 + enc.encode(o9t).length;
    // o10h offset
    const off10h = off;
    off += enc.encode(o10h).length + sl2 + enc.encode(o10t).length;

    const xrefOff = off;
    // 11 objects total (0–10): obj 0 free, objs 1–10
    let xref = 'xref\n0 11\n0000000000 65535 f \n';
    for (let i = 0; i < 9; i++) xref += String(offsets[i]).padStart(10,'0') + ' 00000 n \n';
    xref += String(off10h).padStart(10,'0') + ' 00000 n \n';
    const trailer = `trailer\n<</Size 11 /Root 1 0 R>>\nstartxref\n${xrefOff}\n%%EOF\n`;

    const all = [
      ...partBytes,
      sb1, enc.encode(o9t),
      enc.encode(o10h), sb2, enc.encode(o10t),
      enc.encode(xref), enc.encode(trailer)
    ];
    const total = all.reduce((s,b)=>s+b.length,0);
    const out   = new Uint8Array(total);
    let pos = 0;
    for (const b of all) { out.set(b,pos); pos+=b.length; }
    return out;
  }

  // ── Public: generate ──────────────────────────────────────────────────────
  function generate(d) {
    const { page1, page2 } = buildStreams(d);
    if (page2) {
      return assembleTwo(page1, page2);
    } else {
      return assembleSingle(page1);
    }
  }

  function downloadPDF(resumeData, filename) {
    return new Promise((resolve, reject) => {
      try {
        const bytes = generate(resumeData);
        const safe  = (filename||'Resume').replace(/[^a-zA-Z0-9_\-]/g,'_')+'.pdf';
        const blob  = new Blob([bytes], {type:'application/pdf'});
        const url   = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = safe;
        document.body.appendChild(link);
        link.click();
        link.remove();
        setTimeout(()=>URL.revokeObjectURL(url),5000);
        resolve(safe);
      } catch(e) { reject(e); }
    });
  }

  return { generate, downloadPDF };
})();
