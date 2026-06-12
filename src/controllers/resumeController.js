import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { fileURLToPath } from 'url';
import { extractTextFromResume } from '../services/extractTextFromResume.js';
import { parseResumeText } from '../services/parseResumeText.js';
import { generatePdf } from '../services/generatePdf.js';
import { buildFromTemplate } from '../services/docxTemplateBuilder.js';
import { getAtsScore } from '../services/atsScore.js';
import { getJdMatch } from '../services/jdMatch.js';
import { buildResumeHtml } from '../templates/mleTemplate.js';
import { normalizeResume } from '../utils/schema.js';
import { normalizeToAffindaSchema } from '../utils/affindaSchema.js';
import { computeConfidence } from '../utils/confidence.js';
import {
  createDocumentId,
  markProcessing,
  markReady,
  markFailed,
  getDocument,
  listDocuments,
  deleteDocument,
} from '../services/documentStore.js';

function affindaToMleSchema(affinda) {
  // Fix swapped company/role when AI puts title in org and org in title
  const fixWorkEntry = (w) => {
    let company = w?.organization || '';
    let role = w?.jobTitle || '';
    if ((!role || role === '—' || role === '-') && company) {
      role = company;
      company = '';
    }
    return { company, role, duration: (w?.dateRange || '') };
  };

  const workHistory = (affinda.workExperience || []).map(fixWorkEntry);
  const firstWork = workHistory[0] || {};

  // Filter out AI placeholder entries with no real content
  function hasProjectData(p) {
    return p && (
      (p.title || p.name || p.projectName || '').trim().length > 1 ||
      (Array.isArray(p.highlights) && p.highlights.some(h => h.trim().length > 0)) ||
      (Array.isArray(p.contributions) && p.contributions.some(c => c.trim().length > 0)) ||
      (Array.isArray(p.technologies) && p.technologies.some(t => t.trim().length > 0))
    );
  }

  const techFromProjects = (affinda.projects || [])
    .filter(hasProjectData)
    .map(p => ({
      role: p.title || p.name || p.projectName || '',
      duration: p.dateRange || '',
      contributions: p.highlights || p.contributions || [],
      technologies: p.technologies || [],
      client: p.organization || '',
    }));

  const techFromWork = (affinda.workExperience || [])
    .map(w => ({
      role: w.jobTitle || '',
      duration: w.dateRange || '',
      contributions: w.contributions || [],
      technologies: [],
      client: w.organization || '',
    }))
    .filter(b => {
      const t = (b.role || '').trim();
      return t.length > 0 && t !== '—' && t !== '-';
    });
function deriveProjectTitle(contribution) {
  let text = contribution.trim();
  // Strip all leading verb phrases
  for (const pattern of [/^Responsible\s+for\s+/i, /^Carrying\s+out\s+/i, /^Handling\s+(?:various\s+)?/i, /^Leading\s+(?:and\s+Managing\s+|the\s+)?/i, /^Managing\s+/i, /^Working\s+(?:on\s+)?/i, /^Gathering\s+/i, /^Worked\s+on\s+/i]) {
    while (pattern.test(text)) text = text.replace(pattern, '');
  }
  // Client project name pattern
  const clientProj = text.match(/^([A-Z][a-zA-Z]+)\s+is\s+gearing\s+up\s+towards\s+(.+?)\s+from\s/);
  if (clientProj) return (clientProj[2].trim() + ' Migration').replace(/  /g, ' ');
  // Extract key content words
  const stop = new Set(['the','a','an','of','in','for','to','with','on','at','by','from','and','various','different','this','that','their','its','all','into','upon','about','after','before','between','through','during','without','within','along','like','out','new']);
  const words = text.split(/\s+/)
    .map(w => w.replace(/^[^a-zA-Z0-9]+/, '').replace(/[^a-zA-Z0-9]+$/, ''))
    .filter(w => w.length > 1 && !stop.has(w.toLowerCase()));
  let title = words.slice(0, 4).join(' ');
  if (title) title = title.charAt(0).toUpperCase() + title.slice(1);
  return title || text.slice(0, 40);
}

  // Extract individual project entries from work contributions
  const projectExperience = techFromProjects.length > 0
    ? [...techFromProjects]
    : techFromWork.flatMap(entry =>
        (entry.contributions || []).map(c => {
          const derived = deriveProjectTitle(c, entry.role);
          return {
            title: derived,
            role: derived,
            duration: entry.duration,
            contributions: [c],
            technologies: [],
            client: entry.client,
          };
        })
      );

  const technicalExperience = techFromWork.length > 0
    ? techFromWork
    : [...techFromProjects];

  // Deduplicate workHistory and technicalExperience by duration
  const seenDurations = new Set();
  const dedupedWorkHistory = workHistory.filter(w => {
    const key = (w.duration || '').trim().toLowerCase();
    if (!key || seenDurations.has(key)) return false;
    seenDurations.add(key);
    return true;
  });

  const seenTeDurations = new Set();
  const dedupedTechnicalExperience = technicalExperience.filter(t => {
    const key = (t.duration || '').trim().toLowerCase();
    if (!key || seenTeDurations.has(key)) return false;
    seenTeDurations.add(key);
    return true;
  });

  // Extract totalExperience from summary as fallback
  let totalExperience = affinda.totalYearsExperience || '';
  if (!totalExperience && affinda.summary) {
    const expMatch = affinda.summary.match(/(\d+\+?\s*(?:yrs?\.|years?))\s*(?:of\s+)?experience/i);
    if (expMatch) totalExperience = expMatch[1];
  }

  // Extract expertise areas from skill categories and summary keywords
  const expertise = [];
  if (affinda.summary) {
    const sapMatches = affinda.summary.match(/SAP\s+[A-Za-z0-9/]+/g);
    if (sapMatches) expertise.push(...sapMatches.map(s => s.trim()).filter((v, i, a) => a.indexOf(v) === i));
  }

  // Populate toolsAndPlatforms from skill groups with tool-like categories
  const toolsAndPlatforms = [];
  if (affinda.skills) {
    for (const group of affinda.skills) {
      const cat = (group.category || '').toLowerCase();
      if (cat === 'tools' || cat === 'platforms' || cat === 'tools & platforms') {
        toolsAndPlatforms.push(...(group.items || []));
      }
    }
  }

  return {
    candidateName: affinda.candidateName?.fullName || '',
    candidateInitials: (affinda.candidateName?.fullName || '').split(/\s+/).map(p => p[0] || '').join('').toUpperCase(),
    title: firstWork.role || '',
    phone: affinda.phoneNumber?.[0] || '',
    email: affinda.email?.[0] || '',
    linkedin: (affinda.websites || []).find(w => w.type === 'linkedin')?.url || '',
    location: affinda.location?.formatted || '',
    totalExperience,
    currentCompany: firstWork.company || '',
    currentDesignation: firstWork.role || '',
    noticePeriod: '',
    currentCtc: '',
    expectedCtc: '',
    highestQualification: affinda.education?.[0]?.accreditation || '',
    professionalSummary: affinda.summary ? [affinda.summary] : [],
    expertise,
    domainExperience: [],
    toolsAndPlatforms,
    educationalQualification: (affinda.education || []).map(e =>
      [e.accreditation, e.organization].filter(Boolean).join(' - ')
    ),
    skillGroups: (affinda.skills || []).map(s => ({ title: s.category || 'Skills', items: s.items || [] })),
    workHistory: dedupedWorkHistory,
    technicalExperience: dedupedTechnicalExperience,
    projectExperience,
    certifications: affinda.certifications || [],
    keyAchievements: affinda.achievements || [],
    languagesKnown: (affinda.languages || []).map(l => l.name).filter(Boolean),
    additionalSections: [],
    confidentialLabel: 'Confidential',
    maskPersonalDetails: false,
  };
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '../..');
const generatedDir = path.join(serverRoot, 'generated');
fs.mkdirSync(generatedDir, { recursive: true });

