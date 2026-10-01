'use strict';
const $ = (s) => document.querySelector(s);
const esc = (s) =>
  String(s ?? '').replace(
    /[&<>"']/g,
    (c) =>
      ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[
        c
      ],
  );
let data, toolById, categoryById, territoryById;
let selected = null;
let selectionKeyboardOrigin = null;
let atmosphere = null;
let scale = 1,
  panX = 20,
  panY = 20,
  worldWidth = 1500,
  worldHeight = 1110,
  pointer = null;
const world = $('#world'),
  viewport = $('#viewport');
const apiError = (message) => {
  throw new Error(message);
};
function validate(d) {
  if (!d || d.version !== 1) apiError('Expected an atlas with version: 1.');
  for (const key of [
    'territories',
    'categories',
    'tools',
    'scenarios',
  ])
    if (!Array.isArray(d[key])) apiError(`Missing array: ${key}`);
  if (!d.territories.length || !d.categories.length)
    apiError('Include at least one territory and category.');
  for (const key of ['territories', 'categories', 'tools', 'scenarios']) {
    const ids = new Set();
    for (const item of d[key]) {
      if (typeof item.id !== 'string' || !/^[-a-zA-Z0-9_]+$/.test(item.id))
        apiError(`Use a stable alphanumeric id in ${key}.`);
      if (ids.has(item.id)) apiError(`Duplicate id in ${key}: ${item.id}`);
      ids.add(item.id);
      if (typeof item.name !== 'string' || !item.name.trim())
        apiError(`Missing name: ${item.id}`);
    }
  }
  const territoryIds = new Set(d.territories.map((t) => t.id)),
    categoryIds = new Set(d.categories.map((c) => c.id)),
    toolIds = new Set(d.tools.map((t) => t.id));
  for (const t of d.territories) {
    if (
      !/^#[0-9a-f]{6}$/i.test(t.color) ||
      !/^#[0-9a-f]{6}$/i.test(t.background)
    )
      apiError(`Use six-digit hex colors for ${t.id}.`);
    if (t.exploration !== undefined && typeof t.exploration !== 'boolean')
      apiError(`exploration must be boolean: ${t.id}`);
    if (
      !Number.isInteger(t.columns) ||
      t.columns < 1 ||
      t.columns > 4 ||
      !Number.isInteger(t.lane) ||
      t.lane < 0 ||
      t.lane > 8
    )
      apiError(`Invalid layout for ${t.id}. Use columns 1–4 and lane 0–8.`);
  }
  for (const c of d.categories)
    if (!territoryIds.has(c.territory))
      apiError(`Unknown territory for ${c.id}: ${c.territory}`);
  for (const t of d.tools) {
    if (!categoryIds.has(t.category))
      apiError(`Unknown category for ${t.id}: ${t.category}`);
    if (typeof t.purpose !== 'string') apiError(`Missing purpose: ${t.id}`);
    if (
      t.icon &&
      (typeof t.icon !== 'string' || !/^(assets\/|https:\/\/)/i.test(t.icon))
    )
      apiError(`Use assets/ or https:// for icon: ${t.id}`);
    if (t.url && !/^https:\/\//i.test(t.url))
      apiError(`Tool URLs must start with https://: ${t.id}`);
  }
  for (const s of d.scenarios)
    if (!Array.isArray(s.tools) || s.tools.some((id) => !toolIds.has(id)))
      apiError(`Unknown tool in project: ${s.id}`);
  return d;
}
function setData(next) {
  const clean = validate(structuredClone(next));
  data = clean;
  toolById = new Map(data.tools.map((t) => [t.id, t]));
  categoryById = new Map(data.categories.map((c) => [c.id, c]));
  territoryById = new Map(data.territories.map((t) => [t.id, t]));
  if (selected && !toolById.has(selected)) selected = null;
  if (data.title) document.title = data.title;
  renderMap();
  applyTransform();
  renderSelection();
  document.body.classList.add('map-ready');
  document.documentElement.classList.remove('map-loading');
  $('#directory').hidden = true;
}
function toolIcon(t) {
  return t.icon
    ? `<img src="${esc(t.icon)}" alt="" width="25" height="25" loading="lazy" decoding="async"><span class="icon-fallback">${esc(t.mark || t.name.slice(0, 2))}</span>`
    : esc(t.mark || t.name.slice(0, 2));
}
function nodeMarkup(t) {
  const button = `<button class="node${t.id === selected ? ' selected' : ''}" data-tool="${esc(t.id)}" aria-pressed="${t.id === selected}" aria-label="${esc(t.name)}: ${esc(t.type || 'Tool')}"><span class="mark" aria-hidden="true">${toolIcon(t)}</span><span><strong>${esc(t.name)}</strong><small>${esc(t.type || 'Tool')}</small></span></button>`;
  return `<div class="tool-card map-card">${button}${t.url ? `<a class="tool-website" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer" aria-label="Visit ${esc(t.name)} website (opens in a new tab)" title="Visit ${esc(t.name)}">↗</a>` : ''}</div>`;
}
function websiteLink(t) {
  return t.url
    ? `<div class="landing-links"><a class="official" href="${esc(t.url)}" target="_blank" rel="noopener noreferrer">Visit ${esc(t.name)} ↗</a></div>`
    : '';
}

function renderMap() {
  atmosphere?.reset();
  const groups = $('#regions');
  groups.innerHTML = '';
  $('.canvas-heading').dataset.summary = `A personal index of ${data.tools.length} tools · ${data.territories.length} areas`;
  const core = data.territories.filter((t) => !t.exploration);
  const lanes = [...new Set(core.map((t) => t.lane))].sort((a, b) => a - b),
    laneX = {},
    laneY = {};
  let x = 32;
  for (const lane of lanes) {
    laneX[lane] = x;
    laneY[lane] = 154;
    x +=
      Math.max(...core.filter((t) => t.lane === lane).map((t) => t.columns)) *
      484;
  }
  worldWidth = x + 8;
  let explorationX = Math.max(x + 560, viewport.clientWidth + 480),
    explorationBottom = 0;
  for (const territory of data.territories) {
    const exploratory = territory.exploration === true;
    let y = exploratory ? 220 : laneY[territory.lane],
      gx = exploratory ? explorationX : laneX[territory.lane];
    const fieldTop = y + 52;
    const field = document.createElement('div');
    field.className = 'territory-field';
    field.style.cssText = `left:${gx - 16}px;top:${fieldTop}px;width:${exploratory ? 412 : territory.columns * 484 - 24}px;--territory-color:${territory.color}`;
    groups.append(field);
    const title = document.createElement('div');
    title.className =
      'territory-title' + (exploratory ? ' exploration-title' : '');
    title.style.cssText = `left:${gx}px;top:${y}px;--region-color:${territory.color}`;
    const count = data.tools.filter((tool) =>
      data.categories.some((category) => category.id === tool.category && category.territory === territory.id),
    ).length;
    title.innerHTML = `<strong>${esc(territory.name)}</strong><small>${count} tools</small><span>${esc(territory.description || '')}</span>`;
    groups.append(title);
    y += 58;
    const cats = data.categories.filter((c) => c.territory === territory.id);
    for (let i = 0; i < cats.length; i += territory.columns) {
      let rowHeight = 0;
      cats.slice(i, i + territory.columns).forEach((cat, j) => {
        const tools = data.tools.filter((t) => t.category === cat.id),
          height = exploratory
            ? 60 + tools.length * 72
            : 60 + Math.ceil(tools.length / 2) * 76;
        const group = document.createElement('section');
        group.className =
          'map-group' + (exploratory ? ' exploration-group' : '');
        group.dataset.category = cat.id;
        group.style.cssText = `left:${gx + j * 484}px;top:${y}px;min-height:${height}px;--group-bg:${territory.background};--group-line:${territory.color}30`;
        group.innerHTML = `<h2>${esc(cat.name)}</h2><p class="group-question">${esc(cat.question || '')}</p><div class="node-grid">${tools.map((t) => nodeMarkup(t)).join('')}</div>`;
        groups.append(group);
        rowHeight = Math.max(rowHeight, group.offsetHeight, height);
      });
      y += rowHeight + 12;
    }
    field.style.height = `${y - fieldTop + 16}px`;
    if (exploratory) {
      explorationBottom = Math.max(explorationBottom, y + 15);
      worldWidth = Math.max(worldWidth, gx + territory.columns * 484);
      explorationX += territory.columns * 484 + 160;
    } else laneY[territory.lane] = y + 48;
  }
  worldHeight = Math.max(0, explorationBottom, ...Object.values(laneY)) + 10;
  world.style.width = worldWidth + 'px';
  world.style.height = worldHeight + 'px';
}
function clearToolSelection() {
  $('#inspector').getAnimations().forEach((animation) => animation.cancel());
  selected = null;
  selectionKeyboardOrigin = null;
  if (document.activeElement?.closest('[data-tool]'))
    document.activeElement.blur();
  renderSelection();
}
function clearSelectionAndRestoreFocus() {
  const returnTo = selectionKeyboardOrigin?.isConnected
    ? selectionKeyboardOrigin
    : viewport;
  clearToolSelection();
  returnTo.focus({ preventScroll: true });
}
function selectTool(id) {
  if (!toolById.has(id)) return;
  selected = id;
  renderSelection();
  keepSelectedToolVisible();
}
function revealInspector() {
  const inspector = $('#inspector');
  const reducedMotion = matchMedia('(prefers-reduced-motion: reduce)').matches;
  inspector.animate(
    reducedMotion
      ? [{ opacity: 0 }, { opacity: 1 }]
      : [
          { opacity: 0, transform: 'translateY(8px)' },
          { opacity: 1, transform: 'translateY(0)' },
        ],
    {
      duration: reducedMotion ? 120 : 220,
      easing: 'cubic-bezier(0.32, 0.72, 0, 1)',
    },
  );
}
function selectionPan(rect, panel, view, mobile) {
  const margin = 12;
  const covered = rect.left < panel.right + margin &&
    rect.right > panel.left - margin &&
    rect.top < panel.bottom + margin &&
    rect.bottom > panel.top - margin;
  const offscreen = rect.left < view.left + margin ||
    rect.right > view.right - margin ||
    rect.top < view.top + margin ||
    rect.bottom > view.bottom - margin;
  if (!covered && !offscreen) return { x: 0, y: 0 };

  const left = view.left + margin;
  const right = (mobile ? view.right : panel.left) - margin;
  const top = view.top + margin;
  const bottom = (mobile ? panel.top : view.bottom) - margin;
  let x = rect.right > right ? right - rect.right : 0;
  if (rect.left + x < left) x = left - rect.left;
  let y = rect.bottom > bottom ? bottom - rect.bottom : 0;
  if (rect.top + y < top) y = top - rect.top;
  return { x, y };
}
function keepSelectedToolVisible() {
  if (!selected) return;
  const node = $(`#regions [data-tool="${selected}"]`);
  if (!node) return;
  const pan = selectionPan(
    node.getBoundingClientRect(),
    $('#inspector').getBoundingClientRect(),
    viewport.getBoundingClientRect(),
    viewport.clientWidth <= 760,
  );
  if (!pan.x && !pan.y) return;
  panX += pan.x;
  panY += pan.y;
  applyTransform();
}
function renderSelection() {
  const selectedTool = toolById.get(selected);
  const selectedTerritory = selectedTool && territoryById.get(categoryById.get(selectedTool.category).territory);
  document.querySelectorAll('[data-tool]').forEach((n) => {
    const yes = n.dataset.tool === selected;
    n.classList.toggle('selected', yes);
    if (yes) n.style.setProperty('--selected-color', selectedTerritory.color);
    else n.style.removeProperty('--selected-color');
    n.setAttribute('aria-pressed', String(yes));
  });
  const t = toolById.get(selected);
  $('#inspector').classList.toggle('no-selection', !t);
  if (!t) {
    $('#inspector').innerHTML =
      '<div class="eyebrow">EXPLORE THE COLLECTION</div><h2 id="inspector-heading">Select a tool</h2><p class="detail-body">See the job it does and a concrete example.</p>';
    return;
  }
  const cat = categoryById.get(t.category),
    territory = territoryById.get(cat.territory);
  $('#inspector').innerHTML =
    `<div class="inspector-top"><span>${esc(territory.name.toUpperCase())} / ${territory.exploration ? 'EXPLORATION' : territory.id === 'learning' ? 'SOURCE' : 'TOOL'}</span><button id="clear-selection" aria-label="Clear tool selection">×</button></div><div class="inspector-mark" aria-hidden="true">${toolIcon(t)}</div><h2 id="inspector-heading">${esc(t.name)}</h2><p class="type">${esc(t.type || 'Tool')} · ${esc(cat.name)}</p>${websiteLink(t)}<div class="detail-label">${territory.id === 'learning' ? 'ABOUT THIS SOURCE' : 'THE JOB IT DOES'}</div><p class="detail-body">${esc(t.purpose)}</p>${t.example ? `<div class="detail-label">FOR EXAMPLE</div><div class="example">${esc(t.example)}</div>` : ''}${t.distinction ? `<div class="detail-label">WHERE IT FITS</div><p class="detail-body">${esc(t.distinction)}</p>` : ''}<p class="scope-note">Tools are grouped by their main job. A category does not imply that its tools are interchangeable.</p>`;
  $('#clear-selection').onclick = () => {
    clearSelectionAndRestoreFocus();
  };
  $('#inspector').scrollTop = 0;
}
function applyTransform() {
  atmosphere?.reset();
  world.style.transform = `translate(${panX}px,${panY}px) scale(${scale})`;
  viewport.style.setProperty('--grid-x', `${panX}px`);
  viewport.style.setProperty('--grid-y', `${panY}px`);
  viewport.style.setProperty('--major-step', `${120 * scale}px`);
  viewport.style.setProperty('--minor-step', `${24 * scale}px`);
  viewport.classList.toggle('show-minor-grid', scale >= 0.5);
  $('#zoom-level').textContent = Math.round(scale * 100) + '%';
}
function fitBounds() {
  const right = selected && viewport.clientWidth > 760 ? 265 : 16,
    top = 24;
  const availableWidth = viewport.clientWidth - right - 44,
    availableHeight = viewport.clientHeight - top - 82;
  return {
    availableWidth,
    availableHeight,
    top,
    scale: Math.min(availableWidth / worldWidth, availableHeight / worldHeight, 1),
  };
}
function minimumScale() {
  return Math.min(0.12, fitBounds().scale);
}
function fit() {
  const { availableWidth, availableHeight, top, scale: fittedScale } = fitBounds();
  scale = fittedScale;
  panX = 22 + (availableWidth - worldWidth * scale) / 2;
  panY = top + (availableHeight - worldHeight * scale) / 2;
  applyTransform();
}
function zoom(
  factor,
  x = viewport.clientWidth / 2,
  y = viewport.clientHeight / 2,
) {
  const next = Math.min(16, Math.max(minimumScale(), scale * factor));
  panX = x - ((x - panX) * next) / scale;
  panY = y - ((y - panY) * next) / scale;
  scale = next;
  applyTransform();
}
$('#zoom-in').onclick = () => zoom(1.25);
$('#zoom-out').onclick = () => zoom(0.8);
$('#fit').onclick = fit;
// Canvas navigation: wheel/trackpad scroll pans; Ctrl-wheel/pinch zooms.
const touches = new Map();
let pinch = null,
  suppressCanvasClick = false;
function beginPinch() {
  const points = [...touches.values()];
  if (points.length < 2) {
    pinch = null;
    return;
  }
  const [a, b] = points,
    r = viewport.getBoundingClientRect();
  const cx = (a.x + b.x) / 2 - r.left,
    cy = (a.y + b.y) / 2 - r.top;
  pinch = {
    distance: Math.max(1, Math.hypot(b.x - a.x, b.y - a.y)),
    scale,
    wx: (cx - panX) / scale,
    wy: (cy - panY) / scale,
  };
  pointer = null;
  suppressCanvasClick = true;
  viewport.classList.add('dragging');
}
viewport.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    const unit =
      e.deltaMode === 1 ? 16 : e.deltaMode === 2 ? viewport.clientHeight : 1;
    const dx = e.deltaX * unit,
      dy = e.deltaY * unit;
    if (e.ctrlKey || e.metaKey) {
      const r = viewport.getBoundingClientRect();
      zoom(
        Math.exp(-Math.max(-100, Math.min(100, dy)) * 0.008),
        e.clientX - r.left,
        e.clientY - r.top,
      );
    } else {
      panX -= e.shiftKey && !dx ? dy : dx;
      panY -= e.shiftKey && !dx ? 0 : dy;
      applyTransform();
    }
  },
  { passive: false },
);
viewport.addEventListener('selectstart', (e) => e.preventDefault());
viewport.addEventListener('dragstart', (e) => e.preventDefault());
viewport.addEventListener('pointerdown', (e) => {
  suppressCanvasClick = false;
  if (document.activeElement === viewport) viewport.blur();
  if (
    e.target.closest('a,input,textarea,select') ||
    (e.button !== 0 && e.button !== 1)
  )
    return;
  if (e.pointerType !== 'touch') e.preventDefault();
  if (e.pointerType === 'touch') {
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (touches.size > 1) {
      viewport.setPointerCapture(e.pointerId);
      beginPinch();
      return;
    }
  }
  // Capture only after movement so a tap still activates the original tool button.
  pointer = {
    id: e.pointerId,
    x: e.clientX,
    y: e.clientY,
    px: panX,
    py: panY,
    dragging: false,
  };
});
function moveCanvasPointer(e) {
  if (touches.has(e.pointerId))
    touches.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pinch && touches.size >= 2) {
    const [a, b] = [...touches.values()],
      r = viewport.getBoundingClientRect();
    scale = Math.min(
      16,
      Math.max(
        minimumScale(),
        (pinch.scale * Math.hypot(b.x - a.x, b.y - a.y)) / pinch.distance,
      ),
    );
    panX = (a.x + b.x) / 2 - r.left - pinch.wx * scale;
    panY = (a.y + b.y) / 2 - r.top - pinch.wy * scale;
    e.preventDefault();
    applyTransform();
    return;
  }
  if (!pointer || pointer.id !== e.pointerId) return;
  const dx = e.clientX - pointer.x,
    dy = e.clientY - pointer.y;
  if (!pointer.dragging && Math.hypot(dx, dy) < 4) return;
  pointer.dragging = true;
  suppressCanvasClick = true;
  e.preventDefault();
  if (!viewport.hasPointerCapture(e.pointerId))
    viewport.setPointerCapture(e.pointerId);
  viewport.classList.add('dragging');
  panX = pointer.px + dx;
  panY = pointer.py + dy;
  applyTransform();
}
function endCanvasPointer(e) {
  touches.delete(e.pointerId);
  if (pointer?.id === e.pointerId) pointer = null;
  if (pinch) {
    if (touches.size >= 2) beginPinch();
    else {
      pinch = null;
      const remaining = [...touches.entries()][0];
      if (remaining)
        pointer = {
          id: remaining[0],
          x: remaining[1].x,
          y: remaining[1].y,
          px: panX,
          py: panY,
          dragging: true,
        };
    }
  }
  if (viewport.hasPointerCapture(e.pointerId))
    viewport.releasePointerCapture(e.pointerId);
  if (!pointer && !pinch) viewport.classList.remove('dragging');
}
document.addEventListener('pointermove', moveCanvasPointer, { passive: false });
document.addEventListener('pointerup', endCanvasPointer);
document.addEventListener('pointercancel', endCanvasPointer);
viewport.addEventListener(
  'click',
  (e) => {
    if (suppressCanvasClick) {
      e.preventDefault();
      e.stopImmediatePropagation();
      suppressCanvasClick = false;
    }
  },
  true,
);
window.addEventListener('blur', () => {
  pointer = null;
  pinch = null;
  touches.clear();
  viewport.classList.remove('dragging');
});
viewport.addEventListener('keydown', (e) => {
  if (e.target !== viewport) return;
  const actions = {
    ArrowLeft: () => (panX += 70),
    ArrowRight: () => (panX -= 70),
    ArrowUp: () => (panY += 70),
    ArrowDown: () => (panY -= 70),
    '+': () => zoom(1.25),
    '=': () => zoom(1.25),
    '-': () => zoom(0.8),
    0: fit,
  };
  if (actions[e.key]) {
    e.preventDefault();
    actions[e.key]();
    applyTransform();
  }
});
// Keep focused tools visible for keyboard navigation even on a large canvas.
$('#regions').addEventListener('focusin', (e) => {
  const node = e.target.closest('[data-tool],.tool-website');
  if (!node) return;
  const r = node.getBoundingClientRect(),
    v = viewport.getBoundingClientRect();
  if (
    r.left < v.left ||
    r.right > v.right ||
    r.top < v.top ||
    r.bottom > v.bottom
  ) {
    panX += v.left + v.width / 2 - (r.left + r.width / 2);
    panY += v.top + v.height / 2 - (r.top + r.height / 2);
    applyTransform();
  }
});
document.addEventListener(
  'error',
  (e) => {
    if (
      e.target.tagName === 'IMG' &&
      e.target.parentElement.querySelector('.icon-fallback')
    ) {
      e.target.hidden = true;
      e.target.parentElement.classList.add('icon-failed');
    }
  },
  true,
);
document.addEventListener('click', (e) => {
  const node = e.target.closest('[data-tool]');
  if (node) {
    const opening = !selected && e.detail > 0;
    selectTool(node.dataset.tool);
    if (opening) revealInspector();
    selectionKeyboardOrigin = e.detail === 0 ? node : null;
    if (selectionKeyboardOrigin)
      $('#inspector').focus({ preventScroll: true });
    return;
  }
  if (
    e.target.closest('#viewport') &&
    !e.target.closest('a,button,input,textarea,select')
  ) {
    clearToolSelection();
    if (e.detail > 0 && document.activeElement === viewport) viewport.blur();
  }
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape' && selected) {
    clearSelectionAndRestoreFocus();
  }
});
// Clean up links shared before the map became the only page.
if (location.hash === '#map') {
  history.replaceState(null, '', location.pathname + location.search);
}
let previousCanvasSize = null;
new ResizeObserver(() => {
  const width = viewport.clientWidth,
    height = viewport.clientHeight;
  if (!width || !height) return;
  if (previousCanvasSize && data) {
    panX += (width - previousCanvasSize.width) / 2;
    panY += (height - previousCanvasSize.height) / 2;
    applyTransform();
    keepSelectedToolVisible();
  }
  previousCanvasSize = { width, height };
}).observe(viewport);
async function reloadData() {
  try {
    const response = await fetch('ecosystem.json');
    if (!response.ok)
      throw Error(`Collection request failed (${response.status}).`);
    setData(await response.json());
  } catch (error) {
    document.body.classList.remove('map-ready');
    document.documentElement.classList.remove('map-loading');
    $('#directory').hidden = false;
    const notice = document.createElement('p');
    notice.setAttribute('role', 'alert');
    notice.textContent = 'The interactive map could not load. Browse the directory below or reload to try again.';
    $('#directory h1').after(notice);
    console.error('Could not open the interactive map.', error);
  }
}

window.builderAtlas = {
  getData: () => structuredClone(data),
  setData,
  addTool: (tool) => {
    const next = structuredClone(data);
    next.tools.push(tool);
    setData(next);
  },
  addCategory: (category) => {
    const next = structuredClone(data);
    next.categories.push(category);
    setData(next);
  },
  addTerritory: (territory) => {
    const next = structuredClone(data);
    next.territories.push(territory);
    setData(next);
  },
  selectTool,
  fit,
};
import('./atlas-atmosphere.js?v=3').then(({ createAtlasAtmosphere }) => {
  atmosphere = createAtlasAtmosphere(viewport);
}).catch((error) => console.warn('Atlas hover animation unavailable.', error));
reloadData();
