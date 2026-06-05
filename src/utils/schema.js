function cleanText(value = '') {
  return String(value ?? '').replace(/\s+/g, ' ').trim();
}

function cleanList(items = []) {
  if (Array.isArray(items)) {
    return items.map((item) => cleanText(item)).filter(Boolean);
  }

  if (typeof items === 'string') {
    const value = cleanText(items);
    return value ? [value] : [];
  }

  return [];
}

function uniqueList(items = []) {
  const seen = new Set();
  const result = [];

  for (const item of cleanList(items)) {
    const key = item.toLowerCase();
    if (!seen.has(key)) {
      seen.add(key);
      result.push(item);
    }
  }

  return result;
}

function cleanSkillGroups(groups = []) {
  if (!Array.isArray(groups)) return [];

  return groups
    .map((group) => {
      if (group && typeof group === 'object' && !Array.isArray(group)) {
        return {
          title: cleanText(
            group?.title ||
              group?.name ||
              group?.category ||
              group?.heading
          ),
          items: uniqueList(
            group?.items ||
              group?.skills ||
              group?.values ||
              group?.list
          )
        };
      }

      return {
        title: '',
        items: uniqueList(group)
      };
    })
    .filter((group) => group.title || group.items.length);
}

function cleanWorkHistory(rows = []) {
  if (!Array.isArray(rows)) return [];

  let lastRole = '';
  return rows
    .map((row) => {
      const role = cleanText(
        row?.role ||
          row?.title ||
          row?.designation ||
          row?.position
      );
      const entry = {
        company: cleanText(
          row?.company ||
            row?.organization ||
            row?.employer ||
            row?.client
        ),
        role: role || lastRole,
        duration: cleanText(
          row?.duration ||
            row?.tenure ||
            row?.period
        )
      };
      if (entry.role) lastRole = entry.role;
      return entry;
    })
    .filter((row) => row.company || row.role || row.duration);
}

function normalizeContributionValue(value) {
  if (Array.isArray(value)) return value;
  if (typeof value === 'string') {
    return value
      .split(/\n|•|- (?=\S)|\u2022/)
      .map((item) => cleanText(item))
      .filter(Boolean);
  }
  return [];
}

function cleanExperienceBlocks(blocks = []) {
  if (!Array.isArray(blocks)) return [];

  return blocks
    .map((block) => {
      const role = cleanText(
        block?.role ||
          block?.title ||
          block?.designation ||
          block?.projectName ||
          block?.name ||
          block?.project ||
          block?.client ||
          block?.clientName
      );

      const duration = cleanText(
        block?.duration ||
          block?.tenure ||
          block?.period ||
          block?.timeline
      );

      const contributions = uniqueList(
        block?.contributions ||
          block?.responsibilities ||
          block?.highlights ||
          block?.details ||
          block?.points ||
          block?.description ||
          block?.projectDescription ||
          normalizeContributionValue(block?.summary) ||
          normalizeContributionValue(block?.scope)
      );

      const client = cleanText(
        block?.client ||
          block?.clientName ||
          block?.customer
      );

      const employer = cleanText(
        block?.employer ||
          block?.company ||
          block?.organization
      );

      const technologies = uniqueList(
        block?.technologies ||
          block?.tools ||
          block?.environment ||
          block?.techStack
      );

      return {
        role,
        duration,
        contributions,
        client,
        employer,
        technologies
      };
    })
    .filter((block) => {
      const text = [
        block.role,
        block.duration,
        block.client,
        block.employer,
        ...block.contributions,
        ...block.technologies
      ]
        .join(' ')
        .trim();

      return text.length > 20;
    });
}

function firstNonEmptyText(...values) {
  for (const value of values) {
    const cleaned = cleanText(value);
    if (cleaned) return cleaned;
  }
  return '';
}

function firstNonEmptyTextRaw(...values) {
  for (const value of values) {
    if (value && typeof value === 'string' && value.trim()) return value;
  }
  return '';
}

