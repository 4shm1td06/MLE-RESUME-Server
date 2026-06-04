import 'dotenv/config';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import cors from 'cors';
import express from 'express';
import resumeRoutes from './routes/resumeRoutes.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const serverRoot = path.resolve(__dirname, '..');

const app = express();
app.use(cors());

app.use(express.json({ limit: '10mb' }));
app.use('/generated', express.static(path.join(serverRoot, 'generated')));
app.use('/api/resumes', resumeRoutes);
app.get('/api/health', (_req, res) => {
  res.json({ ok: true, aiConfigured: Boolean(process.env.OPENROUTER_API_KEY?.trim()) });
});

const port = Number(process.env.PORT || 5050);

async function checkPuppeteer() {
  try {
    const puppeteer = await import('puppeteer');
    const browser = await puppeteer.launch({
      headless: true,
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    await browser.close();
    console.log(' Puppeteer available — PDF generation ready');
  } catch {
    console.warn(' Puppeteer not available — PDF generation will fail');
  }
}

function cleanupGeneratedFiles() {
  const generatedDir = path.join(serverRoot, 'generated');
  if (!fs.existsSync(generatedDir)) return;
  const cutoff = Date.now() - 24 * 60 * 60 * 1000;
  for (const file of fs.readdirSync(generatedDir)) {
    if (!/\.(pdf|docx)$/i.test(file)) continue;
    const filePath = path.join(generatedDir, file);
    try {
      const stat = fs.statSync(filePath);
      if (stat.mtimeMs < cutoff) {
        fs.unlinkSync(filePath);
      }
    } catch { /* skip */ }
  }
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
      rateLimitMap.set(ip, { windowStart: now, count: 1 });
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

app.listen(port, () => {
  console.log(`Server listening on http://localhost:${port}`);
  checkPuppeteer();

  const PING_INTERVAL = 30_000;
  const PING_URL = 'https://www.google.com';
  console.log(`Starting keep-alive ping to ${PING_URL} every ${PING_INTERVAL / 1000}s`);
  setInterval(async () => {
    try {
      await fetch(PING_URL, { signal: AbortSignal.timeout(10_000) });
    } catch { /* ignore */ }
  }, PING_INTERVAL);
});
