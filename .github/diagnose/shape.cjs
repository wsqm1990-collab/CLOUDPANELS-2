// Diagnosis only: the "shape" of a JavaScript file, with the names the
// minifier chose replaced by one placeholder (property names kept), one line
// per line of the file, so two builds can be compared whatever names they got.
const fs = require('fs'), acorn = require('acorn');
// Where a bundled package was read from is not code: the same place either way.
const place = value => value.replace(/^(?:\.\.\/)+tmp\/.*?\/scratchpad\/deps\/mega\//, '').replace(/^(?:\.\.\/)+tmp\/.*?\/scratchpad\/deps\//, 'node_modules/').replace(/^(?:\.\.\/)+opt\/npm-tools\/node_modules\//, 'node_modules/');
const text = fs.readFileSync(process.argv[2], 'utf8'), lines = text.split('\n'), out = [];
const tokens = acorn.tokenizer(text, { ecmaVersion: 'latest', sourceType: 'module', locations: true });
let previous = null, line = 1, current = [];
for (const token of tokens) {
  while (token.loc.start.line > line) { out.push(current.join(' ')); current = []; line++; }
  const label = token.type.label;
  let value;
  if (label === 'name') value = previous && (previous.type.label === '.' || previous.type.label === '?.') ? token.value : 'ID';
  else if (label === 'string' || label === 'num' || label === 'regexp' || label === 'template') value = JSON.stringify(place(String(token.value && token.value.pattern !== undefined ? token.value.pattern : token.value)));
  else value = token.type.keyword || label;
  current.push(value); previous = token;
}
out.push(current.join(' '));
fs.writeFileSync(process.argv[3], out.join('\n') + '\n');
