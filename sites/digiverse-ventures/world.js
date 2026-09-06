import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = document.getElementById("stage");
if (!canvas || reduced) {
  /* canyon off */
} else {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.6));
  renderer.setClearColor(0x010308, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 0.78;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x050a10, 0.018);

  const camera = new THREE.PerspectiveCamera(46, 1, 0.1, 320);
  camera.position.set(0, 34, 11);

  scene.add(new THREE.AmbientLight(0x142028, 0.55));
  const fill = new THREE.PointLight(0x8eb8c4, 12, 55);
  fill.position.set(0, 10, 4);
  scene.add(fill);
  const moonLight = new THREE.PointLight(0xcdd6dc, 36, 110);
  moonLight.position.set(0, 52, -20);
  scene.add(moonLight);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(24, 180),
    new THREE.MeshStandardMaterial({
      color: 0x070c10,
      metalness: 0.62,
      roughness: 0.38,
    })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const winTex = (() => {
    const c = document.createElement("canvas");
    c.width = 96;
    c.height = 384;
    const g = c.getContext("2d");
    g.fillStyle = "#081016";
    g.fillRect(0, 0, 96, 384);
    g.strokeStyle = "rgba(18, 32, 40, 0.9)";
    g.lineWidth = 2;
    for (let y = 0; y < 384; y += 16) {
      g.beginPath();
      g.moveTo(0, y);
      g.lineTo(96, y);
      g.stroke();
    }
    for (let y = 4; y < 380; y += 16) {
      for (let x = 6; x < 90; x += 14) {
        if (Math.random() > 0.22) {
          const lit = Math.random() > 0.18;
          g.fillStyle = lit ? "#7eacb8" : "#121c24";
          g.globalAlpha = lit ? 0.28 + Math.random() * 0.5 : 0.9;
          g.fillRect(x, y, 9, 10);
        }
      }
    }
    g.globalAlpha = 1;
    const t = new THREE.CanvasTexture(c);
    t.wrapS = THREE.RepeatWrapping;
    t.wrapT = THREE.RepeatWrapping;
    t.anisotropy = 4;
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  const signTex = (() => {
    const sheets = [];
    const bgs = ["#d4e8ee", "#b7d6de", "#9ec8d2", "#e6f2f4", "#88b4c0"];
    for (let n = 0; n < 8; n += 1) {
      const c = document.createElement("canvas");
      c.width = 48;
      c.height = 256;
      const g = c.getContext("2d");
      g.fillStyle = bgs[n % bgs.length];
      g.fillRect(0, 0, 48, 256);
      g.fillStyle = n === 6 ? "#6a1c22" : "#0b1418";
      g.fillRect(6, 8, 36, 18);
      for (let y = 34; y < 244; y += 11 + (n % 3)) {
        const w = 10 + ((n * 7 + y) % 22);
        g.fillRect(24 - w / 2, y, w, 5 + (y % 5));
      }
      const t = new THREE.CanvasTexture(c);
      t.colorSpace = THREE.SRGBColorSpace;
      sheets.push(t);
    }
    return sheets;
  })();

  const moonTex = (() => {
    const c = document.createElement("canvas");
    c.width = 512;
    c.height = 512;
    const g = c.getContext("2d");
    const grd = g.createRadialGradient(240, 220, 40, 256, 256, 260);
    grd.addColorStop(0, "#e4e8ea");
    grd.addColorStop(0.45, "#c5cbd0");
    grd.addColorStop(1, "#8d969e");
    g.fillStyle = grd;
    g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 90; i += 1) {
      const x = Math.random() * 512;
      const y = Math.random() * 512;
      const r = 3 + Math.random() * 28;
      g.beginPath();
      g.arc(x, y, r, 0, Math.PI * 2);
      g.fillStyle = `rgba(70, 78, 86, ${0.08 + Math.random() * 0.22})`;
      g.fill();
      g.beginPath();
      g.arc(x - r * 0.18, y - r * 0.18, r * 0.7, 0, Math.PI * 2);
      g.fillStyle = `rgba(210, 216, 220, ${0.04 + Math.random() * 0.08})`;
      g.fill();
    }
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    return t;
  })();

  const addSigns = (x, z, w, h, d, facing) => {
    const face = facing < 0 ? -1 : 1;
    let y = 1.1;
    let n = 0;
    while (y < h - 1.2 && n < 16) {
      const sh = 1.15 + Math.random() * 2.4;
      const sw = 0.42 + Math.random() * 0.5;
      if (y + sh > h - 0.5) break;
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(0.07, sh, sw),
        new THREE.MeshBasicMaterial({
          map: signTex[n % signTex.length],
          color: 0xffffff,
        })
      );
      sign.position.set(
        x + face * (w / 2 + 0.045),
        y + sh / 2,
        z + (Math.random() - 0.5) * Math.min(d * 0.55, 1.1)
      );
      scene.add(sign);
      y += sh + 0.08 + Math.random() * 0.18;
      n += 1;
    }
  };

  for (let i = 0; i < 28; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const row = Math.floor(i / 2);
    const z = 6 - row * 3.05;
    const x = side * (2.55 + (row % 4) * 0.12 + (row > 10 ? 0.35 : 0));
    const h = 28 + (row % 7) * 4.5 + Math.random() * 10;
    const w = 2.15 + Math.random() * 1.15;
    const d = 2.4 + Math.random() * 1.5;
    const map = winTex.clone();
    map.wrapS = THREE.RepeatWrapping;
    map.wrapT = THREE.RepeatWrapping;
    map.repeat = new THREE.Vector2(1, Math.max(3, Math.floor(h / 7)));
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({
        map,
        color: 0x6e7d86,
        metalness: 0.42,
        roughness: 0.52,
        emissive: 0x0a1820,
        emissiveIntensity: 0.28,
      })
    );
    body.position.set(x, h / 2, z);
    scene.add(body);
    addSigns(x, z, w, h, d, -side);
  }

  const moon = new THREE.Mesh(
    new THREE.SphereGeometry(11.5, 56, 56),
    new THREE.MeshStandardMaterial({
      map: moonTex,
      color: 0xffffff,
      emissive: 0x9aa4ac,
      emissiveIntensity: 0.22,
      roughness: 1,
      metalness: 0,
    })
  );
  moon.position.set(0.15, 49, -26);
  scene.add(moon);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.28, 0.55, 0.42);
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
    const t = clock.getElapsedTime();
    camera.position.x += (mouse.x * 0.55 - camera.position.x) * 0.03;
    camera.position.y += (34 + mouse.y * 0.9 - camera.position.y) * 0.03;
    camera.lookAt(0.05, 14, -16);
    moon.rotation.y = t * 0.012;
    composer.render();
  };
  loop();
}
