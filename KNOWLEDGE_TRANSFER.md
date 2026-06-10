# MLE Resume Formatter — Knowledge Transfer

## System Architecture

```
┌─────────────────────┐         ┌──────────────────────────────┐
│   Client (Vite/React) │  HTTP   │   Server (Express/Node 22)   │
│   vercel.app         │◄───────►│   render.com                 │
│                      │  CORS   │   Puppeteer · pizzip · sharp │
└─────────────────────┘         └──────────┬───────────────────┘
                                            │
                          ┌─────────────────┼──────────────────────┐
                          │                 │                      │
                     ┌────▼────┐      ┌─────▼─────┐        ┌──────▼─────┐
                     │ Groq AI  │      │ Chromium   │        │ .docx      │
                     │ (LLaMA)  │      │ (Puppeteer)│        │ Template   │
                     └─────────┘      └───────────┘        └────────────┘
```

Two independent deployments:
- **Server**: Node.js Express on Render (via Dockerfile), handles parsing, PDF/DOCX generation
- **Client**: React SPA on Vercel (static), talks to server via CORS

---

## How It Works End-to-End

### 1. Parse Resume
```
Client uploads PDF/DOCX  ──POST──►  Server extracts text (pdf-parse / mammoth)
                                      │
                                      ▼
                                Falls back to OCR (pdftoppm + Tesseract)
                                      │
                                      ▼
                                AI parser via Groq API (LLaMA 4 Scout)
                                      │
                                      ▼
                                Normalizes to MLE schema
                                      │
                                      ▼
                                Returns JSON to client
```

### 2. Generate PDF
```
Client sends edited JSON  ──POST──►  Server builds HTML from template
                                      │
                                      ▼
                                Puppeteer renders HTML → PDF buffer
                                      │
                                      ▼
                                Returns PDF as HTTP attachment download
```

### 3. Generate DOCX
```
Client sends edited JSON  ──POST──►  Server loads template_clean.docx (pizzip)
                                      │
                                      ▼
                                Generates body XML from scratch
                                matching PDF format exactly
                                      │
                                      ▼
                                Injects into template preserving
                                header/footer/watermark/margins
                                      │
                                      ▼
                                Returns DOCX as HTTP attachment download
```

---

## Key Files

### Server (`server/src/`)

| File | Purpose |
|------|---------|
| `index.js` | Express entry — CORS, routes, Puppeteer health check, rate limiting |
| `routes/resumeRoutes.js` | All API routes (v1 + v3 Affinda-compatible) |
| `controllers/resumeController.js` | Request handlers — parse, generate-pdf, generate-docx, ats, jd-match, grammar-fix. Also: V3 CRUD document endpoints |
| `services/extractTextFromResume.js` | Extract raw text from PDF (pdf-parse or OCR via pdftoppm+tesseract) or DOCX (mammoth) |
| `services/parseResumeText.js` | AI parsing via Groq API with retry loop. Brace-matching JSON extraction. Heuristic fallback if no API key |
| `services/generatePdf.js` | Puppeteer: launch Chromium, render HTML to PDF buffer. `Buffer.from()` wrapper for Puppeteer 24.x Uint8Array |
| `services/docxTemplateBuilder.js` | DOCX generation: load `template_clean.docx` via pizzip, generate body XML from scratch (all 10 sections), inject while preserving template structure |
| `services/atsScore.js` | ATS score via AI |
| `services/jdMatch.js` | JD match analysis via AI |
| `services/grammarFix.js` | Grammar fix via AI |
| `services/documentStore.js` | In-memory document store for V3 API |
| `templates/mleTemplate.js` | **PDF HTML/CSS template** — the single source of truth for resume layout. All spacing, fonts, colors, table styles. `buildResumeHtml(data)` returns full HTML string |
| `utils/schema.js` | `normalizeResume()` — normalizes any input JSON to MLE schema. Handles 20+ field aliases, cleans text, deduplicates lists |
| `utils/affindaSchema.js` | Normalize AI output to Affinda-compatible schema |
| `utils/postProcess.js` | Post-processing after AI parse |
| `middleware/auth.js` | Bearer token auth for V3 API |
| `scripts/prepare-template.js` | Run once: converts `template.docx` → `template_clean.docx`, promoting header shapes to proper `word/header1.xml` with correct rIds |

