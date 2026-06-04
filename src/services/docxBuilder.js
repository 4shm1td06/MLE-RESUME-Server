import fs from 'fs/promises';
import {
  AlignmentType,
  BorderStyle,
  Document,
  Footer,
  Header,
  Packer,
  PageNumber,
  Paragraph,
  Table,
  TableCell,
  TableRow,
  TextRun,
  WidthType
} from 'docx';

function text(value = '') {
  return String(value ?? '').trim();
}

function stripInstitutionName(text) {
  const s = String(text ?? '').trim();
  if (!s) return '';
  const dateMatch = s.match(/\(([^)]+)\)\s*$/);
  const dateRange = dateMatch ? `(${dateMatch[1]})` : '';
  const before = dateMatch ? s.slice(0, dateMatch.index).replace(/[,\s]+$/, '') : s;
  const fromMatch = before.match(/^(.*?)\s+from\s+(.*)$/i);
  if (fromMatch) return `${fromMatch[1].trim()} ${dateRange}`.trim();
  const firstComma = before.indexOf(',');
  if (firstComma > 0) return `${before.slice(0, firstComma).trim()} ${dateRange}`.trim();
  const dashMatch = before.match(/^(.*?)\s+[-–—]\s+(.*)$/);
  if (dashMatch) return `${dashMatch[1].trim()} ${dateRange}`.trim();
  return `${before} ${dateRange}`.trim();
}

function formatDisplayName(candidateName, candidateInitials, masked = false) {
  const raw = candidateName || candidateInitials || '';
  if (!raw) return 'Candidate Name';
  const parts = raw.split(/\s+/).filter(Boolean);
  if (!parts.length) return 'Candidate Name';
  if (masked) {
    const first = parts[0];
    const lastInit = parts.length > 1 ? parts[parts.length - 1][0].toUpperCase() : '';
    return lastInit ? `${first} ${lastInit}` : first;
  }
  if (parts.length === 1) return parts[0];
  const firstName = parts[0];
  const lastInitial = parts[parts.length - 1][0].toUpperCase();
  return `${firstName} ${lastInitial}.`;
}

function list(value = []) {
  if (Array.isArray(value)) return value.map((item) => text(item)).filter(Boolean);
  const single = text(value);
  return single ? [single] : [];
}

function metaValue(label, value) {
  const safe = text(value) || '—';
  return new Paragraph({
    spacing: { after: 80 },
    children: [
      new TextRun({ text: `${label}: `, bold: true, color: '1E3A8A' }),
      new TextRun({ text: safe })
    ]
  });
}

function sectionHeading(title) {
  return new Paragraph({
    text: title,
    heading: 'Heading2',
    thematicBreak: false,
    spacing: { before: 220, after: 120 },
    border: {
      bottom: { color: '8FA8D6', style: BorderStyle.SINGLE, size: 6 }
    }
  });
}

function bullets(items) {
  const safe = list(items);
  if (!safe.length) return [new Paragraph({ text: '—', spacing: { after: 80 } })];
  return safe.map((item) => new Paragraph({ text: item, bullet: { level: 0 }, spacing: { after: 60 } }));
}

function plainListRows(items) {
  const safe = list(items);
  return safe.length ? safe.join(', ') : '—';
}

function workHistoryTable(rows = [], hidePersonal = false) {
  const safe = Array.isArray(rows) ? rows.filter((row) => text(row?.company) || text(row?.role) || text(row?.duration)) : [];
  const tableRows = [
    new TableRow({
      tableHeader: true,
      children: ['Company', 'Role', 'Duration'].map((heading) =>
        new TableCell({
          shading: { fill: '1F4E78' },
          children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: heading, bold: true, color: 'FFFFFF' })] })]
        })
      )
    })
  ];

  if (!safe.length) {
    tableRows.push(new TableRow({
      children: [new TableCell({ columnSpan: 3, children: [new Paragraph({ alignment: AlignmentType.CENTER, text: '—' })] })]
    }));
  } else {
    for (const row of safe) {
      tableRows.push(new TableRow({
        children: [hidePersonal ? 'Confidential' : (text(row.company) || 'Confidential'), text(row.role) || '—', text(row.duration) || '—'].map((value) =>
          new TableCell({ children: [new Paragraph({ alignment: AlignmentType.CENTER, text: value })] })
        )
      }));
    }
  }

  return new Table({ width: { size: 100, type: WidthType.PERCENTAGE }, rows: tableRows });
}

function projectBlock(project = {}) {
  const title = [text(project.name), text(project.role)].filter(Boolean).join(' | ') || 'Project';
  const children = [
    new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: title, bold: true })] })
  ];
  if (text(project.duration)) children.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'Duration: ', bold: true }), new TextRun(text(project.duration))] }));
  if (list(project.technologies).length) children.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'Technologies: ', bold: true }), new TextRun(plainListRows(project.technologies))] }));
  children.push(...bullets(project.highlights));
  return children;
}

