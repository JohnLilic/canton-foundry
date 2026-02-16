/**
 * Generate static Observatory site from data.
 * Produces index.html, methodology.html, API JSON files.
 */

import {
  readFileSync,
  writeFileSync,
  mkdirSync,
  copyFileSync,
  existsSync,
} from "node:fs";
import { resolve, dirname } from "node:path";
import { fileURLToPath } from "node:url";
import type { ObservatoryProject } from "./types.js";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, "..");
const SITE_DIR = resolve(ROOT, "site");
const DATA_PATH = resolve(
  ROOT,
  "data/ecosystem-observatory.json",
);

function ensureDir(path: string): void {
  if (!existsSync(path)) {
    mkdirSync(path, { recursive: true });
  }
}

function loadProjects(): ObservatoryProject[] {
  const raw = readFileSync(DATA_PATH, "utf-8");
  return JSON.parse(raw) as ObservatoryProject[];
}

function generateApiFiles(
  projects: ObservatoryProject[],
): void {
  const apiDir = resolve(SITE_DIR, "api/v1");
  const projectsDir = resolve(apiDir, "projects");
  ensureDir(projectsDir);

  // Full dataset
  writeFileSync(
    resolve(apiDir, "projects.json"),
    JSON.stringify(projects, null, 2),
  );

  // Per-project files
  for (const p of projects) {
    writeFileSync(
      resolve(projectsDir, `${p.project_id}.json`),
      JSON.stringify(p, null, 2),
    );
  }

  // Metadata
  const metadata = {
    last_refresh: new Date().toISOString(),
    total_projects: projects.length,
    schema_version: "1.0.0",
    projects_in_production: projects.filter(
      (p) => p.status === "production",
    ).length,
    open_source_count: projects.filter(
      (p) => p.open_source,
    ).length,
    audited_count: projects.filter(
      (p) => p.security_audit !== null,
    ).length,
  };

  writeFileSync(
    resolve(apiDir, "metadata.json"),
    JSON.stringify(metadata, null, 2),
  );
}

function computeStats(
  projects: ObservatoryProject[],
): Record<string, string | number> {
  const total = projects.length;
  const production = projects.filter(
    (p) => p.status === "production",
  ).length;
  const audited = projects.filter(
    (p) => p.security_audit !== null,
  ).length;
  const openSource = projects.filter(
    (p) => p.open_source,
  ).length;
  const auditPct =
    total > 0 ? Math.round((audited / total) * 100) : 0;
  const osPct =
    total > 0
      ? Math.round((openSource / total) * 100)
      : 0;

  return {
    total,
    production,
    audited,
    auditPct,
    openSource,
    osPct,
    lastRefresh: new Date().toISOString().split("T")[0] ?? "",
  };
}

function main(): void {
  console.log("Loading project data...");
  const projects = loadProjects();
  const stats = computeStats(projects);

  console.log("Creating output directories...");
  ensureDir(resolve(SITE_DIR, "assets"));
  ensureDir(resolve(SITE_DIR, "api/v1/projects"));

  console.log("Generating API files...");
  generateApiFiles(projects);

  console.log("Writing site assets...");
  // Copy CSS and JS from templates
  const cssPath = resolve(ROOT, "site-templates/styles.css");
  const jsPath = resolve(
    ROOT,
    "site-templates/observatory.js",
  );

  if (existsSync(cssPath)) {
    copyFileSync(
      cssPath,
      resolve(SITE_DIR, "assets/styles.css"),
    );
  }
  if (existsSync(jsPath)) {
    copyFileSync(
      jsPath,
      resolve(SITE_DIR, "assets/observatory.js"),
    );
  }

  console.log("Generating index.html...");
  const indexHtml = generateIndexHtml(projects, stats);
  writeFileSync(resolve(SITE_DIR, "index.html"), indexHtml);

  console.log("Generating methodology.html...");
  const methodHtml = generateMethodologyHtml();
  writeFileSync(
    resolve(SITE_DIR, "methodology.html"),
    methodHtml,
  );

  console.log(
    `Site generated: ${projects.length} projects, ` +
      `${Object.keys(stats).length} stats`,
  );
}

