import 'dotenv/config';

const OPENROUTER_URL = 'https://openrouter.ai/api/v1/chat/completions';
const API_KEY = process.env.OPENROUTER_API_KEY?.trim();
const SYSTEM_MODEL = 'google/gemini-2.5-flash-lite';
const REFERENCE_MODEL = 'deepseek/deepseek-v4-flash';

const EVAL_PROMPT = `You are a resume data extraction evaluator. You will receive TWO JSON objects extracted from the same resume text: one from a system under test (SUT) and one from a reference parser (REF). Compare them field-by-field and return a JSON score.

Return:
{
  "field_scores": {
    "candidateName": <0-100>,
    "email": <0-100>,
    "phoneNumber": <0-100>,
    "skills": <0-100>,
    "workExperience": {
      "overall": <0-100>,
      "details": [{"jobTitle": <0-100>, "organization": <0-100>, "dateRange": <0-100>}, ...]
    },
    "education": {
      "overall": <0-100>,
      "details": [{"accreditation": <0-100>, "organization": <0-100>, "dateRange": <0-100>}, ...]
    },
    "certifications": <0-100>,
    "location": <0-100>,
    "summary": <0-100>,
    "languages": <0-100>,
    "projects": <0-100>,
    "totalYearsExperience": <0-100>
  },
  "overall": <0-100>,
  "sut_errors": ["<description of what SUT got wrong>", ...],
  "ref_errors": ["<description of what REF got wrong>", ...]
}

Scoring rules:
- 100 = perfect match (same value or semantically identical)
- 80 = minor difference (extra/missing word, different date format)
- 60 = partial match (wrong but related value)
- 40 = major error (missing field, wrong value)
- 0 = completely wrong
- Use judgment for partial matches based on semantic similarity

SUT: {{SUT}}
REF: {{REF}}`;

