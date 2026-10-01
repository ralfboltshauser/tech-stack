const { readFileSync } = require('node:fs');
const { join } = require('node:path');
const vm = require('node:vm');
const assert = require('node:assert/strict');

const source = readFileSync(join(__dirname, '../app.js'), 'utf8');
const context = vm.createContext({});
vm.runInContext(source.slice(source.indexOf('function selectionPan('), source.indexOf('function keepSelectedToolVisible(')), context);
const pan = (rect, panel, view, mobile) => {
  context.rect = rect;
  context.panel = panel;
  context.view = view;
  context.mobile = mobile;
  return vm.runInContext('selectionPan(rect, panel, view, mobile)', context);
};
const box = (left, top, right, bottom) => ({ left, top, right, bottom });
const desktop = box(0, 0, 1200, 900);
const desktopPanel = box(924, 16, 1184, 820);
const mobile = box(0, 0, 393, 852);
const mobilePanel = box(101, 410, 381, 786);

assert.equal(pan(box(70, 280, 270, 346), desktopPanel, desktop, false).x, 0,
  'visible tool leaves the canvas in place');
assert.equal(pan(box(70, 835, 270, 885), desktopPanel, desktop, false).y, 0,
  'tool below the panel stays in place');
assert.equal(pan(box(1040, 282, 1240, 348), desktopPanel, desktop, false).x, -328,
  'covered desktop tool moves into the gap beside the inspector');
assert.equal(pan(box(70, 580, 270, 646), mobilePanel, mobile, true).y, -248,
  'covered mobile tool moves above the inspector');
assert.equal(pan(box(-300, -160, -100, -94), desktopPanel, desktop, false).x, 312,
  'offscreen selection moves into the viewport');
console.log('Passed: selected cards stay visible without moving an unobstructed canvas.');
