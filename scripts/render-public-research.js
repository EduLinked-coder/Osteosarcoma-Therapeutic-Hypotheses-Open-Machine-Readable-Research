const fs = require('fs');
const path = require('path');

const root = process.cwd();
const siteBase = 'https://edulinked-coder.github.io/Osteosarcoma-Therapeutic-Hypotheses-Open-Machine-Readable-Research/';
const generatedBy = 'scripts/render-public-research.js';

const readJson = (file) => JSON.parse(fs.readFileSync(path.join(root, file), 'utf8'));
const writeFile = (file, content) => {
  fs.mkdirSync(path.dirname(path.join(root, file)), { recursive: true });
  fs.writeFileSync(path.join(root, file), content);
};
const esc = (value) => String(value ?? '').replace(/[&<>"']/g, (char) => ({
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;'
}[char]));
const datePart = (value) => String(value || '').slice(0, 10) || new Date(0).toISOString().slice(0, 10);

const discoverHypotheses = () => fs.readdirSync(path.join(root, 'hypotheses'), { withFileTypes: true })
  .filter((entry) => entry.isDirectory() && /^OS-TH-[0-9]{4}$/.test(entry.name))
  .map((entry) => {
    const objectPath = path.join('hypotheses', entry.name, 'hypothesis.json');
    return { objectPath, object: readJson(objectPath) };
  })
  .sort((a, b) => a.object.hypothesis_id.localeCompare(b.object.hypothesis_id));

const renderIndex = (items) => {
  const hypotheses = items.map(({ object: h }) => ({
    schema_version: h.schema_version,
    hypothesis_id: h.hypothesis_id,
    title: h.title,
    plain_language_summary: h.plain_language_summary,
    hypothesis_statement: h.hypothesis_statement,
    evidence_stage: h.evidence_stage,
    review_state: h.review_state,
    publication_path: `hypotheses/${h.hypothesis_id}/`,
    canonical_object_path: `hypotheses/${h.hypothesis_id}/hypothesis.json`,
    evidence_binding_paths: (h.supporting_evidence || []).map((evidence) => `evidence-bindings/${evidence.evidence_id}.json`),
    last_evidence_update: h.provenance.updated_at,
    clinical_use: h.clinical_use
  }));
  return JSON.stringify({
    schema_version: '1.0.0',
    generated_by: generatedBy,
    generated_at: hypotheses.map((h) => h.last_evidence_update).sort().at(-1) || null,
    source: 'Canonical public hypothesis objects in /hypotheses/',
    clinical_use_boundary: 'Research hypotheses only. Not medical advice, treatment recommendations, dosing instructions or claims of patient benefit.',
    hypothesis_count: hypotheses.length,
    hypotheses_requiring_review: hypotheses.filter((h) => h.review_state.scientific_review_required && h.review_state.status !== 'reviewed').length,
    hypotheses
  }, null, 2) + '\n';
};