function firstNonEmptyList(...values) {
  for (const value of values) {
    const cleaned = uniqueList(value);
    if (cleaned.length) return cleaned;
  }
  return [];
}

function firstNonEmptyArray(transformer, ...values) {
  for (const value of values) {
    const cleaned = transformer(value);
    if (cleaned.length) return cleaned;
  }
  return [];
}

function buildInitials(name = '') {
  return cleanText(name)
    .split(/\s+/)
    .filter(Boolean)
    .map((part) => part[0]?.toUpperCase() || '')
    .join('');
}

function extractCertificationLines(rawText = '') {
  if (!cleanText(rawText)) return [];

  return uniqueList(
    rawText
      .split('\n')
      .map((line) => cleanText(line))
      .filter(Boolean)
      .filter((line) =>
        /certification|certifications|certified|certificate|pmp|scrum master|itil/i.test(
          line
        )
      )
  );
}

function extractAchievementLines(rawText = '') {
  if (!cleanText(rawText)) return [];

  return uniqueList(
    rawText
      .split('\n')
      .map((line) => cleanText(line))
      .filter(Boolean)
      .filter((line) =>
        /achievement|achievements|accomplishment|accomplishments|award|awards|honor|honours|recognition|recognized|winner|saved|optimized/i.test(
          line
        )
      )
  );
}

function splitIntoLogicalBlocks(rawText = '') {
  if (!cleanText(rawText)) return [];

  return rawText
    .replace(/\r/g, '')
    .split(/\n\s*\n+/)
    .map((block) =>
      block
        .split('\n')
        .map((line) => cleanText(line))
        .filter(Boolean)
    )
    .filter((block) => block.length);
}

