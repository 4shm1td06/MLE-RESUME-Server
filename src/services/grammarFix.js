function fixCapitalization(text) {
  return text
    .replace(/(^\s*\w)|(\.\s*\w)/g, (c) => c.toUpperCase())
    .replace(/\bi\b/g, 'I');
}

function trimPunctuation(text) {
  return text.replace(/[.,!;]+$/, '').trim();
}

function heuristicFixText(text) {
  if (!text || typeof text !== 'string') return text;
  let fixed = text.trim();
  fixed = fixCapitalization(fixed);
  fixed = trimPunctuation(fixed);
  fixed = fixed.replace(/\s{2,}/g, ' ');
  return fixed;
}

function heuristicFixArray(items) {
  if (!Array.isArray(items)) return items;
  return items.map((item) => heuristicFixText(item)).filter(Boolean);
}

function heuristicFixString(value) {
  if (!value || typeof value !== 'string') return value;
  return heuristicFixText(value);
}

export function heuristicGrammarFix(data = {}) {
  const fixed = { ...data };

  if (Array.isArray(fixed.professionalSummary))
    fixed.professionalSummary = heuristicFixArray(fixed.professionalSummary);

  if (Array.isArray(fixed.expertise))
    fixed.expertise = heuristicFixArray(fixed.expertise);

  if (Array.isArray(fixed.domainExperience))
    fixed.domainExperience = heuristicFixArray(fixed.domainExperience);

  if (Array.isArray(fixed.toolsAndPlatforms))
    fixed.toolsAndPlatforms = heuristicFixArray(fixed.toolsAndPlatforms);

  if (Array.isArray(fixed.educationalQualification))
    fixed.educationalQualification = heuristicFixArray(fixed.educationalQualification);

  if (Array.isArray(fixed.certifications))
    fixed.certifications = heuristicFixArray(fixed.certifications);

  if (Array.isArray(fixed.keyAchievements))
    fixed.keyAchievements = heuristicFixArray(fixed.keyAchievements);

  if (Array.isArray(fixed.languagesKnown))
    fixed.languagesKnown = heuristicFixArray(fixed.languagesKnown);

  if (Array.isArray(fixed.skillGroups)) {
    fixed.skillGroups = fixed.skillGroups.map((g) => {
      if (!g || typeof g !== 'object') return g;
      return {
        ...g,
        title: heuristicFixString(g.title),
        items: heuristicFixArray(g.items)
      };
    });
  }

  if (Array.isArray(fixed.workHistory)) {
    fixed.workHistory = fixed.workHistory.map((w) => {
      if (!w || typeof w !== 'object') return w;
      return {
        ...w,
        company: heuristicFixString(w.company),
        role: heuristicFixString(w.role),
        duration: heuristicFixString(w.duration)
      };
    });
  }

  if (Array.isArray(fixed.technicalExperience)) {
    fixed.technicalExperience = fixed.technicalExperience.map((b) => {
      if (!b || typeof b !== 'object') return b;
      return {
        ...b,
        role: heuristicFixString(b.role),
        duration: heuristicFixString(b.duration),
        contributions: heuristicFixArray(b.contributions)
      };
    });
  }

  if (Array.isArray(fixed.projectExperience)) {
    fixed.projectExperience = fixed.projectExperience.map((b) => {
      if (!b || typeof b !== 'object') return b;
      return {
        ...b,
        role: heuristicFixString(b.role),
        duration: heuristicFixString(b.duration),
        contributions: heuristicFixArray(b.contributions)
      };
    });
  }

  if (Array.isArray(fixed.additionalSections)) {
    fixed.additionalSections = fixed.additionalSections.map((s) => {
      if (!s || typeof s !== 'object') return s;
      return {
        ...s,
        title: heuristicFixString(s.title),
        items: heuristicFixArray(s.items)
      };
    });
  }

  return fixed;
}

export async function grammarFix(data = {}) {
  return { data: heuristicGrammarFix(data) };
}
