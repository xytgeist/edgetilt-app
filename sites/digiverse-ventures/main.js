(() => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;

  const cursor = document.querySelector(".cursor");
  if (cursor && !coarse && !reduced) {
    let x = 0;
    let y = 0;
    let tx = 0;
    let ty = 0;
    window.addEventListener(
      "pointermove",
      (e) => {
        tx = e.clientX;
        ty = e.clientY;
      },
      { passive: true }
    );
    const tick = () => {
      x += (tx - x) * 0.22;
      y += (ty - y) * 0.22;
      cursor.style.transform = `translate(${x}px, ${y}px)`;
      requestAnimationFrame(tick);
    };
    requestAnimationFrame(tick);
    document.querySelectorAll("a").forEach((el) => {
      el.addEventListener("pointerenter", () => cursor.classList.add("is-hot"));
      el.addEventListener("pointerleave", () => cursor.classList.remove("is-hot"));
    });
  }

  document.querySelectorAll(".reveal").forEach((el) => {
    const io = new IntersectionObserver(
      (entries) => {
        entries.forEach((entry) => {
          if (entry.isIntersecting) {
            entry.target.classList.add("in");
            io.unobserve(entry.target);
          }
        });
      },
      { threshold: 0.16 }
    );
    io.observe(el);
  });

  const boot = document.querySelector(".boot");
  if (!boot) return;
  const finish = () => boot.classList.add("is-out");
  if (reduced) {
    finish();
    return;
  }
  window.setTimeout(finish, 2600);
})();
