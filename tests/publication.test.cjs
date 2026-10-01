const fs = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const root = path.join(__dirname, '..');
const read = name => fs.readFileSync(path.join(root, name), 'utf8');
const data = JSON.parse(read('ecosystem.json'));
const source = read('app.js');
const context = vm.createContext({ apiError: message => { throw Error(message); } });
vm.runInContext(source.slice(source.indexOf('function validate('), source.indexOf('function setData(')), context);
context.data = data;
vm.runInContext('validate(data)', context);
for (const tool of data.tools) {
  if (tool.url) assert(tool.url.startsWith('https://'), `${tool.id}: invalid landing page`);
  if (tool.icon?.startsWith('assets/')) assert(fs.existsSync(path.join(root, tool.icon)), `${tool.id}: missing icon`);
}
const html = read('index.html');
const schema = JSON.parse(html.match(/<script type="application\/ld\+json">([\s\S]*?)<\/script>/)[1]);
assert.equal(schema.mainEntity.numberOfItems, data.tools.length);
assert.deepEqual(schema.mainEntity.itemListElement.map(x => x.item.name), data.tools.map(t => t.name));
const url = JSON.parse(read('site.json')).url;
assert(html.includes(`rel="canonical" href="${url}"`));
assert(html.includes(`content="${url}assets/social-card-v2.png"`));
assert(read('sitemap.xml').includes(`<loc>${url}</loc>`));
assert(read('robots.txt').includes(`${url}sitemap.xml`));
assert(!/website-form|link-editor|data-panel|guide-tool/.test(source));
assert(!/<form\b/.test(html));
assert(html.includes('id="directory"'));
console.log(`Passed: ${data.tools.length} valid entries, local icons, public links, metadata, structured data, no editing UI.`);

// Validate image dimensions from PNG headers, without adding test dependencies.
for (const [name, width, height] of [
  ['social-card-v2.png', 1200, 630],
  ['social-card-x-v2.png', 1200, 600],
  ['social-card-square-v2.png', 1200, 1200],
]) {
  const png = fs.readFileSync(path.join(root, 'assets', name));
  assert.equal(png.subarray(1, 4).toString(), 'PNG');
  assert.equal(png.readUInt32BE(16), width);
  assert.equal(png.readUInt32BE(20), height);
  assert(png.length < 1000000, `${name}: keep previews lightweight`);
  assert(html.includes(`${url}assets/${name}`));
}
assert.equal((html.match(/property="og:image"/g) || []).length, 2);
assert.equal((html.match(/name="twitter:image"/g) || []).length, 1);
assert(html.includes('name="twitter:card" content="summary_large_image"'));
console.log('Passed: wide, square and X social images, dimensions, file sizes and metadata.');
