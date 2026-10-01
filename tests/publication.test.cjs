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
assert(html.includes(`content="${url}assets/social-card.png"`));
assert(read('sitemap.xml').includes(`<loc>${url}</loc>`));
assert(read('robots.txt').includes(`${url}sitemap.xml`));
assert(!/website-form|link-editor|data-panel|guide-tool/.test(source));
assert(!/<form\b/.test(html));
assert(html.includes('id="directory"'));
console.log(`Passed: ${data.tools.length} valid entries, local icons, public links, metadata, structured data, no editing UI.`);
