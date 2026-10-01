const assert = require('node:assert/strict');
const { readFileSync } = require('node:fs');
const path = require('node:path');
const vm = require('node:vm');

const root = path.join(__dirname, '..');
const data = JSON.parse(readFileSync(path.join(root, 'ecosystem.json'), 'utf8'));
const source = readFileSync(path.join(root, 'app.js'), 'utf8');
const finder = source.slice(source.indexOf('function finderMatches('), source.indexOf('function renderFinder()'));
const context = vm.createContext({
  data,
  categoryById: new Map(data.categories.map((item) => [item.id, item])),
  territoryById: new Map(data.territories.map((item) => [item.id, item])),
});
vm.runInContext(finder, context);
const matches = (query, territory = 'all') =>
  vm.runInContext(`finderMatches(${JSON.stringify(query)}, ${JSON.stringify(territory)}).map(tool => tool.id)`, context);

assert.equal(matches('').length, data.tools.length);
assert(matches('react').includes('react'));
assert(matches('coding agents').includes('codex'));
assert(matches('sign-in').includes('better-auth'));
assert(matches('web framework').includes('nextjs'));
const productTools = data.tools.filter((tool) =>
  data.categories.find((category) => category.id === tool.category).territory === 'product');
assert.equal(matches('', 'product').length, productTools.length);
assert(matches('react', 'product').includes('react'));
assert(!matches('react', 'business').includes('react'));
assert.equal(matches('no-such-thing').length, 0);
console.log('Passed: full directory, name/category/purpose/type search, territory filter and empty results.');
