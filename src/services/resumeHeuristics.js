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
    .join('');
}

function stripBullet(line = '') {
  return String(line).replace(/^[-•*:\s]+/, '').trim();
}

function listFromSection(section = '') {
  const raw = String(section);
  const lines = raw.split('\n');
  const items = [];
  let current = null;

  for (const rawLine of lines) {
    const trimmed = rawLine.trim();
    if (!trimmed) {
      if (current !== null) {
        items.push(current);
        current = null;
      }
      continue;
    }

    const isBullet = /^[•\-\*]\s/.test(trimmed);

    if (isBullet) {
      if (current !== null) items.push(current);
      current = trimmed.replace(/^[•\-*]\s+/, '').trim();
    } else if (current !== null) {
      current += ' ' + trimmed;
    } else {
      current = trimmed;
    }
  }
  if (current !== null) items.push(current);

  return items;
}

function normalizeHeading(heading = '') {
  return heading.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

const KNOWN_SECTION_HEADINGS = [
  'Professional Summary', 'Summary', 'Profile Summary', 'Career Summary',
  'Career Objective', 'Objective', 'Profile',
  'Technical Skills', 'Skills', 'Core Skills', 'Technical Expertise', 'Technical Profile',
  'Technology & Others', 'Technology & Expertise', 'Tools & Technology',
  'Work History', 'Work Experience', 'Professional Experience', 'Experience',
  'Employers & Clients', 'Employers', 'Clients',
  'Educational Qualification', 'Education Qualification', 'Education', 'Academic Qualification',
  'Certifications', 'Certification',
  'Expertise in', 'Core Expertise', 'Highlights', 'Areas of Expertise',
  'Knowledgeable Domains', 'Domains', 'Industry Domains',
  'Other Skills', 'Additional Skills', 'Other Expertise',
  'Roles and Responsibilities', 'Key Responsibilities', 'Role & Responsibilities',
  'Contact', 'Personal Details', 'Technical Summary', 'Key Skills', 'Tools', 'Tools & Platforms',
  'Projects', 'Project Details', 'Key Projects', 'Project Experience',
  'Achievements', 'Awards', 'Accomplishments', 'Key Achievements',
  'Languages', 'Languages Known', 'Interests', 'Hobbies', 'Strengths',
  'References', 'Declaration',
  'Total Experience', 'Experience Summary',
  'Current Company', 'Current Designation', 'Notice Period',
  'Date of Birth', 'Nationality', 'Visa Status',
];

const SECTION_HEADING_SRC = '(?:^|\\n)(?:' +
  [...KNOWN_SECTION_HEADINGS]
    .sort((a, b) => b.length - a.length)
    .map(normalizeHeading)
    .join('|') +
  ')';

const SECTION_HEADING_RE = new RegExp(SECTION_HEADING_SRC, 'i');

function splitIntoSections(text = '') {
  const sections = [];
  const lines = String(text).split('\n');
  let currentHeading = '';
  let currentContent = [];

  const pushSection = () => {
    const rawContent = currentContent.join('\n').trim();
    if (currentHeading || rawContent) {
      sections.push({
        heading: currentHeading,
        rawContent,
        lines: splitLines(rawContent),
        text: currentContent.join('\n'),
      });
    }
  };

  for (const line of lines) {
    const trimmed = line.trim();
    const match = trimmed.match(SECTION_HEADING_RE);
    if (match) {
      const matchedText = match[0].trim();
      if (matchedText === trimmed || trimmed.startsWith(matchedText + ':')) {
        pushSection();
        currentHeading = matchedText;
        const afterHeading = trimmed.slice(matchedText.length).replace(/^:\s*/, '').trim();
        currentContent = afterHeading ? [afterHeading] : [];
        continue;
      }
    }

    currentContent.push(line);
  }
  pushSection();

  return sections.filter((s) => s.heading || s.lines.length);
}

function extractWorkLines(lines = []) {
  const rows = [];

  const datePatterns = [
    /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}\s*(?:to|-|–)\s*(?:(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|Present|Current|Till\s*Date|Ongoing))/i,
    /((?:[0-1]?\d\/\d{4})\s*(?:to|-|–)\s*(?:[0-1]?\d\/\d{4}|Present|Current))/i,
    /((?:[A-Z][a-z]{2}-\d{4})\s*(?:to|-|–)\s*(?:[A-Z][a-z]{2}-\d{4}|Till\s*Date))/i,
    /(\d{4}\s*(?:to|-|–)\s*\d{4})/,
    /((?:from\s+)?(?:[A-Z][a-z]{2}[a-z]*\s+)?\d{4}\s*(?:to|-|–)\s*(?:Present|Current|Till\s*Date))/i,
  ];

  const locationRe = /\s*\(?\s*(?:US|USA|UK|India|Remote|Hybrid|Onsite|Offshore|San Francisco|New York|Austin|Seattle|Boston|Chicago|Dallas|Houston|Denver|Atlanta|Miami|Portland|Phoenix|Philadelphia|Los Angeles|Washington DC|Silicon Valley|Bay Area|CA|NY|TX|WA|MA|IL|GA|CO|FL|OR|AZ|PA|DC)\s*\)?\s*$/i;

  for (const line of lines) {
    let processed = line.replace(/^[-•*]\s*/, '').trim();

    let duration = '';
    let remaining = processed;

    for (const dp of datePatterns) {
      const m = remaining.match(dp);
      if (m) {
        duration = m[1].replace(/\s+/g, ' ').trim();
        remaining = remaining.replace(m[0], '').trim();
        break;
      }
    }

    if (!duration) continue;

    remaining = remaining.replace(locationRe, '').trim();
    remaining = remaining.replace(/\s*[-–]\s*$/g, '').trim();

    let parts = remaining.split(/\s{3,}|\s+\|\s+/).map((s) => s.trim()).filter(Boolean);
    if (parts.length <= 1) {
      parts = remaining.split(/\s{2,}/).map((s) => s.trim()).filter(Boolean);
    }

    let company = '';
    let role = '';

    if (parts.length >= 3) {
      company = parts[0];
      const lastPart = parts[parts.length - 1];
      const hasLocation = locationRe.test(lastPart);
      if (hasLocation) {
        role = parts.slice(1, -1).join(' | ');
      } else {
        role = parts[parts.length - 1];
      }
    } else if (parts.length === 2) {
      company = parts[0];
      role = parts[1];
    } else if (parts.length === 1) {
      const hyphenSplit = parts[0].split(/\s+[-–]\s+/).map((s) => s.trim()).filter(Boolean);
      if (hyphenSplit.length >= 2) {
        company = hyphenSplit[0];
        role = hyphenSplit[hyphenSplit.length - 1];
      } else {
        company = parts[0];
        role = '';
      }
    }

    rows.push({
      company: company || 'Confidential',
      role: role || '—',
      duration,
    });

    if (rows.length >= 10) break;
  }

  return rows;
}

