export function computeConfidence(data = {}, rawText = '', source = 'heuristic') {
  const conf = {};

  const textQuality = rawText.length > 100 ? 'high' : rawText.length > 20 ? 'medium' : 'low';
  const aiExtracted = source === 'ai' || source === 'ai-gemini';

  const hasValue = (val) => {
    if (val == null) return false;
    if (typeof val === 'string') return val.trim().length > 0;
    if (Array.isArray(val)) return val.length > 0;
    if (typeof val === 'object') return Object.values(val).some(v => v != null && v !== '');
    return false;
  };

  const textConfidence = (field) => {
    if (textQuality === 'high') return aiExtracted ? 0.95 : 0.85;
    if (textQuality === 'medium') return aiExtracted ? 0.80 : 0.65;
    return aiExtracted ? 0.60 : 0.40;
  };

  conf.candidateName = hasValue(data.candidateName?.fullName || data.candidateName)
    ? textConfidence('candidateName')
    : 0;

  conf.email = hasValue(data.email) ? (aiExtracted ? 0.97 : 0.92) : 0;

  conf.phoneNumber = (() => {
    if (!hasValue(data.phoneNumber)) return 0;
    const raw = rawText || '';
    const digits = ((Array.isArray(data.phoneNumber) ? data.phoneNumber[0] : data.phoneNumber) || '').replace(/\D/g, '');
    const digitsInText = raw.replace(/\D/g, '');
    const found = digits && digitsInText.includes(digits);
    return found ? (aiExtracted ? 0.95 : 0.88) : (aiExtracted ? 0.80 : 0.65);
  })();

  conf.location = hasValue(data.location) ? textConfidence('location') : 0;

  conf.workExperience = (() => {
    if (!hasValue(data.workExperience)) return 0;
    const count = data.workExperience.length;
    const hasDates = data.workExperience.some(w => w.dateRange || w.dates);
    if (count >= 3 && hasDates) return textConfidence('workExperience') + 0.05;
    if (count >= 1) return aiExtracted ? 0.75 : 0.60;
    return 0;
  })();

  conf.education = (() => {
    if (!hasValue(data.education)) return 0;
    const count = data.education.length;
    const hasAccreditation = data.education.some(e => e.accreditation || e.organization);
    if (count >= 1 && hasAccreditation) return textConfidence('education');
    return aiExtracted ? 0.70 : 0.55;
  })();

  conf.skills = (() => {
    if (!hasValue(data.skills)) return 0;
    const flatCount = data.skills.reduce((sum, g) => sum + (g.items?.length || 0), 0);
    if (flatCount >= 5) return textConfidence('skills');
    if (flatCount >= 1) return aiExtracted ? 0.75 : 0.60;
    return 0;
  })();

  conf.summary = hasValue(data.summary) ? textConfidence('summary') : 0;

  conf.certifications = (() => {
    if (!hasValue(data.certifications)) return 0;
    return aiExtracted ? 0.85 : 0.70;
  })();

  conf.projects = hasValue(data.projects) ? textConfidence('projects') : 0;

  conf.languages = hasValue(data.languages) ? textConfidence('languages') : 0;

  conf.totalYearsExperience = hasValue(data.totalYearsExperience) ? textConfidence('totalYearsExperience') : 0;

  conf.nationality = hasValue(data.nationality) ? (aiExtracted ? 0.80 : 0.60) : 0;

  conf.dateOfBirth = hasValue(data.dateOfBirth) ? (aiExtracted ? 0.85 : 0.65) : 0;

  const fields = Object.keys(conf);
  const nonZero = fields.filter(f => conf[f] > 0);
  const overallConfidence = nonZero.length > 0
    ? nonZero.reduce((sum, f) => sum + conf[f], 0) / nonZero.length
    : 0;

  return {
    fields: conf,
    overall: Math.round(overallConfidence * 100) / 100,
  };
}
