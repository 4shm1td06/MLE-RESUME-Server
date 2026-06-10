function cleanText(value) {
  return String(value ?? '').replace(/[\r\n]+/g, ' ').replace(/\s+/g, ' ').trim();
}

function cleanList(items) {
  if (Array.isArray(items)) {
    return items.map(item => cleanText(item)).filter(Boolean);
  }
  if (typeof items === 'string') {
    const v = cleanText(items);
    return v ? [v] : [];
  }
  return [];
}

function flattenItems(items) {
  if (!Array.isArray(items)) {
    if (typeof items === 'string') return cleanText(items) ? [cleanText(items)] : [];
    return [];
  }
  const result = [];
  for (const item of items) {
    if (typeof item === 'object' && item !== null) {
      if (Array.isArray(item.highlights) && item.highlights.length) {
        for (const h of item.highlights) result.push(cleanText(h));
      } else {
        const text = cleanText(item.summary || item.text || item.description || item.name || '');
        if (text) result.push(text);
      }
    } else {
      const text = cleanText(item);
      if (text) result.push(text);
    }
  }
  return result.filter(Boolean);
}

function uniqueList(items) {
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

function firstNonEmptyText(...values) {
  for (const v of values) {
    const c = cleanText(v);
    if (c) return c;
  }
  return '';
}

function firstNonEmptyList(...values) {
  for (const v of values) {
    const c = uniqueList(v);
    if (c.length) return c;
  }
  return [];
}

function buildFullName(input) {
  const parts = [];
  if (input?.title) parts.push(input.title);
  if (input?.firstName) parts.push(input.firstName);
  if (input?.middleName) parts.push(input.middleName);
  if (input?.lastName) parts.push(input.lastName);
  if (input?.familyName) parts.push(input.familyName);
  if (input?.fullName) return input.fullName;
  return parts.join(' ') || '';
}

function normalizeLocation(input) {
  if (!input) return null;
  if (typeof input === 'string') return { formatted: input, rawInput: input };
  return {
    formatted: firstNonEmptyText(input.formatted, input.city ? `${input.city}, ${input.state || ''} ${input.country || ''}`.trim() : ''),
    streetNumber: cleanText(input.streetNumber) || null,
    street: cleanText(input.street) || null,
    city: cleanText(input.city) || null,
    postalCode: cleanText(input.postalCode) || null,
    state: cleanText(input.state) || null,
    country: cleanText(input.country) || null,
    countryCode: cleanText(input.countryCode) || null,
    rawInput: cleanText(input.rawInput) || null,
  };
}

function cleanEducation(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map(e => ({
    accreditation: cleanText(e.accreditation || e.degree || e.qualification || ''),
    level: e.level || null,
    organization: cleanText(e.organization || e.institution || e.school || ''),
    location: normalizeLocation(e.location || null),
    major: cleanList(e.major || e.field || e.majors || []),
    minor: cleanList(e.minor || e.minors || []),
    dates: e.dates || null,
    dateRange: cleanText(e.dateRange || e.period || e.duration || ''),
    grade: e.grade || null,
  })).filter(e => e.accreditation || e.organization || e.dateRange || (e.major && e.major.length));
}

function cleanWorkExperience(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map(e => ({
    jobTitle: cleanText(e.jobTitle || e.title || e.role || e.position || e.designation || ''),
    organization: cleanText(e.organization || e.company || e.employer || ''),
    location: normalizeLocation(e.location || null),
    dates: e.dates || null,
    dateRange: cleanText(e.dateRange || e.period || e.duration || ''),
    description: cleanText(e.description || e.summary || ''),
    type: cleanText(e.type || e.employmentType || ''),
    contributions: flattenItems(e.contributions || e.responsibilities || e.highlights || []),
  })).filter(e => e.jobTitle || e.organization || e.dateRange);
}

function cleanSkills(input) {
  if (Array.isArray(input)) {
    return uniqueList(input);
  }
  if (typeof input === 'object' && input !== null) {
    const items = input.items || input.skills || input.list || [];
    return uniqueList(items);
  }
  return [];
}

function cleanLanguages(entries) {
  if (!Array.isArray(entries)) return [];
  if (entries.length && typeof entries[0] === 'string') {
    return entries.map(name => ({ name: cleanText(name), proficiency: null }));
  }
  return entries.map(e => ({
    name: cleanText(e.name || e.language || ''),
    proficiency: cleanText(e.proficiency || e.proficiencyLevel || '') || null,
  })).filter(e => e.name);
}

function cleanProjects(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map(e => ({
    title: cleanText(e.title || e.name || e.projectName || ''),
    description: cleanText(e.description || e.summary || ''),
    startDate: cleanText(e.startDate || e.start || ''),
    endDate: cleanText(e.endDate || e.end || ''),
    dateRange: cleanText(e.dateRange || e.duration || ''),
    organization: cleanText(e.organization || e.client || ''),
    type: cleanText(e.type || e.projectType || ''),
    url: cleanText(e.url || ''),
    technologies: uniqueList(e.technologies || e.tools || e.techStack || []),
    highlights: uniqueList(e.highlights || e.contributions || []),
  })).filter(e => e.title || e.description);
}

function cleanPublications(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map(e => ({
    title: cleanText(e.title || e.publicationTitle || ''),
    date: cleanText(e.date || e.publicationDate || ''),
    journalName: cleanText(e.journalName || e.journal || e.publisher || ''),
  })).filter(e => e.title);
}

function cleanPatents(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map(e => ({
    title: cleanText(e.title || e.patentTitle || ''),
    date: cleanText(e.date || e.patentDate || ''),
    patentNumber: cleanText(e.patentNumber || e.number || ''),
  })).filter(e => e.title);
}

function cleanReferees(entries) {
  if (!Array.isArray(entries)) return [];
  return entries.map(e => ({
    name: cleanText(e.name || e.refereeName || ''),
    contactDetails: cleanText(e.contactDetails || e.contact || e.phone || e.email || ''),
    organization: cleanText(e.organization || e.company || ''),
  })).filter(e => e.name || e.contactDetails);
}

function mapAliases(input = {}) {
  return {
    ...input,
    candidateName: input.candidateName || input.name || input.fullName || null,
    email: input.email || input.emailAddress || input.Email || input.emails || [],
    phoneNumber: input.phoneNumber || input.phone || input.mobile || input.contactNumber || input.phoneNumbers || [],
    location: input.location || input.address || input.city || input.currentLocation || null,
    workExperience: input.workExperience || input.experience || input.employmentHistory || input.careerHistory || input.workHistory || input.professionalExperience || [],
    education: input.education || input.educationalQualification || input.qualifications || input.academicBackground || [],
    skills: input.skills || input.technicalSkills || input.coreSkills || input.keySkills || input.skillGroups || input.techStack || [],
    languages: input.languages || input.languagesKnown || [],
    projects: input.projects || input.projectExperience || input.projectDetails || [],
    summary: input.summary || input.professionalSummary || input.profileSummary || input.careerSummary || input.executiveSummary || '',
    objective: input.objective || input.careerObjective || null,
    certifications: input.certifications || input.Certifications || input.certificates || input.certs || input.courses || [],
    achievements: input.achievements || input.keyAchievements || input.accomplishments || input.awards || [],
    publications: input.publications || input.publication || [],
    patents: input.patents || input.patent || [],
    referees: input.referees || input.references || [],
    hobbies: input.hobbies || input.hobby || input.interests || [],
    associations: input.associations || input.association || [],
    websites: input.websites || input.website || input.linkedin ? [{ type: 'linkedin', url: input.linkedin }] : [],
    nationality: input.nationality || null,
    dateOfBirth: input.dateOfBirth || input.dob || null,
    totalYearsExperience: input.totalYearsExperience || input.totalExperience || null,
  };
}

export const AFFINDA_SCHEMA_DEFAULTS = {
  candidateName: null,
  dateOfBirth: null,
  birthplace: null,
  nationality: null,
  headshot: null,
  rightToWork: null,
  email: [],
  phoneNumber: [],
  websites: [],
  location: null,
  preferredWorkLocation: null,
  willingToRelocate: null,
  availability: null,
  objective: null,
  summary: '',
  achievements: [],
  associations: [],
  hobbies: [],
  workExperience: [],
  education: [],
  skills: [],
  languages: [],
  projects: [],
  publications: [],
  patents: [],
  referees: [],
  certifications: [],
  totalYearsExperience: null,
  rawText: '',
};

export function normalizeToAffindaSchema(input = {}, options = {}) {
  const data = mapAliases(input);
  const rawText = input.rawText || '';

  const candidateName = data.candidateName;
  const normalizedName = candidateName && typeof candidateName === 'object'
    ? {
        title: cleanText(candidateName.title) || null,
        firstName: cleanText(candidateName.firstName || candidateName.givenName || candidateName.first) || null,
        middleName: cleanText(candidateName.middleName) || null,
        lastName: cleanText(candidateName.lastName || candidateName.surname || candidateName.familyName) || null,
        familyName: cleanText(candidateName.familyName) || null,
        fullName: buildFullName(candidateName),
      }
    : candidateName
      ? { fullName: cleanText(candidateName) }
      : null;

  const emails = uniqueList(
    Array.isArray(data.email) ? data.email : typeof data.email === 'string' ? [data.email] : []
  );

  const phones = uniqueList(
    Array.isArray(data.phoneNumber) ? data.phoneNumber : typeof data.phoneNumber === 'string' ? [data.phoneNumber] : []
  );

  const websites = Array.isArray(data.websites) ? data.websites.map(w => ({
    type: cleanText(w.type || ''),
    url: cleanText(w.url || ''),
  })).filter(w => w.url) : [];

  return {
    ...AFFINDA_SCHEMA_DEFAULTS,
    candidateName: normalizedName,
    email: emails,
    phoneNumber: phones,
    websites,
    location: normalizeLocation(data.location),
    preferredWorkLocation: cleanText(data.preferredWorkLocation) || null,
    willingToRelocate: data.willingToRelocate === true || data.willingToRelocate === 'true' || null,
    availability: cleanText(data.availability) || null,
    objective: cleanText(data.objective) || null,
    summary: cleanText(data.summary || (Array.isArray(data.professionalSummary) ? data.professionalSummary.join(' ') : data.professionalSummary) || ''),
    achievements: uniqueList(
      Array.isArray(data.achievements) ? data.achievements : []
    ),
    associations: cleanList(data.associations),
    hobbies: cleanList(data.hobbies),
    workExperience: cleanWorkExperience(data.workExperience),
    education: cleanEducation(data.education),
    skills: cleanSkills(data.skills),
    languages: cleanLanguages(data.languages),
    projects: cleanProjects(data.projects),
    publications: cleanPublications(data.publications),
    patents: cleanPatents(data.patents),
    referees: cleanReferees(data.referees),
    certifications: uniqueList(
      Array.isArray(data.certifications) ? data.certifications : typeof data.certifications === 'string' ? [data.certifications] : []
    ),
    totalYearsExperience: data.totalYearsExperience ? cleanText(data.totalYearsExperience) : null,
    dateOfBirth: cleanText(data.dateOfBirth) || null,
    nationality: cleanText(data.nationality) || null,
    rawText,
  };
}
