import fs from 'fs';
import path from 'path';
import puppeteer from 'puppeteer';

function esc(value = '') {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

function getMimeType(filePath) {
  const ext = path.extname(filePath).toLowerCase();

  switch (ext) {
    case '.png':
      return 'image/png';
    case '.jpg':
    case '.jpeg':
      return 'image/jpeg';
    case '.svg':
      return 'image/svg+xml';
    case '.webp':
      return 'image/webp';
    default:
      return 'image/png';
  }
}

function getBase64ImageDataUrl(filePath) {
  if (!fs.existsSync(filePath)) {
    throw new Error(`Logo file not found at: ${filePath}`);
  }

  const file = fs.readFileSync(filePath);
  const mimeType = getMimeType(filePath);
  return `data:${mimeType};base64,${file.toString('base64')}`;
}

/*
 * Keep header/footer dimensions and margins aligned.
 * Puppeteer margin.top must cover header height + gap.
 * Puppeteer margin.bottom must cover footer height + gap.
 */
const HEADER_HEIGHT_MM = 20;
const HEADER_GAP_MM = 4;
const MARGIN_TOP_MM = HEADER_HEIGHT_MM + HEADER_GAP_MM + 3;

const FOOTER_HEIGHT_MM = 18;
const FOOTER_GAP_MM = 4;
const MARGIN_BOTTOM_MM = FOOTER_HEIGHT_MM + FOOTER_GAP_MM;

export async function generatePdf({
  html,
  outputPath,
  confidentialLabel = 'Confidential'
}) {
  const launchOptions = {
    headless: true,
    args: [
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--allow-file-access-from-files'
    ]
  };

  if (process.env.PUPPETEER_EXECUTABLE_PATH) {
    launchOptions.executablePath = process.env.PUPPETEER_EXECUTABLE_PATH;
  }

  const browser = await puppeteer.launch(launchOptions);

  try {
    const page = await browser.newPage();

    await page.setViewport({
      width: 1400,
      height: 2000,
      deviceScaleFactor: 1
    });

    /*
     * Put your logo here:
     *   public/logo.png
     *
     * You can also use logo.jpg, logo.jpeg, logo.svg, logo.webp
     * by changing the filename below.
     */
    const logoFilePath = path.resolve('assets/mle-logo-2023.png');
    const logoDataUrl = getBase64ImageDataUrl(logoFilePath);
    const watermarkFilePath = path.resolve('assets/mle-watermark.png');
    const watermarkDataUrl = getBase64ImageDataUrl(watermarkFilePath);

    /*
     * Replace placeholder in the HTML template.
     * This makes watermark/background images work reliably in Puppeteer.
     */
    const htmlWithEmbeddedLogo = html.replaceAll('__LOGO__', logoDataUrl);
    const htmlWithEmbeddedWatermark = htmlWithEmbeddedLogo.replaceAll('__WATERMARK__', watermarkDataUrl);

    await page.setContent(htmlWithEmbeddedWatermark, {
      waitUntil: 'networkidle0'
    });
const headerTemplate = `
  <div style="
    width: 100%;
    height: ${HEADER_HEIGHT_MM}mm;
    margin: 0;
    padding: 0;
    box-sizing: border-box;
    font-family: Calibri, Arial, Helvetica, sans-serif;
  ">
    <div style="
      position: relative;
      width: 100%;
      height: 100%;
    ">
      <svg
        xmlns="http://www.w3.org/2000/svg"
        width="100%"
        height="${HEADER_HEIGHT_MM}mm"
        viewBox="0 0 210 20"
        preserveAspectRatio="none"
        style="display:block;"
      >
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

        <!-- FULL WIDTH RIBBON -->
        <rect
          x="0"
          y="5.6"
          width="210"
          height="8.8"
          rx="4.4"
          ry="4.4"
          fill="url(#outer)"
        />

        <!-- INNER STRIP FULL WIDTH -->
        <rect
          x="12"
          y="7.8"
          width="170"
          height="4.4"
          rx="2.2"
          ry="2.2"
          fill="#1f5f9f"
        />

        <!-- OVAL FLOATING ON TOP (RIGHT SIDE) -->
        <ellipse
          cx="188"
          cy="10"
          rx="14"
          ry="8"
          fill="url(#ovalGrad)"
          stroke="#0b2f78"
          stroke-width="1.3"
        />
      </svg>

      <!-- TEXT -->
      <div style="
        position: absolute;
        top: 10.05mm;
        left: 16mm;
        transform: translateY(-50%);
        font-size: 7.2px;
        font-weight: 700;
        color: #ffffff;
        white-space: nowrap;
      ">
        ${esc(confidentialLabel)}&nbsp;&nbsp;
      </div>

     <!-- LOGO -->
<div style="
  position: absolute;
  top: 3.2mm;
  right: 7mm;
  width: 30mm;
  height: 14.5mm;
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 3;
">
  <img
    src="${logoDataUrl}"
    alt="Company Logo"
    style="
      width: 85%;
      height: 85%;
      object-fit: contain;
      object-position: center;
      display: block;
    "
  />
</div>

    </div>
  </div>
`;

    const footerTemplate = `
      <div style="
        width: 100%;
        height: ${FOOTER_HEIGHT_MM}mm;
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 0 14mm;
        font-family: Calibri, Arial, Helvetica, sans-serif;
        font-size: 9px;
        color: #5d6e7c;
        border-top: 1px solid #d6e2ee;
        background: #ffffff;
        box-sizing: border-box;
      ">
        <span style="font-weight: 600; letter-spacing: 0.2px;">
          Mle Systems Pvt. Ltd.
        </span>
        <span>MLE Resume</span>
      </div>
    `;

    await page.pdf({
      path: outputPath,
      format: 'A4',
      printBackground: true,
      displayHeaderFooter: true,
      headerTemplate,
      footerTemplate,
      preferCSSPageSize: false,
      margin: {
        top: `${MARGIN_TOP_MM}mm`,
        right: '0',
        bottom: `${MARGIN_BOTTOM_MM}mm`,
        left: '0'
      }
    });
  } finally {
    await browser.close();
  }
}