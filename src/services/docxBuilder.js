import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import sharp from 'sharp';
import { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell, ImageRun, Header, Footer, WidthType, AlignmentType, BorderStyle, ShadingType } from 'docx';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const FONT = 'Calibri';
const COLOR_PRIMARY = '001f5f';
const COLOR_TEXT = '111111';
const COLOR_CONTACT = '4a5a6a';
const COLOR_HEADER_BG = '1f587f';
const COLOR_HEADER_TEXT = 'ffffff';
const COLOR_BORDER = 'b8cadb';
const COLOR_ALT_ROW = 'edf4fa';
const COLOR_RIBBON = '63c6ef';
const COLOR_STRIP = '1f5f9f';
const COLOR_FOOTER_TEXT = '5d6e7c';
const COLOR_FOOTER_LINE = 'd6e2ee';
const COLOR_SEP = 'b0c0d0';
const COLOR_SKILLS_ALT = 'f7f9fb';
const A4_W = 11906;
const A4_H = 16838;

function sz(hp) { return hp; }

function esc(v = '') {
  return String(v ?? '').trim();
}

function safeList(items) {
  if (Array.isArray(items)) return items.map(i => esc(i)).filter(Boolean);
  if (typeof items === 'string') return esc(items) ? [esc(items)] : [];
  return [];
}

function safeText(v = '') {
  return esc(v);
}

function hasListData(items) {
  return safeList(items).length > 0;
}

function hasSkillGroupData(groups) {
  return (Array.isArray(groups) ? groups : []).some(g => safeText(g?.title) || safeList(g?.items).length);
}

function hasWorkHistoryData(rows) {
  return (Array.isArray(rows) ? rows : []).some(r => safeText(r?.company) || safeText(r?.role) || safeText(r?.duration));
}

function hasExperienceData(blocks) {
  return (Array.isArray(blocks) ? blocks : []).some(b => safeText(b?.role) || safeText(b?.duration) || safeList(b?.contributions).length);
}

const assetsDir = path.resolve(__dirname, '../../assets');
const logoPath = path.join(assetsDir, 'mle-logo-2023.png');
const watermarkPath = path.join(assetsDir, 'mle-watermark.png');

let logoBuffer, watermarkBuffer;
try { logoBuffer = fs.readFileSync(logoPath); } catch { logoBuffer = null; }
try { watermarkBuffer = fs.readFileSync(watermarkPath); } catch { watermarkBuffer = null; }

// ---------- Header ----------------
// Render the PDF-matching SVG header (ribbon, gradient, oval, logo) to a PNG
// via sharp, then embed it in the DOCX header as a single ImageRun.
// -----------------------------------------------------------------
function buildHeaderSvg(renderWidth, renderHeight) {
  const logoBase64 = logoBuffer ? logoBuffer.toString('base64') : '';
  return `<svg xmlns="http://www.w3.org/2000/svg" width="${renderWidth}" height="${renderHeight}" viewBox="0 0 210 20">
  <defs>
    <linearGradient id="outer" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#63c6ef"/>
      <stop offset="100%" stop-color="#4fb3e3"/>
    </linearGradient>
    <linearGradient id="ovalGrad" x1="0%" y1="0%" x2="100%" y2="0%">
      <stop offset="0%" stop-color="#eefcff"/>
      <stop offset="50%" stop-color="#a8deef"/>
      <stop offset="100%" stop-color="#eefcff"/>
    </linearGradient>
  </defs>
  <rect x="0" y="5.6" width="210" height="8.8" rx="4.4" ry="4.4" fill="url(#outer)"/>
  <rect x="12" y="7.8" width="170" height="4.4" rx="2.2" ry="2.2" fill="#1f5f9f"/>
  <ellipse cx="188" cy="10" rx="14" ry="8" fill="url(#ovalGrad)" stroke="#0b2f78" stroke-width="1.3"/>
  ${logoBase64 ? `<image href="data:image/png;base64,${logoBase64}" x="177" y="5" width="22" height="10"/>` : ''}
</svg>`;
}

async function renderHeaderImage() {
  const H_DPI = 300;
  const mmToPx = mm => Math.round(mm / 25.4 * H_DPI);
  const svgWidth = mmToPx(210);
  const svgHeight = mmToPx(20);
  const svg = buildHeaderSvg(svgWidth, svgHeight);
  return sharp(Buffer.from(svg)).png().toBuffer();
}

