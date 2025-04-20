// renumberFootnotes.js  v6.2 – forbid nested <chapter>
// ==========================================================
//  Steps (optional): resequence, flatten, arabic
//  Input validations (always run first):
//      1. fast-xml-parser well‑formedness check  → exact line/col
//      2. no <para> inside another <para>
//      3. **no <chapter> inside another <chapter>**
//
//  ───── CLI ─────
//  node renumberFootnotes.js in.xml out.xml resequence flatten arabic
//  (omit step names to run all)
// --------------------------------------------------------------
import fs from "fs";
import { XMLParser } from "fast-xml-parser";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import xpath from "xpath";

const steps = {
  resequence: resequenceFootnotes,
  flatten: flattenPoems,
  //arabic: fixArabicMarkers,
  english:    fixEnglishAnchors // retag existing <a> in en text
};

// ───────── ENTRY ─────────
const [, , inFile, outFile = "out.xml", ...wanted] = process.argv;
if (!inFile) {
  console.error("Usage: node renumberFootnotes.js <input.xml> [output.xml] [steps…]\nsteps: resequence flatten arabic (default: all)");
  process.exit(1);
}

const raw = fs.readFileSync(inFile, "utf8");
validateWellFormed(raw);

const doc = new DOMParser().parseFromString(raw, "text/xml");
validateNoNestedPara(doc);
validateNoNestedChapter(doc);

// pick steps
const todo = wanted.length ? wanted : Object.keys(steps);
for (const key of todo) {
  if (!steps[key]) {
    console.error(`Unknown step '${key}'. Expected: ${Object.keys(steps).join(", ")}`);
    process.exit(1);
  }
  steps[key](doc);
}

// final sanity check
validateWellFormed(new XMLSerializer().serializeToString(doc));
fs.writeFileSync(outFile, new XMLSerializer().serializeToString(doc), "utf8");
console.log(`✔ Saved → ${outFile}`);

// ───────── VALIDATION HELPERS ─────────
function validateWellFormed(xmlStr) {
  const parser = new XMLParser({ allowBooleanAttributes: true, ignoreAttributes: false });
  try {
    parser.parse(xmlStr);
  } catch (e) {
    console.error(`❌ XML syntax error: ${e.message}`);
    process.exit(1);
  }
}

function validateNoNestedPara(doc) {
  const select = xpath.useNamespaces({});
  const offenders = select("//para[descendant::para]", doc);
  if (offenders.length) {
    offenders.forEach(p => console.error(`❌ Nested <para> found (outer id='${p.getAttribute("id") || "?"}')`));
    process.exit(1);
  }
}

function validateNoNestedChapter(doc) {
  const select = xpath.useNamespaces({});
  const offenders = select("//chapter[descendant::chapter]", doc);
  if (offenders.length) {
    offenders.forEach(ch => console.error(`❌ Nested <chapter> found (outer id='${ch.getAttribute("id") || "?"}')`));
    process.exit(1);
  }
}

// ───────── STEP IMPLEMENTATIONS ───────── (unchanged logic, abbreviated)
function resequenceFootnotes(doc) {
  const select = xpath.useNamespaces({});

  // 1) Resequence <para> ids in document order (depth‑first)
  const paras = select("//para", doc);
  paras.forEach((p, idx) => {
    p.setAttribute("id", String(idx + 1));
  });

  // 2) Resequence <footnote> ids and visible labels
  const footnotes = select("//footnote", doc);
  footnotes.forEach((fn, i) => {
    const n = i + 1;
    fn.setAttribute("id", `f${n}`);
    Array.from(fn.getElementsByTagName("p")).forEach(p => {
      const txt = p.textContent.replace(/^\s*[\[(]?\d+(?:\.\d+)?[\]:)\]]?[-.]*\s*/, "").trim();
      p.textContent = `(${n}) ${txt}`;
    });
  });
}

function flattenPoems(doc) {
  const poems = Array.from(doc.getElementsByTagName("poem"));
  poems.forEach(poem => {
    const parent = poem.parentNode;
    Array.from(poem.getElementsByTagName("para")).forEach(para => {
      const cls = para.getAttribute("class") || "";
      if (!cls.split(/\s+/).includes("Poem")) para.setAttribute("class", cls ? `${cls} Poem` : "Poem");
      parent.insertBefore(para, poem);
    });
    parent.removeChild(poem);
  });
}