const TEST_RESUMES = [
  {
    name: 'standard-tech',
    text: `Hugo Christensen
Email: hhchristensen@outlook.com
Phone: +61 458 023 928

Skills: JavaScript, React, Node.js, Python, AWS, Docker, PostgreSQL, C#, .NET, SQL Server

Senior Software Engineer at Bank of Melbourne, Jan 2014 - Present
Led team of 8 engineers, improved website performance by 40%
Migrated legacy platform to cloud infrastructure

Software Developer at Accelx Software Solutions, Jan 2008 - Aug 2010
Developed .NET applications and EMC Journaling system
Built command-line backup tools

BS Computer Science, Monash University, Melbourne, 2001 - 2005

Certifications: AWS Solutions Architect, PMP, Certified ScrumMaster`,
  },

  {
    name: 'short-simple',
    text: `John Smith
john.smith@gmail.com
(555) 123-4567

Skills: JavaScript, React, Node.js, Python, Git, Docker, PostgreSQL

Software Engineer at Google, Mountain View CA, 2019-2023
Built internal tools for data pipeline monitoring, reduced deployment time by 30%

Junior Developer at Amazon, Seattle WA, 2017-2019
Maintained inventory management system, wrote automated tests

BS Computer Science, UC Berkeley, 2013-2017`,
  },

  {
    name: 'fresher-no-experience',
    text: `Amit Patel
amit.patel@email.com
+91 98765 43210
Mumbai, India

Skills: Python, JavaScript, Java, React, Git, Docker, AWS, Linux, MongoDB, PostgreSQL, Node.js, Express

E-Commerce Analytics Dashboard (React, Python, MongoDB)
Built real-time dashboard processing 10K+ orders/day, implemented predictive analytics

Task Management API (Node.js, Express, PostgreSQL)
RESTful API with JWT authentication, 95% test coverage

Personal Portfolio Website (React, AWS)
Deployed on AWS with CI/CD pipeline

Bachelor of Technology in Computer Science
Indian Institute of Technology, Bombay, 2020-2024, CGPA 8.7/10

Certifications: AWS Certified Cloud Practitioner, Google Data Analytics Professional

Achievements: Winner Smart India Hackathon 2023, Dean's List all semesters`,
  },

  {
    name: 'executive-level',
    text: `MARGARET THOMPSON
margaret.thompson@executive.com | +1 (415) 555-0199 | San Francisco, CA
linkedin.com/in/margaretthompson

EXECUTIVE SUMMARY
Visionary Chief Technology Officer with 20+ years of leadership experience driving digital transformation. Expertise in enterprise architecture, cloud migration, and building high-performance organizations of 200+ people.

CORE COMPETENCIES
Technology Strategy & Roadmap, Enterprise Architecture, Cloud Migration (AWS/Azure/GCP), M&A Technical Due Diligence, Engineering Team Building, Digital Transformation, Budget Management ($50M+), Board-Level Communication

PROFESSIONAL EXPERIENCE

Chief Technology Officer at GlobalTech Industries, New York NY, 2018 - Present
- Led digital transformation resulting in $200M annual cost savings
- Built and scaled engineering organization from 50 to 300+ engineers
- Drove cloud migration strategy reducing infrastructure costs by 45%
- Established AI/ML Center of Excellence serving 5 business units

Senior Vice President of Engineering at DataStream Corporation, San Francisco CA, 2012 - 2018
- Managed portfolio of 20+ products with $500M annual revenue
- Implemented Agile transformation across 40 teams
- Reduced time-to-market by 60% through platform modernization

EDUCATION
Master of Business Administration (MBA), Harvard Business School, 2005 - 2007
Bachelor of Science in Computer Engineering, MIT, 2000 - 2004

BOARD MEMBERSHIPS
Board of Directors, TechStart Foundation (2020-Present)
Advisory Board, Stanford Center for Digital Innovation (2019-Present)

CERTIFICATIONS
AWS Certified Solutions Architect - Professional
Google Cloud Professional Cloud Architect
CISSP`,
  },

  {
    name: 'academic-research',
    text: `Dr. Sarah Chen
sarah.chen@university.edu

SUMMARY
Research scientist specializing in machine learning and NLP with 10+ years of experience.

SKILLS
Machine Learning: PyTorch, TensorFlow, scikit-learn, XGBoost
NLP: Transformers, BERT, GPT, LLM fine-tuning, RAG systems
Programming: Python, R, Julia, C++, MATLAB
Languages: English (Native), Mandarin Chinese (Fluent), Japanese (Conversational)

EXPERIENCE

Senior Research Scientist at Google AI, Mountain View CA, 2020 - Present
- Developed novel transformer architectures for long-document understanding
- Led team of 5 researchers on NLP for healthcare

Research Scientist at Microsoft Research, Redmond WA, 2016 - 2020
- Published 8 papers at top-tier conferences (NeurIPS, ACL, ICLR)
- Developed cross-lingual transfer methods for low-resource languages

EDUCATION
Ph.D. in Computer Science, Stanford University, 2012 - 2016
M.S. in Computer Science, Stanford University, 2010 - 2012
B.S. in Computer Science & Mathematics, MIT, 2006 - 2010

PUBLICATIONS
- Chen et al. (2023). "Efficient Long-Form Text Generation". NeurIPS 2023.
- Chen et al. (2021). "Cross-lingual Transfer for Low-Resource Languages". ACL 2021.

PATENTS
- US Patent 11,234,567: "System and Method for Efficient Text Processing" (2022)
- US Patent 11,098,765: "Cross-lingual Document Understanding" (2021)`,
  },
];

function extractFields(data) {
  return {
    candidateName: data?.candidateName?.fullName || '',
    email: (data?.email || []).join(', '),
    phoneNumber: (data?.phoneNumber || []).join(', '),
    location: data?.location?.formatted || data?.location || '',
    skills: (data?.skills || []).sort().join(', '),
    certifications: (data?.certifications || []).sort().join(', '),
    totalYearsExperience: data?.totalYearsExperience || '',
    summary: data?.summary || '',
    languages: (data?.languages || []).map(l => l.name || l).sort().join(', '),
    workExperience: (data?.workExperience || []).map(w => ({
      jobTitle: w.jobTitle || '',
      organization: w.organization || '',
      dateRange: w.dateRange || '',
    })),
    education: (data?.education || []).map(e => ({
      accreditation: e.accreditation || '',
      organization: e.organization || '',
      dateRange: e.dateRange || '',
    })),
    projects: (data?.projects || []).map(p => p.title || '').join(', '),
  };
}

