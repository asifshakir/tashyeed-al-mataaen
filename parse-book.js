const fs = require('fs');
const path = require('path');
const { DOMParser, XMLSerializer } = require('xmldom');
const xpath = require('xpath');

const filePath = path.join(__dirname, 'tashyeed-vol01.xml');

try {
  const xml = fs.readFileSync(filePath, 'utf-8');

  const doc = new DOMParser().parseFromString(xml, 'text/xml');
  const select = xpath.useNamespaces({});

  const paras = select('//para', doc);

  let footnoteIndex = 0;

  paras.forEach((para, index) => {
    // Update para ID
    const newId = (index + 1).toString();
    para.setAttribute('id', newId);

    // Count <footnote> tags inside the current <para>
    const footnotes = xpath.select('.//footnote', para);


    if (footnotes.length > 0) {
      footnotes.forEach((footnote) => {
        footnoteIndex += 1;
        console.log(`Para ID: ${newId}, Footnote Count: ${footnotes.length}`);
        const footnoteId = footnote.getAttribute('id');
        console.log(`Para ID: ${newId}, Footnote ID: ${footnoteId}, Footnote Index: ${footnoteIndex}`);
      });
    }
  });

  const updatedXml = new XMLSerializer().serializeToString(doc);
  fs.writeFileSync(path.join(__dirname, 'book-fixed.xml'), updatedXml, 'utf-8');

  console.log(`✅ Updated ${paras.length} <para> IDs and counted footnotes.`);
} catch (err) {
  console.error('❌ Error:', err.message);
}
