import * as THREE from "three";
import { EffectComposer } from "three/addons/postprocessing/EffectComposer.js";
import { RenderPass } from "three/addons/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/addons/postprocessing/UnrealBloomPass.js";
import { AfterimagePass } from "three/addons/postprocessing/AfterimagePass.js";
import { FilmPass } from "three/addons/postprocessing/FilmPass.js";
import { GlitchPass } from "three/addons/postprocessing/GlitchPass.js";
import { ShaderPass } from "three/addons/postprocessing/ShaderPass.js";
import { RGBShiftShader } from "three/addons/shaders/RGBShiftShader.js";

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
  renderer.setClearColor(0x000008, 1);
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.2;

  const scene = new THREE.Scene();
  scene.fog = new THREE.FogExp2(0x000008, 0.038);

  const camera = new THREE.PerspectiveCamera(68, 1, 0.1, 220);
  camera.position.set(0, 3.2, 14);

  scene.add(new THREE.AmbientLight(0x140018, 0.4));
  const red = new THREE.PointLight(0xff2a6d, 32, 50);
  red.position.set(-7, 5, 5);
  scene.add(red);
  const cyan = new THREE.PointLight(0x05f2ff, 28, 50);
  cyan.position.set(8, 3, 4);
  scene.add(cyan);
  const gold = new THREE.PointLight(0xffe566, 18, 40);
  gold.position.set(0, 8, -3);
  scene.add(gold);

  const core = new THREE.Mesh(
    new THREE.IcosahedronGeometry(1.7, 1),
    new THREE.MeshStandardMaterial({
      color: 0x05050d,
      emissive: 0xff2a6d,
      emissiveIntensity: 1.1,
      metalness: 0.92,
      roughness: 0.18,
      wireframe: true,
    })
  );
  scene.add(core);

  const inner = new THREE.Mesh(
    new THREE.OctahedronGeometry(0.72, 0),
    new THREE.MeshBasicMaterial({ color: 0xffe566, wireframe: true })
  );
  scene.add(inner);

  const ring = new THREE.Mesh(
    new THREE.TorusGeometry(2.8, 0.04, 12, 220),
    new THREE.MeshBasicMaterial({ color: 0xffe566 })
  );
  ring.rotation.x = Math.PI / 2.2;
  scene.add(ring);

  const ring2 = new THREE.Mesh(
    new THREE.TorusGeometry(3.55, 0.018, 8, 180),
    new THREE.MeshBasicMaterial({ color: 0x05f2ff })
  );
  ring2.rotation.x = Math.PI / 3;
  ring2.rotation.y = 0.5;
  scene.add(ring2);

  const knot = new THREE.Mesh(
    new THREE.TorusKnotGeometry(1.15, 0.16, 220, 12),
    new THREE.MeshBasicMaterial({ color: 0xff2a6d, wireframe: true })
  );
  knot.scale.setScalar(0.78);
  scene.add(knot);

  const grid = new THREE.GridHelper(120, 90, 0xff2a6d, 0x04181e);
  grid.position.y = -3.4;
  scene.add(grid);

  const moons = [0, 1, 2].map((i) => {
    const m = new THREE.Mesh(
      new THREE.IcosahedronGeometry(0.22, 0),
      new THREE.MeshBasicMaterial({ color: i === 1 ? 0x39ff88 : 0x05f2ff, wireframe: true })
    );
    scene.add(m);
    return m;
  });

  const count = window.innerWidth < 700 ? 2800 : 9000;
  const positions = new Float32Array(count * 3);
  for (let i = 0; i < count; i += 1) {
    const r = 3.5 + Math.random() * 36;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.sin(phi) * Math.sin(theta) * 0.55;
    positions[i * 3 + 2] = r * Math.cos(phi);
  }
  const pGeo = new THREE.BufferGeometry();
  pGeo.setAttribute("position", new THREE.BufferAttribute(positions, 3));
  const points = new THREE.Points(
    pGeo,
    new THREE.PointsMaterial({
      color: 0xc8fff8,
      size: 0.042,
      transparent: true,
      opacity: 0.9,
      depthWrite: false,
    })
  );
  scene.add(points);

  const linePos = [];
  for (let i = 0; i < 80; i += 1) {
    const a = Math.floor(Math.random() * count) * 3;
    const b = Math.floor(Math.random() * count) * 3;
    linePos.push(
      positions[a],
      positions[a + 1],
      positions[a + 2],
      positions[b],
      positions[b + 1],
      positions[b + 2]
    );
  }
  const lGeo = new THREE.BufferGeometry();
  lGeo.setAttribute("position", new THREE.Float32BufferAttribute(linePos, 3));
  scene.add(
    new THREE.LineSegments(
      lGeo,
      new THREE.LineBasicMaterial({ color: 0x05f2ff, transparent: true, opacity: 0.12 })
    )
  );

  const composer = new EffectComposer(renderer);
  composer.addPass(new RenderPass(scene, camera));
  const after = new AfterimagePass(0.78);
  composer.addPass(after);
  const bloom = new UnrealBloomPass(new THREE.Vector2(1, 1), 1.35, 0.72, 0.08);
  composer.addPass(bloom);
  composer.addPass(new FilmPass(0.55, false));
  const rgb = new ShaderPass(RGBShiftShader);
  rgb.uniforms.amount.value = 0.0022;
  composer.addPass(rgb);
  const glitch = new GlitchPass();
  glitch.goWild = false;
  glitch.enabled = false;
  composer.addPass(glitch);

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

  window.addEventListener("digiverse:glitch", () => {
    glitch.enabled = true;
    rgb.uniforms.amount.value = 0.018;
    window.setTimeout(() => {
      glitch.enabled = false;
      rgb.uniforms.amount.value = 0.0022;
    }, 180);
  });

  const clock = new THREE.Clock();
  const loop = () => {
    requestAnimationFrame(loop);
    if (!live) return;
    const t = clock.getElapsedTime();
    const hard = document.body.classList.contains("is-jacked") ? 1 : 0.35;
    core.rotation.y = t * 0.32 * hard;
    core.rotation.x = t * 0.11;
    inner.rotation.y = -t * 0.8;
    knot.rotation.y = -t * 0.42;
    knot.rotation.z = t * 0.18;
    ring.rotation.z = t * 0.28;
    ring2.rotation.x = t * 0.15;
    ring2.rotation.z = -t * 0.2;
    points.rotation.y = t * 0.04;
    grid.position.z = (t * 3.4) % 5;
    moons.forEach((m, i) => {
      const a = t * (0.5 + i * 0.18) + i * 2.1;
      const r = 4.2 + i * 0.45;
      m.position.set(Math.cos(a) * r, Math.sin(a * 1.3) * 0.8, Math.sin(a) * r);
    });
    camera.fov = 62 + Math.sin(t * 0.7) * 4 * hard;
    camera.position.x += (mouse.x * 2.4 - camera.position.x) * 0.05;
    camera.position.y += (3.1 + mouse.y * 1.1 - camera.position.y) * 0.05;
    camera.position.z = 13 + Math.sin(t * 0.25) * 1.2;
    camera.updateProjectionMatrix();
    camera.lookAt(0, 0.15, 0);
    red.intensity = 24 + Math.sin(t * 3) * 10;
    composer.render();
  };
  loop();
}