async function buildHeader() {
  const children = [];

  // Watermark (130mm × 130mm, centered behind content)
  if (watermarkBuffer) {
    const px = mm => Math.round(mm / 25.4 * 96);
    children.push(new Paragraph({
      spacing: { before: 0, after: 0, line: 0 },
      children: [
        new ImageRun({
          data: watermarkBuffer,
          transformation: { width: px(130), height: px(130) },
          type: 'png',
          floating: {
            horizontalPosition: { relative: 'page', align: 'center' },
            verticalPosition: { relative: 'page', align: 'center' },
            behindDocument: true,
          },
        }),
      ],
    }));
  }

  // Rendered header image (ribbon + strip + oval + logo)
  const px = mm => Math.round(mm / 25.4 * 96);
  try {
    const headerPng = await renderHeaderImage();
    children.push(new Paragraph({
      spacing: { before: 0, after: 0, line: 0 },
      children: [
        new ImageRun({
          data: headerPng,
          transformation: { width: px(210), height: px(20) },
          type: 'png',
        }),
      ],
    }));
  } catch (e) {
    console.error('Failed to render header image:', e.message);
  }

  return new Header({ children });
}

// ---------- Footer ----------
function buildFooter() {
  return new Footer({
    children: [
      new Paragraph({
        alignment: AlignmentType.LEFT,
        border: { top: { style: BorderStyle.SINGLE, size: 4, color: COLOR_FOOTER_LINE } },
        spacing: { before: 600 },
        indent: { left: 794 },
        children: [
          new TextRun({ text: 'Mle Systems Pvt. Ltd.', font: FONT, size: sz(14), color: COLOR_FOOTER_TEXT }),
        ],
      }),
    ],
  });
}

// ---------- Content builders ----------
function nameParagraph(name) {
  return new Paragraph({
    spacing: { after: 0 },
    children: [
      new TextRun({ text: name.toUpperCase(), font: FONT, size: sz(36), bold: true, color: COLOR_PRIMARY }),
    ],
  });
}

function contactParagraph(data, masked) {
  if (masked) return null;
  const parts = [];
  if (data.phone) parts.push(`Phone: ${data.phone}`);
  if (data.email) parts.push(`Email: ${data.email}`);
  if (data.linkedin) parts.push(`LinkedIn: ${data.linkedin}`);
  if (data.location) parts.push(`Location: ${data.location}`);
  if (!parts.length) return null;
  const children = [];
  parts.forEach((part, i) => {
    if (i > 0) {
      children.push(new TextRun({ text: ' | ', font: FONT, size: sz(14), color: COLOR_SEP }));
    }
    children.push(new TextRun({ text: part, font: FONT, size: sz(14), color: COLOR_CONTACT }));
  });
  return new Paragraph({
    spacing: { before: 45, after: 60 },
    children,
  });
}

function sectionTitle(text, isFirst = false) {
  return new Paragraph({
    spacing: { before: isFirst ? 45 : 75, after: 45 },
    children: [
      new TextRun({ text, font: FONT, size: sz(20), bold: true, color: COLOR_PRIMARY }),
    ],
  });
}

function bodyParagraph(text) {
  return new Paragraph({
    spacing: { after: 0 },
    children: [
      new TextRun({ text, font: FONT, size: sz(17), color: COLOR_TEXT }),
    ],
  });
}

function bulletItem(text, after = 30) {
  return new Paragraph({
    bullet: { level: 0 },
    spacing: { after },
    children: [
      new TextRun({ text, font: FONT, size: sz(16), color: COLOR_TEXT }),
    ],
  });
}

function roleTitleParagraph(text) {
  return new Paragraph({
    spacing: { before: 45, after: 30 },
    children: [
      new TextRun({ text, font: FONT, size: sz(17), bold: true, color: COLOR_TEXT }),
    ],
  });
}

