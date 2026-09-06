import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = document.getElementById("stage");
if (!canvas || reduced) {
  /* skyline off */
} else {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x0b0614, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x14081c, 0.028);

  const camera = new THREE.PerspectiveCamera(62, 1, 0.1, 240);
  camera.position.set(0, 5.2, 22);

  scene.add(new THREE.AmbientLight(0x2a1028, 0.55));
  const sun = new THREE.PointLight(0xff6a22, 40, 80);
  sun.position.set(0, 8, -40);
  scene.add(sun);
  const mag = new THREE.PointLight(0xff2d9b, 22, 36);
  mag.position.set(-8, 4, 6);
  scene.add(mag);
  const cyan = new THREE.PointLight(0x3df0ff, 16, 32);
  cyan.position.set(9, 3.5, 4);
  scene.add(cyan);

  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(220, 220),
    new THREE.MeshStandardMaterial({ color: 0x0a0710, metalness: 0.7, roughness: 0.35 })
  );
  ground.rotation.x = -Math.PI / 2;
  scene.add(ground);

  const makeBuilding = (x, z, w, d, h, neon) => {
    const body = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshStandardMaterial({
        color: 0x121018,
        metalness: 0.45,
        roughness: 0.62,
        emissive: 0x1a0a22,
        emissiveIntensity: 0.25,
      })
    );
    body.position.set(x, h / 2, z);
    scene.add(body);
    if (neon) {
      const sign = new THREE.Mesh(
        new THREE.BoxGeometry(w * 0.08, h * 0.22, 0.08),
        new THREE.MeshBasicMaterial({ color: neon })
      );
      sign.position.set(x + (x < 0 ? w / 2 : -w / 2), h * 0.55, z);
      scene.add(sign);
    }
  };

  for (let i = 0; i < 28; i += 1) {
    const side = i % 2 === 0 ? -1 : 1;
    const z = -6 - i * 4.2 - Math.random() * 2;
    const x = side * (7 + Math.random() * 9);
    const h = 6 + Math.random() * 22;
    const w = 2.2 + Math.random() * 3.4;
    const d = 2.4 + Math.random() * 3;
    const neon = i % 3 === 0 ? 0xff2d9b : i % 3 === 1 ? 0x3df0ff : 0xff6a22;
    makeBuilding(x, z, w, d, h, neon);
  }

  const rainCount = window.innerWidth < 700 ? 900 : 2200;
  const rainPos = new Float32Array(rainCount * 6);
  const rainSpeed = new Float32Array(rainCount);
  for (let i = 0; i < rainCount; i += 1) {
    const x = (Math.random() - 0.5) * 70;
    const y = Math.random() * 40;
    const z = (Math.random() - 0.5) * 80 - 10;
    const len = 0.35 + Math.random() * 0.7;
    rainPos[i * 6] = x;
    rainPos[i * 6 + 1] = y;
    rainPos[i * 6 + 2] = z;
    rainPos[i * 6 + 3] = x - 0.08;
    rainPos[i * 6 + 4] = y - len;
    rainPos[i * 6 + 5] = z;
    rainSpeed[i] = 0.35 + Math.random() * 0.55;
  }
  const rainGeo = new THREE.BufferGeometry();
  rainGeo.setAttribute("position", new THREE.BufferAttribute(rainPos, 3));
  const rain = new THREE.LineSegments(
    rainGeo,
    new THREE.LineBasicMaterial({
      color: 0xaad8ff,
      transparent: true,
      opacity: 0.28,
    })
  );
  scene.add(rain);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.72, 0.5, 0.2);
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
    const pos = rainGeo.attributes.position.array;
    for (let i = 0; i < rainCount; i += 1) {
      const s = rainSpeed[i];
      pos[i * 6 + 1] -= s;
      pos[i * 6 + 4] -= s;
      if (pos[i * 6 + 1] < 0) {
        pos[i * 6 + 1] += 40;
        pos[i * 6 + 4] += 40;
      }
    }
    rainGeo.attributes.position.needsUpdate = true;
    camera.position.x += (mouse.x * 1.8 - camera.position.x) * 0.04;
    camera.position.y += (5.1 + mouse.y * 0.6 - camera.position.y) * 0.04;
    camera.position.z = 21 + Math.sin(t * 0.12) * 0.8;
    camera.lookAt(0, 3.2, -18);
    sun.intensity = 34 + Math.sin(t * 0.7) * 8;
    composer.render();
  };
  loop();
}