function generateIndexHtml(
  projects: ObservatoryProject[],
  stats: Record<string, string | number>,
): string {
  const projectsJson = JSON.stringify(projects);
  const statsJson = JSON.stringify(stats);

  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Canton Ecosystem Observatory</title>
<meta name="description" content="Neutral, factual reference for every project in the Canton Network ecosystem. Structured, verifiable data with confidence tiers.">
<meta property="og:title" content="Canton Ecosystem Observatory">
<meta property="og:description" content="Neutral, factual reference for the Canton Network ecosystem">
<meta property="og:type" content="website">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🔭</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Instrument+Serif&display=swap" rel="stylesheet">
<style>
${getMainCSS()}
</style>
</head>
<body>

<nav class="nav">
  <div class="nav-inner">
    <a href="../" class="nav-logo">Canton Foundry</a>
    <div class="nav-links">
      <a href="../#tools">Tools</a>
      <a href="../#guide">Guide</a>
      <a href="../ecosystem/">Ecosystem</a>
      <a href="./" class="active">Observatory</a>
      <a href="../#about">About</a>
    </div>
    <a href="https://github.com/JohnLilic" target="_blank" rel="noopener noreferrer" class="nav-gh" aria-label="GitHub">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
    </a>
  </div>
</nav>

<header class="hero">
  <div class="hero-inner">
    <h1 class="hero-title">Ecosystem Observatory</h1>
    <p class="hero-sub">Neutral, factual reference for every project in the Canton Network ecosystem</p>
    <div class="stats-bar">
      <div class="stat"><span class="stat-num" id="stat-total">${stats["total"]}</span><span class="stat-label">Projects</span></div>
      <div class="stat"><span class="stat-num" id="stat-prod">${stats["production"]}</span><span class="stat-label">In Production</span></div>
      <div class="stat"><span class="stat-num" id="stat-audit">${stats["auditPct"]}%</span><span class="stat-label">Audited</span></div>
      <div class="stat"><span class="stat-num" id="stat-oss">${stats["osPct"]}%</span><span class="stat-label">Open Source</span></div>
      <div class="stat"><span class="stat-num" id="stat-refresh">${stats["lastRefresh"]}</span><span class="stat-label">Last Refresh</span></div>
    </div>
  </div>
</header>

<main class="main">
  <div class="controls">
    <input type="text" id="search" class="search" placeholder="Search projects..." autocomplete="off">
    <div class="filters" id="filters"></div>
    <div class="sort-row">
      <label for="sort-select">Sort:</label>
      <select id="sort-select" class="sort-select">
        <option value="alpha">Alphabetical</option>
        <option value="updated">Last Updated</option>
        <option value="status">Status</option>
      </select>
      <div class="filter-extras">
        <label class="checkbox-label"><input type="checkbox" id="filter-oss"> Open Source</label>
        <label class="checkbox-label"><input type="checkbox" id="filter-audited"> Audited</label>
        <label class="checkbox-label"><input type="checkbox" id="filter-featured"> Featured App</label>
      </div>
    </div>
  </div>

  <div class="project-count" id="project-count"></div>
  <div class="grid" id="grid"></div>

  <div class="detail-overlay" id="detail-overlay">
    <div class="detail-panel" id="detail-panel"></div>
  </div>
</main>

<footer class="footer">
  <div class="footer-inner">
    <p class="footer-disclaimer">On-chain data reflects publicly observable activity on the Global Synchronizer only. Private transactions between parties are not visible. See <a href="methodology.html">Methodology</a> for details.</p>
    <div class="footer-links">
      <a href="methodology.html">Methodology</a>
      <a href="https://github.com/JohnLilic/canton-foundry" target="_blank" rel="noopener noreferrer">GitHub</a>
      <a href="../">Canton Foundry</a>
    </div>
    <p class="footer-copy">&copy; ${new Date().getFullYear()} Canton Foundry &middot; BSD-0-Clause</p>
  </div>
</footer>

<script>
const PROJECTS = ${projectsJson};
const STATS = ${statsJson};
${getMainJS()}
</script>
</body>
</html>`;
}

function generateMethodologyHtml(): string {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>Methodology — Canton Ecosystem Observatory</title>
<meta name="description" content="How the Canton Ecosystem Observatory collects, verifies, and displays data about Canton Network projects.">
<link rel="icon" href="data:image/svg+xml,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'><text y='.9em' font-size='90'>🔭</text></svg>">
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=DM+Sans:wght@400;500;600;700&family=Instrument+Serif&display=swap" rel="stylesheet">
<style>
${getMainCSS()}
${getMethodologyCSS()}
</style>
</head>
<body>

<nav class="nav">
  <div class="nav-inner">
    <a href="../" class="nav-logo">Canton Foundry</a>
    <div class="nav-links">
      <a href="./">Observatory</a>
      <a href="methodology.html" class="active">Methodology</a>
    </div>
    <a href="https://github.com/JohnLilic" target="_blank" rel="noopener noreferrer" class="nav-gh" aria-label="GitHub">
      <svg width="20" height="20" viewBox="0 0 24 24" fill="currentColor"><path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z"/></svg>
    </a>
  </div>
</nav>

<main class="methodology">
  <h1>Methodology</h1>

  <section>
    <h2>What the Observatory Is</h2>
    <p>The Canton Ecosystem Observatory is a neutral, factual reference for every project, application, validator, and developer tool in the Canton Network ecosystem. It publishes structured, verifiable data with source attribution.</p>
    <p><strong>It does not:</strong> rank projects, assign scores, compare projects, make recommendations, or express opinions.</p>
  </section>

  <section>
    <h2>Data Confidence Tiers</h2>
    <p>Every data point displayed in the Observatory carries a confidence tier indicating how it was obtained and verified.</p>

    <div class="tier-example">
      <div class="tier-row">
        <span class="conf-badge conf-verified">&#10003; Verified</span>
        <p>Canton Foundry has independently confirmed this data against a public, authoritative source. Sources include: Canton Foundation website, GSF governance records, public audit reports, public repositories, on-chain Scan API data.</p>
      </div>
      <div class="tier-row">
        <span class="conf-badge conf-self-reported">&#9432; Self-Reported</span>
        <p>A project maintainer submitted this data through the claim process. Claimant identity was verified, but the data itself has not been independently confirmed. Examples: internal test count, claimed audit without public report, stated jurisdiction.</p>
      </div>
      <div class="tier-row">
        <span class="conf-badge conf-auto">&#9881; Auto-Detected</span>
        <p>Collected automatically from a public API using published methodology. Examples: last commit date, CI status, language breakdown, license type.</p>
      </div>
    </div>
  </section>

  <section>
    <h2>Auto-Detected Fields</h2>
    <p>The following fields are collected automatically from the GitHub API. All API calls use authenticated requests with retry logic (3 retries, exponential backoff) and rate-limit handling.</p>

    <h3>Last Verified Activity</h3>
    <p><code>GET /repos/{owner}/{repo}/commits?per_page=1</code></p>
    <p>Extracts the date of the most recent commit on the default branch. Returns null for empty repositories.</p>

    <h3>Canton SDK Version</h3>
    <p><code>GET /repos/{owner}/{repo}/contents/daml.yaml</code></p>
    <p>Parses the <code>sdk-version</code> field from the project's daml.yaml. Falls back to recursive tree search for monorepos. Reports the highest version found.</p>

    <h3>License Type</h3>
    <p><code>GET /repos/{owner}/{repo}/license</code></p>
    <p>Returns the SPDX identifier from GitHub's license detection. "NOASSERTION" is mapped to "Custom".</p>

    <h3>Tests</h3>
    <p><code>GET /repos/{owner}/{repo}/git/trees/{branch}?recursive=1</code></p>
    <p>Scans file paths for test indicators across Daml, TypeScript, JavaScript, Java, and Python conventions. Test count is approximate and labeled as such.</p>

    <h3>CI Status</h3>
    <p>Checks for CI config files (.github/workflows, .circleci, Jenkinsfile, etc.). For GitHub Actions, queries the latest completed workflow run. Runs older than 90 days are marked "stale" regardless of result.</p>

    <h3>Documentation</h3>
    <p>Checks for: docs/ directory with content files, README.md over 500 bytes, OpenAPI specs, or GitHub Pages. READMEs under 500 bytes are treated as placeholders.</p>

    <h3>Tech Stack</h3>
    <p><code>GET /repos/{owner}/{repo}/languages</code></p>
    <p>Returns languages representing more than 5% of codebase bytes, supplemented with framework detection from manifest files.</p>
  </section>

  <section>
    <h2>Manually Verified Fields</h2>
    <p>These fields cannot be auto-detected and are maintained by Canton Foundry staff:</p>
    <ul>
      <li><strong>Foundation Member</strong> — Cross-referenced against Canton Foundation member list (monthly)</li>
      <li><strong>Validator Status</strong> — Cross-referenced against GSF governance records (monthly)</li>
      <li><strong>Featured App</strong> — Cross-referenced against GSF Tokenomics Committee decisions (monthly)</li>
      <li><strong>Security Audit</strong> — Public audit report obtained and reviewed (on claim)</li>
      <li><strong>Status (Production)</strong> — Live deployment confirmed via public endpoint (quarterly)</li>
    </ul>
  </section>

  <section>
    <h2>Known Limitations</h2>
    <ul>
      <li><strong>Privacy:</strong> Canton's sub-transaction privacy means most on-chain activity is not publicly visible. The Observatory can only report on publicly observable data.</li>
      <li><strong>Closed-source projects:</strong> Without a public repository, technical fields (tests, CI, license, tech stack) cannot be auto-detected and rely on self-reporting.</li>
      <li><strong>GitHub API limits:</strong> Auto-detected data is refreshed weekly. Large repositories may hit tree truncation limits.</li>
      <li><strong>Attribution:</strong> On-chain party IDs are not yet mapped to projects (Phase 2).</li>
      <li><strong>Test counts:</strong> Approximate counts based on file pattern matching. May miss dynamically generated tests.</li>
    </ul>
  </section>

  <section>
    <h2>Claiming a Project</h2>
    <p>Project maintainers can claim ownership to provide verified data. To claim a project:</p>
    <ol>
      <li>Open a <a href="https://github.com/JohnLilic/canton-foundry/issues/new?template=claim-project.yml" target="_blank" rel="noopener noreferrer">Claim Issue</a> on GitHub</li>
      <li>Verify your identity via GitHub repo admin access, DNS TXT record, or Canton Foundation referral</li>
      <li>Once verified, you can submit data updates through the <a href="https://github.com/JohnLilic/canton-foundry/issues/new?template=submit-data.yml" target="_blank" rel="noopener noreferrer">Submit Data</a> form</li>
    </ol>
  </section>

  <section>
    <h2>Disputing Data</h2>
    <p>If you believe a data point is inaccurate, open a <a href="https://github.com/JohnLilic/canton-foundry/issues/new?template=dispute-data.yml" target="_blank" rel="noopener noreferrer">Dispute Issue</a> with the current value, correct value, and supporting evidence.</p>
  </section>

  <section>
    <h2>Update Schedule</h2>
    <ul>
      <li><strong>Auto-detected fields:</strong> Weekly (Monday 06:00 UTC)</li>
      <li><strong>Manually verified fields:</strong> Monthly or on claim</li>
      <li><strong>On-chain fields:</strong> Not yet available (Phase 2)</li>
    </ul>
  </section>
</main>

<footer class="footer">
  <div class="footer-inner">
    <div class="footer-links">
      <a href="./">Observatory</a>
      <a href="https://github.com/JohnLilic/canton-foundry" target="_blank" rel="noopener noreferrer">GitHub</a>
      <a href="../">Canton Foundry</a>
    </div>
    <p class="footer-copy">&copy; ${new Date().getFullYear()} Canton Foundry &middot; BSD-0-Clause</p>
  </div>
</footer>

</body>
</html>`;
}

