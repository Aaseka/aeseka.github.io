const clock = document.getElementById("clock");
const tz = clock.dataset.tz || "America/Toronto";
const fmt = new Intl.DateTimeFormat("en-CA", {
  hour: "numeric",
  minute: "2-digit",
  hour12: true,
  timeZone: tz,
});

function tick() {
  clock.textContent = fmt.format(new Date()).replace(/\./g, "");
}
tick();
setInterval(tick, 15000);

(() => {
  const el = document.getElementById("knot");
  if (!el) return;

  const COLS = 92;
  const ROWS = 50;
  const RAMP = ".,:-=+*#%@"; 
  const TUBE = 0.4; 
  const DIST = 10;

  const probe = document.createElement("span");
  probe.textContent = "M".repeat(20);
  probe.style.cssText = "position:absolute;visibility:hidden;white-space:pre";
  el.appendChild(probe);
  const measure = () => {
    const fs = parseFloat(getComputedStyle(el).fontSize) || 12;
    return probe.getBoundingClientRect().width / 20 / fs || 0.6;
  };
  const cellRatio = measure();
 
  if (document.fonts) {
    document.fonts.ready.then(() => {
      el.appendChild(probe);
      Kx = Ky / measure();
      probe.remove();
      draw();
    });
  }
  probe.remove();

  const Ky = ((ROWS / 2) * 0.95 * (DIST - 2)) / 3.6;
  let Kx = Ky / cellRatio;

  const curve = (t) => {
    const r = 2 + Math.cos(3 * t);
    return [r * Math.cos(2 * t), r * Math.sin(2 * t), Math.sin(3 * t)];
  };
  const norm = (v) => {
    const l = Math.hypot(v[0], v[1], v[2]);
    return [v[0] / l, v[1] / l, v[2] / l];
  };
  const cross = (a, b) => [
    a[1] * b[2] - a[2] * b[1],
    a[2] * b[0] - a[0] * b[2],
    a[0] * b[1] - a[1] * b[0],
  ];

  const ALONG = 700,
    AROUND = 40;
  const pts = new Float32Array(ALONG * AROUND * 6);
  let k = 0;
  for (let i = 0; i < ALONG; i++) {
    const t = (i / ALONG) * Math.PI * 2;
    const c = curve(t);
    const a = curve(t - 0.001),
      b = curve(t + 0.001);
    const T = norm([b[0] - a[0], b[1] - a[1], b[2] - a[2]]);
    const N = norm(cross(T, [0, 0, 1]));
    const B = cross(T, N);
    for (let j = 0; j < AROUND; j++) {
      const s = (j / AROUND) * Math.PI * 2;
      const cs = Math.cos(s),
        ss = Math.sin(s);
      const nx = cs * N[0] + ss * B[0];
      const ny = cs * N[1] + ss * B[1];
      const nz = cs * N[2] + ss * B[2];
      pts[k++] = c[0] + TUBE * nx;
      pts[k++] = c[1] + TUBE * ny;
      pts[k++] = c[2] + TUBE * nz;
      pts[k++] = nx;
      pts[k++] = ny;
      pts[k++] = nz;
    }
  }

  const light = norm([-0.45, 0.6, -0.65]);
  const out = new Array(COLS * ROWS);
  const zbuf = new Float32Array(COLS * ROWS);
  const gap = new Uint8Array(COLS * ROWS);
  const GAP = 0.006; 

  let spin = 0; 
  let tilt = 0.3,
    sway = 0; 
  let tiltOff = 0; 
  let speed = 1,
    target = 1; 
  let spinV = 0; 

  function draw() {
    out.fill(" ");
    zbuf.fill(0);
    const cA = Math.cos(spin),
      sA = Math.sin(spin);
    const cB = Math.cos(tilt + tiltOff),
      sB = Math.sin(tilt + tiltOff);
    const cC = Math.cos(sway),
      sC = Math.sin(sway);

    for (let p = 0; p < pts.length; p += 6) {
      let x = pts[p] * cA - pts[p + 1] * sA;
      let y = pts[p] * sA + pts[p + 1] * cA;
      let z = y * sB + pts[p + 2] * cB;
      y = y * cB - pts[p + 2] * sB;
      const x2 = x * cC + z * sC;
      z = -x * sC + z * cC;
      x = x2;

      const ooz = 1 / (z + DIST);
      const xp = Math.floor(COLS / 2 + Kx * x * ooz);
      const yp = Math.floor(ROWS / 2 - Ky * y * ooz);
      if (xp < 0 || xp >= COLS || yp < 0 || yp >= ROWS) continue;

      const i = xp + yp * COLS;
      if (ooz <= zbuf[i]) continue;
      zbuf[i] = ooz;

      let nx = pts[p + 3] * cA - pts[p + 4] * sA;
      let ny = pts[p + 3] * sA + pts[p + 4] * cA;
      let nz = ny * sB + pts[p + 5] * cB;
      ny = ny * cB - pts[p + 5] * sB;
      const nx2 = nx * cC + nz * sC;
      nz = -nx * sC + nz * cC;
      nx = nx2;

      const lum = nx * light[0] + ny * light[1] + nz * light[2];
      out[i] =
        lum <= 0
          ? "."
          : RAMP[Math.min(RAMP.length - 1, Math.floor(lum * RAMP.length))];
    }


    for (let i = 0; i < out.length; i++) {
      const d = zbuf[i];
      if (!d) continue;
      const x = i % COLS;
      const n = [
        x > 0 ? i - 1 : -1,
        x < COLS - 1 ? i + 1 : -1,
        i - COLS,
        i + COLS,
      ];
      for (const j of n) {
        if (j < 0 || j >= out.length || !zbuf[j]) continue;
        if (zbuf[j] < d - GAP) gap[j] = 1;
      }
    }
    for (let i = 0; i < out.length; i++) {
      if (gap[i]) {
        out[i] = " ";
        gap[i] = 0;
      }
    }

    let s = "";
    for (let r = 0; r < ROWS; r++) {
      s += out.slice(r * COLS, r * COLS + COLS).join("") + "\n";
    }
    el.textContent = s;
  }

  const still = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  draw();
  if (still) return;

  let dragging = false,
    px = 0,
    py = 0;
  let last = performance.now();
  function frame(now) {
    const dt = Math.min(50, now - last) / 16.67;
    last = now;
    speed += (target - speed) * 0.05;
    spin += (0.006 * speed + spinV) * dt;
    spinV *= 0.95;
    tilt = 0.3 + 0.16 * Math.sin(now / 2600);
    sway = 0.28 * Math.sin(now / 3700);
    if (!dragging) tiltOff *= 0.94;
    if (el.offsetParent !== null) draw();
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);

  document.querySelectorAll(".statement a").forEach((a) => {
    a.addEventListener("mouseenter", () => (target = 5));
    a.addEventListener("mouseleave", () => (target = 1));
  });

  el.addEventListener("pointerdown", (e) => {
    dragging = true;
    px = e.clientX;
    py = e.clientY;
    el.setPointerCapture(e.pointerId);
  });
  el.addEventListener("pointermove", (e) => {
    if (!dragging) return;
    const dx = e.clientX - px,
      dy = e.clientY - py;
    px = e.clientX;
    py = e.clientY;
    spin += dx * 0.01;
    spinV = dx * 0.002;
    tiltOff = Math.max(-1.2, Math.min(1.2, tiltOff + dy * 0.01));
  });
  const stop = () => (dragging = false);
  el.addEventListener("pointerup", stop);
  el.addEventListener("pointercancel", stop);
})();

const links = {};
document.querySelectorAll("[data-key]").forEach((a) => {
  links[a.dataset.key] = a;
});

document.addEventListener("keydown", (e) => {
  if (e.metaKey || e.ctrlKey || e.altKey || e.repeat) return;
  const link = links[e.key.toLowerCase()];
  if (!link) return;

  link.classList.add("is-pressed");
  setTimeout(() => {
    link.classList.remove("is-pressed");
    if (link.target === "_blank") {
      window.open(link.href, "_blank", "noopener");
    } else {
      window.location.href = link.href;
    }
  }, 180);
});
