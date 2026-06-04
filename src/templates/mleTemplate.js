function esc(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function safeText(value = '') {
  return String(value ?? '').trim();
}

function renderSkillTable(groups = []) {
  const validGroups = (Array.isArray(groups) ? groups : [])
    .filter(g => g?.title || g?.items?.length);

  return validGroups.map(group => `
    <tr>
      <td class="skill-title-cell">${group.title || ''}</td>
      <td class="skill-items-cell">${(group.items || []).join(', ')}</td>
    </tr>
  `).join('');
}

function safeList(items = []) {
  if (Array.isArray(items)) {
    return items.map((item) => safeText(item)).filter(Boolean);
  }

  if (typeof items === 'string') {
    const value = safeText(items);
    return value ? [value] : [];
  }

  return [];
}

function hasListData(items = []) {
  if (Array.isArray(items)) return items.length > 0;
  if (typeof items === 'string') return items.trim().length > 0;
  return false;
}

function hasSkillGroupData(groups = []) {
  return (Array.isArray(groups) ? groups : []).some(
    (group) => safeText(group?.title) || safeList(group?.items).length
  );
}

function hasWorkHistoryData(rows = []) {
  return (Array.isArray(rows) ? rows : []).some(
    (row) =>
      safeText(row?.company) ||
      safeText(row?.role) ||
      safeText(row?.duration)
  );
}

function hasExperienceData(blocks = []) {
  return (Array.isArray(blocks) ? blocks : []).some(
    (block) =>
      safeText(block?.role) ||
      safeText(block?.duration) ||
      safeList(block?.contributions).length
  );
}

function renderBulletList(items = [], className = '') {
  const safe = safeList(items);
  if (!safe.length) return '';

  const classAttr = className ? ` class="${esc(className)}"` : '';

  return `
    <ul${classAttr}>
      ${safe.map((item) => `<li>${esc(item)}</li>`).join('')}
    </ul>
  `;
}


function renderWorkHistoryRows(rows = [], masked = true) {
  const safe = (Array.isArray(rows) ? rows : [])
    .map((row) => ({
      company: safeText(row?.company),
      role: safeText(row?.role),
      duration: safeText(row?.duration)
    }))
    .filter((row) => row.company || row.role || row.duration);

  if (!safe.length) return '';

  return safe
    .map(
      (row) => `
        <tr>
          <td>${esc(masked ? 'Confidential' : (row.company || 'Confidential'))}</td>
          <td>${esc(row.role || '—')}</td>
          <td>${esc(row.duration || '—')}</td>
        </tr>
      `
    )
    .join('');
}

function renderExperienceBlocks(blocks = [], masked = true) {
  const safe = (Array.isArray(blocks) ? blocks : [])
    .map((block) => ({
      role: safeText(block?.role),
      client: safeText(block?.client),
      duration: safeText(block?.duration),
      contributions: safeList(block?.contributions)
    }))
    .filter((block) => block.role || block.duration || block.contributions.length);

  if (!safe.length) return '';

  return safe
    .map(
      (block) => {
        const parts = [];
        if (block.client && block.role) {
          parts.push(`${esc(block.client)} - ${esc(block.role)}`);
        } else if (block.client) {
          parts.push(esc(block.client));
        } else if (block.role) {
          parts.push(esc(block.role));
        }
        if (block.duration) {
          if (parts.length) {
            parts[parts.length - 1] += ` (${esc(block.duration)})`;
          } else {
            parts.push(esc(block.duration));
          }
        }
        const heading = parts.join(' ');

        return `
        <div class="role-block">
          ${heading ? `<div class="role-title">${heading}</div>` : ''}
          ${block.contributions.length ? renderBulletList(block.contributions, 'compact-list') : ''}
        </div>
      `;
      }
    )
    .join('');
}

function stripInstitutionName(text) {
  const s = String(text ?? '').trim();
  if (!s) return '';
  const dateMatch = s.match(/\(([^)]+)\)\s*$/);
  const dateRange = dateMatch ? `(${dateMatch[1]})` : '';
  const before = dateMatch ? s.slice(0, dateMatch.index).replace(/[,\s]+$/, '') : s;
  const fromMatch = before.match(/^(.*?)\s+from\s+(.*)$/i);
  if (fromMatch) return `${fromMatch[1].trim()} ${dateRange}`.trim();
  const firstComma = before.indexOf(',');
  if (firstComma > 0) return `${before.slice(0, firstComma).trim()} ${dateRange}`.trim();
  const dashMatch = before.match(/^(.*?)\s+[-–—]\s+(.*)$/);
  if (dashMatch) return `${dashMatch[1].trim()} ${dateRange}`.trim();
  return `${before} ${dateRange}`.trim();
}