async function callModel(model, prompt, maxTokens = 500) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 60000);

  try {
    const response = await fetch(OPENROUTER_URL, {
      method: 'POST',
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model,
        messages: [
          { role: 'system', content: 'You are a resume parser. Return only valid JSON. No markdown. No explanations.' },
          { role: 'user', content: prompt },
        ],
        temperature: 0.05,
        max_tokens: maxTokens,
      }),
    });

    if (!response.ok) {
      const errText = await response.text().catch(() => '');
      throw new Error(`${response.status} ${errText}`);
    }

    const json = await response.json();
    let content = json?.choices?.[0]?.message?.content || '';
    content = content.replace(/```json\n?/gi, '').replace(/```\n?/g, '').replace(/^`+|`+$/g, '').trim();

    const start = content.indexOf('{');
    const end = content.lastIndexOf('}');
    if (start !== -1 && end !== -1) {
      content = content.slice(start, end + 1);
    }

    try {
      return JSON.parse(content);
    } catch (parseError) {
      if (model.includes('deepseek') && content.length > 0) {
        const lastBrace = content.lastIndexOf('}');
        const lastBracket = content.lastIndexOf(']');
        const lastValid = Math.max(lastBrace, lastBracket);
        if (lastValid > start) {
          const repaired = content.slice(start, lastValid + 1) + (lastValid === lastBrace ? '' : ']}');
          try { return JSON.parse(repaired); } catch {}
        }
      }
      throw new Error(`JSON parse error at position ${parseError.message.match(/position (\d+)/)?.[1] || '?'}: ${content.slice(Math.max(0, content.length - 200))}`);
    }
  } finally {
    clearTimeout(timeout);
  }
}

function buildParsePrompt(rawText) {
  return `JSON extraction rules:
1. LOCATION: Extract from address lines, city/state in education or work entries, and contact sections
2. SKILLS: Extract ONLY individual skill names, one per array item. Never include category labels like "Languages:" or "Tools:"
3. WORK: Each role as separate entry with exact job title, company name, date range
4. EDUCATION: Each degree separately with exact accreditation and organization names
5. CERTS: Certification names exactly as written
6. NAME: Full name exactly as written at top of resume

Schema: candidateName{fullName}, email[], phoneNumber[], location{formatted}, summary, skills[], workExperience[{jobTitle,organization,dateRange}], education[{accreditation,organization,dateRange}], certifications[], totalYearsExperience, languages[{name,proficiency}], projects[{title,technologies[],highlights[]}]

Resume: ${rawText}`;
}

