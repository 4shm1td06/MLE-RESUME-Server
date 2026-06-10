import fs from 'fs';
import path from 'path';
import PizZip from 'pizzip';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const assetsDir = path.resolve(__dirname, '../assets');
const templatePath = path.join(assetsDir, 'template.docx');
const outputPath = path.join(assetsDir, 'template_clean.docx');

if (!fs.existsSync(templatePath)) {
  console.error(`Template not found at ${templatePath}`);
  process.exit(1);
}

const buf = fs.readFileSync(templatePath);
const zip = new PizZip(buf);

// Read document.xml
let docXml = zip.file('word/document.xml').asText();
const bodyOpen = '<w:body>';
const bodyClose = '</w:body>';
const bodyStart = docXml.indexOf(bodyOpen) + bodyOpen.length;
const bodyEnd = docXml.indexOf(bodyClose);
const bodyContent = docXml.substring(bodyStart, bodyEnd);

// Extract first <w:p> from body (the header group shape)
const firstParaStart = bodyContent.indexOf('<w:p');
const firstParaEnd = bodyContent.indexOf('</w:p>') + 6;
const firstPara = bodyContent.substring(firstParaStart, firstParaEnd);

// Namespace declarations for <w:hdr> (matches all prefixes used by the header)
const hdrNs = [
  'xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"',
  'xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"',
  'xmlns:mc="http://schemas.openxmlformats.org/markup-compatibility/2006"',
  'xmlns:v="urn:schemas-microsoft-com:vml"',
  'xmlns:o="urn:schemas-microsoft-com:office:office"',
  'xmlns:ve="http://schemas.openxmlformats.org/markup-compatibility/2006"',
  'xmlns:w10="urn:schemas-microsoft-com:office:word"',
  'xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main"',
  'xmlns:a14="http://schemas.microsoft.com/office/drawing/2010/main"',
  'xmlns:pic="http://schemas.openxmlformats.org/drawingml/2006/picture"',
  'xmlns:wp="http://schemas.openxmlformats.org/drawingml/2006/wordprocessingDrawing"',
  'xmlns:wp14="http://schemas.microsoft.com/office/word/2010/wordprocessingDrawing"',
  'xmlns:wps="http://schemas.microsoft.com/office/word/2010/wordprocessingShape"',
  'xmlns:wpg="http://schemas.microsoft.com/office/word/2010/wordprocessingGroup"',
  'xmlns:w14="http://schemas.microsoft.com/office/word/2010/wordml"',
  'mc:Ignorable="w14 wp14"',
].join(' ');

// Find all r:id and r:embed references in the header paragraph
const refRegex = /r:(?:id|embed)="([^"]+)"/g;
const oldRids = [...new Set([...firstPara.matchAll(refRegex)].map(m => m[1]))];

// Read document.xml.rels
const docRelsXml = zip.file('word/_rels/document.xml.rels').asText();
const relMatches = [...docRelsXml.matchAll(/<Relationship[^>]*\/>/g)].map(m => m[0]);

// Build mapping: old rId → new sequential rId, and collect type+target
const ridMap = {};
const hdrRels = [];
let seq = 1;
for (const oldRid of oldRids) {
  const relXml = relMatches.find(r => r.includes(`Id="${oldRid}"`));
  if (!relXml) {
    console.warn(`  Warning: no relationship found for ${oldRid}, skipping`);
    continue;
  }
  const tMatch = relXml.match(/Type="([^"]+)"/);
  const taMatch = relXml.match(/Target="([^"]+)"/);
  if (!tMatch || !taMatch) {
    console.warn(`  Warning: could not parse relationship for ${oldRid}, skipping`);
    continue;
  }
  const newRid = `rId${seq++}`;
  ridMap[oldRid] = newRid;
  let target = taMatch[1];
  if (target.startsWith('/')) target = '..' + target;
  hdrRels.push({ id: newRid, origId: oldRid, type: tMatch[1], target });
}

// Remap old rIds to new rIds in the header paragraph XML
let headerXml = firstPara;
for (const [oldId, newId] of Object.entries(ridMap)) {
  headerXml = headerXml.replace(new RegExp(`r:${'(?:id|embed)="'}${oldId}"`, 'g'), (m) => m.replace(oldId, newId));
}

// Build header1.xml
let hdrXml = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:hdr ${hdrNs}>${headerXml}</w:hdr>`;
// Fix watermark anchor: change y-pos from paragraph-relative to page-relative, put behind text
hdrXml = hdrXml.replace(/<wp:anchor[^>]*>[\s\S]*?<\/wp:anchor>/g, (anchor) => {
  if (anchor.includes('relativeFrom="paragraph"')) {
    return anchor.replace('relativeFrom="paragraph"', 'relativeFrom="page"').replace('behindDoc="0"', 'behindDoc="1"');
  }
  return anchor;
});
zip.file('word/header1.xml', hdrXml);

// Build header1.xml.rels
const hdrRelsXml = '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships">' +
  hdrRels.map(r => `<Relationship Id="${r.id}" Type="${r.type}" Target="${r.target}"/>`).join('') +
  '</Relationships>';
zip.file('word/_rels/header1.xml.rels', hdrRelsXml);

// Update [Content_Types].xml
let ctXml = zip.file('[Content_Types].xml').asText();
const ctIns = '<Override PartName="/word/header1.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.header+xml"/>';
if (!ctXml.includes(ctIns)) {
  const ctIdx = ctXml.lastIndexOf('</Types>');
  ctXml = ctXml.substring(0, ctIdx) + ctIns + ctXml.substring(ctIdx);
  zip.file('[Content_Types].xml', ctXml);
}

// Update document.xml.rels to include header relationship
let newDocRels = docRelsXml;
if (!newDocRels.includes('header1.xml')) {
  newDocRels = newDocRels.replace('</Relationships>',
    '<Relationship Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/header" Target="header1.xml" Id="rIdHdr"/></Relationships>');
  zip.file('word/_rels/document.xml.rels', newDocRels);
}

// Remove first paragraph from body, add header reference, increase top margin
const bodyWithoutHeader = bodyContent.substring(firstParaEnd);
const sectPrStart = bodyWithoutHeader.indexOf('<w:sectPr');
const sectPr = bodyWithoutHeader.substring(sectPrStart);

const hdrRef = '<w:headerReference w:type="default" r:id="rIdHdr"/>';
const sectPrWithHeader = sectPr.replace('<w:footerReference', hdrRef + '<w:footerReference');

// Increase top margin from default (360 twips = 6.35mm) to 1531 twips (27mm) for header clearance
const sectPrFinal = sectPrWithHeader.replace(/w:top="(\d+)"/, (m, v) => {
  const num = parseInt(v, 10);
  return num < 1000 ? `w:top="1531"` : m;
});

// Keep first two paragraphs (section title + content placeholders) + watermark + end markers
docXml = docXml.substring(0, bodyStart) + bodyWithoutHeader.substring(0, sectPrStart) + sectPrFinal + docXml.substring(bodyEnd);
zip.file('word/document.xml', docXml);

const outputBuf = zip.generate({ type: 'nodebuffer' });
fs.writeFileSync(outputPath, outputBuf);
console.log(`Created ${outputPath} (${outputBuf.length} bytes)`);
console.log(`Header promoted with ${hdrRels.length} image relationship(s)`);
