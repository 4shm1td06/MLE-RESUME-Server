import 'dotenv/config';
import { heuristicParseResume } from './resumeHeuristics.js';
import { normalizeResume } from '../utils/schema.js';

const apiKey = process.env.OPENROUTER_API_KEY?.trim();
const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';

function extractJson(text = '') {
  const cleaned = String(text)
    .replace(/```json/gi, '')
    .replace(/```/g, '')
    .trim();
  return JSON.parse(cleaned);
}

function pickString(ai, fb) {
  return typeof ai === 'string' && ai.trim() ? ai.trim() : (fb ?? '');
}

function pickArray(ai, fb) {
  if (Array.isArray(ai) && ai.some(Boolean)) return ai;
  return Array.isArray(fb) ? fb : [];
}

function mergeResumeData(fallback, parsed) {
  const ai = normalizeResume(parsed || {});
  const fb = normalizeResume(fallback || {});

  return normalizeResume({
    candidateName: pickString(ai.candidateName, fb.candidateName),
    candidateInitials: pickString(ai.candidateInitials, fb.candidateInitials),
    title: pickString(ai.title, fb.title),
    phone: pickString(ai.phone, fb.phone),
    email: pickString(ai.email, fb.email),
    location: pickString(ai.location, fb.location),
    linkedin: pickString(ai.linkedin, fb.linkedin),
    totalExperience: pickString(ai.totalExperience, fb.totalExperience),
    currentCompany: pickString(ai.currentCompany, fb.currentCompany),
    currentDesignation: pickString(ai.currentDesignation, fb.currentDesignation),
    noticePeriod: pickString(ai.noticePeriod, fb.noticePeriod),
    currentCtc: pickString(ai.currentCtc, fb.currentCtc),
    expectedCtc: pickString(ai.expectedCtc, fb.expectedCtc),
    highestQualification: pickString(ai.highestQualification, fb.highestQualification),
    dateOfBirth: pickString(ai.dateOfBirth, fb.dateOfBirth),
    nationality: pickString(ai.nationality, fb.nationality),
    languagesKnown: pickArray(ai.languagesKnown, fb.languagesKnown),
    domainExperience: pickArray(ai.domainExperience, fb.domainExperience),
    toolsAndPlatforms: pickArray(ai.toolsAndPlatforms, fb.toolsAndPlatforms),
    keyAchievements: pickArray(ai.keyAchievements, fb.keyAchievements),
    professionalSummary: pickArray(ai.professionalSummary, fb.professionalSummary),
    expertise: pickArray(ai.expertise, fb.expertise),
    educationalQualification: pickArray(ai.educationalQualification, fb.educationalQualification),
    skillGroups: pickArray(ai.skillGroups, fb.skillGroups),
    workHistory: pickArray(ai.workHistory, fb.workHistory),
    technicalExperience: pickArray(ai.technicalExperience, fb.technicalExperience),
    projects: pickArray(ai.projects, fb.projects),
    certifications: pickArray(ai.certifications, fb.certifications),
    additionalSections: pickArray(ai.additionalSections, fb.additionalSections),
    confidentialLabel: pickString(ai.confidentialLabel, fb.confidentialLabel || 'Confidential'),
    maskPersonalDetails:
      typeof ai.maskPersonalDetails === 'boolean'
        ? ai.maskPersonalDetails
        : typeof fb.maskPersonalDetails === 'boolean'
          ? fb.maskPersonalDetails
          : true
  });
}

export async function parseResumeText(extractedText = '') {
  const heuristic = normalizeResume(heuristicParseResume(extractedText));

  if (!apiKey) {
    return {
      data: heuristic,
      meta: { apiUsed: false, fallbackUsed: true, reason: 'OPENROUTER_API_KEY missing', provider: 'fallback_only', model: null }
    };
  }

  const prompt = `Extract information from the following resume text and return it as valid JSON matching this schema. Do NOT rewrite, rephrase, paraphrase, or improve any text. Copy the original wording exactly as it appears in the resume. Preserve all phrasing, bullet points, and sentence structure verbatim.

Schema:
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
- CRITICAL: Copy text verbatim from the resume. Do not change any wording.
- Do not invent facts not present in the text.
- candidateInitials should be derived from candidateName when possible.
- Use empty string or empty arrays when data is missing.
- Preserve company as Confidential when the source suggests masking.

Resume text:
${extractedText.slice(0, 25000)}`;

  try {
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
          {
            role: 'system',
            content: 'You extract resume text into JSON. Copy wording verbatim — never rewrite, rephrase, or improve. Return only valid JSON. No markdown. No explanations.'
          },
          { role: 'user', content: prompt }
        ],
        temperature: 0.1
      })
    });

    if (!response.ok) throw new Error(`OpenRouter request failed: ${response.status}`);

    const json = await response.json();
    const text = json?.choices?.[0]?.message?.content || '';
    if (!text) throw new Error('Empty response');

    const parsed = extractJson(text);
    const merged = mergeResumeData(heuristic, parsed);

    return {
      data: merged,
      meta: { apiUsed: true, fallbackUsed: false, reason: null, provider: 'openrouter', model: json?.model || 'openrouter/auto' }
    };
  } catch (error) {
    console.error(error);

    return {
      data: heuristic,
      meta: { apiUsed: false, fallbackUsed: true, reason: error.message, provider: 'fallback_only', model: null }
    };
  }
}