function buildBaseName(name) {
  const parts = (name || '').trim().split(/\s+/).filter(Boolean);
  if (!parts.length) return 'MLE_Resume';
  const first = parts[0];
  const lastName = parts.length > 1 ? parts[parts.length - 1] : '';
  const firstName = first.charAt(0).toUpperCase() + first.slice(1).toLowerCase();
  if (!lastName) return `MLE_${firstName}`;
  const lastInitial = lastName.charAt(0).toUpperCase();
  return `MLE_${firstName}_${lastInitial}`;
}

// -------------------------------------------------------
// Legacy formatter endpoints (backward compatible)
// -------------------------------------------------------

function parseAssignmentsProjects(rawText) {
  const entries = [];
  const sections = rawText.split(/(?=Project Details:)/);
  for (const section of sections) {
    if (!section.includes('Project Details:')) continue;
    const company = (section.match(/^Company\s+(.+)/m) || [])[1] || '';
    const duration = (section.match(/^\s*Duration\s+(.+)/m) || [])[1] || (section.match(/^\s*Period\s+(.+)/m) || [])[1] || '';
    const client = (section.match(/^\s*Customer\s+(.+)/m) || [])[1] || (section.match(/^\s*Client\s+Name\s+(.+)/m) || [])[1] || '';
    const team = (section.match(/^Team\s+(.+)/m) || [])[1] || '';
    const role = (section.match(/^Role\s+(?!&)(.+)/m) || [])[1] || (section.match(/^Position\s+(.+)/m) || [])[1] || '';
    const project = (section.match(/^Title\s+(.+)/m) || [])[1] || (section.match(/^Project\s+(?!Details\b|Description\b|titles?\b)([^\n\r\t]+)/m) || [])[1] || '';
    // Extract responsibilities / bullet points
    const respMatch = section.match(/(?:Role\s*)?&?\s*Responsibilities:?\s*(?:\([^)]+\))?\s*\n([\s\S]*?)(?=\n\n|\nProject Details:|\nAcademic\s|\nPersonal\s|\n$)/);
    const responsibilities = respMatch
      ? respMatch[1].split('\n').map(l => l.replace(/^[•●▪◦❖\-\*]\s*/, '').trim()).filter(Boolean)
      : [];
    if (!role && !company && !client) continue;
    const roleClean = role.replace(/^Working in capacity of\s+|^Worked as\s+/i, '').trim();
    const title = (project || roleClean).trim();
    if (!title) continue;
    const durationClean = duration
      .replace(/'/g, '').replace(/\btill\b/i, '-').replace(/\btil\b/i, '-')
      .replace(/\bnow\b/i, 'Present').replace(/\s+/g, ' ').trim();
    entries.push({
      title,
      role: title,
      duration: durationClean,
      contributions: responsibilities,
      technologies: [],
      client: (client || company).trim(),
    });
  }
  return entries;
}

