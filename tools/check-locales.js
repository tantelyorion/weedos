'use strict';
const fs = require('fs');
const vm = require('vm');
const path = require('path');
const source = fs.readFileSync(path.join(__dirname, '../system/desktop/js/weed.js'), 'utf8');
function readObject(name) {
  const re = new RegExp('const ' + name + ' = (\\{[\\s\\S]*?\\n\\});');
  const match = source.match(re);
  if (!match) throw new Error('Catalogue introuvable: ' + name);
  return vm.runInNewContext('(' + match[1] + ')');
}
const catalogues = ['UI_LANG', 'UI_TEXT', 'SHELL_TEXT'].map(readObject);
const locales = ['fr', 'en', 'es', 'zh', 'hi', 'ar', 'de', 'pt', 'mg'];
for (const [index, catalogue] of catalogues.entries()) {
  for (const locale of locales) {
    if (!catalogue[locale] || typeof catalogue[locale] !== 'object') throw new Error(`Langue ${locale} absente du catalogue ${index}`);
    for (const [key, value] of Object.entries(catalogue[locale])) {
      if (typeof value === 'string' && !value.trim()) throw new Error(`Traduction vide: ${locale}.${key}`);
    }
  }
}
const shellKeys = Object.keys(catalogues[2].fr);
for (const locale of locales) {
  const missing = shellKeys.filter(key => typeof catalogues[2][locale][key] !== 'string');
  if (missing.length) throw new Error(`Clés manquantes dans SHELL_TEXT.${locale}: ${missing.join(', ')}`);
}
console.log(`Localisation vérifiée : ${locales.length} langues, ${catalogues.length} catalogues.`);