function cell(text, opts = {}) {
  const { bold, shading, width, color, align, borderColor } = opts;
  const children = [
    new TextRun({ text: text || '', font: FONT, size: sz(16), bold: bold || false, color: color || COLOR_TEXT }),
  ];
  const cellOpts = {
    children: [new Paragraph({
      alignment: align || AlignmentType.CENTER,
      spacing: { before: 0, after: 0 },
      children,
    })],
    verticalAlign: 'center',
  };
  if (width) cellOpts.width = { size: width, type: WidthType.PERCENTAGE };
  if (shading) cellOpts.shading = { fill: shading, val: ShadingType.CLEAR };
  cellOpts.margins = {
    top: 70,
    bottom: 70,
    left: 85,
    right: 85,
  };
  if (borderColor) {
    cellOpts.borders = {
      top: { style: BorderStyle.SINGLE, size: 6, color: borderColor },
      bottom: { style: BorderStyle.SINGLE, size: 6, color: borderColor },
      left: { style: BorderStyle.SINGLE, size: 6, color: borderColor },
      right: { style: BorderStyle.SINGLE, size: 6, color: borderColor },
    };
  }
  return new TableCell(cellOpts);
}

function headerCell(text, width) {
  return cell(text, {
    bold: true, width, shading: COLOR_HEADER_BG, color: COLOR_HEADER_TEXT, align: AlignmentType.CENTER, borderColor: '8ea9bf',
  });
}