export async function parseResumeController(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Resume file is required.' });
    }

    const extractedText = await extractTextFromResume({
      filePath: req.file.path,
      mimeType: req.file.mimetype,
    });

    const { data: affindaData, source } = await parseResumeText(extractedText);
    const legacyData = affindaToMleSchema(affindaData);

    // Enrich projectExperience with entries from Assignments/Projects section
    const assignmentProjects = parseAssignmentsProjects(extractedText);
    if (assignmentProjects.length > 0) {
      legacyData.projectExperience = assignmentProjects;
    }

    return res.json({
      success: true,
      source,
      parsedData: legacyData,
      extractedText,
      message: 'Resume parsed successfully.',
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Failed to parse resume.' });
  } finally {
    if (req.file?.path) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Failed to clean up uploaded file:', err.message);
      });
    }
  }
}

export async function generatePdfController(req, res) {
  try {
    const data = normalizeResume(req.body || {}, { verbatim: true });
    const rawText = req.body?.rawText || '';
    const fileName = `${buildBaseName(data.candidateName)}.pdf`;
    const html = buildResumeHtml(data);
    const [pdfBuffer, atsScore] = await Promise.all([
      generatePdf({ html }),
      getAtsScore(data, rawText).catch(() => null),
    ]);

    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="${fileName}"`);
    res.set('X-Debug-Name', data.candidateName || '(empty)');
    if (atsScore) {
      try {
        res.set('X-ATS-Score', encodeURIComponent(JSON.stringify(atsScore)));
      } catch { /* header value not encodable */ }
    }
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF generation error:', error);
    const body = req.body || {};
    return res.status(500).json({ error: error.message || 'Failed to generate PDF.', details: error.stack || String(error), receivedName: body.candidateName || '(empty or missing)' });
  }
}

export async function generateDocxController(req, res) {
  try {
    const data = normalizeResume(req.body || {}, { verbatim: true });
    const fileName = `${buildBaseName(data.candidateName)}.docx`;
    const buffer = await buildFromTemplate(data);
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.set('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(buffer);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Failed to generate DOCX.' });
  }
}

export async function atsScoreController(req, res) {
  try {
    const data = normalizeResume(req.body?.resumeData || {});
    const rawText = req.body?.rawText || '';
    const score = await getAtsScore(data, rawText);
    return res.json({ success: true, ...score });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Failed to compute ATS score.' });
  }
}

export async function jdMatchController(req, res) {
  try {
    const data = normalizeResume(req.body?.resumeData || {});
    const rawText = req.body?.rawText || '';
    const jobDescription = req.body?.jobDescription || '';
    if (!jobDescription.trim()) {
      return res.status(400).json({ error: 'Job description is required.' });
    }
    const result = await getJdMatch(data, rawText, jobDescription);
    return res.json({ success: true, ...result });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Failed to compute JD match.' });
  }
}

// -------------------------------------------------------
// V3 Affinda-compatible API endpoints
// -------------------------------------------------------

export async function createDocumentController(req, res) {
  const identifier = createDocumentId();
  const fileName = req.file?.originalname || req.body?.fileName || null;
  const mimeType = req.file?.mimetype || req.body?.mimeType || null;

  try {
    markProcessing(identifier, fileName, mimeType);

    if (!req.file && !req.body?.url && !req.body?.data) {
      markFailed(identifier, 'No file, URL, or data provided.');
      return res.status(400).json({
        type: 'validation_error',
        errors: [{ attr: 'file', code: 'required', detail: 'A file, URL, or data is required.' }],
      });
    }

    let extractedText = '';

    if (req.file) {
      extractedText = await extractTextFromResume({
        filePath: req.file.path,
        mimeType: req.file.mimetype,
      });
    } else if (req.body?.url) {
      const resp = await fetch(req.body.url);
      if (!resp.ok) throw new Error(`Failed to fetch URL: ${resp.status}`);
      const buffer = Buffer.from(await resp.arrayBuffer());
      const tmpPath = path.join(serverRoot, 'uploads', `url-${identifier}`);
      fs.writeFileSync(tmpPath, buffer);
      extractedText = await extractTextFromResume({
        filePath: tmpPath,
        mimeType: resp.headers.get('content-type') || 'application/pdf',
      });
      fs.unlink(tmpPath, () => {});
    } else if (req.body?.data) {
      extractedText = req.body.data;
    }

    const { data: parsed, source } = await parseResumeText(extractedText);
    const confidence = computeConfidence(parsed, extractedText, source);

    markReady(identifier, parsed, confidence, extractedText, {
      wordCount: extractedText.split(/\s+/).length,
      charCount: extractedText.length,
      ocrConfidence: parsed._ocrConfidence ?? null,
    });

    const compact = req.query?.compact === 'true';

    return res.status(201).json({
      data: parsed,
      confidence,
      meta: {
        identifier,
        fileName,
        mimeType,
        ready: true,
        readyDt: new Date().toISOString(),
        failed: false,
        error: null,
        createdDt: getDocument(identifier)?.createdDt,
        ...(compact ? {} : { rawText: extractedText }),
      },
    });
  } catch (error) {
    console.error('Create document failed:', error);
    markFailed(identifier, error.message);
    return res.status(500).json({
      type: 'processing_error',
      errors: [{ attr: null, code: 'processing_failed', detail: error.message }],
    });
  } finally {
    if (req.file?.path) {
      fs.unlink(req.file.path, (err) => {
        if (err) console.error('Failed to clean up uploaded file:', err.message);
      });
    }
  }
}

export async function getDocumentController(req, res) {
  const { identifier } = req.params;
  const doc = getDocument(identifier);

  if (!doc) {
    return res.status(404).json({
      type: 'not_found',
      errors: [{ attr: null, code: 'document_not_found', detail: `Document ${identifier} not found.` }],
    });
  }

  const compact = req.query?.compact === 'true';

  return res.json({
    data: doc.data,
    confidence: doc.confidence,
    meta: {
      identifier: doc.identifier,
      fileName: doc.fileName,
      ready: doc.ready,
      readyDt: doc.readyDt,
      failed: doc.failed,
      error: doc.error,
      createdDt: doc.createdDt,
      status: doc.status,
      ...(compact ? {} : { rawText: doc.rawText }),
    },
  });
}

export async function listDocumentsController(req, res) {
  const offset = parseInt(req.query?.offset, 10) || 0;
  const limit = Math.min(parseInt(req.query?.limit, 10) || 20, 100);

  const result = listDocuments({ offset, limit });

  return res.json(result);
}

export async function deleteDocumentController(req, res) {
  const { identifier } = req.params;
  const doc = getDocument(identifier);

  if (!doc) {
    return res.status(404).json({
      type: 'not_found',
      errors: [{ attr: null, code: 'document_not_found', detail: `Document ${identifier} not found.` }],
    });
  }

  deleteDocument(identifier);
  return res.json({ message: `Document ${identifier} deleted.` });
}
