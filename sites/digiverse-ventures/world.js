import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = document.getElementById("stage");
if (!canvas || reduced) {
  document.documentElement.classList.add("no-verse");
} else {
  const mobile = window.innerWidth < 720 || /Mobi|Android/i.test(navigator.userAgent);
  const COUNT = mobile ? 400 : 820;
  const GROUND_N = mobile ? 28 : 48;
  const FLY_N = mobile ? 56 : 110;
  const RAIN = mobile ? 900 : 2200;
  const LAMP_N = mobile ? 56 : 96;
  const SIGN_N = mobile ? 36 : 72;
  const LEG = 100;
  const STREET = 5.4;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.15 : 1.5));
  renderer.setClearColor(0x090014, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.14;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x140018, 0.0072);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.15, 780);
  camera.position.set(0, 9.5, 96);

  scene.add(new THREE.AmbientLight(0xff4d8a, 0.24));
  scene.add(new THREE.HemisphereLight(0xff8ab0, 0x0a0618, 0.58));
  const sunLight = new THREE.PointLight(0xff7a3c, 110, 300);
  sunLight.position.set(-36, 32, -110);
  scene.add(sunLight);
  const neonFill = new THREE.PointLight(0xff2d9b, 34, 90);
  neonFill.position.set(6, 14, 8);
  scene.add(neonFill);
  const cyanFill = new THREE.PointLight(0x3df0ff, 28, 80);
  cyanFill.position.set(-8, 12, 4);
  scene.add(cyanFill);

  const skyTex = (() => {
    const c = document.createElement("canvas");
    c.width = 8;
    c.height = 512;
    const g = c.getContext("2d");
    const grd = g.createLinearGradient(0, 0, 0, 512);
    grd.addColorStop(0, "#050014");
    grd.addColorStop(0.38, "#1c0636");
    grd.addColorStop(0.68, "#c43a6e");
    grd.addColorStop(0.86, "#ff6a32");
    grd.addColorStop(1, "#ffd08a");
    g.fillStyle = grd;
    g.fillRect(0, 0, 8, 512);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();
  scene.add(
    new THREE.Mesh(
      new THREE.SphereGeometry(420, 24, 16),
      new THREE.MeshBasicMaterial({ map: skyTex, side: THREE.BackSide, fog: false })
    )
  );

  const sun = new THREE.Mesh(
    new THREE.SphereGeometry(34, 32, 32),
    new THREE.MeshBasicMaterial({ color: 0xff8a42, fog: false })
  );
  sun.position.set(-42, 22, -140);
  scene.add(sun);
  const sunHalo = new THREE.Mesh(
    new THREE.SphereGeometry(52, 24, 24),
    new THREE.MeshBasicMaterial({
      color: 0xff5a2a,
      transparent: true,
      opacity: 0.18,
      fog: false,
    })
  );
  sunHalo.position.copy(sun.position);
  scene.add(sunHalo);

  const winTex = (() => {
    const c = document.createElement("canvas");
    c.width = 128;
    c.height = 512;
    const g = c.getContext("2d");
    g.fillStyle = "#0a0714";
    g.fillRect(0, 0, 128, 512);
    g.fillStyle = "#16101f";
    g.fillRect(0, 0, 128, 18);
    g.fillRect(0, 494, 128, 18);
    const pal = ["#ff2d9b", "#3df0ff", "#ffb14a", "#7cff5b", "#c77dff", "#ff6a32"];
    for (let y = 22; y < 488; y += 9) {
      g.fillStyle = "#05030a";
      g.fillRect(0, y + 6, 128, 1);
      for (let x = 5; x < 122; x += 9) {
        if (Math.random() < 0.12) continue;
        const lit = Math.random() > 0.2;
        g.globalAlpha = lit ? 0.55 + Math.random() * 0.45 : 0.16;
        g.fillStyle = lit ? pal[(x + y * 3) % pal.length] : "#1c1528";
        g.fillRect(x, y, 6, 6);
        if (lit && Math.random() > 0.82) {
          g.globalAlpha = 0.9;
          g.fillRect(x + 1, y + 1, 2, 2);
        }
      }
    }
    g.globalAlpha = 0.85;
    g.fillStyle = pal[Math.floor(Math.random() * pal.length)];
    g.fillRect(2, 20, 3, 470);
    g.fillRect(123, 20, 3, 470);
    g.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.colorSpace = THREE.SRGBColorSpace;
    t.anisotropy = 4;
    return t;
  })();

  const roadTex = (() => {
    const c = document.createElement("canvas");
    c.width = 256;
    c.height = 512;
    const g = c.getContext("2d");
    g.fillStyle = "#080610";
    g.fillRect(0, 0, 256, 512);
    for (let i = 0; i < 40; i += 1) {
      g.globalAlpha = 0.08 + Math.random() * 0.12;
      g.fillStyle = i % 2 ? "#ff2d9b" : "#3df0ff";
      g.fillRect(20 + Math.random() * 216, Math.random() * 512, 2 + Math.random() * 6, 40 + Math.random() * 80);
    }
    g.globalAlpha = 0.85;
    g.fillStyle = "#ff2d9b";
    g.fillRect(124, 0, 3, 512);
    g.fillStyle = "#3df0ff";
    g.fillRect(129, 0, 3, 512);
    g.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c);
    t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(1, 8);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  const boardTex = (title, accent, sub) => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = "#05010a";
    g.fillRect(0, 0, 512, 256);
    g.fillStyle = accent;
    g.globalAlpha = 0.22;
    g.fillRect(0, 0, 512, 256);
    g.globalAlpha = 1;
    g.strokeStyle = accent;
    g.lineWidth = 10;
    g.strokeRect(12, 12, 488, 232);
    g.fillStyle = "#f4ffff";
    g.font = "700 68px Orbitron, sans-serif";
    g.fillText(title, 32, 118);
    g.font = "600 22px Rajdhani, sans-serif";
    g.fillStyle = accent;
    g.fillText(sub || "DIGIVERSE  //  LIVE SECTOR", 32, 168);
    for (let y = 18; y < 238; y += 5) {
      g.globalAlpha = 0.07;
      g.fillStyle = "#fff";
      g.fillRect(14, y, 484, 1);
    }
    g.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  };

  const signTexs = ["EDGE", "LIVE", "88", "DV", "PRO"].map((label, i) => {
    const pal = ["#ff2d9b", "#3df0ff", "#ffb14a", "#7cff5b", "#c77dff"];
    return boardTex(label, pal[i], "SECTOR 00");
  });

  const isStreet = (x, z) =>
    Math.abs(x) < STREET ||
    Math.abs(x - LEG) < STREET ||
    Math.abs(z - (70 - LEG)) < STREET ||
    Math.abs(z - 70) < STREET;

  const isPlaza = (x, z) => z > 82 && Math.abs(x) < 18;

  const roadMat = new THREE.MeshStandardMaterial({
    map: roadTex,
    color: 0xffffff,
    metalness: 0.96,
    roughness: 0.12,
  });
  const roadNS = new THREE.Mesh(new THREE.PlaneGeometry(12, 420), roadMat);
  roadNS.rotation.x = -Math.PI / 2;
  roadNS.position.set(0, 0.03, 10);
  scene.add(roadNS);
  const roadNS2 = roadNS.clone();
  roadNS2.position.set(LEG, 0.03, 10);
  scene.add(roadNS2);
  const roadEW = new THREE.Mesh(new THREE.PlaneGeometry(220, 12), roadMat.clone());
  roadEW.rotation.x = -Math.PI / 2;
  roadEW.position.set(LEG / 2, 0.04, 70 - LEG);
  scene.add(roadEW);
  const roadEW2 = roadEW.clone();
  roadEW2.position.set(LEG / 2, 0.04, 70);
  scene.add(roadEW2);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(520, 520),
    new THREE.MeshStandardMaterial({
      color: 0x090612,
      metalness: 0.88,
      roughness: 0.28,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  ground.position.set(LEG / 2, 0, 10);
  scene.add(ground);

  const grid = new THREE.GridHelper(520, 104, 0xff2d9b, 0x3df0ff);
  grid.material.opacity = 0.12;
  grid.material.transparent = true;
  grid.position.set(LEG / 2, 0.05, 10);
  scene.add(grid);

  const bodyMat = new THREE.MeshStandardMaterial({
    map: winTex,
    color: 0xffffff,
    metalness: 0.32,
    roughness: 0.38,
    emissive: 0x1a0824,
    emissiveMap: winTex,
    emissiveIntensity: 1.05,
  });
  const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bodyMat, COUNT);
  scene.add(bodies);
  const neons = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    COUNT
  );
  scene.add(neons);
  const ledges = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    COUNT
  );
  scene.add(ledges);
  const ants = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0x9aa4b0 }),
    COUNT
  );
  scene.add(ants);
  const pods = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    bodyMat,
    COUNT
  );
  scene.add(pods);

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const neonPal = [0xff2d9b, 0x3df0ff, 0xff6a00, 0x7cff5b, 0xc77dff];
  const spots = [];
  const pushSpot = (x, z, extraH = 0) => {
    if (spots.length >= COUNT) return;
    if (isStreet(x, z) || isPlaza(x, z)) return;
    const h = 20 + extraH + ((spots.length * 23) % 70);
    spots.push({
      x,
      z,
      h,
      w: 4.4 + (spots.length % 4) * 0.28,
      d: 4.6 + (spots.length % 3) * 0.32,
      podium: spots.length % 3 === 0,
    });
  };
  for (let z = 80; z > 70 - LEG - 10; z -= 5) {
    pushSpot(-6.7, z, 22);
    pushSpot(6.7, z, 22);
    pushSpot(LEG - 6.7, z, 18);
    pushSpot(LEG + 6.7, z, 18);
  }
  for (let x = 8; x < LEG - 8; x += 5) {
    pushSpot(x, 70 + 6.7, 16);
    pushSpot(x, 70 - 6.7, 16);
    pushSpot(x, 70 - LEG + 6.7, 16);
    pushSpot(x, 70 - LEG - 6.7, 16);
  }
  for (let z = 86; z >= -150 && spots.length < COUNT; z -= 5.1) {
    for (let x = -70; x <= 180 && spots.length < COUNT; x += 4.8) {
      pushSpot(x, z, Math.abs(x) < 14 || Math.abs(x - LEG) < 14 ? 14 : 0);
    }
  }
  const BUILD = Math.min(COUNT, spots.length);
  bodies.count = BUILD;
  neons.count = BUILD;
  ledges.count = BUILD;
  ants.count = BUILD;
  pods.count = BUILD;

  for (let i = 0; i < BUILD; i += 1) {
    const b = spots[i];
    dummy.position.set(b.x, b.h / 2, b.z);
    dummy.scale.set(b.w, b.h, b.d);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix);
    tint.setHex(0xffffff);
    if (bodies.setColorAt) bodies.setColorAt(i, tint.setHSL(0.85 + (i % 7) * 0.02, 0.15, 0.92));

    dummy.position.set(b.x, b.h + 0.22, b.z);
    dummy.scale.set(b.w * 1.06, 0.2, b.d * 1.06);
    dummy.updateMatrix();
    neons.setMatrixAt(i, dummy.matrix);
    tint.setHex(neonPal[i % neonPal.length]);
    neons.setColorAt(i, tint);

    dummy.position.set(b.x, b.h * 0.42, b.z);
    dummy.scale.set(b.w * 1.12, 0.28, b.d * 1.12);
    dummy.updateMatrix();
    ledges.setMatrixAt(i, dummy.matrix);
    ledges.setColorAt(i, tint);

    dummy.position.set(b.x + (i % 2 ? 0.6 : -0.6), b.h + 2.2, b.z);
    dummy.scale.set(0.12, 4.2 + (i % 5), 0.12);
    dummy.updateMatrix();
    ants.setMatrixAt(i, dummy.matrix);

    if (b.podium) {
      dummy.position.set(b.x, 3.2, b.z);
      dummy.scale.set(b.w * 1.35, 6.4, b.d * 1.35);
    } else {
      dummy.position.set(b.x, 0.4, b.z);
      dummy.scale.set(0.01, 0.01, 0.01);
    }
    dummy.updateMatrix();
    pods.setMatrixAt(i, dummy.matrix);
  }
  bodies.instanceMatrix.needsUpdate = true;
  neons.instanceMatrix.needsUpdate = true;
  ledges.instanceMatrix.needsUpdate = true;
  ants.instanceMatrix.needsUpdate = true;
  pods.instanceMatrix.needsUpdate = true;
  if (neons.instanceColor) neons.instanceColor.needsUpdate = true;
  if (ledges.instanceColor) ledges.instanceColor.needsUpdate = true;

  const signMesh = [];
  for (let i = 0; i < SIGN_N; i += 1) {
    const b = spots[(i * 7) % BUILD];
    if (!b) continue;
    const side = b.x < LEG / 2 ? 1 : -1;
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(7.2, 3.4),
      new THREE.MeshBasicMaterial({
        map: signTexs[i % signTexs.length],
        side: THREE.DoubleSide,
        transparent: true,
        opacity: 0.95,
      })
    );
    mesh.position.set(b.x + side * (b.w * 0.52 + 0.05), 10 + (i % 9) * 2.2, b.z);
    mesh.rotation.y = side > 0 ? Math.PI / 2 : -Math.PI / 2;
    scene.add(mesh);
    signMesh.push(mesh);
  }

  const boards = [
    { title: "DIGIVERSE", color: "#ff2d9b", sub: "LIVE  //  ALWAYS ON", x: 0, y: 28, z: 62, ry: 0 },
    { title: "EDGE", color: "#3df0ff", sub: "SOCIAL  //  TOOLS", x: -11, y: 22, z: 18, ry: 0.55 },
    { title: "SYNDICATE", color: "#ffb14a", sub: "MODELS  //  LEDGER", x: 12, y: 20, z: 8, ry: -0.55 },
    { title: "LIVE", color: "#7cff5b", sub: "SECTOR 00  //  WET GRID", x: LEG - 12, y: 26, z: 8, ry: -0.4 },
    { title: "VERSE", color: "#c77dff", sub: "NO ANALOG SKY", x: 18, y: 24, z: 70 - LEG + 8, ry: 0.2 },
  ];
  boards.forEach((b) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(22, 11),
      new THREE.MeshBasicMaterial({
        map: boardTex(b.title, b.color, b.sub),
        transparent: true,
        opacity: 0.94,
        side: THREE.DoubleSide,
      })
    );
    mesh.position.set(b.x, b.y, b.z);
    mesh.rotation.y = b.ry;
    scene.add(mesh);
  });

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(22, 0.28, 10, 80),
    new THREE.MeshBasicMaterial({ color: 0x3df0ff })
  );
  ring.position.set(LEG / 2, 62, 20);
  ring.rotation.x = Math.PI / 2.35;
  scene.add(ring);
  const ring2 = new THREE.Mesh(
    new THREE.TorusGeometry(30, 0.2, 10, 80),
    new THREE.MeshBasicMaterial({ color: 0xff2d9b })
  );
  ring2.position.copy(ring.position);
  ring2.rotation.x = ring.rotation.x;
  scene.add(ring2);

  const lamps = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    LAMP_N
  );
  scene.add(lamps);
  for (let i = 0; i < LAMP_N; i += 1) {
    const leg = i % 4;
    const k = Math.floor(i / 4);
    if (leg === 0) dummy.position.set(-4.6, 3.2, 88 - k * 9);
    if (leg === 1) dummy.position.set(4.6, 3.2, 88 - k * 9);
    if (leg === 2) dummy.position.set(LEG - 4.6, 3.2, 88 - k * 9);
    if (leg === 3) dummy.position.set(4.6 + k * 9, 3.2, 70 - LEG + (k % 2 ? 4.6 : -4.6));
    dummy.scale.set(0.12, 6.4, 0.12);
    dummy.updateMatrix();
    lamps.setMatrixAt(i, dummy.matrix);
    tint.setHex(i % 2 ? 0x3df0ff : 0xff2d9b);
    lamps.setColorAt(i, tint);
  }
  lamps.instanceMatrix.needsUpdate = true;
  if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;

  const groundCars = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    GROUND_N
  );
  scene.add(groundCars);
  const gState = [];
  for (let i = 0; i < GROUND_N; i += 1) {
    const ns = i % 2 === 0;
    gState.push({
      x: ns ? (i % 4 < 2 ? -2.2 : 2.2) : Math.random() * LEG,
      z: ns ? 80 - Math.random() * 160 : i % 4 < 2 ? 70 : 70 - LEG,
      v: 12 + (i % 9) * 1.6,
      dir: i % 2 === 0 ? -1 : 1,
      ns,
      hex: neonPal[i % neonPal.length],
    });
  }

  const flyCars = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    FLY_N
  );
  scene.add(flyCars);
  const flyGlow = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    FLY_N
  );
  scene.add(flyGlow);
  const flyTrails = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.7 }),
    FLY_N
  );
  scene.add(flyTrails);
  const fState = [];
  for (let i = 0; i < FLY_N; i += 1) {
    const ns = i % 3 !== 1;
    fState.push({
      x: ns ? (i % 2 ? -3.1 : 3.1) : Math.random() * LEG,
      y: 9.5 + (i % 7) * 2.4,
      z: ns ? 55 - Math.random() * 90 : i % 2 ? 70 : 70 - LEG,
      v: 26 + (i % 11) * 2.8,
      dir: i % 2 === 0 ? -1 : 1,
      ns,
      hex: neonPal[i % neonPal.length],
    });
  }

  const rainGeo = new THREE.BufferGeometry();
  const rainPos = new Float32Array(RAIN * 3);
  const rainCol = new Float32Array(RAIN * 3);
  const rainSpd = new Float32Array(RAIN);
  const gCol = new THREE.Color(0x7cff5b);
  const mCol = new THREE.Color(0xff2d9b);
  const cCol = new THREE.Color(0x3df0ff);
  for (let i = 0; i < RAIN; i += 1) {
    rainPos[i * 3] = (Math.random() - 0.2) * 180;
    rainPos[i * 3 + 1] = Math.random() * 90;
    rainPos[i * 3 + 2] = (Math.random() - 0.4) * 240;
    rainSpd[i] = 22 + Math.random() * 42;
    const pick = i % 5 === 0 ? mCol : i % 3 === 0 ? cCol : gCol;
    rainCol[i * 3] = pick.r;
    rainCol[i * 3 + 1] = pick.g;
    rainCol[i * 3 + 2] = pick.b;
  }
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
  rainGeo.setAttribute("color", new THREE.BufferAttribute(rainCol, 3));
  scene.add(
    new THREE.Points(
      rainGeo,
      new THREE.PointsMaterial({
        size: 0.16,
        vertexColors: true,
        transparent: true,
        opacity: 0.72,
        depthWrite: false,
      })
    )
  );

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), mobile ? 0.58 : 0.82, 0.68, 0.18);
  composer.addPass(bloom);

  const mouse = { x: 0, y: 0 };
  window.addEventListener(
    "pointermove",
    (e) => {
      mouse.x = (e.clientX / window.innerWidth) * 2 - 1;
      mouse.y = -(e.clientY / window.innerHeight) * 2 + 1;
    },
    { passive: true }
  );

  const START = 5.2;
  const pathAt = (t) => {
    if (t < START) {
      const u = t / START;
      return { x: 0, z: 96 - u * 26, yaw: 0 };
    }
    const s = ((t - START) * 15) % (LEG * 4);
    if (s < LEG) return { x: 0, z: 70 - s, yaw: 0 };
    if (s < LEG * 2) return { x: s - LEG, z: 70 - LEG, yaw: Math.PI / 2 };
    if (s < LEG * 3) return { x: LEG, z: 70 - LEG + (s - LEG * 2), yaw: Math.PI };
    return { x: LEG - (s - LEG * 3), z: 70, yaw: -Math.PI / 2 };
  };
  let yawSmooth = 0;

  const hudClock = document.getElementById("hud-clock");
  const stampClock = () => {
    if (hudClock) hudClock.textContent = `${new Date().toISOString().slice(11, 19)}Z`;
  };
  stampClock();
  window.setInterval(stampClock, 1000);

  const fit = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
    renderer.setSize(w, h, false);
    composer.setSize(w, h);
    bloom.resolution.set(w, h);
  };
  fit();
  window.addEventListener("resize", fit);

  let live = true;
  document.addEventListener("visibilitychange", () => {
    live = document.visibilityState === "visible";
  });

  const clock = new THREE.Clock();
  const loop = () => {
    requestAnimationFrame(loop);
    if (!live) return;
    const dt = Math.min(clock.getDelta(), 0.05);
    const t = clock.elapsedTime;

    const path = pathAt(t);
    const turn = Math.atan2(Math.sin(path.yaw - yawSmooth), Math.cos(path.yaw - yawSmooth));
    yawSmooth += turn * Math.min(1, dt * 2.05);
    const yaw = yawSmooth + mouse.x * 0.9;
    camera.position.x += (path.x - camera.position.x) * 0.08;
    camera.position.y += (8.2 + Math.sin(t * 0.4) * 0.7 + mouse.y * 2.8 - camera.position.y) * 0.07;
    camera.position.z += (path.z - camera.position.z) * 0.08;
    camera.lookAt(
      camera.position.x + Math.sin(yaw) * 36,
      11 + mouse.y * 6,
      camera.position.z - Math.cos(yaw) * 36
    );

    ring.rotation.z = t * 0.22;
    ring2.rotation.z = -t * 0.14;
    neonFill.intensity = 26 + Math.sin(t * 3.2) * 7;
    cyanFill.intensity = 22 + Math.cos(t * 2.4) * 6;
    neonFill.position.set(camera.position.x + 6, 14, camera.position.z - 8);
    cyanFill.position.set(camera.position.x - 7, 12, camera.position.z - 4);

    for (let i = 0; i < GROUND_N; i += 1) {
      const c = gState[i];
      if (c.ns) {
        c.z += c.v * c.dir * dt;
        if (c.z < 70 - LEG - 20) c.z = 88;
        if (c.z > 90) c.z = 70 - LEG - 16;
      } else {
        c.x += c.v * c.dir * dt;
        if (c.x < -8) c.x = LEG + 8;
        if (c.x > LEG + 8) c.x = -8;
      }
      dummy.position.set(c.x, 0.48, c.z);
      dummy.scale.set(0.9, 0.34, 2.2);
      dummy.rotation.set(0, c.ns ? 0 : Math.PI / 2, 0);
      dummy.updateMatrix();
      groundCars.setMatrixAt(i, dummy.matrix);
      tint.setHex(c.hex);
      groundCars.setColorAt(i, tint);
    }
    groundCars.instanceMatrix.needsUpdate = true;
    if (groundCars.instanceColor) groundCars.instanceColor.needsUpdate = true;

    for (let i = 0; i < FLY_N; i += 1) {
      const c = fState[i];
      if (c.ns) {
        c.z += c.v * c.dir * dt;
        if (c.z < 70 - LEG - 30) c.z = 92;
        if (c.z > 94) c.z = 70 - LEG - 24;
      } else {
        c.x += c.v * c.dir * dt;
        if (c.x < -16) c.x = LEG + 16;
        if (c.x > LEG + 16) c.x = -16;
      }
      dummy.position.set(c.x, c.y, c.z);
      dummy.scale.set(2.05, 0.42, 4.4);
      dummy.rotation.set(0, c.ns ? 0 : Math.PI / 2, 0);
      dummy.updateMatrix();
      flyCars.setMatrixAt(i, dummy.matrix);
      tint.setHex(c.hex);
      flyCars.setColorAt(i, tint);

      dummy.position.set(
        c.x + (c.ns ? 0 : c.dir * 2.2),
        c.y,
        c.z + (c.ns ? c.dir * 2.2 : 0)
      );
      dummy.scale.set(0.38, 0.28, 0.38);
      dummy.updateMatrix();
      flyGlow.setMatrixAt(i, dummy.matrix);
      tint.setHex(0xffffff);
      flyGlow.setColorAt(i, tint);

      dummy.position.set(
        c.x - (c.ns ? 0 : c.dir * 3.6),
        c.y,
        c.z - (c.ns ? c.dir * 3.6 : 0)
      );
      dummy.scale.set(0.22, 0.1, 8.5);
      dummy.updateMatrix();
      flyTrails.setMatrixAt(i, dummy.matrix);
      tint.setHex(c.hex);
      flyTrails.setColorAt(i, tint);
    }
    flyCars.instanceMatrix.needsUpdate = true;
    flyGlow.instanceMatrix.needsUpdate = true;
    flyTrails.instanceMatrix.needsUpdate = true;
    if (flyCars.instanceColor) flyCars.instanceColor.needsUpdate = true;
    if (flyGlow.instanceColor) flyGlow.instanceColor.needsUpdate = true;
    if (flyTrails.instanceColor) flyTrails.instanceColor.needsUpdate = true;

    const pos = rainGeo.attributes.position.array;
    for (let i = 0; i < RAIN; i += 1) {
      pos[i * 3 + 1] -= rainSpd[i] * dt;
      if (pos[i * 3 + 1] < 0) {
        pos[i * 3 + 1] = 88;
        pos[i * 3] = camera.position.x + (Math.random() - 0.5) * 70;
        pos[i * 3 + 2] = camera.position.z + (Math.random() - 0.5) * 70;
      }
    }
    rainGeo.attributes.position.needsUpdate = true;

    composer.render();
  };
  loop();
}
