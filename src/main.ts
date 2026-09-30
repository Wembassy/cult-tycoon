import * as THREE from 'three';
import { IsoCamera } from './engine/IsoCamera';

function init(): void {
  const canvas = document.getElementById('game-canvas') as HTMLCanvasElement;
  if (!canvas) throw new Error('Canvas element #game-canvas not found');
  canvas.tabIndex = 0;
  canvas.style.outline = 'none';

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1a2e);

  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio);

  scene.add(new THREE.AmbientLight(0xffffff, 0.6));
  const dirLight = new THREE.DirectionalLight(0xffffff, 0.8);
  dirLight.position.set(10, 20, 15);
  scene.add(dirLight);

  const gridSize = 20;
  scene.add(new THREE.GridHelper(gridSize, gridSize, 0x444466, 0x2a2a44));
  const plane = new THREE.Mesh(
    new THREE.PlaneGeometry(gridSize, gridSize),
    new THREE.MeshStandardMaterial({ color: 0x222238, transparent: true, opacity: 0.8 }),
  );
  plane.rotation.x = -Math.PI / 2;
  plane.position.y = -0.01;
  scene.add(plane);

  const tileColors = [0x3a5a8a, 0x5a3a8a, 0x8a3a5a, 0x3a8a5a];
  const corners = [
    { x: 0, z: 0 }, { x: gridSize - 1, z: 0 },
    { x: 0, z: gridSize - 1 }, { x: gridSize - 1, z: gridSize - 1 },
  ];
  corners.forEach((c, i) => {
    const tile = new THREE.Mesh(
      new THREE.BoxGeometry(0.9, 0.1, 0.9),
      new THREE.MeshStandardMaterial({ color: tileColors[i] }),
    );
    tile.position.set(c.x - gridSize / 2 + 0.5, 0.05, c.z - gridSize / 2 + 0.5);
    scene.add(tile);
  });

  const centerMarker = new THREE.Mesh(
    new THREE.BoxGeometry(1, 0.5, 1),
    new THREE.MeshStandardMaterial({ color: 0xdaa520 }),
  );
  centerMarker.position.set(0, 0.25, 0);
  scene.add(centerMarker);

  const isoCamera = new IsoCamera(canvas);
  canvas.focus();

  const hud = document.createElement('div');
  Object.assign(hud.style, {
    position: 'fixed', top: '10px', left: '10px', color: '#ccc',
    fontFamily: 'monospace', fontSize: '14px', pointerEvents: 'none', zIndex: '10',
  });
  hud.innerHTML = '<div>Isometric Camera Demo</div><div style="margin-top:4px;opacity:0.7"><b>WASD</b> — Pan | <b>Q/E</b> — Rotate | <b>Wheel</b> — Zoom</div><div id="cam-info" style="margin-top:6px;opacity:0.6"></div>';
  document.body.appendChild(hud);
  const camInfo = hud.querySelector('#cam-info') as HTMLDivElement;

  const mouse = new THREE.Vector2();
  window.addEventListener('mousemove', (e) => { mouse.x = e.clientX; mouse.y = e.clientY; });

  let lastTime = performance.now();
  function animate(): void {
    requestAnimationFrame(animate);
    const now = performance.now();
    const dt = Math.min((now - lastTime) / 1000, 0.25);
    lastTime = now;
    isoCamera.update(dt);
    const tile = isoCamera.screenToTile(mouse.x, mouse.y);
    camInfo.textContent = `Zoom: ${isoCamera.getZoom().toFixed(2)}x | Rotation: ${isoCamera.getRotationStep() * 90}° | Tile: (${tile.x}, ${tile.y})`;
    renderer.render(scene, isoCamera.camera);
  }
  animate();
}

if (document.readyState === 'loading') {
  document.addEventListener('DOMContentLoaded', init);
} else {
  init();
}
