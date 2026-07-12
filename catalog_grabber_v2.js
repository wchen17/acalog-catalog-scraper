/* ============================================================================
 * W&L Acalog Catalog Grabber v2  (headless-output edition)
 * Improves the original `screaper code.js`. Paste into the browser DevTools
 * console while on the W&L course-search page, logged in / past bot-checks.
 *
 * WHAT'S DIFFERENT FROM v1 (screaper code.js):
 *   1. Outputs FILES directly (Blob download): a clean .md AND a .json.
 *      -> no more Ctrl+P -> "Save as PDF" -> pdf2md round-trip (lossy, slow).
 *   2. Builds its OWN URL with expand=1&print=1, so it doesn't depend on you
 *      having the right params in the address bar.
 *   3. Paces requests (a delay between pages) + retries on HTTP 202.
 *      The server throttles rapid automated hits with "202 Accepted + empty
 *      body"; a human-paced loop with backoff slips under that.
 *   4. Parses each course into fields (code/title/prereq/credits/fdr/desc) and
 *      groups by department, with a counts index at the top -> diff-friendly.
 *
 * HOW TO RUN:
 *   1. Go to: catalog.wlu.edu/content.php?catoid=46&navoid=4715  (the Courses page)
 *   2. F12 -> Console tab.
 *   3. Paste this whole file, Enter. Watch the status line.
 *   4. Two files download to your Downloads folder when it says "Done".
 *      Move them into the vault's 03_WL_Career/_data/ (or tell Claude they're
 *      in Downloads and it'll pick them up).
 * ========================================================================== */
