// renumberFootnotes.js  v5.6 – regex fix (no “Range out of order”)
// ================================================================
//  Simple two‑step tool: resequenceFootnotes + flattenPoems.
//  Extra validation:
//      • rejects malformed XML
//      • forbids nested <para>
//
//  BUGFIX: the character class in two regexes had an unescaped “‑”
//          before a lower‑codepoint char, causing a *Range out of
//          order* SyntaxError in Node 22+. The hyphen is now escaped
//          (or placed at class end).
//
//  Usage examples:
//      node renumberFootnotes.js in.xml out.xml resequence
//      node renumberFootnotes.js in.xml out.xml resequence flatten
//      node renumberFootnotes.js in.xml out.xml   # both steps
//
import fs from "fs";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import xpath from "xpath";

// ───────────────────────── Helper: validate XML ──────────────────────────
function validateXML(xmlString, label = "XML") {
  const testDoc = new DOMParser().parseFromString(xmlString, "text/xml");
  const errs = Array.from(testDoc.getElementsByTagName("parsererror"));
  if (errs.length) {
    console.error(`\n❌  ${label} is not well‑formed:`);
    errs.forEach((e, i) => {
      console.error(`  ${i + 1}. ${e.textContent.trim().replace(/\s+/g, " ")}`);
    });
    process.exit(1);
  }
  return testDoc;
}

// ───────────────────────── Step 1: resequence ────────────────────────────
function resequenceFootnotes(doc) {
  const select = xpath.useNamespaces({});
  const footnotes = select("//footnote", doc);

  footnotes.forEach((fn, idx) => {
    const newNum = idx + 1;
    fn.setAttribute("id", `f${newNum}`);

    // normalise visible labels inside each footnote <p>
    Array.from(fn.getElementsByTagName("p")).forEach(p => {
      const txt = p.textContent;
      p.textContent = txt.replace(
        /^\s*[\[(]?\d+(?:\.\d+)?[\]\)\.\-:]?\s*/,
        `(${newNum}) `
      );
    });
  });

  // also resequence para ids (simple document order)
  const paras = select("//para", doc);
  paras.forEach((para, i) => para.setAttribute("id", i + 1));
}

// ───────────────────────── Step 2: flatten <poem> ────────────────────────
function flattenPoems(doc) {
  const poems = Array.from(doc.getElementsByTagName("poem"));
  poems.forEach(poem => {
    const parent = poem.parentNode;
    const paras = Array.from(poem.getElementsByTagName("para"));
    paras.forEach(para => {
      const cls = (para.getAttribute("class") || "").split(/\s+/);
      if (!cls.includes("Poem")) cls.push("Poem");
      para.setAttribute("class", cls.filter(Boolean).join(" "));
      parent.insertBefore(para, poem);
    });
    parent.removeChild(poem);
  });
}

// ───────────────────────── Nested <para> guard ───────────────────────────
function ensureNoNestedPara(doc) {
  const select = xpath.useNamespaces({});
  const bad = select("//para[.//para]", doc);
  if (bad.length) {
    console.error("❌  Nested <para> elements found:");
    bad.forEach(p => {
      const inner = xpath.select(".//para", p)[0];
      console.error(`   outer id="${p.getAttribute("id")}", inner id="${inner.getAttribute("id")}"`);
    });
    process.exit(1);
  }
}

// ───────────────────────────── Main ──────────────────────────────────────
const [, , inFile, outFile = "out.xml", ...steps] = process.argv;
if (!inFile) {
  console.error("Usage: node renumberFootnotes.js <input.xml> [output.xml] [steps…]");
  process.exit(1);
}

const raw = fs.readFileSync(inFile, "utf8");
validateXML(raw, "Input");

const doc = new DOMParser().parseFromString(raw, "text/xml");
ensureNoNestedPara(doc);

const wantAll = steps.length === 0;
if (wantAll || steps.includes("resequence")) resequenceFootnotes(doc);
if (wantAll || steps.includes("flatten"))   flattenPoems(doc);

// validate output
const outXML = new XMLSerializer().serializeToString(doc);
validateXML(outXML, "Output");

fs.writeFileSync(outFile, outXML, "utf8");
console.log(`✔  Saved → ${outFile}`);