function getMainCSS(): string {
  return `
*, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

:root {
  --bg: #1A1A2E;
  --surface: #16213E;
  --surface-2: #1a2744;
  --border: #2a3a5c;
  --border-hover: #3a4f7a;
  --text: #E0E0E0;
  --dim: #8899AA;
  --faint: #4a5a7a;
  --gold: #B8860B;
  --gold-hover: #D4AF37;
  --gold-dim: rgba(184,134,11,0.15);
  --green: #2E7D32;
  --green-bg: rgba(46,125,50,0.12);
  --amber: #F9A825;
  --amber-bg: rgba(249,168,37,0.12);
  --blue: #1565C0;
  --blue-bg: rgba(21,101,192,0.12);
  --red: #c62828;
  --red-bg: rgba(198,40,40,0.12);
  --gray: #6b7280;
  --serif: 'Instrument Serif', serif;
  --sans: 'DM Sans', system-ui, sans-serif;
  --mono: 'DM Mono', monospace;
  --max-w: 1100px;
  --nav-bg: rgba(26,26,46,0.92);
  --radius: 6px;
}

html { scroll-behavior: smooth; }
body { font-family: var(--sans); background: var(--bg); color: var(--text); line-height: 1.6; -webkit-font-smoothing: antialiased; }

a { color: var(--gold); text-decoration: none; transition: color 0.15s; }
a:hover { color: var(--gold-hover); }

/* Nav */
.nav { position: sticky; top: 0; z-index: 100; background: var(--nav-bg); backdrop-filter: blur(16px); border-bottom: 1px solid var(--border); }
.nav-inner { max-width: var(--max-w); margin: 0 auto; display: flex; align-items: center; justify-content: space-between; padding: 0 24px; height: 56px; }
.nav-logo { font-family: var(--serif); font-size: 18px; color: var(--text); font-weight: 400; }
.nav-links { display: flex; gap: 24px; }
.nav-links a { color: var(--dim); font-size: 14px; font-weight: 500; }
.nav-links a:hover, .nav-links a.active { color: var(--text); }
.nav-gh { color: var(--dim); }
.nav-gh:hover { color: var(--text); }

/* Hero */
.hero { text-align: center; padding: 56px 24px 40px; border-bottom: 1px solid var(--border); }
.hero-inner { max-width: var(--max-w); margin: 0 auto; }
.hero-title { font-family: var(--serif); font-size: 42px; font-weight: 400; margin-bottom: 8px; color: var(--text); }
.hero-sub { color: var(--dim); font-size: 16px; margin-bottom: 32px; }

/* Stats bar */
.stats-bar { display: flex; justify-content: center; gap: 32px; flex-wrap: wrap; }
.stat { display: flex; flex-direction: column; align-items: center; }
.stat-num { font-family: var(--serif); font-size: 28px; color: var(--gold); }
.stat-label { font-size: 12px; color: var(--dim); text-transform: uppercase; letter-spacing: 0.5px; }

/* Main */
.main { max-width: var(--max-w); margin: 0 auto; padding: 32px 24px; }

/* Controls */
.controls { margin-bottom: 24px; }
.search { width: 100%; padding: 10px 16px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 14px; font-family: var(--sans); outline: none; transition: border-color 0.15s; }
.search:focus { border-color: var(--gold); }
.search::placeholder { color: var(--faint); }

.filters { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 12px; }
.pill { padding: 5px 12px; font-size: 12px; font-weight: 500; border: 1px solid var(--border); border-radius: 20px; background: transparent; color: var(--dim); cursor: pointer; transition: all 0.15s; font-family: var(--sans); }
.pill:hover { border-color: var(--gold); color: var(--text); }
.pill.active { background: var(--gold-dim); border-color: var(--gold); color: var(--gold); }

.sort-row { display: flex; align-items: center; gap: 12px; margin-top: 12px; flex-wrap: wrap; }
.sort-row label { font-size: 13px; color: var(--dim); }
.sort-select { padding: 5px 10px; background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); color: var(--text); font-size: 13px; font-family: var(--sans); outline: none; }
.filter-extras { display: flex; gap: 14px; margin-left: auto; }
.checkbox-label { font-size: 13px; color: var(--dim); cursor: pointer; display: flex; align-items: center; gap: 4px; }
.checkbox-label input { accent-color: var(--gold); }

.project-count { font-size: 13px; color: var(--dim); margin-bottom: 16px; }

/* Grid */
.grid { display: grid; grid-template-columns: 1fr; gap: 12px; }

/* Card */
.card { background: var(--surface); border: 1px solid var(--border); border-radius: var(--radius); padding: 16px 20px; cursor: pointer; transition: border-color 0.2s, box-shadow 0.2s; }
.card:hover { border-color: var(--border-hover); box-shadow: 0 0 20px rgba(184,134,11,0.06); }
.card-header { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
.card-name { font-family: var(--serif); font-size: 20px; color: var(--text); }
.card-entity { font-size: 12px; color: var(--faint); }
.card-desc { font-size: 13px; color: var(--dim); margin-bottom: 10px; line-height: 1.5; }
.card-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 10px; }
.badge { display: inline-flex; align-items: center; gap: 4px; padding: 2px 8px; font-size: 11px; font-weight: 600; border-radius: 10px; text-transform: uppercase; letter-spacing: 0.3px; }
.badge-cat { color: var(--blue); background: var(--blue-bg); border: 1px solid rgba(21,101,192,0.25); }
.badge-status { border: 1px solid; }
.badge-production { color: var(--green); background: var(--green-bg); border-color: rgba(46,125,50,0.3); }
.badge-testnet { color: var(--amber); background: var(--amber-bg); border-color: rgba(249,168,37,0.3); }
.badge-development { color: var(--blue); background: var(--blue-bg); border-color: rgba(21,101,192,0.3); }
.badge-inactive { color: var(--gray); background: rgba(107,114,128,0.1); border-color: rgba(107,114,128,0.3); }
.badge-unknown { color: var(--faint); background: rgba(74,90,122,0.1); border-color: rgba(74,90,122,0.3); }
.badge-featured { color: var(--gold); background: var(--gold-dim); border: 1px solid rgba(184,134,11,0.3); }
.badge-validator { color: #9c27b0; background: rgba(156,39,176,0.1); border: 1px solid rgba(156,39,176,0.3); }
.badge-foundation { color: var(--green); background: var(--green-bg); border: 1px solid rgba(46,125,50,0.3); }

.card-indicators { display: flex; gap: 14px; flex-wrap: wrap; font-size: 12px; color: var(--dim); }
.indicator { display: flex; align-items: center; gap: 4px; }
.indicator-dot { width: 6px; height: 6px; border-radius: 50%; flex-shrink: 0; }
.dot-green { background: var(--green); }
.dot-amber { background: var(--amber); }
.dot-red { background: var(--red); }
.dot-gray { background: var(--gray); }

/* Confidence icons */
.conf { display: inline-flex; align-items: center; justify-content: center; width: 14px; height: 14px; border-radius: 50%; font-size: 9px; cursor: help; flex-shrink: 0; position: relative; }
.conf-verified { background: var(--green-bg); color: var(--green); border: 1px solid rgba(46,125,50,0.3); }
.conf-self-reported { background: var(--amber-bg); color: var(--amber); border: 1px solid rgba(249,168,37,0.3); }
.conf-auto { background: var(--blue-bg); color: var(--blue); border: 1px solid rgba(21,101,192,0.3); }
.conf-tip { display: none; position: absolute; bottom: calc(100% + 6px); left: 50%; transform: translateX(-50%); width: 220px; padding: 8px 10px; background: var(--surface-2); border: 1px solid var(--border); border-radius: 4px; font-size: 11px; font-family: var(--sans); line-height: 1.4; color: var(--dim); text-align: left; z-index: 50; pointer-events: none; white-space: normal; }
.conf:hover .conf-tip { display: block; }

/* Detail overlay */
.detail-overlay { display: none; position: fixed; inset: 0; background: rgba(0,0,0,0.6); z-index: 200; overflow-y: auto; padding: 40px 24px; }
.detail-overlay.open { display: flex; justify-content: center; align-items: flex-start; }
.detail-panel { background: var(--bg); border: 1px solid var(--border); border-radius: 8px; max-width: 700px; width: 100%; padding: 32px; position: relative; }
.detail-close { position: absolute; top: 12px; right: 16px; background: none; border: none; color: var(--dim); font-size: 24px; cursor: pointer; line-height: 1; }
.detail-close:hover { color: var(--text); }
.detail-title { font-family: var(--serif); font-size: 28px; margin-bottom: 4px; }
.detail-entity { color: var(--dim); font-size: 14px; margin-bottom: 16px; }
.detail-section { margin-top: 20px; }
.detail-section h3 { font-size: 13px; text-transform: uppercase; letter-spacing: 0.5px; color: var(--gold); margin-bottom: 10px; font-weight: 600; }
.detail-row { display: flex; justify-content: space-between; align-items: center; padding: 6px 0; border-bottom: 1px solid rgba(42,58,92,0.4); font-size: 13px; }
.detail-label { color: var(--dim); }
.detail-value { color: var(--text); display: flex; align-items: center; gap: 6px; }
.detail-value a { color: var(--gold); }
.detail-badges { display: flex; flex-wrap: wrap; gap: 6px; margin-bottom: 12px; }
.detail-claim { display: inline-block; margin-top: 16px; padding: 8px 16px; border: 1px solid var(--gold); color: var(--gold); border-radius: var(--radius); font-size: 13px; }
.detail-claim:hover { background: var(--gold-dim); }
.detail-notes { font-size: 13px; color: var(--dim); margin-top: 12px; padding: 10px; background: var(--surface); border-radius: var(--radius); }
.phase2-notice { font-size: 12px; color: var(--faint); font-style: italic; padding: 10px; background: var(--surface); border-radius: var(--radius); margin-top: 8px; }

/* Footer */
.footer { border-top: 1px solid var(--border); padding: 32px 24px; margin-top: 48px; text-align: center; }
.footer-inner { max-width: var(--max-w); margin: 0 auto; }
.footer-disclaimer { font-size: 12px; color: var(--faint); max-width: 600px; margin: 0 auto 16px; line-height: 1.5; }
.footer-links { display: flex; justify-content: center; gap: 24px; margin-bottom: 12px; }
.footer-links a { font-size: 13px; color: var(--dim); }
.footer-copy { font-size: 12px; color: var(--faint); }

/* Responsive */
@media (max-width: 640px) {
  .hero-title { font-size: 28px; }
  .stats-bar { gap: 16px; }
  .stat-num { font-size: 20px; }
  .nav-links { gap: 12px; }
  .nav-links a { font-size: 12px; }
  .filter-extras { margin-left: 0; width: 100%; }
  .detail-panel { padding: 20px; }
}
`;
}

