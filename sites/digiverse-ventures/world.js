import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";

const reduced = window.matchMedia("(prefers-reduced-motion: reduce)").matches;
const canvas = document.getElementById("stage");
if (!canvas || reduced) {
  /* HUD-only */
} else {
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    powerPreference: "high-performance",
  });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 1.5));
  renderer.setClearColor(0x02010a, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x02010a, 0.046);

  const camera = new THREE.PerspectiveCamera(55, 1, 0.1, 200);
  camera.position.set(0, 2.4, 11);

  const ambient = new THREE.AmbientLight(0x12304a, 0.55);
  scene.add(ambient);
  const red = new THREE.PointLight(0xff2a6d, 18, 40);
  red.position.set(-6, 4, 4);
  scene.add(red);
  const cyan = new THREE.PointLight(0x05f2ff, 16, 40);
  cyan.position.set(6, 2, 3);
  scene.add(cyan);
  const gold = new THREE.PointLight(0xffe566, 8, 30);
  gold.position.set(0, 6, -2);
  scene.add(gold);

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.55, 1),
    new THREE.MeshStandardMaterial({
      color: 0x0a0a12,
      emissive: 0xff2a6d,
      emissiveIntensity: 0.55,
      metalness: 0.8,
      roughness: 0.25,
      wireframe: true,
    })
  );
  scene.add(core);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.55, 0.035, 16, 180),
    new THREE.MeshBasicMaterial({ color: 0xffe566 })
  );
  ring.rotation.x = Math.PI / 2.4;
  scene.add(ring);

  const knot = new THREE.Mesh(
    new THREE.TorusKnotGeometry(1.05, 0.18, 180, 16),
    new THREE.MeshBasicMaterial({ color: 0x05f2ff, wireframe: true })
  );
  knot.scale.setScalar(0.82);
  scene.add(knot);

  const grid = new THREE.GridHelper(90, 70, 0xff2a6d, 0x08343c);
  grid.position.y = -3.2;
  scene.add(grid);

  const count = window.innerWidth < 700 ? 1800 : 5200;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const r = 4 + Math.random() * 28;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.6;
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({
      color: 0x9dfff4,
      size: 0.035,
      transparent: true,
      opacity: 0.85,
      depthWrite: false,
    })
  );
  scene.add(points);

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 0.85, 0.55, 0.18);
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
    core.rotation.y = t * 0.25;
    core.rotation.x = t * 0.08;
    knot.rotation.y = -t * 0.35;
    knot.rotation.z = t * 0.12;
    ring.rotation.z = t * 0.2;
    points.rotation.y = t * 0.03;
    grid.position.z = (t * 2.2) % 4;
    camera.position.x += (mouse.x * 1.6 - camera.position.x) * 0.04;
    camera.position.y += (2.4 + mouse.y * 0.8 - camera.position.y) * 0.04;
    camera.lookAt(0, 0.2, 0);
    composer.render();
  };
  loop();
}
