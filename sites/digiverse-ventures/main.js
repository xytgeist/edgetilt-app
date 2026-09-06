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
    const tickCursor = () => {
      x += (tx - x) * 0.22;
      y += (ty - y) * 0.22;
      cursor.style.transform = `translate(${x}px, ${y}px) translate(-50%, -50%)`;
      requestAnimationFrame(tickCursor);
    };
    requestAnimationFrame(tickCursor);
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
      { threshold: 0.18 }
    );
    io.observe(el);
  });

  if (reduced) return;

  const canvas = document.getElementById("void");
  if (!canvas) return;
  const gl = canvas.getContext("webgl", { antialias: false, alpha: false });
  if (!gl) {
    canvas.remove();
    return;
  }

  const vs = `
    attribute vec2 a;
    void main() {
      gl_Position = vec4(a, 0.0, 1.0);
    }
  `;
  const fs = `
    precision highp float;
    uniform vec2 uRes;
    uniform vec2 uMouse;
    uniform float uTime;
    float hash(vec2 p) {
      return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
    }
    float noise(vec2 p) {
      vec2 i = floor(p);
      vec2 f = fract(p);
      float a = hash(i);
      float b = hash(i + vec2(1.0, 0.0));
      float c = hash(i + vec2(0.0, 1.0));
      float d = hash(i + vec2(1.0, 1.0));
      vec2 u = f * f * (3.0 - 2.0 * f);
      return mix(a, b, u.x) + (c - a) * u.y * (1.0 - u.x) + (d - b) * u.x * u.y;
    }
    float fbm(vec2 p) {
      float v = 0.0;
      float a = 0.5;
      for (int i = 0; i < 5; i++) {
        v += a * noise(p);
        p *= 2.07;
        a *= 0.55;
      }
      return v;
    }
    void main() {
      vec2 uv = gl_FragCoord.xy / uRes;
      vec2 p = (gl_FragCoord.xy - 0.5 * uRes) / min(uRes.y, uRes.x);
      vec2 m = (uMouse - 0.5) * 0.55;
      p += m * 0.12;
      float t = uTime * 0.035;
      float n = fbm(p * 2.4 + vec2(t, -t * 0.7));
      float n2 = fbm(p * 3.6 - vec2(t * 0.6, t * 0.4));
      vec3 voidCol = vec3(0.027, 0.024, 0.04);
      vec3 red = vec3(0.99, 0.15, 0.18);
      vec3 cyan = vec3(0.02, 0.81, 0.99);
      vec3 gold = vec3(0.91, 0.76, 0.48);
      vec3 col = voidCol;
      col += red * pow(n, 3.2) * 0.85;
      col += cyan * pow(n2, 5.0) * 0.28;
      col += gold * pow(max(n * n2, 0.0), 4.0) * 0.22;
      float stars = step(0.996, hash(gl_FragCoord.xy * 0.37 + floor(uTime * 2.0)));
      col += vec3(stars);
      float vig = smoothstep(1.25, 0.15, length(p));
      col *= vig;
      gl_FragColor = vec4(col, 1.0);
    }
  `;

  const compile = (type, src) => {
    const s = gl.createShader(type);
    gl.shaderSource(s, src);
    gl.compileShader(s);
    if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) {
      console.warn(gl.getShaderInfoLog(s));
      return null;
    }
    return s;
  };
  const prog = gl.createProgram();
  const vsh = compile(gl.VERTEX_SHADER, vs);
  const fsh = compile(gl.FRAGMENT_SHADER, fs);
  if (!vsh || !fsh) return;
  gl.attachShader(prog, vsh);
  gl.attachShader(prog, fsh);
  gl.linkProgram(prog);
  gl.useProgram(prog);

  const buf = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buf);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  const loc = gl.getAttribLocation(prog, "a");
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);

  const uRes = gl.getUniformLocation(prog, "uRes");
  const uMouse = gl.getUniformLocation(prog, "uMouse");
  const uTime = gl.getUniformLocation(prog, "uTime");
  const mouse = { x: 0.5, y: 0.5 };
  window.addEventListener(
    "pointermove",
    (e) => {
      mouse.x = e.clientX / window.innerWidth;
      mouse.y = 1 - e.clientY / window.innerHeight;
    },
    { passive: true }
  );

  const fit = () => {
    const dpr = Math.min(window.devicePixelRatio || 1, 1.6);
    canvas.width = Math.floor(window.innerWidth * dpr);
    canvas.height = Math.floor(window.innerHeight * dpr);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.uniform2f(uRes, canvas.width, canvas.height);
  };
  fit();
  window.addEventListener("resize", fit);

  let start = performance.now();
  let live = true;
  document.addEventListener("visibilitychange", () => {
    live = document.visibilityState === "visible";
    if (live) start = performance.now() - 1000;
  });
  const draw = (now) => {
    if (live) {
      gl.uniform1f(uTime, (now - start) / 1000);
      gl.uniform2f(uMouse, mouse.x, mouse.y);
      gl.drawArrays(gl.TRIANGLES, 0, 3);
    }
    requestAnimationFrame(draw);
  };
  requestAnimationFrame(draw);
})();
