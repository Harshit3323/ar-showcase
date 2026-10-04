import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import { DRACOLoader } from 'three/examples/jsm/loaders/DRACOLoader.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

const PARALLAX = false;

let renderer = null;
let scene = null;
let camera = null;
let model = null;
let animationId = null;
let currentScale = 1;
let initialScale = 1;
let isPinching = false;
let pinchStartDistance = 0;
let pinchStartScale = 1;
let lastTouchCenter = null;
let lastPointer = null;
let orientationPermissionGranted = false;

function getDistance(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

function getCenter(p1, p2) {
  return { x: (p1.x + p2.x) / 2, y: (p1.y + p2.y) / 2 };
}

function onPointerDown(event) {
  if (!model) return;

  const pointers = Array.from(event.targetTouches || [event]);
  if (pointers.length === 1) {
    lastPointer = { x: pointers[0].clientX, y: pointers[0].clientY };
    event.preventDefault();
  } else if (pointers.length === 2) {
    isPinching = true;
    pinchStartDistance = getDistance(pointers[0], pointers[1]);
    pinchStartScale = currentScale;
    lastTouchCenter = getCenter(pointers[0], pointers[1]);
    event.preventDefault();
  }
}

function onPointerMove(event) {
  if (!model) return;

  const pointers = Array.from(event.targetTouches || [event]);

  if (isPinching && pointers.length === 2) {
    const distance = getDistance(pointers[0], pointers[1]);
    const scale = pinchStartScale * (distance / pinchStartDistance);
    currentScale = Math.max(0.3, Math.min(3, scale));
    model.scale.setScalar(currentScale * initialScale);
    event.preventDefault();
  } else if (!isPinching && pointers.length === 1 && lastPointer) {
    const dx = pointers[0].clientX - lastPointer.x;
    const dy = pointers[0].clientY - lastPointer.y;
    model.rotation.y += dx * 0.005;
    model.rotation.x += dy * 0.005;
    model.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, model.rotation.x));
    lastPointer = { x: pointers[0].clientX, y: pointers[0].clientY };
    event.preventDefault();
  }
}

function onPointerUp(event) {
  const pointers = Array.from(event.targetTouches || [event]);
  if (pointers.length < 2) {
    isPinching = false;
  }
  if (pointers.length === 0) {
    lastPointer = null;
  }
  if (pointers.length === 1) {
    lastPointer = { x: pointers[0].clientX, y: pointers[0].clientY };
  }
}

function onDoubleClick(event) {
  if (!model) return;
  model.rotation.set(0, 0, 0);
  currentScale = 1;
  model.scale.setScalar(initialScale);
}

function onResize() {
  if (!renderer || !camera) return;
  const width = window.innerWidth;
  const height = window.innerHeight;
  renderer.setSize(width, height);
  camera.aspect = width / height;
  camera.updateProjectionMatrix();
}

function onOrientation(event) {
  if (!PARALLAX || !model || !orientationPermissionGranted) return;
  const beta = event.beta ? THREE.MathUtils.degToRad(event.beta) : 0;
  const gamma = event.gamma ? THREE.MathUtils.degToRad(event.gamma) : 0;
  model.rotation.y = THREE.MathUtils.clamp(-gamma * 0.5, -0.3, 0.3);
  model.rotation.x = THREE.MathUtils.clamp(-beta * 0.5, -0.3, 0.3);
}

async function requestOrientationPermission() {
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
    try {
      const permission = await DeviceOrientationEvent.requestPermission();
      orientationPermissionGranted = permission === 'granted';
    } catch {
      orientationPermissionGranted = false;
    }
  } else {
    orientationPermissionGranted = true;
  }
}

function animate() {
  animationId = requestAnimationFrame(animate);
  if (renderer && scene && camera) {
    renderer.render(scene, camera);
  }
}

export async function startAR(canvas) {
  await requestOrientationPermission();

  const width = window.innerWidth;
  const height = window.innerHeight;

  renderer = new THREE.WebGLRenderer({ canvas, alpha: true, antialias: true });
  renderer.setSize(width, height);
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
  camera.position.set(0, 0, 0);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const envMap = pmremGenerator.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environment = envMap;

  const dirLight = new THREE.DirectionalLight(0xffffff, 2);
  dirLight.position.set(5, 10, 7);
  scene.add(dirLight);

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath('/draco/');

  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);

  const gltf = await loader.loadAsync('/models/product.glb');
  model = gltf.scene;

  const box = new THREE.Box3().setFromObject(model);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());

  model.position.sub(center);

  const maxDim = Math.max(size.x, size.y, size.z);
  const targetHeight = 0.4;
  initialScale = targetHeight / maxDim;
  currentScale = 1;
  model.scale.setScalar(initialScale);

  model.position.z = -1.5;

  scene.add(model);

  canvas.addEventListener('pointerdown', onPointerDown);
  canvas.addEventListener('pointermove', onPointerMove);
  canvas.addEventListener('pointerup', onPointerUp);
  canvas.addEventListener('pointerleave', onPointerUp);
  canvas.addEventListener('dblclick', onDoubleClick);
  window.addEventListener('resize', onResize);
  if (PARALLAX) {
    window.addEventListener('deviceorientation', onOrientation);
  }

  animate();
}

export function stopAR() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  const canvas = document.getElementById('ar-canvas');
  if (canvas) {
    canvas.removeEventListener('pointerdown', onPointerDown);
    canvas.removeEventListener('pointermove', onPointerMove);
    canvas.removeEventListener('pointerup', onPointerUp);
    canvas.removeEventListener('pointerleave', onPointerUp);
    canvas.removeEventListener('dblclick', onDoubleClick);
  }
  window.removeEventListener('resize', onResize);
  window.removeEventListener('deviceorientation', onOrientation);

  if (model) {
    model.traverse(obj => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        if (Array.isArray(obj.material)) {
          obj.material.forEach(m => m.dispose());
        } else {
          obj.material.dispose();
        }
      }
    });
    model = null;
  }

  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss();
    const gl = renderer.domElement.getContext('webgl');
    if (gl) gl.getExtension('WEBGL_lose_context')?.loseContext();
    renderer = null;
  }

  scene = null;
  camera = null;
  currentScale = 1;
  initialScale = 1;
  isPinching = false;
  pinchStartDistance = 0;
  pinchStartScale = 1;
  lastTouchCenter = null;
  lastPointer = null;
  orientationPermissionGranted = false;
}