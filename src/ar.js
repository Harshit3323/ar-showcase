import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { DRACOLoader } from "three/examples/jsm/loaders/DRACOLoader.js";
import { RoomEnvironment } from "three/examples/jsm/environments/RoomEnvironment.js";

const PARALLAX = false;
const TARGET_SIZE = 0.4; // size of the model's largest side, in scene units
const MODEL_DISTANCE = 1.5; // how far in front of the camera

let renderer = null;
let scene = null;
let camera = null;
let model = null; // pivot group that holds the centered model
let envMap = null;
let animationId = null;
let currentScale = 1;
let initialScale = 1;
let pinchStartDistance = 0;
let pinchStartScale = 1;
let orientationPermissionGranted = false;
let lastTapTime = 0;
let tapMoved = false;

const pointers = new Map();

function getDistance(p1, p2) {
  return Math.hypot(p1.x - p2.x, p1.y - p2.y);
}

function resetModel() {
  if (!model) return;
  model.rotation.set(0, 0, 0);
  currentScale = 1;
  model.scale.setScalar(initialScale);
}

function onPointerDown(e) {
  if (!model) return;
  e.target.setPointerCapture?.(e.pointerId);
  pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
  if (pointers.size === 1) tapMoved = false;
  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    pinchStartDistance = getDistance(a, b);
    pinchStartScale = currentScale;
    tapMoved = true;
  }
}

function onPointerMove(e) {
  if (!model || !pointers.has(e.pointerId)) return;
  const prev = pointers.get(e.pointerId);
  const cur = { x: e.clientX, y: e.clientY };
  pointers.set(e.pointerId, cur);

  if (pointers.size === 2) {
    const [a, b] = [...pointers.values()];
    if (pinchStartDistance > 0) {
      const s = pinchStartScale * (getDistance(a, b) / pinchStartDistance);
      currentScale = Math.max(0.3, Math.min(3, s));
      model.scale.setScalar(currentScale * initialScale);
    }
  } else if (pointers.size === 1) {
    const dx = cur.x - prev.x;
    const dy = cur.y - prev.y;
    if (Math.abs(dx) + Math.abs(dy) > 2) tapMoved = true;
    model.rotation.y += dx * 0.005;
    model.rotation.x += dy * 0.005;
    model.rotation.x = Math.max(
      -Math.PI / 2,
      Math.min(Math.PI / 2, model.rotation.x),
    );
  }
}

function onPointerUp(e) {
  const wasSingle = pointers.size === 1;
  pointers.delete(e.pointerId);

  // double tap (works on touch screens) or double click resets the model
  if (e.type === "pointerup" && wasSingle && !tapMoved) {
    const now = performance.now();
    if (now - lastTapTime < 300) {
      resetModel();
      lastTapTime = 0;
    } else {
      lastTapTime = now;
    }
  }
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
  if (!PARALLAX) return;
  if (
    typeof DeviceOrientationEvent !== "undefined" &&
    typeof DeviceOrientationEvent.requestPermission === "function"
  ) {
    try {
      const permission = await DeviceOrientationEvent.requestPermission();
      orientationPermissionGranted = permission === "granted";
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
  renderer.setClearColor(0x000000, 0);
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1;

  scene = new THREE.Scene();

  camera = new THREE.PerspectiveCamera(50, width / height, 0.1, 100);
  camera.position.set(0, 0, 0);

  const pmremGenerator = new THREE.PMREMGenerator(renderer);
  const roomEnv = new RoomEnvironment();
  envMap = pmremGenerator.fromScene(roomEnv, 0.04).texture;
  scene.environment = envMap;
  roomEnv.dispose?.();
  pmremGenerator.dispose();

  const dirLight = new THREE.DirectionalLight(0xffffff, 2);
  dirLight.position.set(5, 10, 7);
  scene.add(dirLight);

  const ambientLight = new THREE.AmbientLight(0xffffff, 1);
  scene.add(ambientLight);

  const dracoLoader = new DRACOLoader();
  dracoLoader.setDecoderPath("/draco/");

  const loader = new GLTFLoader();
  loader.setDRACOLoader(dracoLoader);

  let gltf;
  try {
    gltf = await loader.loadAsync("/models/product.glb");
  } catch (loadError) {
    console.error("Failed to load model:", loadError);
    throw new Error(`Failed to load model: ${loadError.message}`);
  } finally {
    dracoLoader.dispose();
  }

  if (!gltf || !gltf.scene) {
    throw new Error("Model loaded but scene is missing");
  }

  const root = gltf.scene;

  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  console.log("Model bounds:", { size, center });

  let meshCount = 0;
  root.traverse((child) => {
    if (child.isMesh) meshCount++;
  });
  console.log("Total meshes:", meshCount);
  if (meshCount === 0) {
    throw new Error("Model has no meshes");
  }

  // Center the model inside a pivot so scaling and rotation
  // happen around the middle of the model.
  root.position.sub(center);
  const pivot = new THREE.Group();
  pivot.add(root);

  const maxDim = Math.max(size.x, size.y, size.z);
  initialScale = maxDim > 0 ? TARGET_SIZE / maxDim : 1;
  currentScale = 1;

  pivot.scale.setScalar(initialScale);
  pivot.position.set(0, 0, -MODEL_DISTANCE);

  model = pivot; // gestures and dispose code work on the pivot
  scene.add(model);

  pointers.clear();
  canvas.addEventListener("pointerdown", onPointerDown);
  canvas.addEventListener("pointermove", onPointerMove);
  canvas.addEventListener("pointerup", onPointerUp);
  canvas.addEventListener("pointercancel", onPointerUp);
  canvas.addEventListener("dblclick", resetModel);
  window.addEventListener("resize", onResize);
  if (PARALLAX) {
    window.addEventListener("deviceorientation", onOrientation);
  }

  animate();
}

export function stopAR() {
  if (animationId) {
    cancelAnimationFrame(animationId);
    animationId = null;
  }

  const canvas = document.getElementById("ar-canvas");
  if (canvas) {
    canvas.removeEventListener("pointerdown", onPointerDown);
    canvas.removeEventListener("pointermove", onPointerMove);
    canvas.removeEventListener("pointerup", onPointerUp);
    canvas.removeEventListener("pointercancel", onPointerUp);
    canvas.removeEventListener("dblclick", resetModel);
  }
  window.removeEventListener("resize", onResize);
  window.removeEventListener("deviceorientation", onOrientation);

  if (model) {
    model.traverse((obj) => {
      if (obj.geometry) obj.geometry.dispose();
      if (obj.material) {
        const materials = Array.isArray(obj.material)
          ? obj.material
          : [obj.material];
        materials.forEach((m) => {
          Object.values(m).forEach((v) => {
            if (v && v.isTexture) v.dispose();
          });
          m.dispose();
        });
      }
    });
    model = null;
  }

  if (envMap) {
    envMap.dispose();
    envMap = null;
  }

  if (renderer) {
    renderer.dispose();
    renderer.forceContextLoss();
    renderer = null;
  }

  scene = null;
  camera = null;
  currentScale = 1;
  initialScale = 1;
  pinchStartDistance = 0;
  pinchStartScale = 1;
  orientationPermissionGranted = false;
  lastTapTime = 0;
  tapMoved = false;
  pointers.clear();
}