function getMethodologyCSS(): string {
  return `
.methodology { max-width: 720px; margin: 0 auto; padding: 48px 24px; }
.methodology h1 { font-family: var(--serif); font-size: 36px; margin-bottom: 32px; }
.methodology h2 { font-family: var(--serif); font-size: 22px; margin-bottom: 12px; color: var(--gold); margin-top: 36px; }
.methodology h3 { font-size: 15px; font-weight: 600; margin-top: 20px; margin-bottom: 6px; }
.methodology p { font-size: 14px; color: var(--dim); margin-bottom: 10px; line-height: 1.7; }
.methodology ul, .methodology ol { margin-left: 20px; margin-bottom: 12px; }
.methodology li { font-size: 14px; color: var(--dim); margin-bottom: 6px; line-height: 1.6; }
.methodology code { background: var(--surface); padding: 2px 6px; border-radius: 3px; font-size: 13px; color: var(--text); }
.methodology strong { color: var(--text); }
.tier-example { margin: 16px 0; }
.tier-row { display: flex; gap: 12px; align-items: flex-start; margin-bottom: 16px; padding: 12px; background: var(--surface); border-radius: var(--radius); }
.tier-row p { margin: 0; }
.conf-badge { display: inline-flex; align-items: center; gap: 4px; padding: 3px 10px; border-radius: 12px; font-size: 12px; font-weight: 600; white-space: nowrap; flex-shrink: 0; }
.conf-badge.conf-verified { background: var(--green-bg); color: var(--green); border: 1px solid rgba(46,125,50,0.3); }
.conf-badge.conf-self-reported { background: var(--amber-bg); color: var(--amber); border: 1px solid rgba(249,168,37,0.3); }
.conf-badge.conf-auto { background: var(--blue-bg); color: var(--blue); border: 1px solid rgba(21,101,192,0.3); }
`;
}

