import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import PizZip from 'pizzip';
import { stripInstitutionName } from '../utils/stripInstitutionName.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const assetsDir = path.resolve(__dirname, '../../assets');
const templatePath = path.join(assetsDir, 'template_clean.docx');

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

function xmlEsc(v) {
  return String(v ?? '').replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
}

// PDF-matching formatting
const FONT = 'Calibri';
const COLOR_PRIMARY = '001f5f';
const COLOR_TEXT = '111111';
const COLOR_CONTACT = '4a5a6a';
const COLOR_HEADER_BG = '1f587f';
const COLOR_HEADER_TEXT = 'ffffff';
const COLOR_ALT_ROW = 'edf4fa';
const COLOR_SKILLS_ALT = 'f7f9fb';
const COLOR_BORDER = 'b8cadb';

function rPr(sz, bold, color) {
  const colorEl = color ? `<w:color w:val="${color}"/>` : '';
  const boldEl = bold ? '<w:b w:val="1"/>' : '';
  return `<w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}"/>${colorEl}${boldEl}<w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr>`;
}

function p(text, fontSize, options = {}) {
  const { bold, color, before, after, align } = options;
  const sz = fontSize * 2;
  const alignAttr = align ? ` w:jc="${align}"` : '';
  const spacingBefore = before ? ` w:before="${before}"` : '';
  const spacingAfter = after ? ` w:after="${after}"` : '';
  const rp = rPr(sz, bold, color);
  return `<w:p><w:pPr${alignAttr}><w:spacing w:line="276" w:lineRule="auto"${spacingBefore}${spacingAfter}/>${rp}</w:pPr><w:r>${rp}<w:t xml:space="preserve">${xmlEsc(text)}</w:t></w:r></w:p>`;
}

function bullet(text, options = {}) {
  const { before, after, fontSize } = options;
  const sz = (fontSize || 10.5) * 2;
  const beforeAttr = before ? ` w:before="${before}"` : '';
  const afterAttr = after ? ` w:after="${after}"` : '';
  const indent = 360;
  return `<w:p><w:pPr><w:spacing w:line="276" w:lineRule="auto"${beforeAttr}${afterAttr}/><w:ind w:left="${indent}" w:hanging="${indent}"/><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}"/><w:sz w:val="${sz}"/><w:szCs w:val="${sz}"/></w:rPr><w:t xml:space="preserve">\u2022 ${xmlEsc(text)}</w:t></w:r></w:p>`;
}

function sectionTitleText(text, isFirst) {
  return p(text, 9.75, { bold: true, color: COLOR_PRIMARY, before: isFirst ? 45 : 75, after: 45 });
}

function nameParagraphText(name) {
  return p(name.toUpperCase(), 18, { bold: true, color: COLOR_PRIMARY, after: 0 });
}

function contactParagraphText(data, masked) {
  if (masked) return '';
  const parts = [];
  if (data.phone) parts.push(`Phone: ${data.phone}`);
  if (data.email) parts.push(`Email: ${data.email}`);
  if (data.linkedin) parts.push(`LinkedIn: ${data.linkedin}`);
  if (data.location) parts.push(`Location: ${data.location}`);
  if (!parts.length) return '';
  return p(parts.join(' | '), 7, { color: COLOR_CONTACT, before: 45, after: 60 });
}

function bodyParagraphText(text) {
  return p(text, 8.5, { after: 0 });
}

function roleTitleText(text) {
  return p(text, 8.5, { bold: true, color: COLOR_TEXT, before: 45, after: 30 });
}

function bulletItemText(text) {
  return bullet(text, { after: 30, fontSize: 8 });
}

