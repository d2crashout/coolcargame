import * as THREE from 'https://unpkg.com/three@0.162.0/build/three.module.js';

const canvas = document.querySelector('#game');
const statusEl = document.querySelector('#status');
const levelLabel = document.querySelector('#levelLabel');
const endlessButton = document.querySelector('#endlessToggle');

const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;

const scene = new THREE.Scene();
scene.fog = new THREE.Fog(0x7aa2ff, 25, 140);
scene.background = new THREE.Color(0x8cb6ff);

const camera = new THREE.PerspectiveCamera(62, window.innerWidth / window.innerHeight, 0.1, 500);
camera.position.set(0, 7, 12);

const hemi = new THREE.HemisphereLight(0xdfe9ff, 0x304060, 0.9);
scene.add(hemi);

const sun = new THREE.DirectionalLight(0xffffff, 1.2);
sun.position.set(18, 28, 12);
sun.castShadow = true;
sun.shadow.mapSize.set(1024, 1024);
sun.shadow.camera.left = -80;
sun.shadow.camera.right = 80;
sun.shadow.camera.top = 80;
sun.shadow.camera.bottom = -80;
scene.add(sun);

const groundPlane = new THREE.Mesh(
  new THREE.PlaneGeometry(600, 600),
  new THREE.MeshStandardMaterial({ color: 0x26472f, roughness: 1 })
);
groundPlane.rotation.x = -Math.PI / 2;
groundPlane.position.y = -4;
groundPlane.receiveShadow = true;
scene.add(groundPlane);

const world = new THREE.Group();
scene.add(world);

const car = new THREE.Group();
const carBody = new THREE.Mesh(
  new THREE.BoxGeometry(2.1, 0.8, 1.4),
  new THREE.MeshStandardMaterial({ color: 0xff7f50, roughness: 0.45, metalness: 0.18 })
);
carBody.castShadow = true;
carBody.position.y = 0.25;
car.add(carBody);

const cabin = new THREE.Mesh(
  new THREE.BoxGeometry(1.05, 0.6, 1.05),
  new THREE.MeshStandardMaterial({ color: 0xfef3c7, roughness: 0.35 })
);
cabin.position.set(-0.2, 0.8, 0);
cabin.castShadow = true;
car.add(cabin);

function makeWheel(x, z) {
  const wheel = new THREE.Mesh(
    new THREE.CylinderGeometry(0.42, 0.42, 0.34, 20),
    new THREE.MeshStandardMaterial({ color: 0x121212, roughness: 0.85 })
  );
  wheel.rotation.z = Math.PI / 2;
  wheel.position.set(x, -0.1, z);
  wheel.castShadow = true;
  car.add(wheel);
  return wheel;
}

const wheels = [
  makeWheel(-0.8, 0.65),
  makeWheel(0.8, 0.65),
  makeWheel(-0.8, -0.65),
  makeWheel(0.8, -0.65)
];

scene.add(car);

const carState = {
  x: 0,
  y: 2,
  vx: 0,
  vy: 0,
  angle: 0,
  angularVel: 0,
  wheelBase: 1.6,
  halfHeight: 0.55,
  finished: false,
  crashed: false,
  canControl: true
};

const keys = new Set();
window.addEventListener('keydown', (e) => {
  keys.add(e.key.toLowerCase());
  if (e.key.toLowerCase() === 'r') restartLevel();
});
window.addEventListener('keyup', (e) => keys.delete(e.key.toLowerCase()));

const LEVELS = [
  [0, 0, 12, 0, 24, 2, 38, 3, 48, 1],
  [0, 0, 9, 0, 16, 3, 24, -1, 32, 2, 42, 2],
  [0, 0, 11, 2, 19, -2, 29, 3, 42, -1, 55, 1],
  [0, 0, 8, 0, 13, 4, 17, -3, 23, 5, 33, 0, 42, 2],
  [0, 0, 10, 1, 18, 1, 24, 5, 30, -1, 39, 4, 48, 1],
  [0, 0, 8, -1, 15, 2, 25, 6, 34, 0, 42, 5, 52, 2],
  [0, 0, 7, 3, 15, -2, 22, 4, 29, -3, 38, 5, 50, 1],
  [0, 0, 9, 0, 18, 4, 25, 4, 34, -2, 44, 2, 55, 3],
  [0, 0, 8, 2, 14, -3, 21, 2, 30, 6, 41, 0, 55, 4],
  [0, 0, 10, 0, 18, 5, 25, -1, 32, 6, 41, -2, 52, 3],
  [0, 0, 12, 1, 20, 5, 28, -2, 38, 7, 46, 2, 58, 4],
  [0, 0, 9, 3, 16, -1, 24, 5, 30, -4, 38, 7, 49, 1, 62, 5]
];

