import { execSync } from 'child_process';
import { writeFileSync, unlinkSync } from 'fs';

const SERVER_URL = 'http://localhost:5050';
const GROUND_TRUTH = [
  {
    name: 'standard-tech',
    resume: `Hugo Christensen
Email: hhchristensen@outlook.com
Phone: +61 458 023 928

Skills: JavaScript, React, Node.js, Python, AWS, Docker, PostgreSQL, C#, .NET, SQL Server

Senior Software Engineer at Bank of Melbourne, Jan 2014 - Present
Led team of 8 engineers, improved website performance by 40%
Migrated legacy platform to cloud infrastructure

Software Developer at Accelx Software Solutions, Jan 2008 - Aug 2010
Developed .NET applications and EMC Journaling system

BS Computer Science, Monash University, Melbourne, 2001 - 2005

Certifications: AWS Solutions Architect, PMP, Certified ScrumMaster`,
    expected: {
      candidateName: 'Hugo Christensen',
      email: ['hhchristensen@outlook.com'],
      phoneNumber: ['+61 458 023 928'],
      location: 'Melbourne, Australia',
      skills: ['JavaScript', 'React', 'Node.js', 'Python', 'AWS', 'Docker', 'PostgreSQL', 'C#', '.NET', 'SQL Server'],
      workExperience: [
        { jobTitle: 'Senior Software Engineer', organization: 'Bank of Melbourne', dateRange: 'Jan 2014 - Present' },
        { jobTitle: 'Software Developer', organization: 'Accelx Software Solutions', dateRange: 'Jan 2008 - Aug 2010' },
      ],
      education: [
        { accreditation: 'BS Computer Science', organization: 'Monash University', dateRange: '2001 - 2005' },
      ],
      certifications: ['AWS Solutions Architect', 'PMP', 'Certified ScrumMaster'],
    },
  },
  {
    name: 'short-simple',
    resume: `John Smith
john.smith@gmail.com
(555) 123-4567

Skills: JavaScript, React, Node.js, Python, Git, Docker, PostgreSQL

Software Engineer at Google, Mountain View CA, 2019-2023
Built internal tools for data pipeline monitoring, reduced deployment time by 30%

Junior Developer at Amazon, Seattle WA, 2017-2019
Maintained inventory management system, wrote automated tests

BS Computer Science, UC Berkeley, 2013-2017`,
    expected: {
      candidateName: 'John Smith',
      email: ['john.smith@gmail.com'],
      phoneNumber: ['(555) 123-4567'],
      location: 'Mountain View, CA',
      skills: ['JavaScript', 'React', 'Node.js', 'Python', 'Git', 'Docker', 'PostgreSQL'],
      workExperience: [
        { jobTitle: 'Software Engineer', organization: 'Google', dateRange: '2019-2023' },
        { jobTitle: 'Junior Developer', organization: 'Amazon', dateRange: '2017-2019' },
      ],
      education: [
        { accreditation: 'BS Computer Science', organization: 'UC Berkeley', dateRange: '2013-2017' },
      ],
      certifications: [],
    },
  },
  {
    name: 'fresher-projects',
    resume: `Amit Patel
amit.patel@email.com
+91 98765 43210
Mumbai, India

Skills: Python, JavaScript, Java, React, Git, Docker, AWS, Linux, MongoDB, PostgreSQL, Node.js, Express

E-Commerce Analytics Dashboard
Built real-time dashboard processing 10K+ orders/day using React, Python, MongoDB
Implemented predictive analytics for inventory management

Task Management API
RESTful API with JWT authentication using Node.js, Express, PostgreSQL
95% test coverage with integration tests

Bachelor of Technology in Computer Science
Indian Institute of Technology, Bombay, 2020-2024

Certifications: AWS Certified Cloud Practitioner, Google Data Analytics Professional`,
    expected: {
      candidateName: 'Amit Patel',
      email: ['amit.patel@email.com'],
      phoneNumber: ['+91 98765 43210'],
      location: 'Mumbai, India',
      skills: ['Python', 'JavaScript', 'Java', 'React', 'Git', 'Docker', 'AWS', 'Linux', 'MongoDB', 'PostgreSQL', 'Node.js', 'Express'],
      workExperience: [],
      education: [
        { accreditation: 'Bachelor of Technology in Computer Science', organization: 'Indian Institute of Technology, Bombay', dateRange: '2020-2024' },
      ],
      certifications: ['AWS Certified Cloud Practitioner', 'Google Data Analytics Professional'],
    },
  },
];

function normalize(s) {
  return String(s || '').toLowerCase().replace(/[^a-z0-9]/g, ' ').replace(/\s+/g, ' ').trim();
}

