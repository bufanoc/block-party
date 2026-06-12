import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { baseplateGeometry } from './bricks/geometry.js';
import { DEFAULT_GRID, DEFAULT_BASE_COLOR } from './sizes.js';

// Builds the renderer/scene/camera for a baseplate of `gridSize` studs, with a
// baseplate of `baseColor`. Everything that depended on a fixed 32-stud plate
// (camera framing, light + shadow extents, clip planes, zoom limits) scales
// with gridSize so larger worlds frame and light correctly.
export function createScene(canvas, { gridSize = DEFAULT_GRID, baseColor = DEFAULT_BASE_COLOR } = {}) {
  const G = gridSize;

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x202633);

  const camera = new THREE.PerspectiveCamera(
    50, window.innerWidth / window.innerHeight, 0.1, Math.max(500, G * 16)
  );
  camera.position.set(G * 1.2, G * 1.0, G * 1.5);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(G / 2, 0, G / 2);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2 - 0.02; // don't go below the floor
  controls.minDistance = 6;
  controls.maxDistance = Math.max(150, G * 5);
  controls.update();

  // Lights
  scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x3a3f4a, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(G * 0.9, G * 1.6, G * 0.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = G * 0.9;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.camera.far = G * 4;
  sun.target.position.set(G / 2, 0, G / 2);
  scene.add(sun, sun.target);

  // Visible baseplate (studs included) — visual only.
  const baseplate = new THREE.Mesh(
    baseplateGeometry(G),
    new THREE.MeshStandardMaterial({ color: new THREE.Color(baseColor), roughness: 0.6 })
  );
  baseplate.receiveShadow = true;
  scene.add(baseplate);

  // Invisible flat plane used as the ground raycast target (much cheaper
  // than raycasting the merged stud geometry above).
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(G, G).rotateX(-Math.PI / 2)
      .translate(G / 2, 0, G / 2),
    new THREE.MeshBasicMaterial({ visible: false })
  );
  scene.add(ground);

  const onResize = () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  };
  window.addEventListener('resize', onResize);

  // Tear down everything this scene owns (call on unmount to avoid leaking
  // WebGL contexts and listeners when switching views).
  function dispose() {
    window.removeEventListener('resize', onResize);
    controls.dispose();
    renderer.dispose();
  }

  return { renderer, scene, camera, controls, ground, dispose };
}
