const apiKey = (process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY)?.trim();
const AI_URL = process.env.AI_API_URL || 'https://api.groq.com/openai/v1/chat/completions';

const STOP_WORDS = new Set([
  'the','a','an','and','or','but','in','on','at','to','for','of','with','by','from','as','is','was','are','were',
  'be','been','being','have','has','had','do','does','did','will','would','could','should','may','might','shall',
  'can','need','dare','ought','used','this','that','these','those','it','its','they','them','their','we','our',
  'you','your','he','she','his','her','him','not','no','nor','so','if','than','then','else','all','each','every',
  'both','few','more','most','other','some','such','only','own','same','too','very','just','about','above',
  'after','again','against','because','before','between','during','into','out','over','through','under','up',
  'while','without','per','via','&',
  'where','which','what','why','how','also','well','even','still','already','always','never','usually',
  'much','many','any','anything','everything','nothing','something','here','there',
  'etc','am','get','got','one','two','make','made','take','took','know','known',
  'see','work','working','new','use','used','using','like','including','include',
  'first','last','next','every','due','able','along','among','across','back','being',
  'best','better','big','done','down','far','full','go','going','high','keep','large',
  'long','low','must','near','now','off','often','once','part','put','quite','rather',
  'really','right','said','sure','thing','think','time','top','way','within'
]);

function tokenize(text) {
  if (!text) return [];
  return text.toLowerCase()
    .replace(/[^a-z0-9+#.]/g, ' ')
    .split(/\s+/)
    .filter(Boolean)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w));
}

export function heuristicJdMatch(data = {}, rawText = '', jobDescription = '') {
  const jdTokens = tokenize(jobDescription);
  const resumeTokens = tokenize(rawText);

  const skillTokens = tokenize(
    (data.skillGroups || []).flatMap((g) => g.items || []).join(' ')
  );
  const expertiseTokens = tokenize((data.expertise || []).join(' '));
  const summaryTokens = tokenize((data.professionalSummary || []).join(' '));
  const workTokens = tokenize(
    (data.workHistory || []).flatMap((w) => [w.company, w.role]).join(' ')
  );
  const expTokens = tokenize(
    (data.technicalExperience || []).flatMap((e) => [e.role, e.client, ...(e.contributions || []), e.employer, ...(e.technologies || [])]).join(' ')
  );
  const allResumeTokens = [...new Set([...resumeTokens, ...skillTokens, ...expertiseTokens, ...summaryTokens, ...workTokens, ...expTokens])];
  const jdSet = new Set(jdTokens);

  const matchedTokens = allResumeTokens.filter((t) => jdSet.has(t));

  const matchedSkills = skillTokens.filter((t) => jdSet.has(t));
  const missingSkills = jdTokens.filter((t) => !allResumeTokens.includes(t)).slice(0, 30);

  const jdWordCount = jdTokens.length;
  const keywordOverlap = jdWordCount > 0 ? Math.round((matchedTokens.length / jdWordCount) * 100) : 0;

  function catScore(matched, total, weight) {
    const pct = total > 0 ? Math.round((matched.length / total) * 100) : 0;
    const earned = Math.round((pct / 100) * weight);
    return { earned, max: weight, pct };
  }

  const skillMatchTokens = jdTokens.filter((t) => skillTokens.includes(t));
  const expMatchTokens = jdTokens.filter((t) => expTokens.includes(t));
  const eduTokens = tokenize((data.educationalQualification || []).join(' '));
  const eduMatchTokens = jdTokens.filter((t) => eduTokens.includes(t));

  const categories = {
    'Skills Match': catScore(skillMatchTokens, jdTokens, 10),
    'Experience Match': catScore(expMatchTokens, jdTokens, 10),
    'Education Match': catScore(eduMatchTokens, jdTokens, 5),
    'Keyword Density': { earned: Math.round(keywordOverlap / 10), max: 10, pct: keywordOverlap }
  };

  let overall = 0;
  let totalWeight = 0;
  for (const [_name, cat] of Object.entries(categories)) {
    overall += cat.earned;
    totalWeight += cat.max;
  }
  overall = totalWeight > 0 ? Math.round((overall / totalWeight) * 100) : 0;

  const recommendations = [];
  if (missingSkills.length > 0) recommendations.push(`Consider adding experience with: ${missingSkills.slice(0, 10).join(', ')}`);
  if (keywordOverlap < 40) recommendations.push('Resume keyword density is low — incorporate more terms from the job description');
  if (matchedSkills.length < 5) recommendations.push('Few matching skills detected — review the job requirements and highlight relevant expertise');

  return {
    overall,
    categories,
    matchedSkills: [...new Set(matchedSkills)].slice(0, 30),
    missingSkills: [...new Set(missingSkills)].slice(0, 30),
    recommendations,
    meta: {
      jdWordCount,
      resumeWordCount: allResumeTokens.length,
      keywordOverlap
    }
  };
}

