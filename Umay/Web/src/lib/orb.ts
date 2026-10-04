/* ============================================================
   UMAY CORE — plazma küre görselleştirmesi (canvas 2D)
   Dönen tel-küre, süzülen plazma akışları, yörünge parçacıkları
   ve holografik kaide halkaları çizer.
   ============================================================ */

type Opts = { busy?: boolean };

const TAU = Math.PI * 2;

function hexToRgb(hex: string): [number, number, number] {
  const v = parseInt(hex.replace("#", ""), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}

function rgba(hex: string, a: number) {
  const [r, g, b] = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
}

function mix(h1: string, h2: string, t: number): string {
  const a = hexToRgb(h1);
  const b = hexToRgb(h2);
  return `rgb(${Math.round(a[0] + (b[0] - a[0]) * t)},${Math.round(a[1] + (b[1] - a[1]) * t)},${Math.round(a[2] + (b[2] - a[2]) * t)})`;
}

export function mountOrbStage(canvas: HTMLCanvasElement, getBusy: () => boolean) {
  const ctx = canvas.getContext("2d");
  if (!ctx) return () => {};

  let width = 0;
  let height = 0;
  let dpr = 1;
  let raf = 0;
  let disposed = false;

  type Particle = { a: number; speed: number; tilt: number; radius: number; size: number; hue: string };
  type Stream = { seed: number; hue: string; width: number; speed: number };

  const particles: Particle[] = [];
  for (let i = 0; i < 42; i++) {
    particles.push({
      a: Math.random() * TAU,
      speed: 0.15 + Math.random() * 0.5,
      tilt: (Math.random() - 0.5) * 1.3,
      radius: 1.02 + Math.random() * 0.65,
      size: 0.7 + Math.random() * 1.7,
      hue: ["#67e8f9", "#38bdf8", "#a78bfa", "#22d3ee"][Math.floor(Math.random() * 4)]
    });
  }

  const streams: Stream[] = [];
  for (let i = 0; i < 14; i++) {
    streams.push({
      seed: Math.random() * 1000,
      hue: ["#67e8f9", "#38bdf8", "#7dd3fc", "#a78bfa"][i % 4],
      width: 0.7 + Math.random() * 1.6,
      speed: 0.25 + Math.random() * 0.55
    });
  }

  function resize() {
    const rect = canvas.getBoundingClientRect();
    dpr = Math.min(2, window.devicePixelRatio || 1);
    width = Math.max(10, rect.width);
    height = Math.max(10, rect.height);
    canvas.width = Math.round(width * dpr);
    canvas.height = Math.round(height * dpr);
    ctx!.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  /* --- 3B nokta yardımcıları --- */
  function project(x: number, y: number, z: number, cx: number, cy: number, r: number) {
    const depth = 2.6 / (2.6 + z);
    return {
      x: cx + x * r * depth,
      y: cy + y * r * depth,
      depth
    };
  }

  let spin = 0;

  function drawWireSphere(cx: number, cy: number, r: number, t: number, busy: boolean) {
    const c = ctx!;
    const lonCount = 12;
    const latCount = 7;

    c.save();

    // Enlem halkaları
    for (let i = 1; i < latCount; i++) {
      const lat = (i / latCount - 0.5) * Math.PI;
      const y = Math.sin(lat);
      const rr = Math.cos(lat);
      c.beginPath();
      for (let s = 0; s <= 64; s++) {
        const lon = (s / 64) * TAU + spin * 0.9;
        const x = Math.cos(lon) * rr;
        const z = Math.sin(lon) * rr;
        const p = project(x, y, z, cx, cy, r);
        if (s === 0) c.moveTo(p.x, p.y);
        else c.lineTo(p.x, p.y);
      }
      const alpha = 0.05 + 0.16 * (1 - Math.abs(y));
      c.strokeStyle = `rgba(125, 211, 252, ${alpha})`;
      c.lineWidth = 1;
      c.stroke();
    }

    // Boylam eğrileri
    for (let i = 0; i < lonCount; i++) {
      const lon0 = (i / lonCount) * TAU + spin * 0.9;
      c.beginPath();
      for (let s = 0; s <= 48; s++) {
        const lat = (s / 48) * Math.PI - Math.PI / 2;
        const y = Math.sin(lat);
        const rr = Math.cos(lat);
        const x = Math.cos(lon0) * rr;
        const z = Math.sin(lon0) * rr;
        const p = project(x, y, z, cx, cy, r);
        if (s === 0) c.moveTo(p.x, p.y);
        else c.lineTo(p.x, p.y);
      }
      c.strokeStyle = `rgba(56, 189, 248, ${0.1 + (busy ? 0.08 : 0.04)})`;
      c.lineWidth = 1;
      c.stroke();
    }

    // Kıtalar hissi veren parlak noktalar
    const dotCount = 90;
    for (let i = 0; i < dotCount; i++) {
      const seed = i * 12.9898;
      const yy = Math.sin(seed) * 0.82;
      const aa = (i / dotCount) * TAU * 3 + Math.sin(seed * 2.7) * 2 + spin;
      const rr = Math.sqrt(Math.max(0.05, 1 - yy * yy));
      const x = Math.cos(aa) * rr;
      const z = Math.sin(aa) * rr;
      if (z < -0.15) continue;
      const p = project(x, yy, z, cx, cy, r * 0.99);
      const tw = 0.35 + 0.65 * Math.abs(Math.sin(t * 1.4 + i));
      c.fillStyle = `rgba(186, 230, 253, ${0.14 + 0.5 * tw * p.depth})`;
      c.beginPath();
      c.arc(p.x, p.y, 0.9 * p.depth + tw * 0.6, 0, TAU);
      c.fill();
    }

    c.restore();
  }

  function drawStreams(cx: number, cy: number, r: number, t: number, busy: boolean) {
    const c = ctx!;
    c.save();
    c.globalCompositeOperation = "lighter";
    for (const s of streams) {
      const speed = s.speed * (busy ? 1.9 : 1);
      const phase = t * speed + s.seed;
      const spread = 0.55 + 0.45 * Math.sin(s.seed * 3.1);
      c.beginPath();
      const steps = 26;
      for (let i = 0; i <= steps; i++) {
        const u = i / steps;
        const ang = phase + u * 2.6 + spread * 3;
        const lift = Math.sin(u * Math.PI) * (0.5 + spread);
        const x = cx + Math.cos(ang) * r * (1.12 + lift * 0.55);
        const y = cy + Math.sin(ang * 1.7 + s.seed) * r * (0.28 + lift * 0.5) - lift * r * 0.5;
        if (i === 0) c.moveTo(x, y);
        else c.lineTo(x, y);
      }
      c.strokeStyle = rgba(s.hue, busy ? 0.34 : 0.2);
      c.lineWidth = s.width;
      c.shadowColor = rgba(s.hue, 0.9);
      c.shadowBlur = 8;
      c.stroke();
    }
    c.restore();
  }

  function drawParticles(cx: number, cy: number, r: number, dt: number, busy: boolean) {
    const c = ctx!;
    c.save();
    c.globalCompositeOperation = "lighter";
    for (const p of particles) {
      p.a += dt * p.speed * (busy ? 2.1 : 1);
      const x0 = Math.cos(p.a) * r * p.radius;
      const z0 = Math.sin(p.a) * r * p.radius;
      const y0 = Math.sin(p.a * 0.7 + p.tilt) * r * p.radius * Math.sin(p.tilt);
      const proj = project(x0 / r, y0 / r, z0 / r, cx, cy, r * p.radius);
      const alpha = 0.25 + 0.6 * Math.max(0, (z0 / r + 1) / 2);
      c.fillStyle = rgba(p.hue, alpha);
      c.beginPath();
      c.arc(proj.x, proj.y, p.size * proj.depth, 0, TAU);
      c.fill();
    }
    c.restore();
  }

  function drawBase(cx: number, cy: number, r: number, t: number, busy: boolean) {
    const c = ctx!;
    c.save();
    c.globalCompositeOperation = "lighter";
    const baseY = cy + r * 1.28;
    for (let i = 0; i < 4; i++) {
      const k = i / 4;
      const rx = r * (1.55 - i * 0.24);
      const ry = rx * 0.2;
      const pulse = 0.5 + 0.5 * Math.sin(t * 1.6 - i * 1.1);
      c.beginPath();
      c.ellipse(cx, baseY + i * 7, rx, ry, 0, 0, TAU);
      c.strokeStyle = `rgba(56, 189, 248, ${0.16 + pulse * (busy ? 0.4 : 0.2)})`;
      c.lineWidth = 1.4;
      c.shadowColor = "rgba(56, 189, 248, 0.8)";
      c.shadowBlur = 10;
      c.stroke();
    }
    // yükselen ışık konisi
    const grad = c.createLinearGradient(cx, baseY, cx, cy);
    grad.addColorStop(0, "rgba(125, 211, 252, 0.22)");
    grad.addColorStop(1, "rgba(125, 211, 252, 0)");
    c.fillStyle = grad;
    c.beginPath();
    c.moveTo(cx - r * 0.42, baseY);
    c.lineTo(cx - r * 0.1, cy + r * 0.2);
    c.lineTo(cx + r * 0.1, cy + r * 0.2);
    c.lineTo(cx + r * 0.42, baseY);
    c.closePath();
    c.fill();
    c.restore();
  }

  function drawCore(cx: number, cy: number, r: number, t: number, busy: boolean) {
    const c = ctx!;
    c.save();

    // dış aura
    const aura = c.createRadialGradient(cx, cy, r * 0.2, cx, cy, r * (busy ? 2.5 : 2.1));
    aura.addColorStop(0, `rgba(56, 189, 248, ${busy ? 0.5 : 0.34})`);
    aura.addColorStop(0.4, "rgba(37, 99, 235, 0.16)");
    aura.addColorStop(1, "rgba(37, 99, 235, 0)");
    c.fillStyle = aura;
    c.beginPath();
    c.arc(cx, cy, r * 2.5, 0, TAU);
    c.fill();

    // küre gövdesi
    const body = c.createRadialGradient(cx - r * 0.3, cy - r * 0.35, r * 0.1, cx, cy, r);
    body.addColorStop(0, "rgba(165, 243, 252, 0.95)");
    body.addColorStop(0.25, "rgba(56, 189, 248, 0.85)");
    body.addColorStop(0.7, "rgba(29, 78, 216, 0.9)");
    body.addColorStop(1, "rgba(15, 23, 42, 0.96)");
    c.fillStyle = body;
    c.beginPath();
    c.arc(cx, cy, r, 0, TAU);
    c.fill();

    drawWireSphere(cx, cy, r, t, busy);
    drawStreams(cx, cy, r, t, busy);
    drawParticles(cx, cy, r, 0.016, busy);

    // kenar parıltısı
    c.strokeStyle = `rgba(186, 230, 253, ${busy ? 0.9 : 0.65})`;
    c.lineWidth = 1.6;
    c.shadowColor = "rgba(125, 211, 252, 1)";
    c.shadowBlur = 22;
    c.beginPath();
    c.arc(cx, cy, r, 0, TAU);
    c.stroke();

    // iç çekirdek nabzı
    const pulse = 0.5 + 0.5 * Math.sin(t * (busy ? 5 : 2.4));
    const core = c.createRadialGradient(cx, cy, 0, cx, cy, r * 0.5);
    core.addColorStop(0, `rgba(255, 255, 255, ${0.35 + pulse * 0.3})`);
    core.addColorStop(1, "rgba(255, 255, 255, 0)");
    c.fillStyle = core;
    c.beginPath();
    c.arc(cx, cy, r * 0.5, 0, TAU);
    c.fill();

    c.restore();
  }

  const mixT = (t: number) => 0.5 + 0.5 * Math.sin(t * 0.8);

  function frame(now: number) {
    if (disposed) return;
    const t = now / 1000;
    const busy = getBusy();
    spin = (spin + 0.0035) % TAU;

    ctx!.clearRect(0, 0, width, height);

    const cx = width / 2;
    const cy = height * 0.46;
    const r = Math.min(width, height) * 0.21;

    drawBase(cx, cy, r, t, busy);
    drawCore(cx, cy, r, t, busy);

    // renk geçişi göstergesi (çerçeve ışıması) — ince detay
    const glow = mix("#38bdf8", "#a78bfa", mixT(t));
    ctx!.save();
    ctx!.globalCompositeOperation = "lighter";
    const vign = ctx!.createRadialGradient(cx, cy, r * 1.9, cx, cy, r * 3.4);
    vign.addColorStop(0, glow.replace("rgb", "rgba").replace(")", ", 0.05)"));
    vign.addColorStop(1, "rgba(0,0,0,0)");
    ctx!.fillStyle = vign;
    ctx!.fillRect(0, 0, width, height);
    ctx!.restore();

    raf = requestAnimationFrame(frame);
  }

  resize();
  const ro = new ResizeObserver(resize);
  ro.observe(canvas);
  raf = requestAnimationFrame(frame);

  return () => {
    disposed = true;
    cancelAnimationFrame(raf);
    ro.disconnect();
  };
}