### Client (`client/src/`)

| File | Purpose |
|------|---------|
| `App.jsx` | Main app — file upload, parse/edit form, export buttons, ATS/JD panels |
| `config.js` | `API_BASE_URL` from `VITE_API_URL` env var |
| `utils/mleTemplate.js` | **Client-side PDF preview template** — MUST be kept in sync with `server/src/templates/mleTemplate.js` |
| `components/ResumePreview.jsx` | iframe-based preview, strips `__WATERMARK__` placeholder from HTML |
| `components/ArrayEditor.jsx` | Reusable list editor (summary, expertise, education, etc.) |
| `components/SkillGroupsEditor.jsx` | Category+skills table editor |
| `components/WorkHistoryEditor.jsx` | Company/role/duration table editor |
| `components/TechnicalExperienceEditor.jsx` | Role + bullet points editor |
| `components/ProjectsEditor.jsx` | Project details editor |
| `components/AdditionalSectionsEditor.jsx` | Dynamic section editor for unknown fields |
| `components/AtsScorePanel.jsx` / `AtsScoreCard.jsx` | ATS score display |
| `components/JdMatchPanel.jsx` / `JdMatchCard.jsx` | JD match display |
| `lib/defaultResume.js` | Default empty resume shape |
| `styles.css` | All client styling |

---

## API Endpoints

### v1 (Formatter)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/resumes/parse` | Upload PDF/DOCX → parse with AI. Body: `multipart/form-data` with `resume` field |
| POST | `/api/resumes/generate-pdf` | Generate PDF from JSON data. Returns attachment download |
| POST | `/api/resumes/generate-docx` | Generate DOCX from JSON data. Returns attachment download |
| POST | `/api/resumes/ats-score` | Compute ATS score |
| POST | `/api/resumes/grammar-fix` | Fix grammar in resume data |
| POST | `/api/resumes/jd-match` | Match resume against job description |
| GET | `/api/health` | Health check |

### v3 (Affinda-compatible)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/resumes/v3/documents` | Create document (upload file, URL, or text) |
| GET | `/api/resumes/v3/documents` | List documents |
| GET | `/api/resumes/v3/documents/:identifier` | Get document |
| DELETE | `/api/resumes/v3/documents/:identifier` | Delete document |

All v3 endpoints require `Authorization: Bearer <RESUME_API_KEY>` header.

---

## The Template System

### PDF Template (`server/src/templates/mleTemplate.js`)
- Function `buildResumeHtml(data)` returns a complete HTML string with embedded CSS
- Uses Puppeteer to render/print to PDF
- All styling is inline in `<style>` tags
- Watermark is a `position: fixed` div with `background-image` (replaced at runtime in client preview)
- Output filename: `firstname_lastname_ddmmyyyy.pdf`

### Client Preview (`client/src/utils/mleTemplate.js`)
- Exact same HTML/CSS as server template — MUST be kept identical
- The `__WATERMARK__` URL placeholder is stripped in `ResumePreview.jsx` to avoid 404
- Used for live preview in the iframe

### DOCX Template (`server/assets/template_clean.docx`)
- Pre-processed from `template.docx` by `scripts/prepare-template.js`
- Contains header with ribbon/oval/logo images + watermark image
- At runtime, `docxTemplateBuilder.js` loads this via pizzip, generates body XML from scratch, injects into the template
- Body XML generation mirrors PDF layout: name, contact, professional summary, expertise, education, skills table, work history table, technical experience, certifications, key achievements, and dynamic sections

### Preparing the DOCX Template
```bash
npm run prepare-template    # converts template.docx → template_clean.docx
```

Run once when `template.docx` changes. The clean template is checked into the repo.

---

## Environment Variables

### Server (`server/.env`)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `PORT` | No | `5050` | Server port |
| `CORS_ORIGIN` | No | `http://localhost:5173,https://mle-resume-formatter-client.vercel.app` | Comma-separated allowed origins |
| `GROQ_API_KEY` | Yes (or `OPENROUTER_API_KEY`) | — | Groq API key for AI parsing |
| `AI_API_URL` | No | `https://api.groq.com/openai/v1/chat/completions` | AI API endpoint |
| `AI_MODEL` | No | `mixtral-8x7b-32768` | AI model name |
| `PUPPETEER_EXECUTABLE_PATH` | No (auto) | — | Path to Chromium binary |
| `RESUME_API_KEY` | No | — | Bearer token for V3 API auth (leave empty to disable) |

