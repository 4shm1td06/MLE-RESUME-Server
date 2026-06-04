import 'dotenv/config';
import { heuristicParseResume } from './resumeHeuristics.js';
import { normalizeResume } from '../utils/schema.js';

const apiKey = process.env.OPENROUTER_API_KEY?.trim();
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const MODELS = ['openrouter/auto'];

function extractJson(text = '') {
  const cleaned = String(text)
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();

  return JSON.parse(cleaned);
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function isNonEmptyString(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isNonEmptyArray(value) {
  return Array.isArray(value) && value.some((item) => {
    if (typeof item === 'string') return item.trim().length > 0;
    if (Array.isArray(item)) return item.length > 0;
    if (item && typeof item === 'object') return Object.values(item).some((v) => {
      if (typeof v === 'string') return v.trim().length > 0;
      if (Array.isArray(v)) return v.length > 0;
      return Boolean(v);
    });
    return Boolean(item);
  });
}

function chooseString(aiValue, fallbackValue) {
  return isNonEmptyString(aiValue) ? aiValue.trim() : (fallbackValue ?? '');
}

function chooseArray(aiValue, fallbackValue) {
  return isNonEmptyArray(aiValue) ? aiValue : (Array.isArray(fallbackValue) ? fallbackValue : []);
}

function mergeResumeData(fallback, parsed) {
  const ai = normalizeResume(parsed || {});
  const fb = normalizeResume(fallback || {});

  return normalizeResume({
    candidateName: chooseString(ai.candidateName, fb.candidateName),
    candidateInitials: chooseString(ai.candidateInitials, fb.candidateInitials),
    title: chooseString(ai.title, fb.title),
    phone: chooseString(ai.phone, fb.phone),
    email: chooseString(ai.email, fb.email),
    location: chooseString(ai.location, fb.location),
    linkedin: chooseString(ai.linkedin, fb.linkedin),
    totalExperience: chooseString(ai.totalExperience, fb.totalExperience),
    currentCompany: chooseString(ai.currentCompany, fb.currentCompany),
    currentDesignation: chooseString(ai.currentDesignation, fb.currentDesignation),
    noticePeriod: chooseString(ai.noticePeriod, fb.noticePeriod),
    currentCtc: chooseString(ai.currentCtc, fb.currentCtc),
    expectedCtc: chooseString(ai.expectedCtc, fb.expectedCtc),
    highestQualification: chooseString(ai.highestQualification, fb.highestQualification),
    dateOfBirth: chooseString(ai.dateOfBirth, fb.dateOfBirth),
    nationality: chooseString(ai.nationality, fb.nationality),

    languagesKnown: chooseArray(ai.languagesKnown, fb.languagesKnown),
    domainExperience: chooseArray(ai.domainExperience, fb.domainExperience),
    toolsAndPlatforms: chooseArray(ai.toolsAndPlatforms, fb.toolsAndPlatforms),
    keyAchievements: chooseArray(ai.keyAchievements, fb.keyAchievements),
    professionalSummary: chooseArray(ai.professionalSummary, fb.professionalSummary),
    expertise: chooseArray(ai.expertise, fb.expertise),
    educationalQualification: chooseArray(ai.educationalQualification, fb.educationalQualification),
    skillGroups: chooseArray(ai.skillGroups, fb.skillGroups),
    workHistory: chooseArray(ai.workHistory, fb.workHistory),
    technicalExperience: chooseArray(ai.technicalExperience, fb.technicalExperience),
    projects: chooseArray(ai.projects, fb.projects),
    certifications: chooseArray(ai.certifications, fb.certifications),
    additionalSections: chooseArray(ai.additionalSections, fb.additionalSections),

    confidentialLabel: chooseString(ai.confidentialLabel, fb.confidentialLabel || 'Confidential'),
    maskPersonalDetails:
      typeof ai.maskPersonalDetails === 'boolean'
        ? ai.maskPersonalDetails
        : typeof fb.maskPersonalDetails === 'boolean'
          ? fb.maskPersonalDetails
          : true
  });
}

async function requestOnce(prompt, model) {
  const response = await fetch(OPENROUTER_URL, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${apiKey}`,
      'Content-Type': 'application/json',
      'HTTP-Referer': process.env.OPENROUTER_SITE_URL || 'http://localhost:5050',
      'X-Title': process.env.OPENROUTER_APP_NAME || 'MLE Resume Formatter'
    },
    body: JSON.stringify({
      model,
      messages: [
        {
          role: 'system',
          content:
            'You convert raw resume text into strict JSON for an MLE formatted resume. Write in a natural human tone with varied sentence structure. Avoid overused phrases like "proven track record", "seasoned professional", or "results-driven". Use concrete, specific language. Return only valid JSON. No markdown. No explanations. Do not invent facts.'
        },
        { role: 'user', content: prompt }
      ],
      temperature: 0.5
    })
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    const err = new Error(`OpenRouter request failed: ${response.status} ${errorText}`);
    err.status = response.status;
    throw err;
  }

  const json = await response.json();
  const text = json?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('OpenRouter returned an empty response');
  return { text, raw: json, model: json?.model || model };
}

async function callOpenRouterWithFallbacks(prompt) {
  let lastError = null;

  for (const model of MODELS) {
    try {
      return await requestOnce(prompt, model);
    } catch (error) {
      lastError = error;

      if (error?.status === 429) {
        await sleep(1500);
        try {
          return await requestOnce(prompt, model);
        } catch (retryError) {
          lastError = retryError;
        }
      }
    }
  }

  throw lastError || new Error('All OpenRouter models failed');
}

export async function parseResumeText(extractedText = '') {
  const fallback = normalizeResume(heuristicParseResume(extractedText));

  if (!apiKey) {
    return {
      data: fallback,
      meta: {
        apiUsed: false,
        fallbackUsed: true,
        reason: 'OPENROUTER_API_KEY missing',
        provider: 'fallback_only',
        model: null
      }
    };
  }

  const prompt = `
Return only valid JSON with this schema:
{
  "candidateName": "",
  "candidateInitials": "",
  "title": "",
  "phone": "",
  "email": "",
  "location": "",
  "linkedin": "",
  "totalExperience": "",
  "currentCompany": "",
  "currentDesignation": "",
  "noticePeriod": "",
  "currentCtc": "",
  "expectedCtc": "",
  "highestQualification": "",
  "dateOfBirth": "",
  "nationality": "",
  "languagesKnown": [""],
  "domainExperience": [""],
  "toolsAndPlatforms": [""],
  "keyAchievements": [""],
  "professionalSummary": [""],
  "expertise": [""],
  "educationalQualification": [""],
  "skillGroups": [{"title": "", "items": [""]}],
  "workHistory": [{"company": "Confidential", "role": "", "duration": ""}],
  "technicalExperience": [{"role": "", "company": "", "client": "", "duration": "", "environment": [""], "contributions": [""]}],
  "projects": [{"name": "", "role": "", "duration": "", "technologies": [""], "highlights": [""]}],
  "certifications": [""],
  "additionalSections": [{"title": "", "items": [""]}],
  "confidentialLabel": "Confidential",
  "maskPersonalDetails": true
}
Rules:
- Do not invent facts.
- Keep arrays for bullet-like content.
- candidateInitials should be derived from candidateName when possible.
- Use empty string or empty arrays when data is missing.
- Prefer recruiter-friendly concise wording.
- Write in a natural human tone. Vary sentence structure across bullet points. Avoid clichés like "proven track record", "seasoned professional", or "results-driven". Use concrete, specific language.
- Preserve company as Confidential when the source suggests masking or confidentiality.
- If explicit "Project Experience" is missing, infer projects from employment history, implementation work, rollout work, support projects, migration work, integration work, greenfield work, UAT/testing assignments, SAP assignments, client engagements, and responsibility sections.
- If explicit "Technical Experience" is missing, derive it from project, employment, implementation, support, or responsibility sections.
- Extract certifications whenever certification names appear anywhere in the resume.
- Extract key achievements whenever achievement-like outcomes, savings, improvements, awards, recognitions, or impact statements appear anywhere in the resume.
Resume text:
${extractedText.slice(0, 25000)}
  `.trim();

  try {
    const result = await callOpenRouterWithFallbacks(prompt);
    const parsed = extractJson(result.text);
    const merged = mergeResumeData(fallback, parsed);

    return {
      data: merged,
      meta: {
        apiUsed: true,
        fallbackUsed: false,
        reason: null,
        provider: 'openrouter',
        model: result.model
      }
    };
  } catch (error) {
    console.error(error);

    return {
      data: fallback,
      meta: {
        apiUsed: false,
        fallbackUsed: true,
        reason: error.message || 'OpenRouter parsing failed',
        provider: 'fallback_only',
        model: null
      }
    };
  }
}