function normalizeString(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function stringSimilarity(a, b) {
  const na = normalizeString(a);
  const nb = normalizeString(b);
  if (!na && !nb) return 100;
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 85;
  const aWords = na.split(' ');
  const bWords = nb.split(' ');
  const intersection = aWords.filter(w => bWords.includes(w));
  const union = new Set([...aWords, ...bWords]);
  const jaccard = union.size > 0 ? intersection.length / union.size : 0;
  return Math.round(jaccard * 80) + (intersection.length > 0 ? 10 : 0);
}

function listSimilarity(a, b) {
  const A = (a || '').split(/[,;]/).map(s => normalizeString(s)).filter(Boolean);
  const B = (b || '').split(/[,;]/).map(s => normalizeString(s)).filter(Boolean);
  if (!A.length && !B.length) return 100;
  if (!A.length || !B.length) return 0;
  const setA = new Set(A);
  const setB = new Set(B);
  const intersection = A.filter(x => setB.has(x));
  const union = new Set([...A, ...B]);
  return Math.round((intersection.length / union.size) * 100);
}

function arrayOfObjectsSimilarity(sutArr, refArr, fields) {
  if (!sutArr.length && !refArr.length) return { overall: 100, details: [] };
  if (!sutArr.length || !refArr.length) return { overall: 0, details: [] };

  const details = [];
  const maxLen = Math.max(sutArr.length, refArr.length);
  let totalScore = 0;
  let count = 0;

  for (let i = 0; i < maxLen; i++) {
    const s = sutArr[i] || {};
    const r = refArr[i] || {};
    const scores = {};
    let itemScore = 0;
    let itemFields = 0;

    for (const field of fields) {
      const score = stringSimilarity(s[field] || '', r[field] || '');
      scores[field] = score;
      itemScore += score;
      itemFields++;
    }

    const avg = itemFields > 0 ? Math.round(itemScore / itemFields) : 100;
    details.push({ ...scores, overall: avg });
    totalScore += avg;
    count++;
  }

  return { overall: count > 0 ? Math.round(totalScore / count) : 100, details };
}

async function evaluate() {
  console.log(`\n Evaluation Framework`);
  console.log(` System model: ${SYSTEM_MODEL}`);
  console.log(` Reference model: ${REFERENCE_MODEL}`);
  console.log(` Test cases: ${TEST_RESUMES.length}`);
  console.log('='.repeat(70));

  let allScores = [];

  for (const testCase of TEST_RESUMES) {
    console.log(`\n📄 ${testCase.name}`);
    console.log('-'.repeat(40));

    try {
      const prompt = buildParsePrompt(testCase.text);

      console.log('  Calling system...');
      const systemResult = await callModel(SYSTEM_MODEL, prompt, 600);
      console.log('  Calling reference...');
      let refResult;
      try {
        refResult = await callModel(REFERENCE_MODEL, prompt, 1000);
      } catch (e) {
        console.log(`  Reference failed: ${e.message.slice(0,80)} — retrying with more tokens`);
        refResult = await callModel(REFERENCE_MODEL, prompt, 1500);
      }

      const systemFields = extractFields(systemResult);
      const refFields = extractFields(refResult);

      const scores = {
        candidateName: stringSimilarity(systemFields.candidateName, refFields.candidateName),
        email: stringSimilarity(systemFields.email, refFields.email),
        phoneNumber: stringSimilarity(systemFields.phoneNumber, refFields.phoneNumber),
        location: stringSimilarity(systemFields.location, refFields.location),
        summary: stringSimilarity(systemFields.summary, refFields.summary),
        skills: listSimilarity(systemFields.skills, refFields.skills),
        certifications: listSimilarity(systemFields.certifications, refFields.certifications),
        totalYearsExperience: stringSimilarity(systemFields.totalYearsExperience, refFields.totalYearsExperience),
        languages: listSimilarity(systemFields.languages, refFields.languages),
        projects: listSimilarity(systemFields.projects, refFields.projects),
        workExperience: arrayOfObjectsSimilarity(
          systemFields.workExperience, refFields.workExperience,
          ['jobTitle', 'organization', 'dateRange']
        ),
        education: arrayOfObjectsSimilarity(
          systemFields.education, refFields.education,
          ['accreditation', 'organization', 'dateRange']
        ),
      };

      const fieldWeights = {
        candidateName: 12,
        email: 8,
        phoneNumber: 8,
        location: 5,
        summary: 5,
        skills: 15,
        certifications: 5,
        totalYearsExperience: 5,
        languages: 3,
        projects: 4,
        workExperience: 18,
        education: 12,
      };

      let weightedSum = 0;
      let totalWeight = 0;

      console.log('  Scores:');
      for (const [field, weight] of Object.entries(fieldWeights)) {
        const score = typeof scores[field] === 'object' ? scores[field].overall : scores[field];
        weightedSum += score * weight;
        totalWeight += weight;
        const bar = '█'.repeat(Math.round(score / 10)) + '░'.repeat(10 - Math.round(score / 10));
        console.log(`  ${field.padEnd(25)} ${bar} ${score}%`);
      }

      const overall = totalWeight > 0 ? Math.round(weightedSum / totalWeight) : 0;
      console.log(`  ${'─'.repeat(40)}`);
      console.log(`  ${'OVERALL'.padEnd(25)} ${'█'.repeat(Math.round(overall / 10))}${'░'.repeat(10 - Math.round(overall / 10))} ${overall}%`);

      allScores.push({ name: testCase.name, overall, scores });
    } catch (error) {
      console.error(`  ❌ Failed: ${(error.message || '').slice(0, 200)}`);
    }
  }

  console.log('\n' + '='.repeat(70));
  console.log('📊 FINAL REPORT');
  console.log('='.repeat(70));

  if (allScores.length > 0) {
    const avgOverall = Math.round(allScores.reduce((s, t) => s + t.overall, 0) / allScores.length);
    console.log(`\nAverage accuracy across ${allScores.length} test cases: ${avgOverall}%`);

    for (const result of allScores) {
      console.log(`  ${result.name.padEnd(25)} ${result.overall}%`);
    }

    if (avgOverall >= 96) {
      console.log('\n🎉 TARGET ACHIEVED! Accuracy ≥ 96%');
    } else {
      console.log(`\n⚠️  Need to improve: ${96 - avgOverall} points to target`);
    }
  }
}

evaluate().catch(console.error);