function extractNaukriWorkLines(lines = []) {
  const rows = [];
  const text = lines.join('\n');
  const blocks = text.split(/(?:^|\n)Previous\s+Employer\s*[:.]?\s*/i);
  const currentMatch = text.match(/(?:^|\n)Current\s+Employer\s*[:.]?\s*/i);
  const allBlocks = [];

  if (currentMatch) {
    const idx = currentMatch.index + currentMatch[0].length;
    const firstBlock = text.slice(idx).split(/(?:^|\n)Previous\s+Employer\s*[:.]?\s*/i)[0];
    allBlocks.push({ employer: firstBlock.split('\n')[0]?.trim() || '', rest: firstBlock.split('\n').slice(1).join('\n') });
  }

  for (const block of blocks) {
    const lines = block.trim().split('\n');
    const company = lines[0]?.replace(/[,.\s]+$/, '').trim() || '';
    const rest = lines.slice(1).join('\n');
    allBlocks.push({ employer: company, rest });
  }

  for (const block of allBlocks) {
    if (!block.employer && !block.rest) continue;
    const restLines = block.rest.split('\n').map(l => l.trim()).filter(Boolean);

    let duration = '';
    let role = '';

    for (const line of restLines) {
      if (/^Duration\s*[:.]?\s*/i.test(line)) {
        duration = line.replace(/^Duration\s*[:.]?\s*/i, '').trim();
      } else if (/^Designation\s*[:.]?\s*/i.test(line)) {
        role = line.replace(/^Designation\s*[:.]?\s*/i, '').trim();
      }
    }

    if (block.employer || duration) {
      rows.push({
        company: block.employer || 'Confidential',
        role: role || '—',
        duration: duration || '',
      });
    }
  }

  return rows.slice(0, 10);
}

