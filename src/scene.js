import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { baseplateGeometry } from './bricks/geometry.js';
import { GRID } from './placement.js';

export function createScene(canvas) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.shadowMap.enabled = true;
  renderer.shadowMap.type = THREE.PCFSoftShadowMap;

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x202633);

  const camera = new THREE.PerspectiveCamera(
    50, window.innerWidth / window.innerHeight, 0.1, 500
  );
  camera.position.set(GRID * 1.2, GRID * 1.0, GRID * 1.5);

  const controls = new OrbitControls(camera, canvas);
  controls.target.set(GRID / 2, 0, GRID / 2);
  controls.enableDamping = true;
  controls.dampingFactor = 0.08;
  controls.maxPolarAngle = Math.PI / 2 - 0.02; // don't go below the floor
  controls.minDistance = 6;
  controls.maxDistance = 150;
  controls.update();

  // Lights
  scene.add(new THREE.HemisphereLight(0xcfd8ff, 0x3a3f4a, 0.9));
  const sun = new THREE.DirectionalLight(0xffffff, 1.6);
  sun.position.set(GRID * 0.9, GRID * 1.6, GRID * 0.4);
  sun.castShadow = true;
  sun.shadow.mapSize.set(2048, 2048);
  const s = GRID * 0.9;
  sun.shadow.camera.left = -s;
  sun.shadow.camera.right = s;
  sun.shadow.camera.top = s;
  sun.shadow.camera.bottom = -s;
  sun.shadow.camera.far = GRID * 4;
  sun.target.position.set(GRID / 2, 0, GRID / 2);
  scene.add(sun, sun.target);

  // Visible baseplate (studs included) — visual only.
  const baseplate = new THREE.Mesh(
    baseplateGeometry(GRID),
    new THREE.MeshStandardMaterial({ color: 0x00852b, roughness: 0.6 })
  );
  baseplate.receiveShadow = true;
  scene.add(baseplate);

  // Invisible flat plane used as the ground raycast target (much cheaper
  // than raycasting the merged stud geometry above).
  const ground = new THREE.Mesh(
    new THREE.PlaneGeometry(GRID, GRID).rotateX(-Math.PI / 2)
      .translate(GRID / 2, 0, GRID / 2),
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