function fixArabicMarkers(doc) {
  const select = xpath.useNamespaces({});
  let counter = 1;
  const paras = select("//para[footnotes]", doc);
  paras.forEach(para => {

    const paraId = para.getAttribute("id") || "unknown";
    const paraClass = para.getAttribute("class") || "unknown";
    const isPoem = (paraClass || "").split(/\s+/).includes("Poem");

    console.log(`Processing <para> id='${paraId}' class='${paraClass}'`);

    const foots = Array.from(select("footnotes/footnote", para));
    if (!foots.length) return;

    const arNodes = Array.from(para.childNodes)
    .filter(n => n.nodeType === 1 && n.nodeName === "p")
    .filter(p => {
      const l = p.getAttribute("lang");
      return l === "ar" || l === "fa";
    });

    if (arNodes.length === 0) return;

    arNodes.forEach(p => {
      const lang = p.getAttribute("lang") || "unknown";
      const re = isPoem ? /\((\d+)\)/g : /(\((\d+)\)|\*+)/g;

      console.log(`  Processing <p> lang='${lang}'`);

      const paraText = p.textContent;
      console.log(`    Original text: ${paraText}`);

      const matches = paraText.match(re);
      if (!matches) return; // no matches found
      console.log(`    Found matches: ${matches.join(", ")}`);
      console.log(`    Total matches: ${matches.length}, Footnotes: ${foots.length}`);
      matches.forEach((match, matchIdx) => {
        console.log(`    Match index: ${matchIdx}`);
        console.log(`    Counter: '${counter}'`);
        if(counter === 79) {
          counter++;
          matchIdx++;
        }
        const matchingFooter = foots[matchIdx];
        console.log(`    Match index: ${matchIdx}`);
        console.log(`    Found match: '${match}'`);
        console.log(`    Replacing '${match}' with '${counter}'`);
        const footnoteId = matchingFooter.getAttribute("id") || "unknown";
        console.log(`    Footnote ID: '${footnoteId}'`);
        const footnoteRef = `(${counter})`;
        const footnoteLink = `<a href="#${footnoteId}" id="ref${counter}" class="footnote-ref">${footnoteRef}</a>`;
        const newText = paraText.replace(match, footnoteLink);
        p.textContent = newText;
        console.log(`    Updated text: ${newText}`);
        counter++;
      });
    });
  });
}

function fixEnglishAnchors(doc) {
  const select = xpath.useNamespaces({});
  let counter = 1;
  const paras = select("//para[footnotes]", doc);
  paras.forEach(para => {
    const foots = Array.from(select("footnotes/footnote", para));
    if (!foots.length) return;

    const enNodes = Array.from(para.childNodes)
      .filter(n => n.nodeType === 1 && n.nodeName === "p")
      .filter(p => p.getAttribute("lang") === "en");
    if (enNodes.length === 0) return;

    console.log(`Processing <para> id='${para.getAttribute("id") || "unknown"}'`);

    enNodes.forEach(p => {
      // collect existing anchors inside this p i.e. <a tags />
      const linkRegExp = /<a[^>]*>(.*?)<\/a>/g;
      const anchors = p.textContent.match(linkRegExp) || [];

      if (!anchors.length) return;

      console.log(`   Found ${anchors.length} existing anchors`);

      anchors.forEach((a, idx) => {

        console.log(`    Processing anchor ${idx + 1}`);
        console.log(`    Original anchor: ${a}`);
        console.log(`    Counter: ${counter}`);

        const footnoteId = foots[idx].getAttribute("id") || "unknown";
        console.log(`    Footnote ID: '${footnoteId}'`);
        const footnoteRef = `(${counter})`;
        console.log(`    Footnote reference: '${footnoteRef}'`);
        console.log(`    Replacing '${a}' with '${footnoteRef}'`);

        const footnoteLink = `<a href="#${footnoteId}" id="ref${counter}" class="footnote-ref">${footnoteRef}</a>`;

        const newText = a.replace(linkRegExp, footnoteLink);
        p.textContent = newText;

        console.log(`    Updated anchor: ${newText}`);
        console.log(`    Updated text: ${p.textContent}`);

        counter++;

      });
    });
  });
}