function extractProjectsFromRawText(rawText = '') {
  if (!cleanText(rawText)) return [];

  const lines = rawText
    .replace(/\r/g, '')
    .split('\n')
    .map((line) => cleanText(line))
    .filter(Boolean);

  const projects = [];
  let current = null;

  const startPattern =
    /(support\s+project\s+no|project\s+no|project\s+number|project)\s*[:\-]?\s*\d*/i;

  const projectSignals =
    /project detail|project description|client name|responsibilit(y|ies)|tasks|contribution|implementation|support project|green field|brown field|rollout|migration/i;

  for (const line of lines) {
    if (startPattern.test(line)) {
      if (current) projects.push(current);
      current = {
        role: line,
        duration: '',
        contributions: [],
        client: '',
        employer: '',
        technologies: []
      };
      continue;
    }

    if (/^client name$/i.test(line)) {
      continue;
    }

    if (/^project description$/i.test(line)) {
      continue;
    }

    if (/^employer$/i.test(line)) {
      continue;
    }

    if (/^responsibility\s*\/?\s*tasks?\s*\/?\s*contribution$/i.test(line)) {
      continue;
    }

    if (!current && projectSignals.test(line)) {
      current = {
        role: '',
        duration: '',
        contributions: [line],
        client: '',
        employer: '',
        technologies: []
      };
      continue;
    }

    if (!current) continue;

    if (!current.duration && /from .* to|from .* till date|till date|to .*$/i.test(line)) {
      current.duration = line;
      continue;
    }

    if (!current.client && /^[a-z0-9&(),.\-/' ]{2,}$/i.test(line) && /client/i.test(lines[Math.max(0, lines.indexOf(line) - 1)] || '')) {
      current.client = line;
      continue;
    }

    if (/sap|oracle|java|react|node|python|aws|azure|gcp|hana|fico|ecc|s\/4/i.test(line)) {
      current.technologies.push(line);
    } else {
      current.contributions.push(line);
    }
  }

  if (current) projects.push(current);

  return cleanExperienceBlocks(projects);
}

function extractProjectsFromLabelValueBlocks(rawText = '') {
  const blocks = splitIntoLogicalBlocks(rawText);
  const projects = [];

  for (const block of blocks) {
    const joined = block.join(' ').toLowerCase();

    const score =
      (/(project\s*(no|number)?|project detail)/i.test(joined) ? 3 : 0) +
      (/(client name|client|customer)/i.test(joined) ? 2 : 0) +
      (/(project description|description|scope|objective)/i.test(joined) ? 2 : 0) +
      (/(responsibilit(y|ies)|tasks|contribution)/i.test(joined) ? 2 : 0) +
      (/(technology|technologies|tools|environment)/i.test(joined) ? 1 : 0) +
      (/(from .* to|till date|duration|timeline)/i.test(joined) ? 1 : 0);

    if (score < 4) continue;

    let role = '';
    let duration = '';
    let client = '';
    let employer = '';
    const contributions = [];
    const technologies = [];

    for (let i = 0; i < block.length; i += 1) {
      const line = block[i];
      const next = block[i + 1] || '';

      if (!role && /project\s*(no|number)?|project detail/i.test(line)) {
        role = next && !/^(client|project|responsibilit|employer)/i.test(next)
          ? next
          : line;
        continue;
      }

      if (!client && /^client name$/i.test(line)) {
        client = next;
        continue;
      }

      if (!employer && /^employer$/i.test(line)) {
        employer = next;
        continue;
      }

      if (!duration && /from .* to|from .* till date|till date/i.test(line)) {
        duration = line;
        continue;
      }

      if (/sap|oracle|java|react|node|python|aws|azure|gcp|hana|fico|ecc|s\/4/i.test(line)) {
        technologies.push(line);
      }

      if (
        !/^project detail/i.test(line) &&
        !/^client name$/i.test(line) &&
        !/^project description$/i.test(line) &&
        !/^responsibility/i.test(line) &&
        !/^employer$/i.test(line)
      ) {
        contributions.push(line);
      }
    }

    projects.push({
      role,
      duration,
      client,
      employer,
      contributions,
      technologies
    });
  }

  return cleanExperienceBlocks(projects);
}

function mergeExperienceBlocks(...arrays) {
  const merged = arrays.flat().filter(Boolean);
  const normalized = cleanExperienceBlocks(merged);
  const seen = new Set();

  return normalized.filter((block) => {
    const key = [
      cleanText(block.role).toLowerCase(),
      cleanText(block.duration).toLowerCase(),
      cleanText(block.client).toLowerCase(),
      cleanText(block.employer).toLowerCase(),
      cleanText(block.contributions.join(' ')).toLowerCase().slice(0, 250)
    ].join('|');

    if (!key.replace(/\|/g, '').trim()) return false;
    if (seen.has(key)) return false;

    seen.add(key);
    return true;
  });
}

function mapAliases(input = {}) {
  return {
    ...input,

    professionalSummary:
      input.professionalSummary ||
      input.summary ||
      input.profileSummary ||
      input.careerSummary ||
      input.executiveSummary ||
      input.objective ||
      [],

    expertise:
      input.expertise ||
      input.coreExpertise ||
      input.coreCompetencies ||
      input.specializations ||
      input.highlights ||
      input.strengths ||
      [],

    educationalQualification:
      input.educationalQualification ||
      input.education ||
      input.academicQualification ||
      input.qualifications ||
      input.academicBackground ||
      [],

    skillGroups:
      input.skillGroups ||
      input.skills ||
      input.technicalSkills ||
      input.coreSkills ||
      input.keySkills ||
      input.techStack ||
      [],

    workHistory:
      input.workHistory ||
      input.employmentHistory ||
      input.careerHistory ||
      input.workHistorySummary ||
      [],

    technicalExperience:
      input.technicalExperience ||
      [],

    projectExperience:
      input.projectExperience ||
      input.projects ||
      input.projectDetails ||
      input.clientProjects ||
      [],

    professionalExperience:
      input.professionalExperience ||
      input.projectProfile ||
      input.assignments ||
      input.engagements ||
      [],

    workExperience:
      input.workExperience ||
      input.relevantExperience ||
      input.engineeringExperience ||
      input.developmentExperience ||
      input.responsibilities ||
      [],

    certifications:
      input.certifications ||
      input.Certifications ||
      input.certificates ||
      input.certs ||
      input.licenses ||
      input.licences ||
      input.courses ||
      input.professionalCertifications ||
      [],

    keyAchievements:
      input.keyAchievements ||
      input.achievements ||
      input.accomplishments ||
      input.awards ||
      input.keyHighlights ||
      input.careerHighlights ||
      []
  };
}

const KNOWN_FIELDS = new Set([
  'candidateName', 'candidateInitials', 'title', 'phone', 'email',
  'linkedin', 'location', 'totalExperience', 'currentCompany',
  'currentDesignation', 'noticePeriod', 'currentCtc', 'expectedCtc',
  'highestQualification', 'confidentialLabel', 'maskPersonalDetails',
  'professionalSummary', 'expertise', 'domainExperience',
  'toolsAndPlatforms', 'educationalQualification', 'skillGroups',
  'workHistory', 'technicalExperience', 'projectExperience',
  'professionalExperience', 'workExperience', 'certifications',
  'keyAchievements', 'languagesKnown', 'additionalSections',
  'projects', 'dateOfBirth', 'nationality', 'rawText',
  'name', 'fullName', 'jobTitle', 'professionalTitle', 'designation',
  'currentRole', 'mobile', 'contactNumber', 'mobileNumber',
  'emailAddress', 'linkedinUrl', 'linkedIn', 'linkedInUrl',
  'city', 'address', 'currentLocation',
  'summary', 'profileSummary', 'careerSummary', 'executiveSummary',
  'objective', 'coreExpertise', 'coreCompetencies', 'specializations',
  'highlights', 'strengths', 'education', 'academicQualification',
  'qualifications', 'academicBackground',
  'skills', 'technicalSkills', 'coreSkills', 'keySkills', 'techStack',
  'employmentHistory', 'careerHistory', 'workHistorySummary',
  'projectDetails', 'clientProjects', 'projectProfile',
  'assignments', 'engagements', 'relevantExperience',
  'engineeringExperience', 'developmentExperience', 'responsibilities',
  'Certifications', 'certificates', 'certs', 'licenses', 'licences',
  'courses', 'professionalCertifications',
  'achievements', 'accomplishments', 'awards', 'keyHighlights',
  'careerHighlights',
]);

function collectUnknownSections(input = {}) {
  const sections = [];
  for (const [key, value] of Object.entries(input)) {
    if (KNOWN_FIELDS.has(key)) continue;
    if (key.startsWith('__')) continue;
    if (value == null) continue;
    if (typeof value === 'string' && !value.trim()) continue;
    if (Array.isArray(value) && value.length === 0) continue;

    if (Array.isArray(value)) {
      const items = value
        .map((v) => (v !== null && typeof v === 'object' ? JSON.stringify(v) : String(v)))
        .filter(Boolean);
      if (items.length) sections.push({ title: key, items });
    } else if (typeof value === 'object' && value !== null) {
      sections.push({ title: key, items: [JSON.stringify(value, null, 2)] });
    } else {
      sections.push({ title: key, items: [String(value)] });
    }
  }
  return sections;
}

const DEFAULT_RESUME = {
  candidateName: '',
  candidateInitials: '',
  title: '',
  phone: '',
  email: '',
  linkedin: '',
  location: '',
  totalExperience: '',
  currentCompany: '',
  currentDesignation: '',
  noticePeriod: '',
  currentCtc: '',
  expectedCtc: '',
  highestQualification: '',
  confidentialLabel: 'Confidential',
  maskPersonalDetails: true,
  professionalSummary: [],
  expertise: [],
  domainExperience: [],
  toolsAndPlatforms: [],
  educationalQualification: [],
  skillGroups: [],
  workHistory: [],
  technicalExperience: [],
  certifications: [],
  keyAchievements: [],
  languagesKnown: [],
  additionalSections: []

};

export function normalizeResume(input = {}, options = {}) {
  const data = mapAliases(input);
  const rawText = input.rawText || data.rawText || '';

  if (options.verbatim) {
    const asArray = (v) => (Array.isArray(v) ? v : []);

    return {
      ...DEFAULT_RESUME,
      candidateName: firstNonEmptyTextRaw(data.candidateName, data.name, data.fullName),
      candidateInitials: firstNonEmptyTextRaw(
        data.candidateInitials,
        buildInitials(firstNonEmptyTextRaw(data.candidateName, data.name, '')),
      ),
      title: firstNonEmptyTextRaw(data.title, data.jobTitle, data.professionalTitle, data.designation, data.currentRole),
      phone: firstNonEmptyTextRaw(data.phone, data.mobile, data.contactNumber, data.mobileNumber),
      email: firstNonEmptyTextRaw(data.email, data.emailAddress),
      linkedin: firstNonEmptyTextRaw(data.linkedin, data.linkedinUrl, data.linkedIn, data.linkedInUrl),
      location: firstNonEmptyTextRaw(data.location, data.city, data.address, data.currentLocation),
      totalExperience: firstNonEmptyTextRaw(data.totalExperience),
      currentCompany: firstNonEmptyTextRaw(data.currentCompany),
      currentDesignation: firstNonEmptyTextRaw(data.currentDesignation),
      noticePeriod: firstNonEmptyTextRaw(data.noticePeriod),
      currentCtc: firstNonEmptyTextRaw(data.currentCtc),
      expectedCtc: firstNonEmptyTextRaw(data.expectedCtc),
      highestQualification: firstNonEmptyTextRaw(data.highestQualification),
      domainExperience: asArray(data.domainExperience),
      toolsAndPlatforms: asArray(data.toolsAndPlatforms),
      languagesKnown: asArray(data.languagesKnown),
      professionalSummary: asArray(
        data.professionalSummary || data.summary || data.profileSummary || data.careerSummary || data.executiveSummary || data.objective,
      ),
      expertise: asArray(
        data.expertise || data.coreExpertise || data.coreCompetencies || data.specializations || data.highlights || data.strengths,
      ),
      educationalQualification: asArray(
        data.educationalQualification || data.education || data.academicQualification || data.qualifications || data.academicBackground,
      ),
      skillGroups: asArray(data.skillGroups || data.skills || data.technicalSkills || data.coreSkills || data.keySkills || data.techStack),
      workHistory: asArray(data.workHistory || data.employmentHistory || data.careerHistory),
      technicalExperience: asArray(
        data.technicalExperience || data.projectExperience || data.professionalExperience || data.workExperience || data.relevantExperience,
      ),
      certifications: asArray(
        data.certifications || data.Certifications || data.certificates || data.certs || data.licenses || data.licences || data.courses || data.professionalCertifications,
      ),
      keyAchievements: asArray(
        data.keyAchievements || data.achievements || data.accomplishments || data.awards || data.keyHighlights || data.careerHighlights,
      ),
      additionalSections: [
        ...(Array.isArray(data.additionalSections) ? data.additionalSections : []),
        ...collectUnknownSections(input),
      ],
      confidentialLabel: firstNonEmptyTextRaw(data.confidentialLabel, DEFAULT_RESUME.confidentialLabel),
      maskPersonalDetails: Boolean(data.maskPersonalDetails),
    };
  }

  const technicalExperience = cleanExperienceBlocks(data.technicalExperience);
  const projectExperience = cleanExperienceBlocks(data.projectExperience);
  const professionalExperience = cleanExperienceBlocks(data.professionalExperience);
  const workExperience = cleanExperienceBlocks(data.workExperience);
  const relevantExperience = cleanExperienceBlocks(data.relevantExperience);

  const rawTextProjects = mergeExperienceBlocks(
    extractProjectsFromRawText(rawText),
    extractProjectsFromLabelValueBlocks(rawText)
  );

  const professionalSummary = firstNonEmptyList(
    data.professionalSummary,
    data.summary,
    data.profileSummary,
    data.careerSummary,
    data.executiveSummary,
    data.objective
  );

  const expertise = firstNonEmptyList(
    data.expertise,
    data.coreExpertise,
    data.coreCompetencies,
    data.specializations,
    data.highlights,
    data.strengths
  );

  const educationalQualification = firstNonEmptyList(
    data.educationalQualification,
    data.education,
    data.academicQualification,
    data.qualifications,
    data.academicBackground
  );

  const skillGroups = firstNonEmptyArray(
    cleanSkillGroups,
    data.skillGroups,
    data.skills,
    data.technicalSkills,
    data.coreSkills,
    data.keySkills,
    data.techStack
  );

  const workHistory = firstNonEmptyArray(
    cleanWorkHistory,
    data.workHistory,
    data.employmentHistory,
    data.careerHistory
  );

  const resolvedExperience = mergeExperienceBlocks(
    technicalExperience,
    projectExperience,
    professionalExperience,
    workExperience,
    relevantExperience,
    rawTextProjects
  );

  const certifications = firstNonEmptyList(
    data.certifications,
    data.Certifications,
    data.certificates,
    data.certs,
    data.licenses,
    data.licences,
    data.courses,
    data.professionalCertifications
  );

  const keyAchievements = firstNonEmptyList(
    data.keyAchievements,
    data.achievements,
    data.accomplishments,
    data.awards,
    data.keyHighlights,
    data.careerHighlights
  );

  const fallbackCertifications =
    certifications.length > 0
      ? certifications
      : extractCertificationLines(rawText);

  const fallbackAchievements =
    keyAchievements.length > 0
      ? keyAchievements
      : extractAchievementLines(rawText);

  const candidateName = firstNonEmptyText(
    data.candidateName,
    data.name,
    data.fullName
  );

  let title = firstNonEmptyText(
    data.title,
    data.jobTitle,
    data.professionalTitle,
    data.designation,
    data.currentRole
  );

  if (!title) {
    const lastRole = (workHistory || []).find((w) => w?.role);
    if (lastRole?.role) title = lastRole.role;
  }

  const phone = firstNonEmptyText(
    data.phone,
    data.mobile,
    data.contactNumber,
    data.mobileNumber
  );

  const email = firstNonEmptyText(
    data.email,
    data.emailAddress
  );

  const linkedin = firstNonEmptyText(
    data.linkedin,
    data.linkedinUrl,
    data.linkedIn,
    data.linkedInUrl
  );

  const location = firstNonEmptyText(
    data.location,
    data.city,
    data.address,
    data.currentLocation
  );

  const candidateInitials = firstNonEmptyText(
    data.candidateInitials,
    buildInitials(candidateName)
  );

  return {
    ...DEFAULT_RESUME,
    candidateName,
    candidateInitials,
    title,
    phone,
    email,
    linkedin,
    location,
    totalExperience: firstNonEmptyText(data.totalExperience),
    currentCompany: firstNonEmptyText(data.currentCompany),
    currentDesignation: firstNonEmptyText(data.currentDesignation),
    noticePeriod: firstNonEmptyText(data.noticePeriod),
    currentCtc: firstNonEmptyText(data.currentCtc),
    expectedCtc: firstNonEmptyText(data.expectedCtc),
    highestQualification: firstNonEmptyText(data.highestQualification),
    domainExperience: firstNonEmptyArray(data.domainExperience),
    toolsAndPlatforms: firstNonEmptyArray(data.toolsAndPlatforms),
    languagesKnown: firstNonEmptyArray(data.languagesKnown),
    additionalSections: [
      ...(Array.isArray(data.additionalSections) ? data.additionalSections : []),
      ...collectUnknownSections(input),
    ],
    confidentialLabel: firstNonEmptyText(
      data.confidentialLabel,
      DEFAULT_RESUME.confidentialLabel
    ),
    maskPersonalDetails: Boolean(data.maskPersonalDetails),
    professionalSummary,
    expertise,
    educationalQualification,
    skillGroups,
    workHistory,
    technicalExperience: resolvedExperience,
    certifications: fallbackCertifications,
    keyAchievements: fallbackAchievements
  };
}