(async () => {
  const CATOID = 46;      // 2026-27 undergraduate catalog (was 44 = 2025-26)
  const NAVOID = 4715;    // the "Courses" list page for that catalog
  const DELAY_MS = 900;   // base gap between pages; jittered below (dodges 202)
  const MAX_PAGES = 50;   // safety cap; loop also self-stops when no new courses
  const MAX_RETRY = 6;    // per-page retries on the 202 throttle
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const jitter = () => DELAY_MS + Math.floor(Math.random() * 500); // 900-1400ms

  // prefix -> department name, for the index. Derived from the catalog's
  // "Course Type" dropdown. Unknown prefixes fall back to the raw prefix.
  const DEPT = {
    ACCT:"Accounting", AFCA:"Africana Studies", ARAB:"Arabic", ARTH:"Art History",
    ARTS:"Studio Art", BIOL:"Biology", BUS:"Business Administration",
    CBL:"Community-Based Learning", CBSC:"Cognitive and Behavioral Science",
    CHEM:"Chemistry", CHIN:"Chinese", CLAS:"Classics",
    CPD:"Career and Professional Development", CSCI:"Computer Science",
    DANC:"Dance", DCI:"Digital Culture & Information", DS:"Data Science",
    EALL:"East Asian Languages and Literatures", EAS:"East Asian Studies",
    ECON:"Economics", EDUC:"Education", EEG:"Earth and Environmental Geoscience",
    EERS:"East European and Russian Studies", ENGL:"English", ENGN:"Engineering",
    ENT:"Entrepreneurship", ENV:"Environmental Studies", FILM:"Film Studies",
    FIN:"Finance", FREN:"French", FYE:"First-Year Experience", GERM:"German",
    GR:"Greek", HIST:"History", INTR:"Interdepartmental", ITAL:"Italian",
    JAPN:"Japanese", JOUR:"Journalism and Mass Communications", LACS:"Latin American and Caribbean Studies",
    LATN:"Latin", LIT:"Literature in Translation", LJS:"Law, Justice, and Society",
    MATH:"Mathematics", MESA:"Middle East and South Asia Studies",
    MRST:"Medieval and Renaissance Studies", MUS:"Music", NEUR:"Neuroscience",
    PE:"Physical Education", PHIL:"Philosophy", PHYS:"Physics", POL:"Politics",
    PORT:"Portuguese", POV:"Poverty and Human Capability Studies", REL:"Religion",
    ROML:"Romance Languages", RUSS:"Russian", SKT:"Sanskrit",
    SOAN:"Sociology & Anthropology", SSIR:"Student Summer Independent Research",
    SPAN:"Spanish", THTR:"Theater", WGSS:"Women's, Gender, and Sexuality Studies",
    WRIT:"Writing",
  };

  // ---- tiny on-page status banner so you can watch progress -----------------
  const banner = document.createElement("div");
  banner.style.cssText = "position:fixed;top:0;left:0;right:0;z-index:99999;background:#111;color:#0f0;font:14px monospace;padding:10px";
  banner.textContent = "Catalog grabber v2 starting...";
  document.body.appendChild(banner);
  const say = (m) => { banner.textContent = m; console.log(m); };

  // ---- build the paginated URL (expand=1 = full descriptions inline) --------
  const urlFor = (cpage) => {
    const p = new URLSearchParams();
    p.set("catoid", CATOID); p.set("navoid", NAVOID);
    p.set("filter[27]", "-1");   // -1 = all prefixes
    p.set("filter[3]", "1");     // course-type = all
    p.set("filter[cpage]", cpage);
    p.set("filter[keyword]", "");
    p.set("filter[32]", "1");
    p.set("expand", "1");        // <-- inline descriptions
    p.set("print", "1");         // <-- printable (server-rendered) view
    p.set("search_database", "Filter");
    return "/content.php?" + p.toString();
  };

  // regex for a course-code header line: "CSCI 1100 - Intro..." -> "CSCI 1100"
  const CODE = /^([A-Z]{2,4})\s?(\d{3,4}[A-Z]?)\s*[-–]\s*(.+)$/;
  const codesIn = (text) => {
    const out = [];
    for (const line of text.split("\n")) {
      const m = line.trim().match(CODE);
      if (m) out.push(`${m[1]} ${m[2]}`);
    }
    return out;
  };

  // fetch one page, retrying on 202 / empty (the bot-throttle response) --------
  // Key lesson: res.ok is TRUE for 202, so "ok" does NOT mean "got data".
  // We check the body length, and back off longer each retry.
  async function fetchPage(cpage) {
    for (let attempt = 0; attempt < MAX_RETRY; attempt++) {
      let res, html = "";
      try { res = await fetch(urlFor(cpage), { credentials: "same-origin" }); html = await res.text(); }
      catch (e) { /* network hiccup, treat as retryable */ }
      if (res && res.ok && html.length > 300) return html;   // real page
      const wait = 2500 * (attempt + 1);                     // 2.5s,5s,7.5s...15s
      say(`Page ${cpage}: throttled (HTTP ${res ? res.status : "err"}), waiting ${wait / 1000}s (try ${attempt + 1}/${MAX_RETRY})...`);
      await sleep(wait);
    }
    return null;
  }

  // ---- pull every page; stop when a page adds no NEW course codes ------------
  const parts = [];
  const seen = new Set();     // every course code seen so far (the real end signal)
  let pages = 0;
  for (let cp = 1; cp <= MAX_PAGES; cp++) {
    let html = await fetchPage(cp);
    if (!html) {                                  // one long cooldown, then quit
      say(`Page ${cp} blocked. One 25s cooldown, then a final try...`);
      await sleep(25000);
      html = await fetchPage(cp);
      if (!html) { say(`Stopping at page ${cp}: still blocked after cooldown. Keeping the ${seen.size} courses gathered so far.`); break; }
    }
    const doc = new DOMParser().parseFromString(html, "text/html");
    const main = doc.querySelector("td.block_content") || doc.body;
    main.querySelectorAll("form, table.nounderlines, script, style").forEach((e) => e.remove());
    main.querySelectorAll('a[href*="preview_course"]').forEach((a) => {
      a.replaceWith(document.createTextNode(a.textContent));
    });
    const text = main.innerText.replace(/\r/g, "").replace(/\n{3,}/g, "\n\n").trim();

    const codes = codesIn(text);
    const fresh = codes.filter((c) => !seen.has(c));
    if (codes.length === 0) { say(`Reached the end at page ${cp} (no courses on it).`); break; }
    if (fresh.length === 0) { say(`Reached the end at page ${cp} (no NEW courses; catalog wrapped).`); break; }
    fresh.forEach((c) => seen.add(c));
    parts.push(text); pages = cp;
    say(`Page ${cp}: ${codes.length} courses (${fresh.length} new). Running total: ${seen.size}.`);
    await sleep(jitter());
  }
  const raw = parts.join("\n\n");

  // ---- parse the text into course records -----------------------------------
  // A title line looks like:  "CSCI 1100 - Introduction to Computer Science"
  // Everything until the next title line is that course's body. (CODE regex
  // was defined up top and reused here.)
  const parsed = [];
  let cur = null;
  for (const line of raw.split("\n")) {
    const t = line.trim();
    const m = t.match(CODE);
    if (m) {
      if (cur) parsed.push(cur);
      cur = { code: `${m[1]} ${m[2]}`, prefix: m[1], number: m[2], title: m[3].trim(),
              prereq: "", credits: "", fdr: "", description: "" };
    } else if (cur && t) {
      if (/^Prerequisite/i.test(t))      cur.prereq += (cur.prereq ? " " : "") + t.replace(/^Prerequisite[s]?:?\s*/i, "");
      else if (/^Credits?:/i.test(t))    cur.credits = t.replace(/^Credits?:?\s*/i, "");
      else if (/^(FDR|Fulfills)/i.test(t)) cur.fdr   = t.replace(/^(FDR|Fulfills)[:\s]*/i, "");
      else                               cur.description += (cur.description ? " " : "") + t;
    }
  }
  if (cur) parsed.push(cur);
  // de-dup by code (a page can carry a few already-seen codes), keep first seen
  const courses = [];
  const dseen = new Set();
  for (const c of parsed) { if (!dseen.has(c.code)) { dseen.add(c.code); courses.push(c); } }

  // ---- build clean markdown, grouped by department, with an index -----------
  const byDept = {};
  for (const c of courses) (byDept[c.prefix] ||= []).push(c);
  const prefixes = Object.keys(byDept).sort();

  let md = `# W&L Course Catalog 2026-2027 (catoid=${CATOID}, live grab)\n\n`;
  md += `*Grabbed direct from Acalog HTML via catalog_grabber_v2.js. `;
  md += `${courses.length} courses across ${prefixes.length} prefixes, ${pages} pages. `;
  md += `Fields are best-effort text parses; the description holds any line not matched as prereq/credits/fdr.*\n\n`;
  md += `## Index (course counts by prefix)\n\n`;
  for (const px of prefixes) md += `- **${px}** ${DEPT[px] || ""}: ${byDept[px].length}\n`;
  md += `\n---\n`;
  for (const px of prefixes) {
    md += `\n## ${DEPT[px] || px} (${px})\n\n`;
    for (const c of byDept[px]) {
      md += `**${c.code} - ${c.title}**\n`;
      if (c.prereq)  md += `Prerequisite: ${c.prereq}\n`;
      if (c.fdr)     md += `FDR: ${c.fdr}\n`;
      if (c.credits) md += `Credits: ${c.credits}\n`;
      if (c.description) md += `\n${c.description}\n`;
      md += `\n`;
    }
  }

  // ---- download both artifacts ----------------------------------------------
  const dl = (name, content, type) => {
    const url = URL.createObjectURL(new Blob([content], { type }));
    const a = document.createElement("a");
    a.href = url; a.download = name; document.body.appendChild(a); a.click();
    a.remove(); URL.revokeObjectURL(url);
  };
  dl(`Courses_WL_2026-27_catoid${CATOID}.md`, md, "text/markdown");
  dl(`Courses_WL_2026-27_catoid${CATOID}.json`, JSON.stringify(courses, null, 1), "application/json");

  say(`Done. ${courses.length} courses, ${pages} pages. Two files downloaded (.md + .json).`);
})();
