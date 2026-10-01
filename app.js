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
let selectedFromFinder = false;
let selectionKeyboardOrigin = null;
let finderTerritory = 'all';
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
    'relations',
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
  for (const r of d.relations)
    if (
      !toolIds.has(r.from) ||
      !toolIds.has(r.to) ||
      typeof r.label !== 'string'
    )
      apiError('A relationship has an unknown tool or missing label.');
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
  document.title = 'Ralf’s Tech Stack+';
  document.body.classList.add('map-ready');
  $('#directory').hidden = true;
  renderMap();
  renderSelection();
  renderFinder();
  requestAnimationFrame(() => {
    applyTransform();
    drawEdges();
  });
}
function toolIcon(t) {
  return t.icon
    ? `<img src="${esc(t.icon)}" alt="" width="25" height="25" loading="lazy" decoding="async"><span class="icon-fallback">${esc(t.mark || t.name.slice(0, 2))}</span>`
    : esc(t.mark || t.name.slice(0, 2));
}
function finderMatches(query, territoryId) {
  const term = query.trim().toLocaleLowerCase();
  return data.tools.filter((tool) => {
    const category = categoryById.get(tool.category);
    const territory = territoryById.get(category.territory);
    if (territoryId !== 'all' && territory.id !== territoryId) return false;
    return [tool.name, tool.type, tool.purpose, category.name, territory.name]
      .join(' ')
      .toLocaleLowerCase()
      .includes(term);
  });
}
function renderFinder() {
  if (!data) return;
  if (finderTerritory !== 'all' && !territoryById.has(finderTerritory))
    finderTerritory = 'all';
  const filters = $('#finder-territories');
  filters.innerHTML = [
    `<button type="button" data-territory="all" aria-pressed="${finderTerritory === 'all'}">All</button>`,
    ...data.territories.map((territory) =>
      `<button type="button" data-territory="${esc(territory.id)}" aria-pressed="${finderTerritory === territory.id}">${esc(territory.name)}</button>`),
  ].join('');
  const results = finderMatches($('#finder-search').value, finderTerritory);
  $('#finder-count').textContent = `${results.length} of ${data.tools.length} entries`;
  const groups = new Map();
  for (const tool of results) {
    const category = categoryById.get(tool.category);
    if (!groups.has(category.id)) groups.set(category.id, { category, tools: [] });
    groups.get(category.id).tools.push(tool);
  }
  $('#finder-results').innerHTML = results.length
    ? [...groups.values()].map(({ category, tools }) =>
      `<section><h2>${esc(category.name)}</h2>${tools.map((tool) =>
        `<div class="finder-result"><button type="button" data-find-tool="${esc(tool.id)}"><strong>${esc(tool.name)}</strong><small>${esc(tool.type || 'Tool')}</small></button>${tool.url ? `<a href="${esc(tool.url)}" target="_blank" rel="noopener noreferrer" aria-label="Visit ${esc(tool.name)} website (opens in a new tab)">↗</a>` : ''}</div>`).join('')}</section>`).join('')
    : '<p class="finder-empty">No matches. Try a name, category, or task.</p>';
}
function showToolFromFinder(id) {
  const node = [...document.querySelectorAll('#regions [data-tool]')]
    .find((item) => item.dataset.tool === id);
  if (!node) return;
  $('#finder').open = false;
  selectTool(id);
  selectedFromFinder = true;
  selectionKeyboardOrigin = null;
  if (scale < 0.72) {
    scale = 0.72;
    applyTransform();
  }
  const rect = node.getBoundingClientRect();
  const targetX = viewport.clientWidth > 760 ? (viewport.clientWidth - 280) / 2 : viewport.clientWidth / 2;
  const targetY = viewport.clientWidth > 760 ? viewport.clientHeight / 2 : viewport.clientHeight * 0.3;
  panX += targetX - (rect.left + rect.width / 2);
  panY += targetY - (rect.top + rect.height / 2);
  applyTransform();
  $('#inspector').focus({ preventScroll: true });
  drawEdges();
}
$('#finder').addEventListener('toggle', () => {
  if ($('#finder').open) $('#finder-search').focus();
});
$('#finder-search').addEventListener('input', renderFinder);
$('#finder-territories').addEventListener('click', (event) => {
  const button = event.target.closest('[data-territory]');
  if (!button) return;
  finderTerritory = button.dataset.territory;
  renderFinder();
  [...$('#finder-territories').querySelectorAll('[data-territory]')]
    .find((item) => item.dataset.territory === finderTerritory)?.focus();
});
$('#finder-results').addEventListener('click', (event) => {
  const button = event.target.closest('[data-find-tool]');
  if (button) showToolFromFinder(button.dataset.findTool);
});
$('#finder').addEventListener('keydown', (event) => {
  if (event.key === 'Escape') {
    event.preventDefault();
    event.stopPropagation();
    $('#finder').open = false;
    $('#finder summary').focus();
  }
});
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
  const groups = $('#regions');
  groups.innerHTML = '';
  const core = data.territories.filter((t) => !t.exploration);
  const lanes = [...new Set(core.map((t) => t.lane))].sort((a, b) => a - b),
    laneX = {},
    laneY = {};
  let x = 32;
  for (const lane of lanes) {
    laneX[lane] = x;
    laneY[lane] = 28;
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
    const title = document.createElement('div');
    title.className =
      'territory-title' + (exploratory ? ' exploration-title' : '');
    title.style.cssText = `left:${gx}px;top:${y}px;--region-color:${territory.color}`;
    title.innerHTML = `${esc(territory.name.toUpperCase())}<span>${esc(territory.description || '')}</span>`;
    groups.append(title);
    y += 58;
    const cats = data.categories.filter((c) => c.territory === territory.id);
    for (let i = 0; i < cats.length; i += territory.columns) {
      let rowHeight = 0;
      cats.slice(i, i + territory.columns).forEach((cat, j) => {
        const tools = data.tools.filter((t) => t.category === cat.id),
          height = exploratory
            ? 110 + tools.length * 72
            : 96 + Math.ceil(tools.length / 2) * 76;
        const group = document.createElement('section');
        group.className =
          'map-group' + (exploratory ? ' exploration-group' : '');
        group.dataset.category = cat.id;
        group.style.cssText = `left:${gx + j * 484}px;top:${y}px;min-height:${height}px;--group-bg:${territory.background};--group-line:${territory.color}30`;
        group.innerHTML = `<h2>${esc(cat.name)}</h2><p class="group-question">${esc(cat.question || '')}</p><div class="node-grid">${tools.map((t) => nodeMarkup(t)).join('')}</div>`;
        groups.append(group);
        rowHeight = Math.max(rowHeight, group.offsetHeight, height);
      });
      y += rowHeight + 34;
    }
    if (exploratory) {
      explorationBottom = Math.max(explorationBottom, y + 15);
      worldWidth = Math.max(worldWidth, gx + territory.columns * 484);
      explorationX += territory.columns * 484 + 160;
    } else laneY[territory.lane] = y + 15;
  }
  worldHeight = Math.max(0, explorationBottom, ...Object.values(laneY)) + 10;
  world.style.width = worldWidth + 'px';
  world.style.height = worldHeight + 'px';
  $('#edges').setAttribute('width', worldWidth);
  $('#edges').setAttribute('height', worldHeight);
}
function clearToolSelection() {
  selected = null;
  selectedFromFinder = false;
  selectionKeyboardOrigin = null;
  if (document.activeElement?.closest('[data-tool]'))
    document.activeElement.blur();
  renderSelection();
}
function clearSelectionAndRestoreFocus() {
  const returnTo = selectedFromFinder
    ? $('#finder summary')
    : selectionKeyboardOrigin?.isConnected
      ? selectionKeyboardOrigin
      : viewport;
  clearToolSelection();
  returnTo.focus({ preventScroll: true });
}
function selectTool(id) {
  if (!toolById.has(id)) return;
  selected = id;
  selectedFromFinder = false;
  renderSelection();
}
function renderSelection() {
  document.querySelectorAll('[data-tool]').forEach((n) => {
    const yes = n.dataset.tool === selected;
    n.classList.toggle('selected', yes);
    n.setAttribute('aria-pressed', String(yes));
  });
  const t = toolById.get(selected);
  $('#inspector').classList.toggle('no-selection', !t);
  if (!t) {
    $('#inspector').innerHTML =
      '<div class="eyebrow">EXPLORE THE COLLECTION</div><h2 id="inspector-heading">Select a tool</h2><p class="detail-body">See the job it does, a concrete example, and the tools it connects to.</p>';
    drawEdges();
    return;
  }
  const cat = categoryById.get(t.category),
    territory = territoryById.get(cat.territory),
    relations = data.relations.filter(
      (r) => r.from === selected || r.to === selected,
    );
  $('#inspector').innerHTML =
    `<div class="inspector-top"><span>${esc(territory.name.toUpperCase())} / ${territory.exploration ? 'EXPLORATION' : territory.id === 'learning' ? 'SOURCE' : 'TOOL'}</span><button id="clear-selection" aria-label="Clear tool selection">×</button></div><div class="inspector-mark" aria-hidden="true">${toolIcon(t)}</div><h2 id="inspector-heading">${esc(t.name)}</h2><p class="type">${esc(t.type || 'Tool')} · ${esc(cat.name)}</p>${websiteLink(t)}<div class="detail-label">${territory.id === 'learning' ? 'ABOUT THIS SOURCE' : 'THE JOB IT DOES'}</div><p class="detail-body">${esc(t.purpose)}</p>${t.example ? `<div class="detail-label">FOR EXAMPLE</div><div class="example">${esc(t.example)}</div>` : ''}${t.distinction ? `<div class="detail-label">WHERE IT FITS</div><p class="detail-body">${esc(t.distinction)}</p>` : ''}${
      relations.length
        ? `<div class="detail-label">CONNECTIONS</div>${relations
            .map((r) => {
              const other = r.from === selected ? r.to : r.from;
              return `<button class="relation" data-related="${esc(other)}"><span>${esc(toolById.get(r.from).name)} ${esc(r.label)}</span><b>${esc(toolById.get(r.to).name)} ↗</b></button>`;
            })
            .join('')}`
        : ''
    }<p class="scope-note">Tools are grouped by their main job. A category does not imply that its tools are interchangeable.</p>`;
  $('#clear-selection').onclick = () => {
    clearSelectionAndRestoreFocus();
  };
  $('#inspector').scrollTop = 0;
  drawEdges();
}
function drawEdges() {
  const svg = $('#edges');
  svg.innerHTML =
    '<defs><marker id="arrow" viewBox="0 0 10 10" refX="9" refY="5" markerWidth="6" markerHeight="6" orient="auto-start-reverse"><path d="M 0 0 L 10 5 L 0 10 z" style="fill:#9696b3;stroke:none"/></marker></defs>';
  if (!selected) return;
  const selectedNode = $(`#regions [data-tool="${selected}"]`);
  if (!selectedNode || selectedNode.parentElement.classList.contains('dimmed'))
    return;
  const worldRect = world.getBoundingClientRect();
  const box = (id) => {
    const n = $(`#regions [data-tool="${id}"]`);
    if (!n || n.parentElement.classList.contains('dimmed')) return null;
    const r = n.getBoundingClientRect();
    return {
      x: (r.x - worldRect.x) / scale,
      y: (r.y - worldRect.y) / scale,
      w: r.width / scale,
      h: r.height / scale,
    };
  };
  for (const r of data.relations.filter(
    (r) => r.from === selected || r.to === selected,
  )) {
    const a = box(r.from),
      b = box(r.to);
    if (!a || !b) continue;
    let ax = a.x + a.w / 2,
      ay = a.y + a.h / 2,
      bx = b.x + b.w / 2,
      by = b.y + b.h / 2,
      path,
      lx,
      ly;
    const ga = $(`#regions [data-tool="${r.from}"]`).closest('.map-group'),
      gb = $(`#regions [data-tool="${r.to}"]`).closest('.map-group');
    if (ga !== gb) {
      const forward = gb.offsetLeft > ga.offsetLeft,
        sign = forward ? 1 : -1;
      ax += (sign * a.w) / 2;
      bx -= (sign * b.w) / 2;
      const exit = forward
        ? ga.offsetLeft + ga.offsetWidth + 17
        : ga.offsetLeft - 17;
      const enter = forward
        ? gb.offsetLeft - 17
        : gb.offsetLeft + gb.offsetWidth + 17;
      const routeY = Math.min(ga.offsetTop, gb.offsetTop) - 16;
      path = `M${ax},${ay} H${exit} V${routeY} H${enter} V${by} H${bx}`;
      lx = (exit + enter) / 2;
      ly = routeY - 9;
    } else if (Math.abs(ax - bx) > Math.abs(ay - by)) {
      const sign = bx > ax ? 1 : -1;
      ax += (sign * a.w) / 2;
      bx -= (sign * b.w) / 2;
      const offset = Math.max(35, Math.abs(bx - ax) * 0.45);
      path = `M${ax},${ay} C${ax + sign * offset},${ay} ${bx - sign * offset},${by} ${bx},${by}`;
      lx = (ax + bx) / 2;
      ly = Math.min(a.y, b.y) - 9;
    } else {
      const sign = by > ay ? 1 : -1;
      ay += (sign * a.h) / 2;
      by -= (sign * b.h) / 2;
      const offset = Math.max(35, Math.abs(by - ay) * 0.45);
      path = `M${ax},${ay} C${ax},${ay + sign * offset} ${bx},${by - sign * offset} ${bx},${by}`;
      lx = (ax + bx) / 2 + 8;
      ly = (ay + by) / 2;
    }
    svg.insertAdjacentHTML(
      'beforeend',
      `<path d="${path}" marker-end="url(#arrow)" ${r.kind === 'overlap' ? 'stroke-dasharray="6 5"' : ''}/><text x="${lx}" y="${ly}" text-anchor="middle">${esc(r.label)}</text>`,
    );
  }
}
function applyTransform() {
  world.style.transform = `translate(${panX}px,${panY}px) scale(${scale})`;
  $('#zoom-level').textContent = Math.round(scale * 100) + '%';
}
function fit() {
  const right = selected && viewport.clientWidth > 760 ? 265 : 16,
    top = 24;
  const availableWidth = viewport.clientWidth - right - 44,
    availableHeight = viewport.clientHeight - top - 82;
  scale = Math.max(
    0.12,
    Math.min(availableWidth / worldWidth, availableHeight / worldHeight, 1),
  );
  panX = 22 + (availableWidth - worldWidth * scale) / 2;
  panY = top + (availableHeight - worldHeight * scale) / 2;
  applyTransform();
  drawEdges();
}
function zoom(
  factor,
  x = viewport.clientWidth / 2,
  y = viewport.clientHeight / 2,
) {
  const next = Math.min(4, Math.max(0.12, scale * factor));
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
  if (
    e.target.closest('a,input,textarea,select') ||
    (e.button !== 0 && e.button !== 1)
  )
    return;
  if (e.pointerType !== 'touch') e.preventDefault();
  suppressCanvasClick = false;
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
      4,
      Math.max(
        0.12,
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
    selectTool(node.dataset.tool);
    selectionKeyboardOrigin = e.detail === 0 ? node : null;
    if (selectionKeyboardOrigin)
      $('#inspector').focus({ preventScroll: true });
    return;
  }
  const rel = e.target.closest('[data-related]');
  if (rel) {
    selectTool(rel.dataset.related);
    $('#inspector').focus({ preventScroll: true });
    return;
  }
  if (
    e.target.closest('#viewport') &&
    !e.target.closest('a,button,input,textarea,select')
  ) {
    clearToolSelection();
    viewport.focus({ preventScroll: true });
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
  addRelation: (relation) => {
    const next = structuredClone(data);
    next.relations.push(relation);
    setData(next);
  },
  selectTool,
  fit,
};
reloadData();
