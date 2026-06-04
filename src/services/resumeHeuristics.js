function splitLines(text = '') {
  return String(text)
    .split(/\n+/)
    .map((line) => line.trim())
    .filter(Boolean);
}

function initialsFromName(name = '') {
  return String(name)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() || '')
    .slice(0, 3)
    .join('');
}

function findContact(lines = []) {
  const joined = lines.join(' | ');
  const email = joined.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i)?.[0] || '';
  const phone = joined.match(/(?:\+?\d[\d\s()-]{8,}\d)/)?.[0] || '';
  const linkedin = joined.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s|]+/i)?.[0] || '';
  return { email, phone, linkedin };
}

function stripBullet(line = '') {
  return String(line).replace(/^[-•*:\s]+/, '').trim();
}

function listFromSection(section = '') {
  return String(section)
    .split(/\n|•/)
    .map(stripBullet)
    .filter(Boolean);
}

function normalizeHeading(heading = '') {
  return heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function extractSection(text = '', headings = []) {
  const pattern = new RegExp(
    `(?:^|\\n)(?:${headings.map(normalizeHeading).join('|')})\\s*:?\\s*([\\s\\S]*?)(?=\\n[A-Z][A-Za-z &/()\\-]{2,}:?\\s*(?:\\n|$)|$)`,
    'i'
  );
  return text.match(pattern)?.[1]?.trim() || '';
}

function inferSkillGroups(text = '') {
  const lines = splitLines(extractSection(text, ['Technical Skills', 'Skills', 'Core Skills', 'Technical Expertise']));
  const groups = [];
  let current = null;

  for (const raw of lines) {
    const line = raw.replace(/^[-•]\s*/, '').trim();
    const colonIndex = line.indexOf(':');

    if (colonIndex > 0) {
      const title = line.slice(0, colonIndex).trim();
      const rest = line.slice(colonIndex + 1).trim();
      current = {
        title,
        items: rest ? rest.split(',').map((item) => item.trim()).filter(Boolean) : []
      };
      groups.push(current);
      continue;
    }

    if (current) {
      current.items.push(line);
    }
  }

  return groups.length
    ? groups
    : [
        { title: 'Technical Skills', items: lines.map(stripBullet).filter(Boolean).slice(0, 20) }
      ];
}

function inferWorkHistory(text = '') {
  const lines = splitLines(extractSection(text, ['Work History', 'Work Experience', 'Professional Experience', 'Experience']));
  const rows = [];

  for (const line of lines) {
    const durationMatch = line.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}\s*(?:to|-|–)\s*(?:Present|Current|(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Sept|Oct|Nov|Dec)[a-z]*\s+\d{4}))/i);
    if (!durationMatch) continue;

    const duration = durationMatch[1].replace(/\s+/g, ' ').trim();
    const lead = line.replace(durationMatch[0], '').replace(/[|–-]+$/g, '').trim();
    const parts = lead.split(/\s{2,}|\s+\|\s+|\s+—\s+|\s+–\s+/).map((item) => item.trim()).filter(Boolean);
    const role = parts[parts.length - 1] || lead || '';
    rows.push({ company: 'Confidential', role, duration });
    if (rows.length >= 8) break;
  }

  return rows;
}

function inferTechnicalExperience(text = '') {
  const roleBlocks = text.split(/(?:^|\n)Role\s*:/i).slice(1);
  const blocks = roleBlocks.map((block) => {
    const lines = splitLines(block);
    const role = lines[0] || '';
    const durationMatch = block.match(/Duration\s*[-:]?\s*([^\n]+)/i);
    const keyContributionSection = extractSection(block, ['Key Contributions', 'Roles & Responsibilities', 'Responsibilities', 'Key Responsibility', 'Key Achievements']);
    const contributions = listFromSection(keyContributionSection || block)
      .filter((item) => item.length > 2)
      .slice(0, 12);

    return {
      role,
      duration: durationMatch?.[1]?.trim() || '',
      contributions
    };
  }).filter((item) => item.role || item.duration || item.contributions.length);

  if (blocks.length) return blocks.slice(0, 8);

  const workRows = inferWorkHistory(text);
  return workRows.slice(0, 4).map((row) => ({
    role: row.role,
    duration: row.duration,
    contributions: []
  }));
}

export function heuristicParseResume(text = '') {
  const lines = splitLines(text);
  const candidateName = lines[0] || '';
  const secondLine = lines[1] || '';
  const { email, phone, linkedin } = findContact(lines.slice(0, 10));

  const professionalSummary = listFromSection(extractSection(text, ['Professional Summary', 'Summary', 'Profile Summary', 'Career Summary'])).slice(0, 8);
  const expertise = listFromSection(extractSection(text, ['Expertise in', 'Core Expertise', 'Highlights', 'Areas of Expertise'])).slice(0, 12);
  const educationalQualification = listFromSection(extractSection(text, ['Educational Qualification', 'Education', 'Academic Qualification'])).slice(0, 6);
  const certifications = listFromSection(extractSection(text, ['Certifications', 'Certification'])).slice(0, 10);

  return {
    candidateName,
    candidateInitials: initialsFromName(candidateName),
    title: secondLine && !/@/.test(secondLine) ? secondLine : '',
    phone,
    email,
    location: '',
    linkedin,
    professionalSummary,
    expertise,
    educationalQualification,
    skillGroups: inferSkillGroups(text),
    workHistory: inferWorkHistory(text),
    technicalExperience: inferTechnicalExperience(text),
    certifications,
    additionalSections: [],
    confidentialLabel: 'Confidential',
    maskPersonalDetails: true
  };
}