function tbl(options = {}) {
  const { cols, header, rows, widths } = options;
  const colWidths = widths
    ? widths.map(w => Math.round(w / widths.reduce((a, b) => a + b, 0) * 5000))
    : cols.map(() => Math.floor(5000 / cols.length));
  const tcMar = '<w:tcMar><w:top w:w="28" w:type="dxa"/><w:left w:w="57" w:type="dxa"/><w:bottom w:w="28" w:type="dxa"/><w:right w:w="57" w:type="dxa"/></w:tcMar>';
  let xml = `<w:tbl><w:tblPr><w:tblW w:w="5000" w:type="pct"/><w:jc w:val="center"/></w:tblPr>`;
  if (header) {
    xml += `<w:tblGrid>${colWidths.map(w => `<w:gridCol w:w="${w}"/>`).join('')}</w:tblGrid>`;
    const headerCells = header.map((h, i) =>
      `<w:tc><w:tcPr><w:tcW w:w="${colWidths[i]}" w:type="dxa"/>${tcMar}<w:shd w:fill="${COLOR_HEADER_BG}" w:val="clear"/><w:tcBorders><w:top w:val="single" w:sz="6" w:color="8ea9bf"/><w:left w:val="single" w:sz="6" w:color="8ea9bf"/><w:bottom w:val="single" w:sz="6" w:color="8ea9bf"/><w:right w:val="single" w:sz="6" w:color="8ea9bf"/></w:tcBorders></w:tcPr><w:p><w:pPr><w:jc w:val="center"/><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}"/><w:b w:val="1"/><w:sz w:val="16"/><w:szCs w:val="16"/><w:color w:val="${COLOR_HEADER_TEXT}"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}"/><w:b w:val="1"/><w:sz w:val="16"/><w:szCs w:val="16"/><w:color w:val="${COLOR_HEADER_TEXT}"/></w:rPr><w:t>${xmlEsc(h)}</w:t></w:r></w:p></w:tc>`
    );
    xml += `<w:tr>${headerCells.join('')}</w:tr>`;
  }
  rows.forEach((row, ri) => {
    const even = ri % 2 === 1;
    const fill = even ? (options.skillsAlt ? COLOR_SKILLS_ALT : COLOR_ALT_ROW) : undefined;
    const shd = fill ? ` w:fill="${fill}"` : '';
    const cells = row.map((cellText, ci) =>
      `<w:tc><w:tcPr><w:tcW w:w="${colWidths[ci]}" w:type="dxa"/>${tcMar}<w:shd w:val="clear"${shd}/><w:tcBorders><w:top w:val="single" w:sz="6" w:color="${COLOR_BORDER}"/><w:left w:val="single" w:sz="6" w:color="${COLOR_BORDER}"/><w:bottom w:val="single" w:sz="6" w:color="${COLOR_BORDER}"/><w:right w:val="single" w:sz="6" w:color="${COLOR_BORDER}"/></w:tcBorders></w:tcPr><w:p><w:pPr><w:jc w:val="left"/><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}"/><w:sz w:val="16"/><w:szCs w:val="16"/><w:color w:val="${COLOR_TEXT}"/></w:rPr></w:pPr><w:r><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}"/><w:sz w:val="16"/><w:szCs w:val="16"/><w:color w:val="${COLOR_TEXT}"/></w:rPr><w:t>${xmlEsc(cellText)}</w:t></w:r></w:p></w:tc>`
    );
    xml += `<w:tr>${cells.join('')}</w:tr>`;
  });
  xml += '</w:tbl>';
  return xml;
}

function skillsTableXml(groups) {
  const valid = groups ? groups.filter(g => g?.title || g?.items?.length) : [];
  if (!valid.length) return '';
  const rows = valid.map(g => [g.title || '', (g.items || []).join(', ')]);
  return tbl({ cols: ['Category', 'Skills'], header: ['Category', 'Skills'], rows, widths: [30, 70], skillsAlt: true });
}

function workHistoryTableXml(rows, masked, label) {
  const safe = (Array.isArray(rows) ? rows : [])
    .map(r => ({ company: safeText(r?.company), role: safeText(r?.role), duration: safeText(r?.duration) }))
    .filter(r => r.company || r.role || r.duration);
  if (!safe.length) return '';
  const dataRows = safe.map(r => [
    masked ? (label || 'Confidential') : r.company,
    r.role || '\u2014',
    r.duration || '\u2014'
  ]);
  return tbl({ cols: ['Company', 'Role', 'Duration'], header: ['Company', 'Role', 'Duration'], rows: dataRows, widths: [40, 30, 30] });
}

function experienceBlocksXml(blocks) {
  const safe = (Array.isArray(blocks) ? blocks : [])
    .map(b => ({ role: safeText(b?.role), duration: safeText(b?.duration), contributions: safeList(b?.contributions) }))
    .filter(b => b.role || b.duration || b.contributions.length);
  if (!safe.length) return '';
  let xml = '';
  safe.forEach((block, i) => {
    if (i > 0) {
      xml += `<w:p><w:pPr><w:spacing w:before="45"/><w:rPr><w:rFonts w:ascii="${FONT}" w:hAnsi="${FONT}"/></w:rPr></w:pPr></w:p>`;
    }
    const heading = block.role ? `${block.role}${block.duration ? ` (${block.duration})` : ''}` : block.duration;
    if (heading) xml += roleTitleText(heading);
    block.contributions.forEach(c => { xml += bulletItemText(c); });
  });
  return xml;
}

