import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import helmet from 'helmet';
import morgan from 'morgan';
import express from 'express';
import resumeRoutes from './routes/resumeRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');

const app = express();

app.use(helmet({ crossOriginResourcePolicy: { policy: 'cross-origin' } }));
app.use(morgan('short'));
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173,https://mle-resume-formatter-client.vercel.app').split(',');
app.use(cors({ origin: allowedOrigins }));

app.use(express.json({ limit: '10mb' }));
app.use('/generated', express.static(path.join(serverRoot, 'generated')));
app.use('/api/resumes', resumeRoutes);
app.get('/api/health', (_req, res) => {
  res.json({ ok: true });
});

const port = Number(process.env.PORT || 5050);

async function checkPuppeteer() {
  try {
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox'],
    });
    await browser.close();
    console.log(' Puppeteer available — PDF generation ready');
  } catch {
    console.warn(' Puppeteer not available — PDF generation will fail');
  }
}

function cleanupGeneratedFiles() {
  const dir = path.join(serverRoot, 'generated');
  fs.readdir(dir, (err, files) => {
    if (err) return;
    const cutoff = Date.now() - 24 * 60 * 60 * 1000;
    for (const file of files) {
      if (!/\.(pdf|docx)$/i.test(file)) continue;
      fs.stat(path.join(dir, file), (err, stat) => {
        if (err) return;
        if (stat.mtimeMs < cutoff) {
          fs.unlink(path.join(dir, file), () => {});
        }
      });
    }
  });
}

cleanupGeneratedFiles();

const rateLimitMap = new Map();
const RATE_LIMIT_WINDOW = 60 * 1000;
const RATE_LIMIT_MAX = 10;
app.use('/api/resumes/parse', (req, res, next) => {
  const ip = req.ip || req.connection.remoteAddress || 'unknown';
  const now = Date.now();
  const entry = rateLimitMap.get(ip);
  if (entry) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW) {
      entry.windowStart = now;
      entry.count = 1;
    } else if (entry.count >= RATE_LIMIT_MAX) {
      return res.status(429).json({ error: 'Too many requests. Please wait before trying again.' });
    } else {
      entry.count++;
    }
  } else {
    rateLimitMap.set(ip, { windowStart: now, count: 1 });
  }
  next();
});

setInterval(() => {
  const now = Date.now();
  for (const [ip, entry] of rateLimitMap) {
    if (now - entry.windowStart > RATE_LIMIT_WINDOW * 2) {
      rateLimitMap.delete(ip);
    }
  }
}, 60_000);

// Standardized error handler
app.use((err, _req, res, _next) => {
  console.error('Unhandled error:', err.message);
  if (err.type === 'entity.too.large') {
    return res.status(413).json({
      type: 'validation_error',
      errors: [{ attr: null, code: 'request_too_large', detail: 'Request body too large.' }],
    });
  }
  if (err.code === 'LIMIT_FILE_SIZE') {
    return res.status(413).json({
      type: 'validation_error',
      errors: [{ attr: 'file', code: 'file_too_large', detail: 'File too large. Maximum size is 10MB.' }],
    });
  }
  if (err.message?.includes('Only PDF and DOCX') || err.message?.includes('Unsupported file type')) {
    return res.status(400).json({
      type: 'validation_error',
      errors: [{ attr: 'file', code: 'unsupported_file_type', detail: err.message }],
    });
  }
  res.status(500).json({
    type: 'internal_error',
    errors: [{ attr: null, code: 'internal_error', detail: 'Internal server error.' }],
  });
});

app.listen(port, (err) => {
  if (err) {
    console.error('Failed to start server:', err.message);
    process.exit(1);
  }
  console.log(`Server listening on http://localhost:${port}`);
  checkPuppeteer();
});