### Client (`client/.env.local` or Vercel env vars)

| Variable | Required | Default | Description |
|----------|----------|---------|-------------|
| `VITE_API_URL` | No | `''` (uses same origin) | Server base URL, e.g. `https://mle-resume-server.onrender.com` |

---

## Data Schema (MLE Resume JSON)

```
{
  candidateName, candidateInitials, title,
  phone, email, linkedin, location,
  totalExperience, currentCompany, currentDesignation,
  noticePeriod, currentCtc, expectedCtc, highestQualification,
  confidentialLabel, maskPersonalDetails (boolean),
  professionalSummary: string[],
  expertise: string[],
  domainExperience: string[],
  toolsAndPlatforms: string[],
  educationalQualification: string[],
  skillGroups: [{ title: string, items: string[] }],
  workHistory: [{ company, role, duration }],
  technicalExperience: [{ role, duration, contributions: string[], client, employer, technologies: string[] }],
  certifications: string[],
  keyAchievements: string[],
  languagesKnown: string[],
  additionalSections: [{ title, items: string[] }]
}
```

---

## AI Parsing Details

- **Provider**: Groq API (preferred) or OpenRouter
- **Model**: `meta-llama/llama-4-scout-17b-16e-instruct` (17B)
- **Prompt rules**: extract exact text, do NOT paraphrase, copy bullet points verbatim
- **Retry**: 3 attempts with exponential backoff (2s → 4s → 8s), resubmits on rate-limit (429), empty response, or swapped company/role
- **JSON extraction**: brace-depth matching to handle truncated responses, `json5` fallback parser
- **No heuristic fallback**: if AI fails and no API key is set, the app uses heuristic parsing

---

## Deployment

### Server (Render)
- Dockerfile at `server/Dockerfile` — `node:22-slim`, Chromium via apt
- Build command: dockerized (Render auto-detects Dockerfile)
- Start command: `node src/index.js`
- Puppeteer: `PUPPETEER_SKIP_DOWNLOAD=true`, `PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium`
- Environment: all vars from `.env.example`
- Current: `https://mle-resume-server.onrender.com`

### Client (Vercel)
- Framework: Vite (auto-detected)
- Build: `npm run build`
- Output: static files in `dist/`
- Environment: `VITE_API_URL` = server URL
- Current: `https://mle-resume-formatter-client.vercel.app`

---

## Common Issues & Gotchas

1. **PDF Preview vs Output mismatch**: If the client preview and generated PDF look different, the two `mleTemplate.js` files (client + server) are out of sync. Copy changes to both.

2. **DOCX doesn't match PDF**: `docxTemplateBuilder.js` must be updated when the PDF template changes. Each section's rendering (fonts, sizes, spacing) must match.

3. **DOCX Header/Watermark broken**: If the DOCX opens without the logo/watermark/header strip, run `npm run prepare-template` again — the template may have been corrupted.

4. **Puppeteer fails on Render**: Chromium dependencies may change. Check the Dockerfile — if `--no-install-recommends` skips a needed library, add it manually.

5. **AI returns empty/incomplete JSON**: The brace-matching in `parseResumeText.js` detects truncated responses. If this triggers, the retry logic runs. The `max_tokens: 8192` should be sufficient for most resumes.

6. **ATS Score header too long**: The `X-ATS-Score` header is URL-encoded JSON. If the score object is very large, the header may be truncated by the server/proxy. Noted but not currently an issue.

7. **V3 API v1 API conflict**: The v3 endpoints are Affinda-compatible and use a different auth scheme (Bearer token). The v1 endpoints use no auth. Make sure clients hit the right endpoints.

8. **CORS errors on client**: The server's `CORS_ORIGIN` env var must include the client's deployment URL. Multiple origins are comma-separated.

9. **File size limits**: 10MB upload limit. If resumes are larger, the request will be rejected with HTTP 413.

10. **Rate limiting**: The parse endpoint is rate-limited to 10 requests per minute per IP. Other endpoints are not rate-limited.