function parseColonSkillGroups(lines = []) {
  const groups = [];
  let current = null;

  for (const raw of lines) {
    const isBullet = raw.trim().startsWith('-') || raw.trim().startsWith('•') || raw.trim().startsWith('*');
    const line = isBullet ? raw.replace(/^[-•*]\s*/, '').trim() : raw.trim();
    if (!line) continue;

    const colonIndex = line.indexOf(':');

    if (colonIndex > 0 && colonIndex < 60) {
      const title = line.slice(0, colonIndex).trim();
      const rest = line.slice(colonIndex + 1).trim();
      if (title && !title.match(/^(http|www)/i)) {
        current = {
          title,
          items: rest ? rest.split(',').map((item) => item.trim()).filter(Boolean) : [],
        };
        groups.push(current);
        continue;
      }
    }

    if (!isBullet) {
      current = { title: line, items: [] };
      groups.push(current);
    } else if (current) {
      current.items.push(line);
    }
  }

  return groups;
}

function experienceBlockLabelValue(text = '') {
  const blocks = [];
  const roleBlocks = text.split(/(?:^|\n)(?:Role|Project|Project Name|Project No)\s*[:.]?\s*/i).slice(1);

  for (const block of roleBlocks) {
    const lines = splitLines(block);
    if (!lines.length) continue;

    const role = lines[0];
    let duration = '';
    let client = '';
    let employer = '';
    const contributions = [];
    const technologies = [];

    for (let i = 1; i < lines.length; i++) {
      const line = lines[i];
      const lower = line.toLowerCase();

      if (!duration && /^duration\s*[:.]?\s*/i.test(line)) {
        duration = line.replace(/^duration\s*[:.]?\s*/i, '').trim();
        continue;
      }

      if (!client && /^client\s*(name)?\s*[:.]?\s*/i.test(line)) {
        client = line.replace(/^client\s*(name)?\s*[:.]?\s*/i, '').trim();
        continue;
      }

      if (!employer && /^employer\s*[:.]?\s*/i.test(line)) {
        employer = line.replace(/^employer\s*[:.]?\s*/i, '').trim();
        continue;
      }

      if (/^(key\s+)?contributions?\s*[:.]?\s*|responsibilities?\s*[:.]?\s*|key\s+responsibilities?\s*[:.]?\s*/i.test(line)) {
        continue;
      }

      if (/^(technolog|tools|environment|tech\s*stack)\s*[:.]?\s*/i.test(line)) {
        technologies.push(line.replace(/^(technolog|tools|environment|tech\s*stack)\s*[:.]?\s*/i, '').trim());
        continue;
      }

      contributions.push(line);
    }

    if (role || duration || contributions.length) {
      blocks.push({ role, duration, client, employer, contributions, technologies });
    }
  }

  return blocks;
}

