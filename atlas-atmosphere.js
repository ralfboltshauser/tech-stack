const clamp = (value, min, max) => Math.max(min, Math.min(max, value));

export function createAtlasAtmosphere(viewport) {
  const motion = matchMedia('(prefers-reduced-motion: reduce)');
  const mouse = matchMedia('(hover: hover) and (pointer: fine)');
  const canvas = document.createElement('canvas');
  canvas.className = 'atlas-atmosphere';
  canvas.setAttribute('aria-hidden', 'true');
  const ctx = canvas.getContext('2d');
  if (!ctx) return { reset() {} };

  const cache = new Map();
  let hovered = null, timer = 0, frame = 0, generation = 0;
  let particles = [], projection = null, returning = false, started = 0;
  let width = 0, height = 0, held = false;

  async function sampleIcon(src) {
    if (cache.has(src)) return cache.get(src);
    const pending = (async () => {
      const image = new Image();
      image.crossOrigin = 'anonymous';
      image.src = src;
      await image.decode();
      const sample = document.createElement('canvas');
      sample.width = sample.height = 72;
      const context = sample.getContext('2d', { willReadFrequently: true });
      const ratio = Math.min(64 / image.naturalWidth, 64 / image.naturalHeight);
      const w = image.naturalWidth * ratio, h = image.naturalHeight * ratio;
      context.drawImage(image, (72 - w) / 2, (72 - h) / 2, w, h);
      const pixels = context.getImageData(0, 0, 72, 72).data;
      const points = [];
      for (let y = 0; y < 72; y += 2) {
        for (let x = 0; x < 72; x += 2) {
          const i = (y * 72 + x) * 4;
          const [r, g, b, a] = pixels.subarray(i, i + 4);
          // White icon backplates should not become a square cloud.
          const contrast = 1 - Math.min(r, g, b) / 255;
          if (a < 80 || contrast < 0.12) continue;
          points.push({ x: x / 72 - 0.5, y: y / 72 - 0.5,
            color: `rgb(${Math.round(r * 0.72)},${Math.round(g * 0.72)},${Math.round(b * 0.72)})`,
            alpha: (a / 255) * (0.22 + contrast * 0.2) });
        }
      }
      const sampled = points.filter((_, i) => i % Math.ceil(points.length / 700) === 0);
      const glow = document.createElement('canvas');
      glow.width = glow.height = 144;
      const glowContext = glow.getContext('2d');
      glowContext.filter = 'blur(5px)';
      glowContext.drawImage(sample, 12, 12, 120, 120);
      return { points: sampled, glow };
    })().catch((error) => {
      console.warn('Could not sample an atlas hover icon:', src, error);
      return null;
    });
    cache.set(src, pending);
    return pending;
  }

  function reset() {
    generation++;
    clearTimeout(timer);
    cancelAnimationFrame(frame);
    frame = 0;
    hovered = null;
    particles = [];
    projection = null;
    ctx.clearRect(0, 0, width, height);
    canvas.remove();
  }

  function prepareCanvas() {
    width = height = 200;
    const dpr = Math.min(devicePixelRatio || 1, 2);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    viewport.append(canvas);
  }

  function draw(now) {
    frame = 0;
    const elapsed = now - started;
    let moving = false;
    ctx.clearRect(0, 0, width, height);
    if (projection) {
      const fade = returning ? Math.max(0, 1 - elapsed / 260) : clamp((elapsed - 180) / 550, 0, 1);
      ctx.globalAlpha = 0.085 * fade;
      ctx.drawImage(projection.glow, projection.x - projection.size / 2,
        projection.y - projection.size / 2, projection.size, projection.size);
    }
    for (const p of particles) {
      const t = clamp(elapsed / p.duration, 0, 1);
      const ease = 1 - (1 - t) ** 4;
      const arc = Math.sin(Math.PI * t) * (1 - t) * p.arc;
      p.x = p.sx + (p.tx - p.sx) * ease + arc;
      p.y = p.sy + (p.ty - p.sy) * ease - arc * 0.6;
      p.alpha = p.sa + (p.ta - p.sa) * ease;
      ctx.globalAlpha = p.alpha;
      ctx.fillStyle = p.color;
      ctx.beginPath();
      ctx.arc(p.x, p.y, p.radius, 0, Math.PI * 2);
      ctx.fill();
      if (t < 1) moving = true;
    }
    ctx.globalAlpha = 1;
    if (moving) frame = requestAnimationFrame(draw);
    else if (returning) {
      particles = [];
      projection = null;
      ctx.clearRect(0, 0, width, height);
      canvas.remove();
    }
  }

  function animate() {
    cancelAnimationFrame(frame);
    started = performance.now();
    frame = requestAnimationFrame(draw);
  }

  function release() {
    generation++;
    clearTimeout(timer);
    hovered = null;
    if (!particles.length || returning) return;
    returning = true;
    particles.forEach((p, i) => {
      p.sx = p.x; p.sy = p.y; p.sa = p.alpha;
      p.tx = p.hx; p.ty = p.hy; p.ta = 0;
      p.duration = 480 + (i % 7) * 22;
    });
    animate();
  }

  async function assemble(node) {
    const token = ++generation;
    const src = node.querySelector('img')?.src;
    if (!src) { release(); return; }
    const icon = await sampleIcon(src);
    if (token !== generation) return;
    if (!icon?.points.length) { release(); return; }
    prepareCanvas();
    const size = 176, x = width / 2, y = height / 2;
    const step = 24, cols = 7;
    const previous = particles;
    particles = Array.from({ length: 512 }, (_, i) => {
      const pointIndex = Math.floor(i * icon.points.length / 512);
      const point = icon.points[pointIndex];
      const copies = Math.ceil((pointIndex + 1) * 512 / icon.points.length) - Math.ceil(pointIndex * 512 / icon.points.length);
      const old = previous[i];
      const hx = 28 + (i % cols) * step;
      const hy = 28 + (Math.floor(i / cols) % cols) * step;
      return { x: old?.x ?? hx, y: old?.y ?? hy,
        sx: old?.x ?? hx, sy: old?.y ?? hy, hx, hy,
        tx: x + point.x * size, ty: y + point.y * size,
        alpha: old?.alpha ?? 0.06, sa: old?.alpha ?? 0.06,
        // Repeated samples should have the same final opacity as a single dot.
        ta: 1 - (1 - point.alpha * 1.65) ** (1 / copies),
        color: point.color, radius: 1.05,
        duration: 720 + (i % 11) * 17, arc: ((i % 5) - 2) * 12 };
    });
    projection = { glow: icon.glow, x, y, size: size * 1.2 };
    returning = false;
    animate();
  }

  function hover(event) {
    if (event.pointerType !== 'mouse' || !mouse.matches || motion.matches || held || document.hidden) return;
    const node = event.target.closest('.tool-card')?.querySelector('[data-tool]') || null;
    if (node === hovered) return;
    clearTimeout(timer);
    generation++;
    hovered = node || null;
    if (node) timer = setTimeout(() => assemble(node), 110);
    else timer = setTimeout(release, 100);
  }

  viewport.addEventListener('pointermove', hover);
  viewport.addEventListener('pointerleave', release);
  viewport.addEventListener('pointerdown', () => { held = true; reset(); });
  document.addEventListener('pointerup', () => { held = false; });
  document.addEventListener('pointercancel', () => { held = false; reset(); });
  window.addEventListener('blur', () => { held = false; reset(); });
  document.addEventListener('visibilitychange', reset);
  motion.addEventListener('change', reset);
  mouse.addEventListener('change', reset);
  return { reset };
}