function getMainJS(): string {
  return `
(function() {
  var CATEGORIES = [
    'All','tokenized-assets','data-analytics','naas',
    'developer-tools','wallets','exchanges','liquidity',
    'interoperability','forensics-security','custody',
    'stablecoins','payments','financing','compliance'
  ];
  var CAT_LABELS = {
    'All':'All','tokenized-assets':'Tokenized Assets',
    'data-analytics':'Data & Analytics','naas':'NaaS',
    'developer-tools':'Developer Tools','wallets':'Wallets',
    'exchanges':'Exchanges','liquidity':'Liquidity',
    'interoperability':'Interoperability',
    'forensics-security':'Forensics & Security',
    'custody':'Custody','stablecoins':'Stablecoins',
    'payments':'Payments','financing':'Financing',
    'compliance':'Compliance'
  };

  var searchInput = document.getElementById('search');
  var filtersEl = document.getElementById('filters');
  var gridEl = document.getElementById('grid');
  var countEl = document.getElementById('project-count');
  var sortSelect = document.getElementById('sort-select');
  var filterOss = document.getElementById('filter-oss');
  var filterAudited = document.getElementById('filter-audited');
  var filterFeatured = document.getElementById('filter-featured');
  var overlay = document.getElementById('detail-overlay');
  var detailPanel = document.getElementById('detail-panel');

  var activeCat = 'All';
  var searchTerm = '';
  var debounceTimer = null;

  // Build filter pills
  CATEGORIES.forEach(function(cat) {
    var btn = document.createElement('button');
    btn.className = 'pill' + (cat === 'All' ? ' active' : '');
    btn.textContent = CAT_LABELS[cat] || cat;
    btn.onclick = function() {
      activeCat = cat;
      filtersEl.querySelectorAll('.pill').forEach(function(p) {
        p.classList.toggle('active', p.textContent === (CAT_LABELS[cat] || cat));
      });
      render();
    };
    filtersEl.appendChild(btn);
  });

  searchInput.addEventListener('input', function() {
    clearTimeout(debounceTimer);
    debounceTimer = setTimeout(function() {
      searchTerm = searchInput.value.toLowerCase().trim();
      render();
    }, 150);
  });

  sortSelect.addEventListener('change', render);
  filterOss.addEventListener('change', render);
  filterAudited.addEventListener('change', render);
  filterFeatured.addEventListener('change', render);

  function getFiltered() {
    var list = PROJECTS.slice();

    if (activeCat !== 'All') {
      list = list.filter(function(p) {
        return p.category.indexOf(activeCat) !== -1;
      });
    }

    if (searchTerm) {
      list = list.filter(function(p) {
        return p.display_name.toLowerCase().indexOf(searchTerm) !== -1 ||
               p.description.toLowerCase().indexOf(searchTerm) !== -1 ||
               p.project_id.indexOf(searchTerm) !== -1;
      });
    }

    if (filterOss.checked) {
      list = list.filter(function(p) { return p.open_source; });
    }
    if (filterAudited.checked) {
      list = list.filter(function(p) { return p.security_audit !== null; });
    }
    if (filterFeatured.checked) {
      list = list.filter(function(p) { return p.featured_app === true; });
    }

    var sort = sortSelect.value;
    list.sort(function(a, b) {
      if (sort === 'alpha') return a.display_name.localeCompare(b.display_name);
      if (sort === 'updated') return (b.updated_at || '').localeCompare(a.updated_at || '');
      if (sort === 'status') {
        var order = {production:0,testnet:1,development:2,unknown:3,inactive:4};
        return (order[a.status]||3) - (order[b.status]||3);
      }
      return 0;
    });

    return list;
  }

  function confIcon(tier) {
    if (!tier) return '';
    var cls = tier === 'verified' ? 'conf-verified' :
              tier === 'self_reported' ? 'conf-self-reported' : 'conf-auto';
    var sym = tier === 'verified' ? '\\u2713' :
              tier === 'self_reported' ? '\\u2139' : '\\u2699';
    var label = tier === 'verified' ? 'Verified' :
                tier === 'self_reported' ? 'Self-Reported' : 'Auto-Detected';
    return '<span class="conf ' + cls + '" title="' + label + '">' + sym +
           '<span class="conf-tip">' + label + '</span></span>';
  }

  function statusBadge(status) {
    var cls = 'badge badge-status badge-' + status;
    return '<span class="' + cls + '">' + status + '</span>';
  }

  function renderCard(p) {
    var badges = '';
    p.category.forEach(function(c) {
      badges += '<span class="badge badge-cat">' + (CAT_LABELS[c] || c) + '</span>';
    });
    badges += statusBadge(p.status);
    if (p.featured_app) badges += '<span class="badge badge-featured">\\u2605 Featured</span>';
    if (p.validator_status !== 'none') badges += '<span class="badge badge-validator">' + p.validator_status.replace('_', ' ') + '</span>';
    if (p.foundation_member) badges += '<span class="badge badge-foundation">Foundation</span>';

    var indicators = '';
    var addInd = function(label, val, dotCls, confTier) {
      indicators += '<span class="indicator"><span class="indicator-dot ' + dotCls + '"></span>' + label + ': ' + val + ' ' + confIcon(confTier) + '</span>';
    };

    addInd('OSS', p.open_source ? 'Yes' : 'No', p.open_source ? 'dot-green' : 'dot-gray', p.data_confidence.open_source);
    if (p.security_audit) addInd('Audit', '\\u2713', 'dot-green', p.data_confidence.security_audit);
    if (p.has_tests !== null) addInd('Tests', p.has_tests ? 'Yes' : 'No', p.has_tests ? 'dot-green' : 'dot-gray', p.data_confidence.has_tests);
    if (p.ci_status) addInd('CI', p.ci_status, p.ci_status === 'passing' ? 'dot-green' : p.ci_status === 'failing' ? 'dot-red' : 'dot-amber', p.data_confidence.ci_status);
    if (p.last_verified_activity) addInd('Active', p.last_verified_activity, 'dot-green', p.data_confidence.last_verified_activity);
    if (p.canton_sdk_version) addInd('SDK', p.canton_sdk_version, 'dot-green', p.data_confidence.canton_sdk_version);

    return '<div class="card" data-id="' + p.project_id + '">' +
      '<div class="card-header"><div><span class="card-name">' + p.display_name + '</span>' +
      (p.entity_name ? '<span class="card-entity">' + p.entity_name + '</span>' : '') +
      '</div></div>' +
      '<p class="card-desc">' + p.description + '</p>' +
      '<div class="card-badges">' + badges + '</div>' +
      '<div class="card-indicators">' + indicators + '</div>' +
      '</div>';
  }

  function render() {
    var filtered = getFiltered();
    countEl.textContent = filtered.length + ' project' + (filtered.length !== 1 ? 's' : '');
    gridEl.innerHTML = filtered.map(renderCard).join('');
  }

  function detailField(label, value, confTier) {
    var displayVal = value === null || value === undefined ? '<span style="color:var(--faint)">Unknown</span>' :
                     typeof value === 'boolean' ? (value ? 'Yes' : 'No') :
                     Array.isArray(value) ? (value.length > 0 ? value.join(', ') : '<span style="color:var(--faint)">None</span>') :
                     String(value);
    if (typeof value === 'string' && value.startsWith('http')) {
      displayVal = '<a href="' + value + '" target="_blank" rel="noopener noreferrer">' + value + '</a>';
    }
    return '<div class="detail-row"><span class="detail-label">' + label + '</span>' +
           '<span class="detail-value">' + displayVal + ' ' + confIcon(confTier) + '</span></div>';
  }

  function showDetail(projectId) {
    var p = PROJECTS.find(function(pr) { return pr.project_id === projectId; });
    if (!p) return;

    var dc = p.data_confidence;
    var html = '<button class="detail-close" id="detail-close">&times;</button>';
    html += '<h2 class="detail-title">' + p.display_name + '</h2>';
    if (p.entity_name) html += '<p class="detail-entity">' + p.entity_name + '</p>';

    // Badges
    html += '<div class="detail-badges">';
    p.category.forEach(function(c) { html += '<span class="badge badge-cat">' + (CAT_LABELS[c]||c) + '</span>'; });
    html += statusBadge(p.status);
    if (p.featured_app) html += '<span class="badge badge-featured">\\u2605 Featured App</span>';
    if (p.validator_status !== 'none') html += '<span class="badge badge-validator">' + p.validator_status.replace('_',' ') + '</span>';
    if (p.foundation_member) html += '<span class="badge badge-foundation">Foundation Member</span>';
    html += '</div>';

    // Identity & Governance
    html += '<div class="detail-section"><h3>Identity &amp; Governance</h3>';
    html += detailField('Entity', p.entity_name, dc.entity_name);
    html += detailField('Jurisdiction', p.entity_jurisdiction, dc.entity_jurisdiction);
    html += detailField('Foundation Member', p.foundation_member, dc.foundation_member);
    html += detailField('Validator Status', p.validator_status, dc.validator_status);
    html += detailField('Website', p.website_url, dc.website_url);
    html += detailField('Contact', p.contact_url, dc.contact_url);
    html += '</div>';

    // Operational Status
    html += '<div class="detail-section"><h3>Operational Status</h3>';
    html += detailField('Status', p.status, dc.status);
    html += detailField('Network', p.network, dc.network);
    html += detailField('Canton SDK', p.canton_sdk_version, dc.canton_sdk_version);
    html += detailField('Last Activity', p.last_verified_activity, dc.last_verified_activity);
    html += detailField('Launch Date', p.launch_date, dc.launch_date);
    html += detailField('Featured App', p.featured_app, dc.featured_app);
    html += '</div>';

    // Technical Posture
    html += '<div class="detail-section"><h3>Technical Posture</h3>';
    html += detailField('Open Source', p.open_source, dc.open_source);
    html += detailField('Repository', p.repo_url, dc.repo_url);
    html += detailField('License', p.license_type, dc.license_type);
    if (p.security_audit) {
      html += detailField('Audit', p.security_audit.auditor + ' (' + p.security_audit.date + ')', dc.security_audit);
    } else {
      html += detailField('Security Audit', null, dc.security_audit);
    }
    html += detailField('Has Tests', p.has_tests, dc.has_tests);
    html += detailField('Test Count', p.test_count !== null ? p.test_count + ' (approx.)' : null, dc.test_count);
    html += detailField('CI', p.has_ci, dc.has_ci);
    html += detailField('CI Status', p.ci_status, dc.ci_status);
    html += detailField('Documentation', p.has_documentation, dc.has_documentation);
    html += detailField('Docs URL', p.documentation_url, dc.documentation_url);
    html += detailField('Tech Stack', p.tech_stack, dc.tech_stack);
    html += '</div>';

    // On-Chain (Phase 2)
    html += '<div class="detail-section"><h3>On-Chain Footprint</h3>';
    html += '<div class="phase2-notice">Coming soon &mdash; pending Scan API integration. All on-chain fields are null until Phase 2.</div>';
    html += '</div>';

    // Metadata
    html += '<div class="detail-section"><h3>Data Provenance</h3>';
    html += detailField('Record Created', p.created_at.split('T')[0], null);
    html += detailField('Last Updated', p.updated_at.split('T')[0], null);
    html += detailField('Last Auto-Refresh', p.last_auto_refresh, null);
    html += detailField('Claimed', p.claimed, null);
    if (p.claimed) html += detailField('Claimed By', p.claimed_by, null);
    html += '</div>';

    if (p.notes) {
      html += '<div class="detail-notes"><strong>Notes:</strong> ' + p.notes + '</div>';
    }

    html += '<a class="detail-claim" href="https://github.com/JohnLilic/canton-foundry/issues/new?template=claim-project.yml&title=Claim:+' + encodeURIComponent(p.display_name) + '" target="_blank" rel="noopener noreferrer">Claim This Project</a>';

    detailPanel.innerHTML = html;
    overlay.classList.add('open');
    document.body.style.overflow = 'hidden';

    document.getElementById('detail-close').addEventListener('click', closeDetail);
  }

  function closeDetail() {
    overlay.classList.remove('open');
    document.body.style.overflow = '';
  }

  overlay.addEventListener('click', function(e) {
    if (e.target === overlay) closeDetail();
  });

  document.addEventListener('keydown', function(e) {
    if (e.key === 'Escape') closeDetail();
  });

  gridEl.addEventListener('click', function(e) {
    var card = e.target.closest('.card');
    if (card) showDetail(card.dataset.id);
  });

  render();
})();
`;
}

main();
