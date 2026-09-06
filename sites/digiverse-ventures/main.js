(() => {
  const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  const coarse = window.matchMedia("(pointer: coarse)").matches;
  const gate = document.querySelector(".gate");
  const boot = document.querySelector(".boot");
  const jack = document.querySelector("#jack");
  const muteBtn = document.querySelector("#mute");

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
    document.querySelectorAll("a, button").forEach((el) => {
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

  let audio = null;
  const startAudio = () => {
    const Ctx = window.AudioContext || window.webkitAudioContext;
    if (!Ctx) return;
    const ctx = new Ctx();
    const master = ctx.createGain();
    master.gain.value = 0.045;
    master.connect(ctx.destination);
    const make = (type, freq, detune) => {
      const o = ctx.createOscillator();
      o.type = type;
      o.frequency.value = freq;
      o.detune.value = detune;
      const f = ctx.createBiquadFilter();
      f.type = "lowpass";
      f.frequency.value = 420;
      o.connect(f);
      f.connect(master);
      o.start();
    };
    make("sawtooth", 38, 0);
    make("sawtooth", 38.4, 7);
    make("sine", 77, 0);
    make("triangle", 155, -12);
    audio = { ctx, master };
  };

  const glitchBurst = () => {
    document.body.classList.add("is-glitch", "shake");
    window.dispatchEvent(new Event("digiverse:glitch"));
    window.setTimeout(() => {
      document.body.classList.remove("is-glitch", "shake");
    }, 160);
  };

  const enterHouse = () => {
    document.body.classList.add("is-jacked");
    document.body.classList.remove("is-locked");
    if (gate) gate.classList.add("is-out");
    if (boot) {
      boot.classList.add("is-on");
      window.setTimeout(() => boot.classList.add("is-out"), 2100);
    }
    glitchBurst();
    window.setInterval(glitchBurst, 5200);
  };

  if (reduced) {
    document.body.classList.remove("is-locked");
    if (gate) gate.classList.add("is-out");
    if (boot) boot.classList.add("is-out");
    return;
  }

  if (!gate || !jack) {
    if (boot) {
      boot.classList.add("is-on");
      window.setTimeout(() => boot.classList.add("is-out"), 1800);
    }
    return;
  }

  document.body.classList.add("is-locked");
  jack.addEventListener("click", () => {
    startAudio();
    enterHouse();
  });

  if (muteBtn && !coarse) {
    muteBtn.hidden = false;
    muteBtn.addEventListener("click", () => {
      if (!audio) return;
      const now = audio.master.gain.value > 0.001;
      audio.master.gain.value = now ? 0 : 0.045;
      muteBtn.textContent = now ? "AUDIO OFF" : "AUDIO ON";
    });
  }
})();