let levelIndex = 0;
let endless = false;
let endlessSeed = 1;
let currentTrack = [];
let trackMeshes = [];
let finishMesh = null;

function clearTrack() {
  for (const mesh of trackMeshes) {
    world.remove(mesh);
    mesh.geometry.dispose();
    mesh.material.dispose();
  }
  trackMeshes = [];
  if (finishMesh) {
    world.remove(finishMesh);
    finishMesh.geometry.dispose();
    finishMesh.material.dispose();
    finishMesh = null;
  }
}

function random01() {
  endlessSeed = (endlessSeed * 16807) % 2147483647;
  return (endlessSeed - 1) / 2147483646;
}

function createEndlessTrack() {
  const points = [0, 0];
  let x = 0;
  let y = 0;
  for (let i = 0; i < 36; i++) {
    x += 6 + random01() * 5;
    y += (random01() - 0.5) * 6;
    y = Math.max(-2.5, Math.min(9.5, y));
    points.push(x, y);
  }
  return points;
}

function makeTrackMeshes(points) {
  const material = new THREE.MeshStandardMaterial({ color: 0x2f2f3a, roughness: 0.82, metalness: 0.06 });
  for (let i = 0; i < points.length - 2; i += 2) {
    const x1 = points[i];
    const y1 = points[i + 1];
    const x2 = points[i + 2];
    const y2 = points[i + 3];

    const dx = x2 - x1;
    const dy = y2 - y1;
    const length = Math.hypot(dx, dy);
    const angle = Math.atan2(dy, dx);

    const slab = new THREE.Mesh(new THREE.BoxGeometry(length, 1, 8), material.clone());
    slab.position.set((x1 + x2) / 2, (y1 + y2) / 2 - 0.55, 0);
    slab.rotation.z = angle;
    slab.receiveShadow = true;
    slab.castShadow = true;
    world.add(slab);
    trackMeshes.push(slab);
  }

  const endX = points[points.length - 2];
  const endY = points[points.length - 1];
  finishMesh = new THREE.Mesh(
    new THREE.CylinderGeometry(0.12, 0.12, 5.8, 12),
    new THREE.MeshStandardMaterial({ color: 0x22c55e, emissive: 0x0a481f })
  );
  finishMesh.position.set(endX, endY + 2.1, 0);
  finishMesh.castShadow = true;
  world.add(finishMesh);
}

function loadLevel() {
  clearTrack();
  currentTrack = endless ? createEndlessTrack() : LEVELS[levelIndex];
  makeTrackMeshes(currentTrack);
  resetCar();
  updateLabels();
  statusEl.textContent = '';
  statusEl.className = '';
}

function resetCar() {
  carState.x = currentTrack[0] + 1;
  carState.y = currentTrack[1] + 3;
  carState.vx = 0;
  carState.vy = 0;
  carState.angle = 0;
  carState.angularVel = 0;
  carState.finished = false;
  carState.crashed = false;
  carState.canControl = true;
}

function restartLevel() {
  resetCar();
  statusEl.textContent = 'Restarted!';
  statusEl.className = '';
}

function getGroundAt(x) {
  const pts = currentTrack;
  if (x <= pts[0]) return { y: pts[1], angle: 0 };

  for (let i = 0; i < pts.length - 2; i += 2) {
    const x1 = pts[i];
    const y1 = pts[i + 1];
    const x2 = pts[i + 2];
    const y2 = pts[i + 3];
    if (x >= x1 && x <= x2) {
      const t = (x - x1) / (x2 - x1);
      return { y: y1 + (y2 - y1) * t, angle: Math.atan2(y2 - y1, x2 - x1) };
    }
  }

  const endX = pts[pts.length - 2];
  const endY = pts[pts.length - 1];
  if (x > endX) return { y: endY, angle: 0 };
  return { y: -20, angle: 0 };
}

function checkFinish() {
  const endX = currentTrack[currentTrack.length - 2];
  if (!carState.finished && carState.x > endX + 1.5) {
    carState.finished = true;
    carState.canControl = false;
    statusEl.textContent = endless ? 'Huge run! Endless track regenerated.' : 'Level cleared!';
    statusEl.className = '';

    if (endless) {
      endlessSeed += Math.floor(performance.now());
      setTimeout(loadLevel, 900);
    } else {
      setTimeout(() => {
        levelIndex = (levelIndex + 1) % LEVELS.length;
        loadLevel();
      }, 850);
    }
  }
}