function experienceBlockAsBullets(text = '') {
  const sections = [];
  const lines = splitLines(text);
  let current = null;

  for (const line of lines) {
    const hasDuration = /((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|(?:[A-Z][a-z]{2}-\d{4})|\d{2}\/\d{4}|\b\d{4}\b)\s*(?:to|-|–)\s*/i.test(line);

    if (hasDuration && line.length < 120) {
      if (current) sections.push(current);

      const dp = line.match(/((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|(?:[A-Z][a-z]{2}-\d{4})|\d{2}\/\d{4}|\b\d{4}\b)\s*(?:to|-|–)\s*((?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)[a-z]*\s+\d{4}|(?:[A-Z][a-z]{2}-\d{4})|\d{2}\/\d{4}|\b\d{4}\b|Present|Current|Till\s*Date)/i);
      const duration = dp ? dp[0].replace(/\s+/g, ' ').trim() : '';
      const lead = dp ? line.replace(dp[0], '').replace(/[|–-]+$/g, '').trim() : line;

      const pipeParts = lead.split(/\s{2,}|\s+\|\s+/).map((s) => s.trim()).filter(Boolean);
      const firstPipe = pipeParts[0] || '';
      const lastPipe = pipeParts[pipeParts.length - 1] || firstPipe;

      current = { role: lastPipe || firstPipe, client: firstPipe !== lastPipe ? firstPipe : '', duration, contributions: [] };
      continue;
    }

    if (current) {
      current.contributions.push(stripBullet(line));
    }
  }

  if (current) sections.push(current);
  return sections.slice(0, 10);
}

const SECTION_CLASSIFIERS = {
  skill: ['Technical Skills', 'Skills', 'Core Skills', 'Technical Expertise', 'Technical Profile', 'Key Skills', 'Technical Summary'],
  work: ['Work History', 'Work Experience', 'Professional Experience', 'Experience', 'Employers & Clients', 'Employers', 'Clients'],
  education: ['Educational Qualification', 'Education', 'Academic Qualification'],
  certifications: ['Certifications', 'Certification'],
  achievements: ['Achievements', 'Awards', 'Accomplishments', 'Key Achievements'],
  expertise: ['Expertise in', 'Core Expertise', 'Highlights', 'Areas of Expertise'],
  summary: ['Professional Summary', 'Summary', 'Profile Summary', 'Career Summary', 'Career Objective', 'Objective', 'Profile'],
  tools: ['Tools', 'Tools & Platforms'],
  languages: ['Languages', 'Languages Known'],
  domains: ['Knowledgeable Domains', 'Domains', 'Industry Domains'],
  projects: ['Projects', 'Project Details', 'Key Projects', 'Project Experience'],
  other: ['Other Skills', 'Additional Skills', 'Other Expertise'],
  roles: ['Roles and Responsibilities', 'Key Responsibilities', 'Role & Responsibilities'],
};

function classifyHeading(heading = '') {
  const h = heading.trim();
  for (const [cls, patterns] of Object.entries(SECTION_CLASSIFIERS)) {
    for (const p of patterns) {
      if (h.toLowerCase() === p.toLowerCase()) return cls;
    }
  }

  const lower = h.toLowerCase();
  if (/achievement|award|accomplish/i.test(lower)) return 'achievements';
  if (/educat|qualification|academic/i.test(lower)) return 'education';
  if (/skill|technical|expertise|proficien/i.test(lower)) return 'skill';
  if (/experience|work|employ|client|career/i.test(lower)) return 'work';
  if (/certif|license|licence/i.test(lower)) return 'certifications';
  if (/project|assignment|engagement/i.test(lower)) return 'projects';
  if (/tool|platform|technolog/i.test(lower)) return 'tools';
  if (/language/i.test(lower)) return 'languages';
  if (/domain|industry/i.test(lower)) return 'domains';
  if (/summar|profile|objective/i.test(lower)) return 'summary';
  if (/expertise|highlights|core/i.test(lower)) return 'expertise';
  if (/responsibilit/i.test(lower)) return 'roles';
  if (/declaration|reference|interest|hobby|contact/i.test(lower)) return 'ignore';

  return 'other';
}

export function heuristicParseResume(text = '') {
  const rawText = String(text ?? '');
  const sections = splitIntoSections(rawText);
  const allLines = splitLines(rawText);

  let candidateName = allLines[0] || '';
  for (const line of allLines.slice(0, 5)) {
    if (/^[\d+\s()-]{5,}$/.test(line) || /@/.test(line) || /linkedin|contact|phone|email/i.test(line)) continue;
    if (!/[A-Z][a-z]{2,}/.test(line) && !/^[A-Z][A-Z\s]{2,}$/.test(line)) continue;
    if (line.length > 50) continue;
    candidateName = line;
    break;
  }
  const titleLine = allLines[1] || '';

  let email = '';
  let phone = '';
  let linkedin = '';
  let location = '';
  const allJoined = allLines.join(' | ');

  const emailMatch = allJoined.match(/[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/i);
  if (emailMatch) email = emailMatch[0];

  const phoneMatch = allJoined.match(/(?:\+?\d[\d\s()-]{8,}\d)/);
  if (phoneMatch) phone = phoneMatch[0];

  const linkedinMatch = allJoined.match(/(?:https?:\/\/)?(?:www\.)?linkedin\.com\/[^\s|]+/i);
  if (linkedinMatch) linkedin = linkedinMatch[0];

  for (const line of allLines.slice(0, 15)) {
    if (/location|address|city|based\s+in/i.test(line) && /[A-Z][a-z]+/.test(line)) {
      const parts = line.replace(/^(location|address)\s*[:.]?\s*/i, '').trim();
      if (parts && !/@/.test(parts) && !/\d{6,}/.test(parts)) {
        location = parts;
        break;
      }
    }
  }

  const professionalSummary = [];
  const expertise = [];
  const educationalQualification = [];
  const skillGroups = [];
  const workHistory = [];
  let technicalExperience = [];
  const certifications = [];
  const keyAchievements = [];
  const toolsAndPlatforms = [];
  const languagesKnown = [];
  const domainExperience = [];
  const additionalSections = [];
  const otherSections = [];
  let totalExperience = '';

  for (const section of sections) {
    const cls = classifyHeading(section.heading);

    switch (cls) {
      case 'summary':
        professionalSummary.push(...listFromSection(section.rawContent).slice(0, 12));
        break;

      case 'expertise':
        expertise.push(...listFromSection(section.rawContent).slice(0, 15));
        break;

      case 'skill':
      {
        const parsed = parseColonSkillGroups(section.lines);
        if (parsed.length) {
          if (parsed.length > 15) {
            const allItems = parsed.flatMap(g => g.items);
            const flatTitle = parsed[0]?.title || 'Technical Skills';
            skillGroups.push({ title: flatTitle, items: allItems.slice(0, 30) });
          } else {
            skillGroups.push(...parsed);
          }
        } else {
          skillGroups.push({
            title: 'Technical Skills',
            items: listFromSection(section.rawContent).slice(0, 20),
          });
        }
        break;
      }

      case 'work':
      {
        if (!totalExperience) {
          const firstLines = section.lines.slice(0, 3).join(' ');
          const expMatch = firstLines.match(/((?:Work Experience|Total Experience|Experience)\s*[:.]?\s*)?(\d{1,2}\.?\d*\+?\s*(?:years?|yrs?|y)(?:\s+of)?\s+experience)/i)
            || firstLines.match(/(\d{1,2}\.?\d*\+?\s*(?:Years?|Yrs?|Y))/);
          if (expMatch && expMatch[1]) totalExperience = expMatch[1].trim();
          else if (expMatch && expMatch[2]) totalExperience = expMatch[2].trim();
          if (totalExperience && !/experience\s*$/i.test(totalExperience)) {
            totalExperience += ' of experience';
          }
        }
        const parsed = extractWorkLines(section.lines);
        if (parsed.length) {
          workHistory.push(...parsed);
        } else if (/Current\s+Employer|Previous\s+Employer/i.test(section.rawContent)) {
          const naukriParsed = extractNaukriWorkLines(section.lines);
          workHistory.push(...naukriParsed);
        }
        break;
      }

      case 'education':
        educationalQualification.push(...listFromSection(section.rawContent).slice(0, 8));
        break;

      case 'certifications':
        certifications.push(...listFromSection(section.rawContent).slice(0, 15));
        break;

      case 'achievements':
        keyAchievements.push(...listFromSection(section.rawContent).slice(0, 15));
        break;

      case 'projects':
      {
        const labelValue = experienceBlockLabelValue(section.text);
        if (labelValue.length) {
          technicalExperience.push(...labelValue);
        } else {
          const bullet = experienceBlockAsBullets(section.text);
          if (bullet.length) {
            technicalExperience.push(...bullet);
          } else {
            technicalExperience.push({
              role: section.heading,
              duration: '',
              contributions: listFromSection(section.rawContent).slice(0, 15),
            });
          }
        }
        break;
      }

      case 'tools':
        toolsAndPlatforms.push(...listFromSection(section.rawContent).slice(0, 15));
        break;

      case 'other':
        if (/skill/i.test(section.heading) && !skillGroups.length) {
          skillGroups.push({
            title: section.heading,
            items: listFromSection(section.rawContent).flatMap((item) => item.split(',').map((s) => s.trim())).filter(Boolean).slice(0, 20),
          });
        } else {
          otherSections.push(section);
        }
        break;

      case 'languages':
        languagesKnown.push(...listFromSection(section.rawContent).flatMap((item) => item.split(',').map((s) => s.trim())).filter(Boolean).slice(0, 10));
        break;

      case 'domains':
        domainExperience.push(...listFromSection(section.rawContent).flatMap((item) => item.split(',').map((s) => s.trim())).filter(Boolean).slice(0, 10));
        break;

      case 'ignore':
        break;

      default:
        otherSections.push(section);
        break;
    }
  }

  for (const section of otherSections) {
    if (!section.heading) continue;
    const items = listFromSection(section.rawContent).slice(0, 15);
    if (items.length) {
      additionalSections.push({ title: section.heading || 'Additional Information', items });
    }
  }

  if (!workHistory.length || workHistory.length === 1) {
    for (const sec of [...sections, ...otherSections]) {
      if (/previous\s+employer|current\s+employer/i.test(sec.rawContent)) {
        const extra = extractNaukriWorkLines(sec.lines);
        if (extra.length) {
          for (const e of extra) {
            if (!workHistory.some(w => w.company === e.company && w.duration === e.duration)) {
              workHistory.push(e);
            }
          }
        }
      }
    }
  }

  if (!workHistory.length) {
    const fallbackWH = extractWorkLines(allLines);
    workHistory.push(...fallbackWH);
  }

  if (!skillGroups.length) {
    const filtered = allLines.filter(l => !/^(client|project|duration|designation|employer|role|key|current|previous|notice|duties|responsibilit)/i.test(l));
    const fallback = parseColonSkillGroups(filtered);
    if (fallback.length) {
      if (fallback.length > 15) {
        const allItems = fallback.flatMap(g => g.items).slice(0, 30);
        skillGroups.push({ title: 'Technical Skills', items: allItems });
      } else {
        skillGroups.push(...fallback);
      }
    }
  }

  if (!technicalExperience.length && workHistory.length) {
    technicalExperience = workHistory.slice(0, 6).map((w) => ({
      role: w.role,
      client: '',
      duration: w.duration,
      contributions: [],
    }));
  }

  let title = '';
  let currentCompany = '';
  let currentDesignation = '';

  const skipTitleRe = /^(linkedin|contact|phone|email|@|[0-9+\s()-]{5,})/i;
  for (const line of allLines.slice(1, 6)) {
    if (!line || skipTitleRe.test(line)) continue;
    if (/@/.test(line) || /linkedin/i.test(line) || /personal details/i.test(line) || /^[\d+\s()-]{5,}$/.test(line)) continue;
    if (line.length > 70 || /^\d/.test(line)) continue;
    if (candidateName && line.toLowerCase() === candidateName.toLowerCase()) continue;
    const lower = line.toLowerCase();
    if (KNOWN_SECTION_HEADINGS.some(h => h.toLowerCase() === lower || lower.startsWith(h.toLowerCase() + ':') || lower.startsWith(h.toLowerCase()))) continue;
    title = line;
    break;
  }

  if (workHistory.length) {
    currentCompany = workHistory[0].company || '';
    currentDesignation = workHistory[0].role || '';
    if (!title) title = currentDesignation;
  }

  if (!totalExperience) {
    const expMatch = allJoined.match(/(\d{1,2}\.?\d*\+?\s*(?:years?|yrs?|y)(?:\s+of)?\s+experience)/i);
    if (expMatch) totalExperience = expMatch[1].trim();
  }

  return {
    candidateName: { fullName: candidateName },
    email,
    phoneNumber: phone ? [phone] : [],
    websites: linkedin ? [{ type: 'linkedin', url: linkedin }] : [],
    location: location ? { formatted: location, rawInput: location } : null,
    summary: professionalSummary.join(' '),
    objective: '',
    achievements: keyAchievements,
    workExperience: workHistory.map(w => ({
      jobTitle: w.role,
      organization: w.company,
      dateRange: w.duration,
      contributions: [],
    })),
    education: educationalQualification.map(e => ({ accreditation: e })),
    skills: (skillGroups || []).flatMap(g => g.items || []),
    languages: languagesKnown.map(l => ({ name: l, proficiency: null })),
    certifications,
    projects: technicalExperience.map(p => ({
      title: p.role || '',
      description: p.contributions?.join('\n') || '',
      dateRange: p.duration || '',
      technologies: p.technologies || [],
      highlights: p.contributions || [],
    })),
    totalYearsExperience: totalExperience || null,
    hobbies: [],
    associations: [],
    publications: [],
    patents: [],
    referees: [],
    dateOfBirth: null,
    nationality: null,
    rawText,
  };
}
