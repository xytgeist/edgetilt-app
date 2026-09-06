(() => {
  const canvas = document.getElementById("rain");
  if (!canvas || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;

  const glyphs = "01DIGIVERSEEDGEWYLLCアカサタナハマヤラワ$#*+<>";
  const cols = [];
  let w = 0;
  let h = 0;
  let font = 16;

  const fit = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.75);
    w = window.innerWidth;
    h = window.innerHeight;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    font = w < 700 ? 13 : 16;
    const n = Math.ceil(w / font);
    cols.length = 0;
    for (let i = 0; i < n; i += 1) cols.push(Math.random() * -40);
  };
  fit();
  window.addEventListener("resize", fit);

  let live = true;
  document.addEventListener("visibilitychange", () => {
    live = document.visibilityState === "visible";
  });

  const tick = () => {
    if (live) {
      ctx.fillStyle = "rgba(3, 7, 4, 0.14)";
      ctx.fillRect(0, 0, w, h);
      ctx.fillStyle = "#7cff6b";
      ctx.font = `${font}px "IBM Plex Mono", monospace`;
      cols.forEach((y, i) => {
        const ch = glyphs[Math.floor(Math.random() * glyphs.length)];
        const x = i * font;
        ctx.globalAlpha = 0.35 + Math.random() * 0.65;
        ctx.fillText(ch, x, y * font);
        if (y * font > h && Math.random() > 0.975) cols[i] = 0;
        else cols[i] = y + 1;
      });
      ctx.globalAlpha = 1;
    }
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();
