// renumberFootnotes.js
// Usage: node renumberFootnotes.js <in.xml> [out.xml]
// Requires: npm i @xmldom/xmldom xpath

import fs from "fs";
import { DOMParser, XMLSerializer } from "@xmldom/xmldom";
import xpath from "xpath";

const [,, inFile, outFile = "out.xml"] = process.argv;
if (!inFile) {
  console.error("Usage: node renumberFootnotes.js <input.xml> [output.xml]");
  process.exit(1);
}

const xml = fs.readFileSync(inFile, "utf8");
const doc = new DOMParser().parseFromString(xml, "text/xml");

// Grab all footnotes *as they appear* in the document
const footnoteNodes = xpath.select("//footnote", doc);

// Helper to normalise leading number inside a <p>
function updateLeadingNumber(pNode, newNum) {
  const txt = pNode.textContent;
  // (1) style
  if (/^\s*\(\d+\)/.test(txt)) {
    pNode.textContent = txt.replace(/^\s*\(\d+\)/, `(${newNum})`);
  // 1- or 1 .  style (Arabic / Persian footers usually "1-" )
  } else if (/^\s*\d+[\s.-]/.test(txt)) {
    pNode.textContent = txt.replace(/^\s*\d+/, String(newNum));
  }
}

// First pass – assign sequential ids and build map oldId -> newNum
const idMap = new Map();
footnoteNodes.forEach((fn, idx) => {
  const newNum = idx + 1;
  const newId = String(newNum);
  const oldId = fn.getAttribute("id");
  idMap.set(oldId, newNum);
  fn.setAttribute("id", newId);
  // Update any "lang" <p> inside the footnote so leading numbers match
  const ps = xpath.select(".//p", fn);
  ps.forEach(p => updateLeadingNumber(p, newNum));
});

// Second pass – update every anchor that references a footnote
const anchors = xpath.select("//a[contains(@class,'footnote-ref')]", doc);
anchors.forEach(a => {
  const href = a.getAttribute("href");
  if (!href || !href.startsWith("#f")) return;
  const oldId = href.slice(2); // "#f123" -> "123"
  const newNum = idMap.get(oldId);
  if (!newNum) return; // stray link
  a.setAttribute("href", `#f${newNum}`);
  a.setAttribute("id", `ref${newNum}`);
  a.textContent = `(${newNum})`;
});

// Third pass – update any in‑line leading numbers inside <footnote> tag itself if they were outside <p>
footnoteNodes.forEach((fn, idx) => {
  const newNum = idx + 1;
  if (fn.firstChild && fn.firstChild.nodeType === 3) { // text node
    fn.firstChild.data = fn.firstChild.data.replace(/^\s*\d+/, String(newNum));
  }
});

const out = new XMLSerializer().serializeToString(doc);
fs.writeFileSync(outFile, out, "utf8");
console.log(`✔ Renumbered ${footnoteNodes.length} footnotes → ${outFile}`);
