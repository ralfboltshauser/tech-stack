const { readFileSync } = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const source = readFileSync(require('node:path').join(__dirname, '../app.js'), 'utf8');
const viewport = { clientWidth: 320, clientHeight: 700 };
const context = vm.createContext({ viewport, applyTransform() {}, drawEdges() {}, Math });
vm.runInContext('let scale = 1, panX = 20, panY = 20, worldWidth = 5200, worldHeight = 3900, selected = null;', context);
vm.runInContext(source.slice(source.indexOf('function fitBounds()'), source.indexOf("$('#zoom-in').onclick")), context);
const value = (name) => vm.runInContext(name, context);

for (const [width, height, selected] of [[320, 700, false], [393, 852, false], [1440, 900, false], [1440, 900, true]]) {
  viewport.clientWidth = width;
  viewport.clientHeight = height;
  vm.runInContext(`selected = ${selected ? "'tool'" : 'null'}`, context);
  vm.runInContext('fit()', context);
  const zoom = value('scale');
  assert(zoom > 0 && zoom <= 1, `Fit gives a positive zoom at ${width}px`);
  assert(value('panX') >= 0, `Fit keeps the left edge visible at ${width}px`);
  assert(value('panX') + 5200 * zoom <= width, `Fit keeps the right edge visible at ${width}px`);
  assert(value('panY') >= 0, `Fit keeps the top edge visible at ${width}px`);
  assert(value('panY') + 3900 * zoom <= height, `Fit keeps the bottom edge visible at ${width}px`);
  vm.runInContext('zoom(0.8)', context);
  assert(value('scale') <= zoom, `Zoom out never jumps closer at ${width}px`);
  vm.runInContext('fit()', context);
  vm.runInContext('zoom(1.25)', context);
  assert(Math.abs(value('scale') - zoom * 1.25) < 1e-10, `Zoom in moves smoothly from Fit at ${width}px`);
}
console.log('Passed: Fit contains the full map and zoom moves smoothly at mobile and desktop widths.');