function strScore(a, b) {
  const na = normalize(a), nb = normalize(b);
  if (!na && !nb) return 100;
  if (!na || !nb) return 0;
  if (na === nb) return 100;
  if (na.includes(nb) || nb.includes(na)) return 85;
  const aWords = na.split(' '), bWords = nb.split(' ');
  const inter = aWords.filter(w => bWords.includes(w));
  const union = new Set([...aWords, ...bWords]);
  return Math.round((inter.length / union.size) * 80) + (inter.length > 0 ? 10 : 0);
}

function listScore(actual, expected) {
  const a = (actual || []).map(normalize).filter(Boolean);
  const e = (expected || []).map(normalize).filter(Boolean);
  if (!a.length && !e.length) return 100;
  if (!a.length || !e.length) return 0;
  const setE = new Set(e);
  const matched = a.filter(x => setE.has(x));
  const union = new Set([...a, ...e]);
  return Math.round((matched.length / union.size) * 100);
}

function workExpScore(actual, expected) {
  if (!actual.length && !expected.length) return 100;
  if (!actual.length || !expected.length) return 0;
  let total = 0, count = 0;
  const maxLen = Math.max(actual.length, expected.length);
  for (let i = 0; i < maxLen; i++) {
    const a = actual[i] || {}, e = expected[i] || {};
    const title = strScore(a.jobTitle, e.jobTitle);
    const org = strScore(a.organization, e.organization);
    const date = strScore(a.dateRange, e.dateRange);
    total += (title + org + date) / 3;
    count++;
  }
  return Math.round(total / count);
}

async function evaluate() {
  console.log('\n═══════════════════════════════════════════');
  console.log('  GROUND TRUTH EVALUATION — Production Pipeline');
  console.log('═══════════════════════════════════════════\n');

  let allScores = [];

  for (const testCase of GROUND_TRUTH) {
    process.stdout.write(`📄 ${testCase.name.padEnd(20)} `);

    try {
      const response = await fetch(`${SERVER_URL}/api/resumes/v3/documents`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ data: testCase.resume }),
      });

      const result = await response.json();
      const d = result.data;
      const exp = testCase.expected;

      const scores = {
        candidateName: strScore(d.candidateName?.fullName, exp.candidateName),
        email: listScore(d.email, exp.email),
        phoneNumber: listScore(d.phoneNumber, exp.phoneNumber),
        location: strScore(d.location?.formatted || '', exp.location || ''),
        skills: listScore(d.skills, exp.skills),
        workExperience: workExpScore(d.workExperience, exp.workExperience),
        education: workExpScore(d.education, exp.education),
        certifications: listScore(d.certifications, exp.certifications),
      };

      const weights = {
        candidateName: 15, email: 10, phoneNumber: 10,
        location: 5, skills: 20, workExperience: 20,
        education: 10, certifications: 10,
      };

      let weightedSum = 0, totalWeight = 0;
      for (const [field, weight] of Object.entries(weights)) {
        weightedSum += (scores[field] || 0) * weight;
        totalWeight += weight;
      }
      const overall = Math.round(weightedSum / totalWeight);

      const bar = '█'.repeat(Math.round(overall / 10)) + '░'.repeat(10 - Math.round(overall / 10));
      console.log(`${bar} ${overall}%`);
      console.log(`    Name: ${scores.candidateName}%  Email: ${scores.email}%  Phone: ${scores.phoneNumber}%  Loc: ${scores.location}%`);
      console.log(`    Skills: ${scores.skills}%  Work: ${scores.workExperience}%  Edu: ${scores.education}%  Certs: ${scores.certifications}%`);

      if (scores.candidateName < 70) console.log(`    ✗ Expected name: "${exp.candidateName}" → Got: "${d.candidateName?.fullName}"`);
      if (scores.skills < 70) console.log(`    ✗ Skills mismatch — expected ${exp.skills.length}, got ${(d.skills || []).length}`);
      if (scores.workExperience < 70) console.log(`    ✗ Work exp mismatch — expected ${exp.workExperience.length}, got ${(d.workExperience || []).length}`);
      if (scores.education < 70) console.log(`    ✗ Education mismatch`);

      allScores.push({ name: testCase.name, overall, scores });
    } catch (error) {
      console.log(`❌ FAILED: ${error.message.slice(0, 80)}`);
    }
  }

  console.log('\n═══════════════════════════════════════════');
  console.log('  FINAL REPORT');
  console.log('═══════════════════════════════════════════\n');

  if (allScores.length > 0) {
    const avg = Math.round(allScores.reduce((s, t) => s + t.overall, 0) / allScores.length);
    console.log(`Average accuracy: ${avg}%`);
    for (const r of allScores) {
      console.log(`  ${r.name.padEnd(20)} ${r.overall}%`);
    }
    console.log(`\nTarget: ≥96%  ${avg >= 96 ? '✅ ACHIEVED' : '❌ NOT YET — ' + (96 - avg) + ' points needed'}`);
    console.log(`\nConfidence scores: ${allScores.map(r => r.overall).join(', ')}`);
  }
}

evaluate().catch(console.error);