function resolveName(data, masked) {
  if (masked) {
    const raw = data.candidateName || data.candidateInitials || 'Candidate Name';
    const parts = esc(raw).split(/\s+/).filter(Boolean);
    if (!parts.length) return 'C';
    const first = parts[0];
    const lastInit = parts.length > 1 ? parts[parts.length - 1][0].toUpperCase() : '';
    return lastInit ? `${first} ${lastInit}` : first;
  }
  return esc(data.candidateName || data.candidateInitials || 'Candidate Name');
}

// ---------- Main ----------
export async function buildFromTemplate(data) {
  if (!fs.existsSync(templatePath)) {
    throw new Error(`Clean template not found at ${templatePath}. Run 'npm run prepare-template' first.`);
  }

  const masked = Boolean(data.maskPersonalDetails);
  const name = resolveName(data, masked);

  const templateBuffer = fs.readFileSync(templatePath);
  const zip = new PizZip(templateBuffer);
  let docXml = zip.file('word/document.xml').asText();

  // Extract sectPr from body (preserves header ref, footer ref, margins, watermark drawing)
  const bodyMatch = docXml.match(/<w:body>([^]*)<\/w:body>/);
  if (!bodyMatch) throw new Error('Could not find body in document.xml');
  const fullBody = bodyMatch[1];

  const sectPrMatch = fullBody.match(/<w:sectPr>[\s\S]*?<\/w:sectPr>/);
  const sectPr = sectPrMatch ? sectPrMatch[0] : '';

  // Generate all body content from scratch (matching PDF formatting exactly)
  let bodyXml = '';

  // Name
  bodyXml += nameParagraphText(name);

  // Contact
  bodyXml += contactParagraphText(data, masked);

  let firstSection = true;

  // Professional Summary
  if (hasListData(data.professionalSummary)) {
    bodyXml += sectionTitleText('Professional Summary', firstSection);
    firstSection = false;
    if (data.professionalSummary.length > 1) {
      data.professionalSummary.forEach(item => { bodyXml += bulletItemText(item); });
    } else {
      bodyXml += bodyParagraphText(data.professionalSummary[0]);
    }
  }

  // Expertise
  if (hasListData(data.expertise)) {
    bodyXml += sectionTitleText('Expertise in', firstSection);
    firstSection = false;
    data.expertise.forEach(item => { bodyXml += bulletItemText(item); });
  }

  // Educational Qualification
  if (hasListData(data.educationalQualification)) {
    bodyXml += sectionTitleText('Educational Qualification', firstSection);
    firstSection = false;
    const items = masked
      ? data.educationalQualification.map(e => stripInstitutionName(e))
      : data.educationalQualification;
    items.forEach(item => { bodyXml += bulletItemText(item); });
  }

  // Technical Skills
  if (hasSkillGroupData(data.skillGroups)) {
    bodyXml += sectionTitleText('Technical Skills', firstSection);
    firstSection = false;
    bodyXml += skillsTableXml(data.skillGroups);
  }

  // Work History
  if (hasWorkHistoryData(data.workHistory)) {
    bodyXml += sectionTitleText('Work History', firstSection);
    firstSection = false;
    bodyXml += workHistoryTableXml(data.workHistory, masked, data.confidentialLabel || 'Confidential');
  }

  // Technical / Project Experience
  if (hasExperienceData(data.technicalExperience)) {
    bodyXml += sectionTitleText('Technical Experience', firstSection);
    firstSection = false;
    bodyXml += experienceBlocksXml(data.technicalExperience);
  } else if (hasExperienceData(data.projectExperience)) {
    bodyXml += sectionTitleText('Project Experience', firstSection);
    firstSection = false;
    bodyXml += experienceBlocksXml(data.projectExperience);
  }

  // Certifications
  if (hasListData(data.certifications)) {
    bodyXml += sectionTitleText('Certifications', firstSection);
    firstSection = false;
    data.certifications.forEach(item => { bodyXml += bulletItemText(item); });
  }

  // Key Achievements
  if (hasListData(data.keyAchievements)) {
    bodyXml += sectionTitleText('Key Achievements', firstSection);
    firstSection = false;
    data.keyAchievements.forEach(item => { bodyXml += bulletItemText(item); });
  }

  // Assemble: generated body + template's sectPr (with header ref, footer ref, margins, watermark)
  docXml = docXml.substring(0, docXml.indexOf('<w:body>') + 8) + bodyXml + sectPr + docXml.substring(docXml.indexOf('</w:body>'));

  zip.file('word/document.xml', docXml);

  return zip.generate({ type: 'nodebuffer' });
}
