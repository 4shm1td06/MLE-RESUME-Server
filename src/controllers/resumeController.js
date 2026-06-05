import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { extractTextFromResume } from '../services/extractTextFromResume.js';
import { parseResumeText } from '../services/parseResumeText.js';
import { generatePdf } from '../services/generatePdf.js';
import { generateDocx } from '../services/docxBuilder.js';
import { getAtsScore } from '../services/atsScore.js';
import { getJdMatch } from '../services/jdMatch.js';
import { grammarFix } from '../services/grammarFix.js';
import { buildResumeHtml } from '../templates/mleTemplate.js';
import { normalizeResume } from '../utils/schema.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '../..');
const generatedDir = path.join(serverRoot, 'generated');
fs.mkdirSync(generatedDir, { recursive: true });

export async function parseResumeController(req, res) {
  try {
    if (!req.file) {
      return res.status(400).json({ error: 'Resume file is required.' });
    }

    const extractedText = await extractTextFromResume({
      filePath: req.file.path,
      mimeType: req.file.mimetype
    });

    const parsed = await parseResumeText(extractedText);
    const normalized = normalizeResume(parsed.data);

    return res.json({
      success: true,
      parsedData: normalized,
      extractedText,
      meta: parsed.meta,
      message: parsed.meta.apiUsed && !parsed.meta.fallbackUsed
        ? 'Resume parsed successfully with OpenRouter enhancement.'
        : 'Resume parsed successfully using the built-in parser.'
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
    const data = normalizeResume(req.body || {});
    const rawText = req.body?.rawText || '';

    const fileName = `mle-resume-${Date.now()}.pdf`;
    const outputPath = path.join(generatedDir, fileName);

    const html = buildResumeHtml(data);

    const [atsScore] = await Promise.all([
      getAtsScore(data, rawText).catch(() => null),
      generatePdf({ html, outputPath }),
    ]);

    return res.json({
      success: true,
      pdfUrl: `/generated/${fileName}`,
      atsScore,
    });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Failed to generate PDF.' });
  }
}

export async function generateDocxController(req, res) {
  try {
    const data = normalizeResume(req.body || {});
    const fileName = `mle-resume-${Date.now()}.docx`;
    const outputPath = path.join(generatedDir, fileName);
    await generateDocx({ data, outputPath });
    return res.json({ success: true, docxUrl: `/generated/${fileName}` });
  } catch (error) {
    console.error(error);
    return res.status(500).json({ error: error.message || 'Failed to generate DOCX.' });
  }
}

export async function grammarFixController(req, res) {
  try {
    const data = normalizeResume(req.body?.resumeData || {});
    const result = await grammarFix(data);
    return res.json({
      success: true,
      fixedData: result.data,
      provider: result.provider,
      message: result.provider === 'openrouter'
        ? 'Grammar fixed with AI enhancement.'
        : 'Grammar fixed with built-in rules.'
    });
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