function experienceBlock(exp = {}, hidePersonal = false) {
  const bits = [text(exp.role)];
  if (!hidePersonal && text(exp.company)) bits.push(text(exp.company));
  if (text(exp.client)) bits.push(`Client: ${text(exp.client)}`);
  const headerBits = bits.filter(Boolean);
  const children = [new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: headerBits.join(' | ') || 'Technical Experience', bold: true })] })];
  if (text(exp.duration)) children.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'Duration: ', bold: true }), new TextRun(text(exp.duration))] }));
  if (list(exp.environment).length) children.push(new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: 'Environment: ', bold: true }), new TextRun(plainListRows(exp.environment))] }));
  children.push(...bullets(exp.contributions));
  return children;
}

export async function generateDocx({ data, outputPath }) {
  const hidePersonal = Boolean(data.maskPersonalDetails);
  const doc = new Document({
    creator: 'OpenAI',
    title: 'MLE Resume',
    description: 'Recruiter formatted resume',
    styles: {
      default: {
        document: { run: { font: 'Calibri', size: 22, fontFamily: 'Calibri' }, paragraph: { spacing: { line: 276 } } },
        heading1: { run: { bold: true, size: 34, color: '0F2D71' }, paragraph: { spacing: { after: 120 } } },
        heading2: { run: { bold: true, size: 26, color: '0F2D71' }, paragraph: { spacing: { before: 180, after: 100 } } }
      }
    },
    sections: [{
      properties: {
        page: { margin: { top: 720, right: 720, bottom: 720, left: 720 } }
      },
      headers: {
        default: new Header({ children: [new Paragraph({ alignment: AlignmentType.RIGHT, children: [new TextRun({ text: text(data.confidentialLabel) || 'Confidential', color: '6B7280', size: 18 })] })] })
      },
      footers: {
        default: new Footer({ children: [new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun('MLE Resume Format • Page '), PageNumber.CURRENT] })] })
      },
      children: [
        new Paragraph({ text: formatDisplayName(data.candidateName, data.candidateInitials, hidePersonal), heading: 'Heading1' }),
        metaValue('Title', data.title),
        metaValue('Total Experience', data.totalExperience),
        metaValue('Current Designation', data.currentDesignation),
        metaValue('Current Company', hidePersonal ? 'Confidential' : data.currentCompany),
        metaValue('Notice Period', data.noticePeriod),
        metaValue('Current CTC', hidePersonal ? 'Redacted' : data.currentCtc),
        metaValue('Expected CTC', hidePersonal ? 'Redacted' : data.expectedCtc),
        metaValue('Highest Qualification', data.highestQualification),
        metaValue('Location', hidePersonal ? 'Redacted' : data.location),
        metaValue('Phone', hidePersonal ? 'Redacted' : data.phone),
        metaValue('Email', hidePersonal ? 'Redacted' : data.email),
        metaValue('LinkedIn', hidePersonal ? 'Redacted' : data.linkedin),
        sectionHeading('Professional Summary'),
        ...bullets(data.professionalSummary),
        sectionHeading('Expertise in'),
        ...bullets(data.expertise),
        sectionHeading('Domain Experience'),
        ...bullets(data.domainExperience),
        sectionHeading('Tools and Platforms'),
        ...bullets(data.toolsAndPlatforms),
        sectionHeading('Educational Qualification'),
        ...bullets(hidePersonal ? (data.educationalQualification || []).map(stripInstitutionName) : data.educationalQualification),
        sectionHeading('Technical Skills'),
        ...((Array.isArray(data.skillGroups) && data.skillGroups.length) ? data.skillGroups.flatMap((group) => [new Paragraph({ spacing: { after: 50 }, children: [new TextRun({ text: `${text(group.title) || 'Skills'}: `, bold: true }), new TextRun(plainListRows(group.items))] })]) : [new Paragraph('—')]),
        sectionHeading('Work History'),
        workHistoryTable(data.workHistory, hidePersonal),
        sectionHeading('Technical Experience'),
        ...((Array.isArray(data.technicalExperience) && data.technicalExperience.length) ? data.technicalExperience.flatMap((exp) => experienceBlock(exp, hidePersonal)) : [new Paragraph('—')]),
        sectionHeading('Projects'),
        ...((Array.isArray(data.projects) && data.projects.length) ? data.projects.flatMap(projectBlock) : [new Paragraph('—')]),
        sectionHeading('Key Achievements'),
        ...bullets(data.keyAchievements),
        sectionHeading('Certifications'),
        ...bullets(data.certifications),
        sectionHeading('Languages Known'),
        ...bullets(data.languagesKnown),
        ...((Array.isArray(data.additionalSections) && data.additionalSections.length)
          ? data.additionalSections.flatMap((section) => [sectionHeading(text(section.title) || 'Additional Information'), ...bullets(section.items)])
          : [])
      ]
    }]
  });

  const buffer = await Packer.toBuffer(doc);
  await fs.writeFile(outputPath, buffer);
}