function resolveName(data = {}, masked = true) {
  const raw = data.candidateName || data.candidateInitials || '';
  if (!raw) return 'Candidate Name';
  const name = safeText(raw);
  if (!name) return 'Candidate Name';
  if (masked) {
    const parts = name.split(/\s+/).filter(Boolean);
    if (!parts.length) return 'C';
    const first = parts[0];
    const lastInit = parts.length > 1 ? parts[parts.length - 1][0].toUpperCase() : '';
    return lastInit ? `${first} ${lastInit}` : first;
  }
  return name;
}

function renderSection(title, content) {
  if (!content || !String(content).trim()) return '';
  return `
    <div class="section">
      <div class="section-title">${esc(title)}</div>
      ${content}
    </div>
  `;
}

export function buildResumeHtml(data = {}) {
  const masked = Boolean(data.maskPersonalDetails);
  const name = resolveName(data, masked);

  const contactParts = [];
  if (!masked) {
    const phone = safeText(data.phone);
    const email = safeText(data.email);
    const linkedin = safeText(data.linkedin);
    const location = safeText(data.location);
    if (phone) contactParts.push(`Phone: ${esc(phone)}`);
    if (email) contactParts.push(`Email: ${esc(email)}`);
    if (linkedin) contactParts.push(`LinkedIn: ${esc(linkedin)}`);
    if (location) contactParts.push(`Location: ${esc(location)}`);
  }
  const contactLine = contactParts.length ? `<div class="contact-line">${contactParts.join('<span class="contact-sep">|</span>')}</div>` : '';

  let technicalOrProjectExperience;
  let experienceSectionTitle;

  if (hasExperienceData(data.technicalExperience)) {
    technicalOrProjectExperience = data.technicalExperience;
    experienceSectionTitle = 'Technical Experience';
  } else if (hasExperienceData(data.projectExperience)) {
    technicalOrProjectExperience = data.projectExperience;
    experienceSectionTitle = 'Project Experience';
  } else {
    technicalOrProjectExperience = [];
    experienceSectionTitle = 'Technical Experience';
  }

  const professionalSummarySection = hasListData(data.professionalSummary)
    ? renderSection(
        'Professional Summary',
        renderBulletList(data.professionalSummary)
      )
    : '';

  const expertiseSection = hasListData(data.expertise)
    ? renderSection('Expertise in', renderBulletList(data.expertise))
    : '';

  const educationSection = hasListData(data.educationalQualification)
    ? renderSection(
        'Educational Qualification',
        renderBulletList(masked ? data.educationalQualification.map(stripInstitutionName) : data.educationalQualification)
      )
    : '';

  const skillsSection = hasSkillGroupData(data.skillGroups)
  ? renderSection('Technical Skills', `
    <table class="skills-table">
      <thead>
        <tr>
          <th>Category</th>
          <th>Skills</th>
        </tr>
      </thead>
      <tbody>
        ${renderSkillTable(data.skillGroups)}
      </tbody>
    </table>
  `)
  : '';

  const workHistorySection = hasWorkHistoryData(data.workHistory)
    ? renderSection(
        'Work History',
        `
          <table>
            <thead>
              <tr>
                <th>Company</th>
                <th>Role</th>
                <th>Duration</th>
              </tr>
            </thead>
            <tbody>
              ${renderWorkHistoryRows(data.workHistory, masked)}
            </tbody>
          </table>
        `
      )
    : '';

  const experienceSection = hasExperienceData(technicalOrProjectExperience)
    ? renderSection(
        experienceSectionTitle,
        renderExperienceBlocks(technicalOrProjectExperience, masked)
      )
    : '';
  const certificationsSection = hasListData(data.certifications)
    ? renderSection(
        'Certifications',
        renderBulletList(data.certifications)
      )
    : '';
  const keyAchievementsSection = hasListData(data.keyAchievements)
    ? renderSection(
        'Key Achievements',
        renderBulletList(data.keyAchievements)
      )
    : '';

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>MLE Resume</title>
<style>
  @page {
    size: A4;
  }

  * {
    box-sizing: border-box;
  }

  html,
  body {
    margin: 0;
    padding: 0;
    background: #ffffff;
    color: #111111;
    font-family: Calibri, Arial, Helvetica, sans-serif;
  }

  body {
    position: relative;
    z-index: 1;
    -webkit-print-color-adjust: exact;
    print-color-adjust: exact;
    overflow-x: hidden;
  }

  .page {
    position: relative;
    width: 100%;
    margin: 0;
    padding: 0;
  }

  .content {
    position: relative;
    z-index: 2;
    margin: 0;
    padding: 0mm 14mm 0 14mm;
  }
  

  h1 {
    margin: 0;
    padding: 0;
  }


  .watermark {
    position: fixed;
    top: 50%;
    left: 50%;
    width: 130mm;
    height: 130mm;
    transform: translate(-50%, -50%);
    background-image: url("__WATERMARK__");
    background-repeat: no-repeat;
    background-position: center;
    background-size: contain;
    opacity: 0.2;

    z-index: 0;
    pointer-events: none;
  }

  .name {
    margin: 0;
    padding: 0;
    font-size: 24px;
    line-height: 1.1;
    font-weight: 700;
    letter-spacing: 0.2px;
    color: #001f5f;
    text-transform: uppercase;
  }

  .contact-line {
    margin: 4px 0 8px 0;
    font-size: 9.5px;
    line-height: 1.4;
    color: #4a5a6a;
  }

  .contact-sep {
    margin: 0 6px;
    color: #b0c0d0;
  }

  .section {
    margin-top: 10px;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .section:first-child {
    margin-top: 8px;
  }

  .section-title {
    margin: 0 0 5px 0;
    color: #001f5f;
    font-size: 14px;
    line-height: 1.2;
    font-weight: 700;
  }

  p,
  li,
  td,
  th,
  .skill-row,
  .role-title,
  .role-duration {
    font-size: 11px;
    line-height: 1.35;
  }

  ul {
    margin: 0;
    padding-left: 18px;
  }

  li {
    margin: 0 0 3px 0;
  }

  .compact-list li {
    margin-bottom: 2px;
  }

  .skills-wrap {
    margin-top: 1px;
  }

  .skill-row {
    margin-bottom: 3px;
  }


  .skill-sep {
    font-weight: 700;
    margin: 0 4px 0 2px;
  }

  table {
    width: 100%;
    border-collapse: collapse;
    table-layout: fixed;
    margin-top: 4px;
  }

  thead {
    display: table-header-group;
  }

 .skills-table {
  width: 100%;
  border-collapse: collapse;
  margin-top: 4mm;
  font-size: 10px;
}

.skills-table tr:nth-child(even) {
  background: #f7f9fb;
}

.skill-title {
  width: 28%;
  font-weight: 700;
  padding: 2mm;
  background: #eef4f8;
}

.skills-table {
  table-layout: fixed;
  width: 100%;
}

.skill-title-cell {
  width: 30%;
  font-weight: 700;
  text-align: left;
  padding: 6px;
}

.skill-items-cell {
  width: 70%;
  text-align: left;
  padding: 6px;
  word-break: break-word;
}

  tr {
    break-inside: avoid;
    page-break-inside: avoid;
  }

  thead th {
    background: #1f587f;
    color: #ffffff;
    border: 1px solid #8ea9bf;
    padding: 6px 7px;
    text-align: center;
    font-weight: 700;
  }

  tbody td {
    border: 1px solid #b8cadb;
    padding: 6px 7px;
    text-align: center;
    vertical-align: middle;
  }

  tbody tr:nth-child(even) td {
    background: #edf4fa;
  }

  .role-block {
    margin-top: 8px;
    break-inside: avoid;
    page-break-inside: avoid;
  }

  .role-block:first-child {
    margin-top: 0;
  }

  .role-title {
    font-weight: 700;
    color: #111111;
    margin-bottom: 2px;
  }

  .role-duration {
    font-weight: 700;
    margin-bottom: 4px;
  }

 
}
</style>
</head>
<body>
  <div class="watermark" aria-hidden="true"></div>
  <div class="hero-glow" aria-hidden="true"></div>

  <div class="page">
    <div class="content">
      <h1 class="name">${esc(name)}</h1>
      ${contactLine}

      ${professionalSummarySection}
      ${expertiseSection}
      ${educationSection}
      ${skillsSection}
      ${workHistorySection}
      ${experienceSection}
      ${certificationsSection}
      ${keyAchievementsSection}

    </div>
  </div>
</body>
</html>`;
}