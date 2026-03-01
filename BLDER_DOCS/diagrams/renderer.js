// Renderer — called via eval() from Playwright.
// Defines window.renderExcalidraw(data) → { width, height }

window.renderExcalidraw = function(data) {
  const PAD = 48;
  const elements = (data.elements || []).filter(e => !e.isDeleted);
  const bg = (data.appState && data.appState.viewBackgroundColor) || "#f8f9fa";

  // ── Compute bounding box ──────────────────────────────────────────────────
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;

  for (const el of elements) {
    const x = el.x || 0, y = el.y || 0;
    const w = el.width || 0, h = el.height || 0;
    if (el.type === "arrow" && el.points) {
      for (const p of el.points) {
        minX = Math.min(minX, x + p[0]); maxX = Math.max(maxX, x + p[0]);
        minY = Math.min(minY, y + p[1]); maxY = Math.max(maxY, y + p[1]);
      }
    }
    minX = Math.min(minX, x);     maxX = Math.max(maxX, x + w);
    minY = Math.min(minY, y);     maxY = Math.max(maxY, y + h);
  }

  if (!isFinite(minX)) { minX = 0; minY = 0; maxX = 400; maxY = 300; }

  const W = Math.round(maxX - minX + PAD * 2);
  const H = Math.round(maxY - minY + PAD * 2);
  const ox = -minX + PAD;   // translate offset x
  const oy = -minY + PAD;   // translate offset y

  // ── Set up canvas ─────────────────────────────────────────────────────────
  const canvas = document.getElementById("c");
  canvas.width  = W;
  canvas.height = H;
  canvas.style.width  = W + "px";
  canvas.style.height = H + "px";

  const ctx = canvas.getContext("2d");
  ctx.clearRect(0, 0, W, H);
  ctx.fillStyle = bg;
  ctx.fillRect(0, 0, W, H);

  // ── Draw elements ─────────────────────────────────────────────────────────
  for (const el of elements) {
    const x  = (el.x || 0) + ox;
    const y  = (el.y || 0) + oy;
    const w  = el.width  || 0;
    const h  = el.height || 0;
    const sc = el.strokeColor     || "#1e1e1e";
    const fc = (el.backgroundColor === "transparent" || !el.backgroundColor) ? null : el.backgroundColor;
    const sw = el.strokeWidth || 2;
    const dash = el.strokeStyle === "dashed" ? [8, 4] : [];

    // ── rectangle ────────────────────────────────────────────────────────────
    if (el.type === "rectangle") {
      ctx.save();
      ctx.lineWidth   = sw;
      ctx.strokeStyle = sc;
      ctx.setLineDash(dash);

      if (el.roundness) {
        const r = Math.min(10, w / 2, h / 2);
        ctx.beginPath();
        ctx.moveTo(x + r, y);
        ctx.lineTo(x + w - r, y);
        ctx.arcTo(x + w, y, x + w, y + r, r);
        ctx.lineTo(x + w, y + h - r);
        ctx.arcTo(x + w, y + h, x + w - r, y + h, r);
        ctx.lineTo(x + r, y + h);
        ctx.arcTo(x, y + h, x, y + h - r, r);
        ctx.lineTo(x, y + r);
        ctx.arcTo(x, y, x + r, y, r);
        ctx.closePath();
        if (fc) { ctx.fillStyle = fc; ctx.fill(); }
        ctx.stroke();
      } else {
        if (fc) { ctx.fillStyle = fc; ctx.fillRect(x, y, w, h); }
        ctx.strokeRect(x, y, w, h);
      }
      ctx.restore();

    // ── text ─────────────────────────────────────────────────────────────────
    } else if (el.type === "text") {
      if (!el.text || !el.text.trim()) continue;
      ctx.save();
      const fs = el.fontSize || 16;
      const ff = el.fontFamily === 3 ? "monospace"
               : el.fontFamily === 2 ? "Georgia, serif"
               : "'Segoe UI', system-ui, Arial, sans-serif";
      ctx.font         = `${fs}px ${ff}`;
      ctx.fillStyle    = sc;
      ctx.textAlign    = "center";
      ctx.textBaseline = "middle";

      const lines  = el.text.split("\n");
      const lineH  = fs * 1.3;
      const totalH = lines.length * lineH;
      const startY = y + (h - totalH) / 2 + lineH / 2;

      lines.forEach((line, i) => {
        ctx.fillText(line, x + w / 2, startY + i * lineH, w - 8);
      });
      ctx.restore();

    // ── arrow ─────────────────────────────────────────────────────────────────
    } else if (el.type === "arrow") {
      const pts = el.points || [[0, 0], [w, h]];
      const abs = pts.map(p => [x + p[0], y + p[1]]);
      if (abs.length < 2) continue;

      ctx.save();
      ctx.strokeStyle = sc;
      ctx.lineWidth   = sw;
      ctx.setLineDash(dash);
      ctx.lineCap     = "round";
      ctx.lineJoin    = "round";

      ctx.beginPath();
      ctx.moveTo(abs[0][0], abs[0][1]);
      for (let i = 1; i < abs.length; i++) ctx.lineTo(abs[i][0], abs[i][1]);
      ctx.stroke();

      // Arrowhead at end
      if (el.endArrowhead) {
        const last = abs[abs.length - 1];
        const prev = abs[abs.length - 2];
        const angle = Math.atan2(last[1] - prev[1], last[0] - prev[0]);
        const aLen = 11, aSpread = Math.PI / 6;

        ctx.setLineDash([]);
        ctx.beginPath();
        ctx.moveTo(last[0], last[1]);
        ctx.lineTo(last[0] - aLen * Math.cos(angle - aSpread),
                   last[1] - aLen * Math.sin(angle - aSpread));
        ctx.moveTo(last[0], last[1]);
        ctx.lineTo(last[0] - aLen * Math.cos(angle + aSpread),
                   last[1] - aLen * Math.sin(angle + aSpread));
        ctx.stroke();
      }
      ctx.restore();
    }
  }

  return { width: W, height: H };
};
