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
import { grammarFix } from '../services/grammarFix.js';
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

  const techFromProjects = (affinda.projects || []).map(p => ({
    role: p.title || '',
    duration: p.dateRange || '',
    contributions: p.highlights || [],
    technologies: p.technologies || [],
    client: p.organization || '',
  }));

  const techFromWork = (affinda.workExperience || []).map(w => ({
    role: w.jobTitle || '',
    duration: w.dateRange || '',
    contributions: w.contributions || [],
    technologies: [],
    client: w.organization || '',
  }));

  const technicalExperience = [...techFromProjects, ...techFromWork];

  return {
    candidateName: affinda.candidateName?.fullName || '',
    candidateInitials: (affinda.candidateName?.fullName || '').split(/\s+/).map(p => p[0] || '').join('').toUpperCase(),
    title: firstWork.role || '',
    phone: affinda.phoneNumber?.[0] || '',
    email: affinda.email?.[0] || '',
    linkedin: (affinda.websites || []).find(w => w.type === 'linkedin')?.url || '',
    location: affinda.location?.formatted || '',
    totalExperience: affinda.totalYearsExperience || '',
    currentCompany: firstWork.company || '',
    currentDesignation: firstWork.role || '',
    noticePeriod: '',
    currentCtc: '',
    expectedCtc: '',
    highestQualification: affinda.education?.[0]?.accreditation || '',
    professionalSummary: affinda.summary ? [affinda.summary] : [],
    expertise: [],
    domainExperience: [],
    toolsAndPlatforms: [],
    educationalQualification: (affinda.education || []).map(e =>
      [e.accreditation, e.organization].filter(Boolean).join(' - ')
    ),
    skillGroups: [{ title: 'Skills', items: affinda.skills || [] }],
    workHistory,
    technicalExperience,
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

// -------------------------------------------------------
// Legacy formatter endpoints (backward compatible)
// -------------------------------------------------------

export async function parseResumeController(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Resume file is required.' });
    }

    const extractedText = await extractTextFromResume({
      filePath: req.file.path,
      mimeType: req.file.mimetype,
    });

    const { data: affindaData } = await parseResumeText(extractedText);
    const legacyData = affindaToMleSchema(affindaData);

    return res.json({
      success: true,
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
    const firstName = (data.candidateName || '').split(/\s+/)[0] || 'resume';
    const dateStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '');
    const fileName = `${firstName}_${dateStr}.pdf`;
    const html = buildResumeHtml(data);
    const [pdfBuffer, atsScore] = await Promise.all([
      generatePdf({ html }),
      getAtsScore(data, rawText).catch(() => null),
    ]);

    res.set('Content-Type', 'application/pdf');
    res.set('Content-Disposition', `attachment; filename="${fileName}"`);
    if (atsScore) {
      try {
        res.set('X-ATS-Score', encodeURIComponent(JSON.stringify(atsScore)));
      } catch { /* header value not encodable */ }
    }
    return res.send(pdfBuffer);
  } catch (error) {
    console.error('PDF generation error:', error);
    return res.status(500).json({ error: error.message || 'Failed to generate PDF.', details: error.stack || String(error) });
  }
}

export async function generateDocxController(req, res) {
  try {
    const data = normalizeResume(req.body || {}, { verbatim: true });
    const firstName = (data.candidateName || '').split(/\s+/)[0] || 'resume';
    const dateStr = new Date().toLocaleDateString('en-GB').replace(/\//g, '');
    const fileName = `${firstName}_${dateStr}.docx`;
    const buffer = await buildFromTemplate(data);
    res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document');
    res.set('Content-Disposition', `attachment; filename="${fileName}"`);
    return res.send(buffer);
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Failed to generate DOCX.' });
  }
}

export async function grammarFixController(req, res) {
  try {
    const data = normalizeResume(req.body?.resumeData || {});
    const result = await grammarFix(data);
    return res.json({ success: true, fixedData: result.data });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Failed to fix grammar.' });
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