function checkCrash(dt) {
  if (carState.crashed || carState.finished) return;

  if (Math.abs(carState.angle) > Math.PI * 1.15 && Math.abs(carState.vx) < 2) {
    carState.crashed = true;
  }

  if (carState.y < -10) {
    carState.crashed = true;
  }

  if (carState.crashed) {
    carState.canControl = false;
    statusEl.textContent = 'Crashed! Auto-restarting...';
    statusEl.className = 'fail';
    setTimeout(restartLevel, Math.max(700, 900 - dt * 120));
  }
}

function updatePhysics(dt) {
  const accel = keys.has('w') || keys.has('arrowup') ? 1 : 0;
  const brake = keys.has('s') || keys.has('arrowdown') ? 1 : 0;
  const rotateLeft = keys.has('a') || keys.has('arrowleft');
  const rotateRight = keys.has('d') || keys.has('arrowright');

  const frontX = carState.x + Math.cos(carState.angle) * carState.wheelBase * 0.5;
  const rearX = carState.x - Math.cos(carState.angle) * carState.wheelBase * 0.5;
  const front = getGroundAt(frontX);
  const rear = getGroundAt(rearX);

  const groundY = (front.y + rear.y) * 0.5;
  const groundAngle = Math.atan2(front.y - rear.y, frontX - rearX || 0.0001);

  const suspensionHeight = groundY + carState.halfHeight + 0.35;
  const onGround = carState.y <= suspensionHeight + 0.18;

  if (carState.canControl) {
    if (onGround) {
      const slopeFactor = Math.cos(groundAngle);
      carState.vx += (accel * 16 - brake * 13) * slopeFactor * dt;
      carState.vx -= Math.sin(groundAngle) * 8 * dt;
      carState.angularVel += (groundAngle - carState.angle) * 10 * dt;
    } else {
      if (rotateLeft) carState.angularVel += 4.2 * dt;
      if (rotateRight) carState.angularVel -= 4.2 * dt;
      if (accel) carState.vx += 3.5 * dt;
    }
  }

  carState.vy -= 24 * dt;

  if (onGround) {
    carState.y += (suspensionHeight - carState.y) * 9.5 * dt;
    carState.vy = Math.max(carState.vy, -1.4);
    carState.angle += (groundAngle - carState.angle) * 7 * dt;
    carState.angularVel *= 0.87;
  }

  carState.vx *= onGround ? 0.987 : 0.996;
  carState.vy *= 0.998;

  carState.x += carState.vx * dt;
  carState.y += carState.vy * dt;
  carState.angle += carState.angularVel * dt;

  if (Math.abs(carState.vx) > 27) carState.vx *= 0.97;
}

function updateVisuals(dt) {
  car.position.set(carState.x, carState.y, 0);
  car.rotation.z = carState.angle;

  for (const wheel of wheels) {
    wheel.rotation.x -= carState.vx * dt * 2.2;
  }

  const target = new THREE.Vector3(carState.x + 6.5, carState.y + 5.8, 12);
  camera.position.lerp(target, 1 - Math.pow(0.0009, dt));
  camera.lookAt(carState.x + 2.5, carState.y + 1.2, 0);
}

function updateLabels() {
  levelLabel.textContent = endless ? 'Mode: Endless' : `Level ${levelIndex + 1} / ${LEVELS.length}`;
  endlessButton.textContent = `Endless: ${endless ? 'On' : 'Off'}`;
}

document.querySelector('#prevLevel').addEventListener('click', () => {
  if (endless) return;
  levelIndex = (levelIndex - 1 + LEVELS.length) % LEVELS.length;
  loadLevel();
});

document.querySelector('#nextLevel').addEventListener('click', () => {
  if (endless) return;
  levelIndex = (levelIndex + 1) % LEVELS.length;
  loadLevel();
});

document.querySelector('#restart').addEventListener('click', restartLevel);

document.querySelector('#endlessToggle').addEventListener('click', () => {
  endless = !endless;
  loadLevel();
});

window.addEventListener('resize', () => {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
});

let last = performance.now();
function tick(now) {
  const dt = Math.min((now - last) / 1000, 0.033);
  last = now;

  updatePhysics(dt);
  checkFinish();
  checkCrash(dt);
  updateVisuals(dt);
  renderer.render(scene, camera);
  requestAnimationFrame(tick);
}

loadLevel();
requestAnimationFrame(tick);
