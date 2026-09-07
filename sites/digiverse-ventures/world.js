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
  const COUNT = mobile ? 160 : 320;
  const CAR_N = mobile ? 52 : 96;
  const RAIN = mobile ? 1200 : 3200;
  const LAMP_N = mobile ? 48 : 80;

  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, mobile ? 1.15 : 1.55));
  renderer.setClearColor(0x090014, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.18;
  renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x16001c, 0.0058);

  const camera = new THREE.PerspectiveCamera(64, 1, 0.15, 920);
  camera.position.set(0, 8.5, 52);

  scene.add(new THREE.AmbientLight(0xff4d8a, 0.22));
  scene.add(new THREE.HemisphereLight(0xff8ab0, 0x0a0618, 0.62));
  const sunLight = new THREE.PointLight(0xff7a3c, 120, 320);
  sunLight.position.set(-36, 32, -110);
  scene.add(sunLight);
  const neonFill = new THREE.PointLight(0xff2d9b, 36, 110);
  neonFill.position.set(6, 14, 8);
  scene.add(neonFill);
  const cyanFill = new THREE.PointLight(0x3df0ff, 30, 100);
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
      new THREE.SphereGeometry(300, 24, 16),
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
    c.width = 64;
    c.height = 256;
    const g = c.getContext("2d");
    g.fillStyle = "#070510";
    g.fillRect(0, 0, 64, 256);
    const pal = ["#ff2d9b", "#3df0ff", "#ffb14a", "#7cff5b", "#c77dff"];
    for (let y = 3; y < 252; y += 7) {
      for (let x = 3; x < 61; x += 6) {
        if (Math.random() > 0.24) {
          const lit = Math.random() > 0.18;
          g.globalAlpha = lit ? 0.5 + Math.random() * 0.5 : 0.14;
          g.fillStyle = lit ? pal[(x + y) % pal.length] : "#161022";
          g.fillRect(x, y, 4, 5);
        }
      }
    }
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

  const roadMat = new THREE.MeshStandardMaterial({
    map: roadTex,
    color: 0xffffff,
    metalness: 0.96,
    roughness: 0.12,
  });
  const roadNS = new THREE.Mesh(new THREE.PlaneGeometry(18, 720), roadMat);
  roadNS.rotation.x = -Math.PI / 2;
  roadNS.position.y = 0.03;
  scene.add(roadNS);
  const roadEW = new THREE.Mesh(new THREE.PlaneGeometry(720, 18), roadMat.clone());
  roadEW.rotation.x = -Math.PI / 2;
  roadEW.position.set(0, 0.04, -40);
  scene.add(roadEW);
  const roadEW2 = roadEW.clone();
  roadEW2.position.set(0, 0.04, 50);
  scene.add(roadEW2);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(720, 780),
    new THREE.MeshStandardMaterial({
      color: 0x090612,
      metalness: 0.88,
      roughness: 0.28,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const grid = new THREE.GridHelper(720, 120, 0xff2d9b, 0x3df0ff);
  grid.material.opacity = 0.16;
  grid.material.transparent = true;
  grid.position.y = 0.05;
  scene.add(grid);

  const bodyMat = new THREE.MeshStandardMaterial({
    map: winTex,
    color: 0xffffff,
    metalness: 0.38,
    roughness: 0.4,
    emissive: 0x1a0824,
    emissiveMap: winTex,
    emissiveIntensity: 0.95,
  });
  const bodies = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), bodyMat, COUNT);
  scene.add(bodies);

  const neonMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const neons = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), neonMat, COUNT);
  scene.add(neons);

  const stripMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const strips = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), stripMat, COUNT);
  scene.add(strips);

  const dummy = new THREE.Object3D();
  const tint = new THREE.Color();
  const neonPal = [0xff2d9b, 0x3df0ff, 0xff6a00, 0x7cff5b, 0xc77dff];
  const spots = [];
  for (let gz = -22; gz <= 22 && spots.length < COUNT; gz += 1) {
    for (let gx = -12; gx <= 12 && spots.length < COUNT; gx += 1) {
      const onNS = Math.abs(gx) <= 1;
      const onEW = gz === -6 || gz === 7 || gz % 8 === 0;
      if (onNS || onEW) continue;
      spots.push({
        x: gx * 7.4,
        z: gz * 8.2,
        h: 16 + ((spots.length * 19) % 68) + (Math.abs(gx) === 2 ? 12 : 0),
        w: 3.1 + (spots.length % 5) * 0.5,
        d: 3.6 + (spots.length % 4) * 0.55,
      });
    }
  }
  const BUILD = Math.min(COUNT, spots.length);
  bodies.count = BUILD;
  neons.count = BUILD;
  strips.count = BUILD;

  for (let i = 0; i < BUILD; i += 1) {
    const b = spots[i];
    const x = b.x;
    const z = b.z;
    const h = b.h;
    const w = b.w;
    const d = b.d;
    const side = x >= 0 ? 1 : -1;

    dummy.position.set(x, h / 2, z);
    dummy.scale.set(w, h, d);
    dummy.rotation.set(0, 0, 0);
    dummy.updateMatrix();
    bodies.setMatrixAt(i, dummy.matrix);

    dummy.position.set(x, h + 0.28, z);
    dummy.scale.set(w * 1.04, 0.16, d * 1.04);
    dummy.updateMatrix();
    neons.setMatrixAt(i, dummy.matrix);
    tint.setHex(neonPal[i % neonPal.length]);
    neons.setColorAt(i, tint);

    dummy.position.set(x + side * (w * 0.52), h * 0.55, z);
    dummy.scale.set(0.12, h * 0.92, 0.12);
    dummy.updateMatrix();
    strips.setMatrixAt(i, dummy.matrix);
    strips.setColorAt(i, tint);
  }
  bodies.instanceMatrix.needsUpdate = true;
  neons.instanceMatrix.needsUpdate = true;
  strips.instanceMatrix.needsUpdate = true;
  if (neons.instanceColor) neons.instanceColor.needsUpdate = true;
  if (strips.instanceColor) strips.instanceColor.needsUpdate = true;

  const landmarks = [
    { x: -11, z: -24, h: 92, w: 6, d: 6, hex: 0xff2d9b },
    { x: 12, z: -38, h: 78, w: 5.2, d: 5.2, hex: 0x3df0ff },
    { x: -13, z: 8, h: 70, w: 5.6, d: 5, hex: 0xff6a00 },
    { x: 11, z: -72, h: 86, w: 6.4, d: 5.8, hex: 0x7cff5b },
  ];
  landmarks.forEach((t) => {
    const geo = new THREE.BoxGeometry(t.w, t.h, t.d);
    const mesh = new THREE.Mesh(
      geo,
      new THREE.MeshStandardMaterial({
        map: winTex,
        metalness: 0.45,
        roughness: 0.32,
        emissive: 0x140818,
        emissiveMap: winTex,
        emissiveIntensity: 1.05,
      })
    );
    mesh.position.set(t.x, t.h / 2, t.z);
    scene.add(mesh);
    const edges = new THREE.LineSegments(
      new THREE.EdgesGeometry(geo),
      new THREE.LineBasicMaterial({ color: t.hex })
    );
    edges.position.copy(mesh.position);
    scene.add(edges);
  });

  const boards = [
    { title: "DIGIVERSE", color: "#ff2d9b", sub: "LIVE  //  ALWAYS ON", x: 0, y: 26, z: -6, ry: 0 },
    { title: "EDGE", color: "#3df0ff", sub: "SHARP SOCIAL  //  EV TOOLS", x: -15.5, y: 22, z: 18, ry: 0.55 },
    { title: "SYNDICATE", color: "#ffb14a", sub: "MODELS  //  LEDGER", x: 16, y: 20, z: 6, ry: -0.55 },
    { title: "LIVE", color: "#7cff5b", sub: "SECTOR 00  //  WET GRID", x: 0, y: 34, z: 24, ry: 0 },
    { title: "+EV", color: "#c77dff", sub: "FIND YOUR EDGE", x: 15, y: 30, z: -58, ry: -0.32 },
  ];
  boards.forEach((b) => {
    const mesh = new THREE.Mesh(
      new THREE.PlaneGeometry(26, 13),
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
    new THREE.TorusGeometry(26, 0.32, 10, 96),
    new THREE.MeshBasicMaterial({ color: 0x3df0ff })
  );
  ring.position.set(0, 52, -86);
  ring.rotation.x = Math.PI / 2.35;
  scene.add(ring);
  const ring2 = new THREE.Mesh(
    new THREE.TorusGeometry(34, 0.22, 10, 96),
    new THREE.MeshBasicMaterial({ color: 0xff2d9b })
  );
  ring2.position.copy(ring.position);
  ring2.rotation.x = ring.rotation.x;
  scene.add(ring2);

  const lampMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const lamps = new THREE.InstancedMesh(new THREE.BoxGeometry(1, 1, 1), lampMat, LAMP_N);
  scene.add(lamps);
  for (let i = 0; i < LAMP_N; i += 1) {
    const ns = i < LAMP_N / 2;
    if (ns) {
      const side = i % 2 === 0 ? -1 : 1;
      dummy.position.set(side * 7.6, 3.4, 120 - Math.floor(i / 2) * 12);
    } else {
      const j = i - Math.floor(LAMP_N / 2);
      const side = j % 2 === 0 ? -1 : 1;
      dummy.position.set(-140 + Math.floor(j / 2) * 14, 3.4, side * 7.6 - 40);
    }
    dummy.scale.set(0.14, 6.8, 0.14);
    dummy.updateMatrix();
    lamps.setMatrixAt(i, dummy.matrix);
    tint.setHex(i % 2 ? 0x3df0ff : 0xff2d9b);
    lamps.setColorAt(i, tint);
  }
  lamps.instanceMatrix.needsUpdate = true;
  if (lamps.instanceColor) lamps.instanceColor.needsUpdate = true;

  const cars = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff }),
    CAR_N
  );
  scene.add(cars);
  const trails = new THREE.InstancedMesh(
    new THREE.BoxGeometry(1, 1, 1),
    new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.55 }),
    CAR_N
  );
  scene.add(trails);
  const carState = [];
  for (let i = 0; i < CAR_N; i += 1) {
    const flying = i % 3 !== 0;
    const dir = i % 2 === 0 ? -1 : 1;
    carState.push({
      x: flying
        ? i % 2 === 0
          ? -3.2 + (i % 5) * 0.15
          : 3.2
        : i % 4 < 2
          ? i % 2 === 0
            ? -2.4
            : 2.4
          : -80 + (i % 17) * 8,
      y: flying ? 9 + (i % 11) * 2.8 : 0.55,
      z: i % 4 < 2 ? 90 - Math.random() * 220 : i % 2 === 0 ? -36 : -44,
      v: (14 + (i % 13) * 2.1) * dir,
      axis: i % 4 < 2 ? "z" : "x",
      hex: neonPal[i % neonPal.length],
      flying,
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
    rainPos[i * 3] = (Math.random() - 0.5) * 160;
    rainPos[i * 3 + 1] = Math.random() * 88;
    rainPos[i * 3 + 2] = (Math.random() - 0.5) * 280;
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
        opacity: 0.78,
        depthWrite: false,
      })
    )
  );

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), mobile ? 0.62 : 0.92, 0.72, 0.16);
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

  const LEG = 110;
  const pathAt = (t) => {
    const s = (t * 16) % (LEG * 4);
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
    yawSmooth += turn * Math.min(1, dt * 2.2);
    const yaw = yawSmooth + mouse.x * 0.95;
    camera.position.x += (path.x - camera.position.x) * 0.08;
    camera.position.y += (7.4 + Math.sin(t * 0.42) * 0.9 + mouse.y * 3.4 - camera.position.y) * 0.07;
    camera.position.z += (path.z - camera.position.z) * 0.08;
    camera.lookAt(
      camera.position.x + Math.sin(yaw) * 42,
      10 + mouse.y * 7,
      camera.position.z - Math.cos(yaw) * 42
    );

    ring.rotation.z = t * 0.22;
    ring2.rotation.z = -t * 0.14;
    neonFill.intensity = 28 + Math.sin(t * 3.2) * 8;
    cyanFill.intensity = 24 + Math.cos(t * 2.4) * 7;

    for (let i = 0; i < CAR_N; i += 1) {
      const c = carState[i];
      if (c.axis === "x") {
        c.x += c.v * dt;
        if (c.x < -150) c.x = 150;
        if (c.x > 150) c.x = -150;
      } else {
        c.z += c.v * dt;
        if (c.z < -160) c.z = 120;
        if (c.z > 122) c.z = -158;
      }
      dummy.position.set(c.x, c.y, c.z);
      dummy.scale.set(c.flying ? 0.55 : 0.85, c.flying ? 0.2 : 0.32, c.flying ? 1.6 : 2.1);
      dummy.rotation.set(0, c.axis === "x" ? Math.PI / 2 : 0, 0);
      dummy.updateMatrix();
      cars.setMatrixAt(i, dummy.matrix);
      tint.setHex(c.hex);
      cars.setColorAt(i, tint);

      dummy.position.set(
        c.x - (c.axis === "x" ? Math.sign(c.v) * 1.6 : 0),
        c.y,
        c.z - (c.axis === "z" ? Math.sign(c.v) * 1.6 : 0)
      );
      dummy.scale.set(0.12, 0.08, 3.4);
      dummy.updateMatrix();
      trails.setMatrixAt(i, dummy.matrix);
      trails.setColorAt(i, tint);
    }
    cars.instanceMatrix.needsUpdate = true;
    trails.instanceMatrix.needsUpdate = true;
    if (cars.instanceColor) cars.instanceColor.needsUpdate = true;
    if (trails.instanceColor) trails.instanceColor.needsUpdate = true;

    const pos = rainGeo.attributes.position.array;
    for (let i = 0; i < RAIN; i += 1) {
      pos[i * 3 + 1] -= rainSpd[i] * dt;
      if (pos[i * 3 + 1] < 0) {
        pos[i * 3 + 1] = 86;
        pos[i * 3] = (Math.random() - 0.5) * 160;
      }
    }
    rainGeo.attributes.position.needsUpdate = true;

    composer.render();
  };
  loop();
}
