import { heuristicParseResume } from './resumeHeuristics.js';
import { normalizeToAffindaSchema } from '../utils/affindaSchema.js';
import { postProcessResume } from '../utils/postProcess.js';
import JSON5 from 'json5';


const apiKey = (process.env.OPENROUTER_API_KEY || process.env.GROQ_API_KEY)?.trim();
const AI_URL = process.env.AI_API_URL || 'https://api.groq.com/openai/v1/chat/completions';

function buildAiPrompt(rawText) {
  return `Extract resume data as JSON. Rules:
1. Extract exact text, do NOT paraphrase or rewrite.
2. For projects: copy each bullet point into highlights[] as written.
3. Skills: group them by category (e.g. Operating Systems, Cloud, Networking, Tools).
4. Work experience: each role is a separate entry; copy bullet points into highlights[].
5. Education: each degree is a separate entry.
6. Certifications: exact names.
7. Name: full name as written.
8. Summary: copy the entire professional summary section.
9. Key achievements: copy each key achievement / accomplishment bullet point into achievements[].

Schema: candidateName{fullName}, email[], phoneNumber[], location{formatted}, summary, skills[{category,items[]}], workExperience[{jobTitle,organization,dateRange,highlights[]}], education[{accreditation,organization,dateRange}], certifications[], projects[{title,technologies[],highlights[]}], achievements[]

Text:
${rawText}`.trim();
}

async function callAiParser(prompt, attempt = 1, maxRetries = 3) {
  const timeoutMs = 45000 + (attempt - 1) * 10000;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);

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
        { role: 'system', content: 'You are a resume parser. Return only valid JSON. No markdown. No explanations.' },
        { role: 'user', content: prompt }
      ],
      temperature: 0.1,
      max_tokens: 8192
    })
  });
  clearTimeout(timeout);

  if (response.status === 429 && attempt <= maxRetries) {
    const delay = Math.min(2000 * Math.pow(2, attempt), 15000);
    console.error(`Rate limited (attempt ${attempt}/${maxRetries}), retrying in ${delay}ms...`);
    await new Promise(r => setTimeout(r, delay));
    return callAiParser(prompt, attempt + 1, maxRetries);
  }

  if (!response.ok) {
    const errorText = await response.text().catch(() => '');
    throw new Error(`OpenRouter parsing request failed: ${response.status} ${errorText}`);
  }

  const json = await response.json();
  const text = json?.choices?.[0]?.message?.content || '';
  if (!text) throw new Error('OpenRouter returned empty parsing result');

  let jsonStr = text
    .replace(/```json\s*/gi, '')
    .replace(/```/g, '')
    .trim();

  const braceStart = jsonStr.indexOf('{');
  if (braceStart < 0) {
    console.error('AI response: no JSON object found. Raw preview:', text.slice(0, 600));
    throw new Error('No JSON object in AI response');
  }
  jsonStr = jsonStr.slice(braceStart);

  let braceDepth = 0;
  let jsonEnd = -1;
  for (let i = 0; i < jsonStr.length; i++) {
    if (jsonStr[i] === '{') braceDepth++;
    else if (jsonStr[i] === '}') {
      braceDepth--;
      if (braceDepth === 0) { jsonEnd = i; break; }
    }
  }
  if (jsonEnd < 0) {
    console.error('AI response JSON truncated (unclosed braces). Raw preview:', text.slice(0, 600));
    throw new Error('Truncated JSON in AI response (no closing brace)');
  }
  jsonStr = jsonStr.slice(0, jsonEnd + 1);

  const cleaned = jsonStr
    .replace(/\,\s*\]/g, ']')
    .replace(/\,\s*\}/g, '}')
    .trim();

  function tryParse(s) {
    try { return JSON.parse(s); } catch { try { return JSON5.parse(s); } catch { return null; } }
  }

  const ascii = cleaned.replace(/[^\x20-\x7E]+/g, '');
  let parsed = tryParse(cleaned) || tryParse(ascii);

  if (!parsed) {
    console.error('AI response could not be parsed after cleaning. Raw JSON:', jsonStr.slice(0, 600));
    throw new Error('Failed to parse AI response as JSON');
  }


  const isEmpty = !parsed.skills?.length && !parsed.workExperience?.length && !parsed.education?.length && !parsed.certifications?.length;
  const hasSwappedFields = (parsed.workExperience || []).some(w => {
    const title = (w.jobTitle || '').trim();
    const org = (w.organization || '').trim();
    return (!title || title === '—' || title === '-') && /engineer|developer|manager|analyst|intern/i.test(org);
  });

  if (attempt <= maxRetries && (isEmpty || hasSwappedFields)) {
    const delay = Math.min(2000 * Math.pow(2, attempt), 15000);
    await new Promise(r => setTimeout(r, delay));
    return callAiParser(prompt, attempt + 1, maxRetries);
  }

  return parsed;
}

export async function parseResumeText(extractedText = '') {
  let data;
  let source;

  function scoreData(d) {
    return (d.skills?.length || 0) + (d.projects?.length || 0) + (d.workExperience || []).filter(w => w.organization && w.jobTitle && w.jobTitle !== '—').length + (d.education?.length || 0);
  }

  if (apiKey) {
    const prompt = buildAiPrompt(extractedText);
    for (let attempt = 0; attempt < 2; attempt++) {
      try {
        if (attempt > 0) await new Promise(r => setTimeout(r, 2000));
        const raw = await callAiParser(prompt);
        const candidate = normalizeToAffindaSchema(raw);
        if (!data || scoreData(candidate) > scoreData(data)) {
          data = candidate;
          source = 'ai';
        }
        if (data.skills?.length && data.workExperience?.some(w => w.organization && w.jobTitle && w.jobTitle !== '—')) break;
      } catch (error) {
        console.error(`AI attempt ${attempt + 1} failed:`, error.message);
      }
    }
    if (!data) {
      throw new Error('AI parsing failed after 2 attempts');
    }
  } else {
    source = 'heuristic';
    data = normalizeToAffindaSchema(heuristicParseResume(extractedText));
  }

  data = postProcessResume(data, extractedText, source);

  return { data, source };
}