function skillsTable(groups) {
  const valid = (Array.isArray(groups) ? groups : []).filter(g => g?.title || g?.items?.length);
  if (!valid.length) return null;
  const rows = [
    new TableRow({ tableHeader: true, children: [headerCell('Category', 28), headerCell('Skills', 72)] }),
  ];
  valid.forEach((group, i) => {
    const isEven = i % 2 === 1;
    rows.push(new TableRow({
      children: [
        cell(group.title || '', { width: 28, bold: true, align: AlignmentType.LEFT, shading: isEven ? COLOR_SKILLS_ALT : undefined, color: COLOR_TEXT, borderColor: COLOR_BORDER }),
        cell((group.items || []).join(', '), { width: 72, align: AlignmentType.LEFT, shading: isEven ? COLOR_SKILLS_ALT : undefined, color: COLOR_TEXT, borderColor: COLOR_BORDER }),
      ],
    }));
  });
  return new Table({ rows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

function workHistoryTable(rows, masked, label) {
  const safe = (Array.isArray(rows) ? rows : [])
    .map(r => ({ company: safeText(r?.company), role: safeText(r?.role), duration: safeText(r?.duration) }))
    .filter(r => r.company || r.role || r.duration);
  if (!safe.length) return null;
  const tableRows = [
    new TableRow({ tableHeader: true, children: [headerCell('Company', 40), headerCell('Role', 35), headerCell('Duration', 25)] }),
  ];
  safe.forEach((row, i) => {
    const isEven = i % 2 === 1;
    tableRows.push(new TableRow({
      children: [
        cell(masked ? label : row.company, { width: 40, shading: isEven ? COLOR_ALT_ROW : undefined, color: COLOR_TEXT, borderColor: COLOR_BORDER }),
        cell(row.role || '\u2014', { width: 35, shading: isEven ? COLOR_ALT_ROW : undefined, color: COLOR_TEXT, borderColor: COLOR_BORDER }),
        cell(row.duration || '\u2014', { width: 25, shading: isEven ? COLOR_ALT_ROW : undefined, color: COLOR_TEXT, borderColor: COLOR_BORDER }),
      ],
    }));
  });
  return new Table({ rows: tableRows, width: { size: 100, type: WidthType.PERCENTAGE } });
}

function experienceBlocks(blocks) {
  const safe = (Array.isArray(blocks) ? blocks : [])
    .map(b => ({ role: safeText(b?.role), duration: safeText(b?.duration), contributions: safeList(b?.contributions) }))
    .filter(b => b.role || b.duration || b.contributions.length);
  if (!safe.length) return [];
  const items = [];
  safe.forEach((block, i) => {
    if (i > 0) items.push(new Paragraph({ spacing: { before: 45 } }));
    const heading = block.role ? `${block.role}${block.duration ? ` (${block.duration})` : ''}` : block.duration;
    if (heading) items.push(roleTitleParagraph(heading));
    block.contributions.forEach((c) => { items.push(bulletItem(c, 30)); });
  });
  return items;
}

function dynamicSections(sections, isFirst) {
  if (!Array.isArray(sections) || !sections.length) return [];
  const items = [];
  sections.forEach((s, idx) => {
    if (!s || !s.title || !Array.isArray(s.items) || !s.items.length) return;
    items.push(sectionTitle(s.title, isFirst && idx === 0));
    s.items.forEach((item) => { items.push(bulletItem(item, 30)); });
  });
  return items;
}

  // ---------- Main ----------
export async function buildDocx(data) {
  const masked = Boolean(data.maskPersonalDetails);
  const name = masked
    ? (() => {
        const raw = data.candidateName || data.candidateInitials || 'Candidate Name';
        const parts = esc(raw).split(/\s+/).filter(Boolean);
        if (!parts.length) return 'C';
        const first = parts[0];
        const lastInit = parts.length > 1 ? parts[parts.length - 1][0].toUpperCase() : '';
        return lastInit ? `${first} ${lastInit}` : first;
      })()
    : esc(data.candidateName || data.candidateInitials || 'Candidate Name');

  let techOrProject, expTitle;
  if (hasExperienceData(data.technicalExperience)) {
    techOrProject = data.technicalExperience;
    expTitle = 'Technical Experience';
  } else if (hasExperienceData(data.projectExperience)) {
    techOrProject = data.projectExperience;
    expTitle = 'Project Experience';
  } else {
    techOrProject = [];
    expTitle = 'Technical Experience';
  }

  const children = [];

  children.push(nameParagraph(name));

  const contact = contactParagraph(data, masked);
  if (contact) children.push(contact);

  let firstSection = true;

  if (hasListData(data.professionalSummary)) {
    children.push(sectionTitle('Professional Summary', firstSection));
    firstSection = false;
    if (data.professionalSummary.length > 1) {
      data.professionalSummary.forEach((item) => { children.push(bulletItem(item, 30)); });
    } else {
      children.push(bodyParagraph(data.professionalSummary[0]));
    }
  }

  if (hasListData(data.expertise)) {
    children.push(sectionTitle('Expertise in', firstSection));
    firstSection = false;
    data.expertise.forEach((item) => { children.push(bulletItem(item, 30)); });
  }

  if (hasListData(data.educationalQualification)) {
    children.push(sectionTitle('Educational Qualification', firstSection));
    firstSection = false;
    const items = masked
      ? data.educationalQualification.map(e => {
          const s = String(e ?? '').trim();
          const dateMatch = s.match(/\(([^)]+)\)\s*$/);
          if (!dateMatch) return s;
          const before = s.slice(0, dateMatch.index).replace(/[,\s]+$/, '');
          const firstComma = before.indexOf(',');
          if (firstComma > 0) return `${before.slice(0, firstComma).trim()} ${dateMatch[0]}`.trim();
          return `${before} ${dateMatch[0]}`.trim();
        })
      : data.educationalQualification;
    items.forEach((item) => { children.push(bulletItem(item, 30)); });
  }

  if (hasSkillGroupData(data.skillGroups)) {
    children.push(sectionTitle('Technical Skills', firstSection));
    firstSection = false;
    const tbl = skillsTable(data.skillGroups);
    if (tbl) children.push(tbl);
  }

  if (hasWorkHistoryData(data.workHistory)) {
    children.push(sectionTitle('Work History', firstSection));
    firstSection = false;
    const tbl = workHistoryTable(data.workHistory, masked, data.confidentialLabel || 'Confidential');
    if (tbl) children.push(tbl);
  }

  if (hasExperienceData(techOrProject)) {
    children.push(sectionTitle(expTitle, firstSection));
    firstSection = false;
    children.push(...experienceBlocks(techOrProject));
  }

  if (hasListData(data.certifications)) {
    children.push(sectionTitle('Certifications', firstSection));
    firstSection = false;
    data.certifications.forEach((item) => { children.push(bulletItem(item, 30)); });
  }

  if (hasListData(data.keyAchievements)) {
    children.push(sectionTitle('Key Achievements', firstSection));
    firstSection = false;
    data.keyAchievements.forEach((item) => { children.push(bulletItem(item, 30)); });
  }

  children.push(...dynamicSections(data.additionalSections, firstSection));

  const header = await buildHeader();
  const footer = buildFooter();

  const doc = new Document({
    styles: {
      default: {
        document: {
          run: { font: FONT, size: sz(17), color: COLOR_TEXT },
        },
      },
    },
    sections: [{
      properties: {
        page: {
          size: { width: A4_W, height: A4_H },
          margin: {
            top: 1531,
            right: 680,
            bottom: 1247,
            left: 680,
          },
        },
      },
      headers: { default: header },
      footers: { default: footer },
      children,
    }],
  });

  return Packer.toBuffer(doc);
}
