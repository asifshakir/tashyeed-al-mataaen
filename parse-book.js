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

  paras.forEach((para, index) => {
    para.setAttribute('id', (index + 1).toString());
  });

  const updatedXml = new XMLSerializer().serializeToString(doc);
  fs.writeFileSync(path.join(__dirname, 'book-fixed.xml'), updatedXml, 'utf-8');

  console.log(`✅ Updated ${paras.length} <para> IDs successfully.`);
} catch (err) {
  console.error('❌ Error:', err.message);
}
