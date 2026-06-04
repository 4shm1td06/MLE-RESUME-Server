import 'dotenv/config';

const apiKey = process.env.OPENROUTER_API_KEY?.trim();
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

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

export async function getAiGrammarFix(data = {}) {
  if (!apiKey) return null;

  const prompt = `You are a resume editor. Fix grammar, spelling, capitalization, and awkward phrasing in the following resume JSON. Preserve all field names, structure, and meaning. Return ONLY valid JSON with no markdown or explanation. Do not add or remove fields. Do not change dates, company names, or proper nouns unless they have obvious typos.

Input:
${JSON.stringify(data, null, 2)}`;

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model: 'openrouter/auto',
        messages: [{ role: 'user', content: prompt.slice(0, 25000) }],
        temperature: 0.1,
        max_tokens: 8000
      })
    });

    if (!response.ok) return null;

    const result = await response.json();
    const content = result?.choices?.[0]?.message?.content?.trim();
    if (!content) return null;

    const cleaned = content.replace(/```json\s*|```\s*/g, '').trim();
    return JSON.parse(cleaned);
  } catch {
    return null;
  }
}

export async function grammarFix(data = {}) {
  const aiResult = await getAiGrammarFix(data);
  const heuristicResult = heuristicGrammarFix(data);

  if (aiResult) {
    return { data: aiResult, provider: 'openrouter' };
  }
  return { data: heuristicResult, provider: 'heuristic' };
}