const renderHypothesisPage = (h) => {
  const list = (items) => (items || []).map((item) => `<li>${esc(item)}</li>`).join('');
  const evidence = (h.supporting_evidence || []).map((item) => `<li><a href="${esc(item.source_url)}">${esc(item.citation)}</a><br>${esc(item.finding)}</li>`).join('');
  const validation = (h.validation_requirements || []).map((item) => `<li><strong>${esc(item.stage)}</strong> - ${esc(item.requirement)} <span class="pill">${esc(item.status)}</span></li>`).join('');
  const score = h.ranking.score === null ? 'Pending recalculation' : `${esc(h.ranking.score)}/100`;
  return `<!doctype html>
<html lang="en-AU">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<meta name="generator" content="${generatedBy}">
<title>${esc(h.hypothesis_id)} | Research hypothesis</title>
<style>:root{--text:#172033;--muted:#42526e;--surface:#f7f5ff;--border:#c9c3e6;--gold:#dea93f}*{box-sizing:border-box}body{margin:0;font-family:system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--text);line-height:1.7}main{width:min(100% - 2rem,70rem);margin:auto;padding:3rem 0}header{padding:2.5rem;border-radius:1rem;background:linear-gradient(135deg,#fff,#f7f5ff,#fff7e8,#edf8ff);border:1px solid var(--border)}h1{font-size:clamp(2rem,6vw,3.5rem);line-height:1.1}.pill{display:inline-block;padding:.25rem .65rem;border:1px solid var(--border);border-radius:999px;background:var(--surface);font-weight:700;margin:.15rem}.warning{border-left:6px solid var(--gold);background:#fff9ec;padding:1.2rem;margin:2rem 0;border-radius:.6rem}section{border-top:1px solid var(--border);margin-top:2rem;padding-top:.5rem}li{margin:.65rem 0}a{color:#2349a6}</style>
</head>
<body>
<main>
<header>
<p><strong>${esc(h.hypothesis_id)}</strong></p>
<h1>${esc(h.title)}</h1>
<p>${esc(h.plain_language_summary)}</p>
<span class="pill">${esc(h.evidence_stage)}</span>
<span class="pill">${esc(h.review_state.publication_class)}</span>
<span class="pill">clinical use: false</span>
</header>
<div class="warning"><strong>Research only.</strong> This is a testable research hypothesis, not an established treatment, medical advice, dose instruction or clinical recommendation.</div>
<section><h2>Hypothesis</h2><p>${esc(h.hypothesis_statement)}</p></section>
<section><h2>Why this hypothesis exists</h2><p>${esc(h.mechanism.summary)}</p></section>
<section><h2>Supporting evidence</h2><ul>${evidence}</ul></section>
<section><h2>Contradictory evidence</h2><p>${esc(h.contradictory_evidence.assessment)}</p></section>
<section><h2>Uncertainty</h2><p><strong>Level: ${esc(h.uncertainty.level)}</strong></p><p>${esc(h.uncertainty.summary)}</p><h3>Open questions</h3><ul>${list(h.uncertainty.open_questions)}</ul></section>
<section><h2>Research-priority ranking</h2><p><strong>${score}</strong></p><p>${esc(h.ranking.meaning)}</p></section>
<section><h2>Novelty</h2><p>${esc(h.novelty.assessment)}</p></section>
<section><h2>What would challenge or falsify it?</h2><ul>${list(h.falsifiability.falsification_conditions)}</ul><h3>Discriminating tests</h3><ul>${list(h.falsifiability.discriminating_tests)}</ul></section>
<section><h2>Validation still required</h2><ul>${validation}</ul></section>
<section><h2>Review and provenance</h2><p>Review state: <strong>${esc(h.review_state.status)}</strong>. Scientific review required: <strong>${esc(h.review_state.scientific_review_required)}</strong>.</p><p>Source authority: ${esc(h.provenance.source_authority)}</p><p><a href="hypothesis.json">Canonical JSON</a> | <a href="../../">Research portfolio</a></p></section>
</main>
</body>
</html>
`;
};

const renderSitemap = (items) => {
  const urls = [
    { loc: siteBase, lastmod: items.map(({ object }) => datePart(object.provenance.updated_at)).sort().at(-1) || datePart() },
    ...items.map(({ object }) => ({ loc: `${siteBase}hypotheses/${object.hypothesis_id}/`, lastmod: datePart(object.provenance.updated_at) }))
  ];
  return `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.map((url) => `  <url>
    <loc>${esc(url.loc)}</loc>
    <lastmod>${esc(url.lastmod)}</lastmod>
  </url>`).join('\n')}
</urlset>
`;
};

const expectedOutputs = () => {
  const items = discoverHypotheses();
  const outputs = {
    'indexes/hypotheses.json': renderIndex(items),
    'sitemap.xml': renderSitemap(items)
  };
  for (const { object } of items) {
    outputs[`hypotheses/${object.hypothesis_id}/index.html`] = renderHypothesisPage(object);
  }
  return outputs;
};

const check = process.argv.includes('--check');
const outputs = expectedOutputs();
const stale = [];
for (const [file, content] of Object.entries(outputs)) {
  const absolute = path.join(root, file);
  if (check) {
    const existing = fs.existsSync(absolute) ? fs.readFileSync(absolute, 'utf8') : null;
    if (existing !== content) stale.push(file);
  } else {
    writeFile(file, content);
  }
}
if (stale.length) {
  console.error('Generated public research projections are stale:');
  stale.forEach((file) => console.error(' - ' + file));
  console.error('Run: node scripts/render-public-research.js');
  process.exit(1);
}
console.log((check ? 'Verified' : 'Rendered') + ' ' + Object.keys(outputs).length + ' public research projection(s).');