function buildAiPrompt(data, rawText, jobDescription) {
  return `
You are a hiring expert and ATS optimization specialist. Compare this candidate's resume against the provided job description. Return ONLY valid JSON with no markdown.

Return this exact schema:
{
  "overall": <number 0-100>,
  "categories": {
    "Skills Match": { "earned": <number>, "max": 10, "pct": <number> },
    "Experience Match": { "earned": <number>, "max": 10, "pct": <number> },
    "Education Match": { "earned": <number>, "max": 5, "pct": <number> },
    "Keyword Density": { "earned": <number>, "max": 10, "pct": <number> }
  },
  "matchedSkills": ["<skill found in both>", ...],
  "missingSkills": ["<skill in JD but not resume>", ...],
  "recommendations": ["<actionable suggestion>", ...],
  "meta": {
    "jdWordCount": <number>,
    "resumeWordCount": <number>,
    "keywordOverlap": <number>
  }
}

Rules:
- Score each category realistically (0-100% within its max weight)
- matchedSkills: technologies, tools, or concepts that appear in both
- missingSkills: key requirements in the JD that are absent from the resume (max 20)
- recommendations: specific, actionable suggestions to improve alignment (max 8)
- Be critical — this helps candidates target their resume effectively

Job Description:
${jobDescription}

Resume data:
${JSON.stringify(data, null, 2)}

Raw text length: ${rawText.length} chars
`.trim();
}

function buildFallbackPrompt(jobDescription, rawText) {
  return `
You are an ATS optimization specialist. Compare this resume text against the job description and return ONLY valid JSON.

Return this exact schema:
{
  "overall": <number 0-100>,
  "categories": {
    "Skills Match": { "earned": <number>, "max": 10, "pct": <number> },
    "Experience Match": { "earned": <number>, "max": 10, "pct": <number> },
    "Education Match": { "earned": <number>, "max": 5, "pct": <number> },
    "Keyword Density": { "earned": <number>, "max": 10, "pct": <number> }
  },
  "matchedSkills": ["<skill found in both>", ...],
  "missingSkills": ["<skill in JD but not resume>", ...],
  "recommendations": ["<actionable suggestion>", ...],
  "meta": {
    "jdWordCount": <number>,
    "resumeWordCount": <number>,
    "keywordOverlap": <number>
  }
}

Job Description:
${jobDescription}

Resume Text:
${rawText}
`.trim();
}

async function callAiJdMatch(prompt) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 45000);

  const response = await fetch(AI_URL, {
    method: 'POST',
    signal: controller.signal,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json'
    },
    body: JSON.stringify({
      model: process.env.OPENROUTER_MODEL || process.env.AI_MODEL || 'mixtral-8x7b-32768',
      messages: [
        { role: 'system', content: 'You are a hiring and ATS optimization expert. Return only valid JSON. No markdown. No explanations.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.2,
      max_tokens: 800
    })
  });
  clearTimeout(timeout);

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`OpenRouter JD Match request failed: ${response.status} ${errorText}`);
  }

  const json = await response.json();
  const text = json?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('OpenRouter returned empty JD Match analysis');

  const cleaned = text.replace(/```json/gi, '').replace(/```/g, '').trim();
  return JSON.parse(cleaned);
}

export async function getJdMatch(data = {}, rawText = '', jobDescription = '') {
  const heuristic = heuristicJdMatch(data, rawText, jobDescription);

  if (!apiKey) {
      return heuristic;
    }

    try {
      const prompt = data?.candidateName
        ? buildAiPrompt(data, rawText, jobDescription)
        : buildFallbackPrompt(jobDescription, rawText);
      const aiResult = await callAiJdMatch(prompt);

      return {
        overall: aiResult.overall ?? heuristic.overall,
        categories: aiResult.categories ?? heuristic.categories,
        matchedSkills: aiResult.matchedSkills ?? heuristic.matchedSkills,
        missingSkills: aiResult.missingSkills ?? heuristic.missingSkills,
        recommendations: aiResult.recommendations ?? heuristic.recommendations,
        meta: aiResult.meta ?? heuristic.meta
      };
    } catch (error) {
      console.error('AI JD Match analysis failed, using heuristic:', error.message);
      return heuristic;
    }
}
