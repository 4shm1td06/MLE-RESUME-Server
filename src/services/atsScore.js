import 'dotenv/config';

const apiKey = process.env.OPENROUTER_API_KEY?.trim();
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function count(val) {
  if (Array.isArray(val)) return val.filter(Boolean).length;
  if (typeof val === 'string') return val.trim() ? 1 : 0;
  return 0;
}

function hasText(val) {
  if (Array.isArray(val)) return val.some((v) => typeof v === 'string' && v.trim().length > 0);
  return typeof val === 'string' && val.trim().length > 0;
}

function estimateReadTime(text) {
  const words = text.split(/\s+/).length;
  return Math.ceil(words / 250);
}

export function heuristicAtsScore(data = {}, rawText = '') {
  const score = { overall: 0, categories: {}, pros: [], cons: [] };
  let totalWeight = 0;
  let weightedScore = 0;

  function addCategory(name, weight, earned, max, pros, cons) {
    totalWeight += weight;
    weightedScore += weight * (earned / max);
    score.categories[name] = { earned, max, pct: Math.round((earned / max) * 100) };
    if (pros) pros.forEach((p) => score.pros.push(p));
    if (cons) cons.forEach((c) => score.cons.push(c));
  }

  const name = hasText(data.candidateName);
  const email = hasText(data.email);
  const phone = hasText(data.phone);
  const linkedin = hasText(data.linkedin);
  const location = hasText(data.location);
  const title = hasText(data.title);

  let contactScore = 0;
  const contactPros = [];
  const contactCons = [];
  if (name) { contactScore += 2; contactPros.push('Candidate name present'); } else contactCons.push('Missing candidate name');
  if (email) { contactScore += 2; contactPros.push('Email address present'); } else contactCons.push('Missing email address');
  if (phone) { contactScore += 2; contactPros.push('Phone number present'); } else contactCons.push('Missing phone number');
  if (linkedin) { contactScore += 1; contactPros.push('LinkedIn profile linked'); }
  if (location) { contactScore += 1; contactPros.push('Location specified'); }
  if (title) { contactScore += 1; contactPros.push('Professional title present'); }
  addCategory('Contact Info', 10, contactScore, 9, contactPros, contactCons);

  const summaryItems = count(data.professionalSummary);
  if (summaryItems >= 3) addCategory('Professional Summary', 10, 10, 10, ['Strong professional summary with multiple points'], []);
  else if (summaryItems >= 1) addCategory('Professional Summary', 10, 6, 10, ['Professional summary present'], ['Consider expanding your professional summary to 3-5 bullet points']);
  else addCategory('Professional Summary', 10, 0, 10, [], ['Missing professional summary — this is critical for ATS visibility']);

  const skillCount = (data.skillGroups || []).reduce((sum, g) => sum + count(g.items), 0);
  const skillGroupCount = count(data.skillGroups);
  if (skillCount >= 15 && skillGroupCount >= 3) addCategory('Skills', 15, 15, 15, [`${skillCount} skills across ${skillGroupCount} categories — excellent depth`], []);
  else if (skillCount >= 8) addCategory('Skills', 15, 10, 15, [`${skillCount} skills listed`], ['Consider organizing skills into 3+ categories for better ATS parsing']);
  else if (skillCount >= 1) addCategory('Skills', 15, 5, 15, [], [`Only ${skillCount} skills found — add more relevant skills`]);
  else addCategory('Skills', 15, 0, 15, [], ['No skills detected — skills section is essential for ATS']);

  const workCount = count(data.workHistory);
  const hasDuration = (data.workHistory || []).some((w) => hasText(w.duration));
  if (workCount >= 3 && hasDuration) addCategory('Work History', 15, 15, 15, [`${workCount} roles with durations — strong employment history`], []);
  else if (workCount >= 1 && hasDuration) addCategory('Work History', 15, 10, 15, [`${workCount} roles listed`], ['Add more work history entries (3+ recommended)']);
  else if (workCount >= 1) addCategory('Work History', 15, 5, 15, [], ['Add duration/tenure for each role']);
  else addCategory('Work History', 15, 0, 15, [], ['No work history found']);

  const expBlocks = count(data.technicalExperience);
  const totalContributions = (data.technicalExperience || []).reduce((sum, b) => sum + count(b.contributions), 0);
  if (expBlocks >= 2 && totalContributions >= 6) addCategory('Experience Details', 15, 15, 15, [`${totalContributions} detailed contributions across ${expBlocks} roles`], []);
  else if (expBlocks >= 1 && totalContributions >= 3) addCategory('Experience Details', 15, 10, 15, [`${totalContributions} contributions listed`], ['Add more quantifiable contributions to each role']);
  else if (expBlocks >= 1) addCategory('Experience Details', 15, 5, 15, [], ['Expand each experience block with specific contributions and achievements']);
  else addCategory('Experience Details', 15, 0, 15, [], ['No technical experience details provided']);

  const eduCount = count(data.educationalQualification);
  if (eduCount >= 2) addCategory('Education', 8, 8, 8, [`${eduCount} qualifications listed`], []);
  else if (eduCount === 1) addCategory('Education', 8, 5, 8, ['Education listed'], ['Consider adding more educational qualifications']);
  else addCategory('Education', 8, 0, 8, [], ['No education section found']);

  const certCount = count(data.certifications);
  if (certCount >= 3) addCategory('Certifications', 7, 7, 7, [`${certCount} certifications listed — strong加分`], []);
  else if (certCount >= 1) addCategory('Certifications', 7, 4, 7, [`${certCount} certification(s) listed`], ['Consider adding more relevant certifications']);
  else addCategory('Certifications', 7, 0, 7, [], ['No certifications listed — adding them boosts ATS ranking']);

  const achievementCount = count(data.keyAchievements);
  if (achievementCount >= 3) addCategory('Achievements', 8, 8, 8, [`${achievementCount} key achievements with measurable impact`], []);
  else if (achievementCount >= 1) addCategory('Achievements', 8, 4, 8, ['Key achievements listed'], ['Quantify achievements with metrics (%, $, time saved)']);
  else addCategory('Achievements', 8, 0, 8, [], ['No achievements section — highlight measurable results']);

  const expertiseCount = count(data.expertise);
  if (expertiseCount >= 4) addCategory('Expertise & Keywords', 7, 7, 7, [`${expertiseCount} areas of expertise — strong keyword density`], []);
  else if (expertiseCount >= 1) addCategory('Expertise & Keywords', 7, 4, 7, ['Areas of expertise listed'], ['Add more domain-specific keywords for better ATS matching']);
  else addCategory('Expertise & Keywords', 7, 0, 7, [], ['No expertise section — add keywords relevant to target role']);

  const hasQuantified = /[0-9]+%|[0-9]+ years|₹|\$|[0-9]+x/i.test(rawText);
  const hasActionVerbs = /\b(led|managed|developed|implemented|created|designed|optimized|reduced|increased|delivered|achieved|built|launched)\b/i.test(rawText);
  const lengthMinutes = estimateReadTime(rawText);

  if (hasQuantified) {
    addCategory('Content Quality', 8, 8, 8, ['Contains quantified results (%, $, years)'], []);
  } else if (hasActionVerbs) {
    addCategory('Content Quality', 8, 5, 8, ['Uses strong action verbs'], ['Add quantified metrics to strengthen impact']);
  } else {
    addCategory('Content Quality', 8, 2, 8, [], ['Add action verbs and quantified achievements']);
  }

  let formatScore = 10;
  const formatCons = [];
  if (lengthMinutes > 3) { formatScore -= 3; formatCons.push('Resume may be too long (target 1-2 pages for most roles)'); }
  if (lengthMinutes < 0.5) { formatScore -= 2; formatCons.push('Resume seems too short — add more detail'); }
  if (!hasActionVerbs) { formatScore -= 2; formatCons.push('Few action verbs detected — use more strong openings'); }
  if (!hasQuantified) { formatScore -= 2; formatCons.push('No quantified achievements — add metrics where possible'); }
  addCategory('Format & Readability', 12, Math.max(0, formatScore), 10, formatScore >= 8 ? ['Good resume length and structure'] : [], formatCons);

  score.overall = totalWeight > 0 ? Math.round(weightedScore) : 0;
  score.overallMax = 100;
  score.totalWeight = totalWeight;

  const rawWords = rawText.split(/\s+/).length;
  score.meta = {
    wordCount: rawWords,
    estimatedReadMinutes: lengthMinutes,
    skillCount,
    workHistoryCount: workCount,
    contributionCount: totalContributions,
    certificationCount: certCount,
    achievementCount
  };

  return score;
}

