(() => {
  const word = document.querySelector(".word");
  if (!word || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  if (window.matchMedia("(pointer: coarse)").matches) return;
  let x = 0;
  let tx = 0;
  window.addEventListener(
    "pointermove",
    (e) => {
      tx = (e.clientX / window.innerWidth - 0.5) * -48;
    },
    { passive: true }
  );
  const tick = () => {
    x += (tx - x) * 0.06;
    word.style.transform = `translateX(${x}px)`;
    requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
})();