function buildAiPrompt(data, rawText) {
  return `
You are an ATS (Applicant Tracking System) expert. Analyze this resume data and return ONLY valid JSON with no markdown.

Return this exact schema:
{
  "overall": <number 0-100>,
  "categories": {
    "Contact Info": { "earned": <number>, "max": <number>, "pct": <number> },
    "Professional Summary": { ... },
    "Skills": { ... },
    "Work History": { ... },
    "Experience Details": { ... },
    "Education": { ... },
    "Certifications": { ... },
    "Achievements": { ... },
    "Expertise & Keywords": { ... },
    "Content Quality": { ... },
    "Format & Readability": { ... }
  },
  "pros": ["<strength>", ...],
  "cons": ["<weakness/suggestion>", ...],
  "meta": {
    "wordCount": <number>,
    "estimatedReadMinutes": <number>
  }
}

Rules:
- Score each category 0-100 based on ATS best practices
- Pros should highlight what works well for ATS parsing
- Cons should be actionable improvements
- Be critical but fair — hiring managers use this
- Consider keyword optimization, format, quantifiable results, section completeness

Resume data:
${JSON.stringify(data, null, 2)}

Raw text length: ${rawText.length} chars
`.trim();
}

async function callAiAts(prompt) {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:5050',
      'X-Title': process.env.OPENROUTER_APP_NAME || 'MLE Resume Formatter'
    },
    body: JSON.stringify({
      model: 'openrouter/auto',
      messages: [
        { role: 'system', content: 'You are an ATS scoring expert. Return only valid JSON. No markdown. No explanations.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`OpenRouter ATS request failed: ${response.status} ${errorText}`);
  }

  const json = await response.json();
  const text = json?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('OpenRouter returned empty ATS analysis');

  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned);
}

export async function getAtsScore(data = {}, rawText = '') {
  const heuristic = heuristicAtsScore(data, rawText);

  if (!apiKey) {
    return {
      ...heuristic,
      provider: 'heuristic',
      note: 'AI analysis unavailable — using rule-based scoring'
    };
  }

  try {
    const prompt = buildAiPrompt(data, rawText);
    const aiResult = await callAiAts(prompt);

    return {
      overall: aiResult.overall ?? heuristic.overall,
      categories: aiResult.categories ?? heuristic.categories,
      pros: aiResult.pros ?? heuristic.pros,
      cons: aiResult.cons ?? heuristic.cons,
      meta: { ...heuristic.meta, ...aiResult.meta },
      provider: 'openrouter',
      note: 'AI-powered ATS analysis'
    };
  } catch (error) {
    console.error('AI ATS analysis failed, using heuristic:', error.message);
    return {
      ...heuristic,
      provider: 'heuristic',
      note: 'AI analysis unavailable — using rule-based scoring'
    };
  }
}
