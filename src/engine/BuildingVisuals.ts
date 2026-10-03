/** Small, readable models authored for the compound. Geometry is owned by each group. */
import * as THREE from 'three';

const PALETTE = {
  wood: 0x79543a,
  dark: 0x3c493d,
  linen: 0xe7d9b7,
  green: 0x527365,
  metal: 0x39434b,
  brass: 0xb39a58,
  stone: 0x8f958b,
  soil: 0x543f2a,
  purple: 0x785b73,
};
export function createBuildingVisual(id: string): THREE.Group {
  const group = new THREE.Group();
  group.name = `furniture:${id}`;
  const add = (
    geometry: THREE.BufferGeometry,
    color: number,
    x: number,
    y: number,
    z: number,
    glow = 0,
  ) => {
    const material = new THREE.MeshStandardMaterial({
      color,
      roughness: 0.85,
      flatShading: true,
      emissive: glow ? color : 0,
      emissiveIntensity: glow,
    });
    const mesh = new THREE.Mesh(geometry, material);
    mesh.position.set(x, y, z);
    mesh.castShadow = true;
    mesh.receiveShadow = true;
    group.add(mesh);
    return mesh;
  };
  const box = (w: number, h: number, d: number, color: number, x = 0, y = h / 2, z = 0) =>
    add(new THREE.BoxGeometry(w, h, d), color, x, y, z);
  const cyl = (r: number, h: number, color: number, x = 0, y = h / 2, z = 0) =>
    add(new THREE.CylinderGeometry(r, r, h, 10), color, x, y, z);
  const ball = (r: number, color: number, x = 0, y = r, z = 0, glow = 0) =>
    add(new THREE.IcosahedronGeometry(r, 1), color, x, y, z, glow);
  const candle = (x: number, y: number, z: number) => {
    cyl(0.045, 0.2, PALETTE.linen, x, y + 0.1, z);
    ball(0.046, 0xffcc68, x, y + 0.23, z, 1.1);
  };
  const table = (w = 0.88, d = 0.72, y = 0.62) => {
    box(w, 0.1, d, PALETTE.wood, 0, y, 0);
    for (const x of [-w * 0.4, w * 0.4])
      for (const z of [-d * 0.4, d * 0.4]) box(0.075, y, 0.075, PALETTE.dark, x, y / 2, z);
  };
  const bookshelf = () => {
    box(0.9, 1.25, 0.28, PALETTE.wood, 0, 0.625, 0.25);
    for (const y of [0.18, 0.55, 0.92]) {
      box(0.9, 0.07, 0.4, PALETTE.dark, 0, y, 0.2);
      for (let i = 0; i < 6; i++)
        box(
          0.085,
          0.24 + (i % 2) * 0.07,
          0.19,
          [0x824e43, 0x465c67, 0x819067][i % 3],
          -0.33 + i * 0.13,
          y + 0.16,
          0.08,
        );
    }
  };
  if (['bed', 'bunk_bed', 'better_bed'].includes(id)) {
    const mattress = (y: number) => {
      box(0.83, 0.1, 1.78, PALETTE.wood, 0, y, 0);
      box(0.77, 0.16, 1.69, PALETTE.linen, 0, y + 0.13, 0);
      box(0.77, 0.035, 1.02, PALETTE.green, 0, y + 0.23, 0.28);
      box(0.56, 0.09, 0.3, 0xf3e8cf, 0, y + 0.25, -0.57);
    };
    for (const x of [-0.35, 0.35])
      for (const z of [-0.82, 0.82]) box(0.08, 0.38, 0.08, PALETTE.dark, x, 0.19, z);
    mattress(0.26);
    box(0.88, 0.58, 0.1, PALETTE.wood, 0, 0.37, -0.86);
    if (id === 'bunk_bed') {
      for (const x of [-0.37, 0.37])
        for (const z of [-0.84, 0.84]) box(0.07, 1.3, 0.07, PALETTE.wood, x, 0.65, z);
      mattress(1.08);
      for (const y of [0.3, 0.55, 0.8, 1.05]) box(0.34, 0.055, 0.055, PALETTE.linen, 0.24, y, 0.93);
    }
  } else if (['altar', 'sacrificial_altar'].includes(id)) {
    const wide = id === 'sacrificial_altar';
    box(1.7, 0.16, wide ? 1.7 : 0.78, PALETTE.stone);
    box(1.4, 0.57, wide ? 1.3 : 0.64, PALETTE.dark, 0, 0.42, 0);
    box(1.75, 0.13, wide ? 1.55 : 0.88, PALETTE.stone, 0, 0.75, 0);
    box(0.61, 0.025, wide ? 1.5 : 0.85, PALETTE.purple, 0, 0.83, 0);
    for (const x of [-0.68, 0.68]) candle(x, 0.83, 0);
    const gem = add(new THREE.OctahedronGeometry(0.14), PALETTE.brass, 0, 0.95, 0, 0.25);
    gem.rotation.z = 0.2;
  } else if (['cookpot', 'cauldron'].includes(id)) {
    box(0.83, 0.18, 0.83, PALETTE.stone);
    for (const x of [-0.24, 0.24]) box(0.065, 0.41, 0.065, PALETTE.dark, x, 0.33, 0);
    cyl(0.32, 0.32, PALETTE.metal, 0, 0.5, 0);
    cyl(0.275, 0.018, 0xc09451, 0, 0.67, 0);
    const rim = add(new THREE.TorusGeometry(0.32, 0.035, 5, 12), PALETTE.dark, 0, 0.67, 0);
    rim.rotation.x = Math.PI / 2;
    box(0.065, 0.53, 0.065, PALETTE.wood, 0.17, 0.86, 0.06).rotation.z = 0.35;
    ball(0.1, 0xff9b4a, 0, 0.23, 0, 0.9);
  } else if (id === 'research_desk') {
    table();
    box(0.3, 0.025, 0.31, PALETTE.linen, -0.18, 0.69, 0).rotation.y = 0.2;
    box(0.23, 0.07, 0.29, 0x835a48, 0.15, 0.69, -0.06);
    candle(0.32, 0.67, 0.18);
    box(0.4, 0.07, 0.35, PALETTE.wood, 0, 0.3, 0.53);
    for (const x of [-0.15, 0.15]) box(0.06, 0.29, 0.06, PALETTE.dark, x, 0.15, 0.53);
  } else if (['library_shelf', 'decor_bookshelf'].includes(id)) {
    bookshelf();
  } else if (['storage_box', 'warehouse'].includes(id)) {
    const crate = (x: number, z: number) => {
      box(0.74, 0.57, 0.72, PALETTE.wood, x, 0.285, z);
      for (const xx of [-0.27, 0.27]) box(0.055, 0.59, 0.74, PALETTE.dark, x + xx, 0.3, z);
      box(0.72, 0.06, 0.7, 0x987451, x, 0.59, z);
      box(0.16, 0.1, 0.035, PALETTE.brass, x, 0.34, z + 0.37);
    };
    if (id === 'warehouse')
      for (const x of [-0.45, 0.45]) for (const z of [-0.45, 0.45]) crate(x, z);
    else crate(0, 0);
  } else if (id === 'toilet') {
    box(0.36, 0.22, 0.36, PALETTE.linen, 0, 0.11, 0.1);
    cyl(0.27, 0.24, 0xe3e6dc, 0, 0.35, 0.12);
    const seat = add(new THREE.TorusGeometry(0.23, 0.052, 6, 12), 0xf5f1df, 0, 0.49, 0.12);
    seat.rotation.x = Math.PI / 2;
    box(0.5, 0.46, 0.21, 0xe9e7d7, 0, 0.45, -0.24);
    box(0.51, 0.05, 0.24, PALETTE.linen, 0, 0.7, -0.24);
    box(0.08, 0.035, 0.04, PALETTE.brass, 0.16, 0.56, -0.35);
  } else if (id === 'shower') {
    box(0.86, 0.065, 0.86, PALETTE.stone);
    box(0.84, 0.9, 0.07, 0xb5cbbd, 0, 0.48, 0.4);
    box(0.055, 1.5, 0.055, PALETTE.metal, 0.25, 0.76, 0.33);
    box(0.06, 0.055, 0.45, PALETTE.metal, 0.25, 1.5, 0.12);
    cyl(0.1, 0.05, PALETTE.brass, 0.25, 1.45, -0.08);
    cyl(0.055, 0.015, PALETTE.metal, 0, 0.044, 0);
  } else if (['meditation_mat', 'decor_rug'].includes(id)) {
    box(0.9, 0.04, 0.88, PALETTE.purple);
    box(0.74, 0.02, 0.71, PALETTE.linen, 0, 0.049, 0);
    box(0.65, 0.025, 0.62, PALETTE.green, 0, 0.062, 0);
    cyl(0.19, 0.08, PALETTE.linen, 0, 0.12, 0);
  } else if (['garden_plot', 'farm_plot', 'zen_garden', 'decor_plant'].includes(id)) {
    const wide = id === 'farm_plot';
    const w = wide ? 1.85 : 0.87,
      d = wide ? 1.85 : 0.87;
    box(w, 0.17, d, PALETTE.wood);
    box(w - 0.12, 0.018, d - 0.12, PALETTE.soil, 0, 0.18, 0);
    const rows = wide ? 4 : 2;
    for (let z = 0; z < rows; z++)
      for (let x = 0; x < rows; x++) {
        const xx = (x / (rows - 1) - 0.5) * (w - 0.35),
          zz = (z / (rows - 1) - 0.5) * (d - 0.35);
        if (id === 'zen_garden') ball(0.14, PALETTE.stone, xx, 0.27, zz);
        else {
          box(0.035, 0.2, 0.035, PALETTE.dark, xx, 0.28, zz);
          ball(0.12, 0x6f914d, xx, 0.39, zz);
        }
      }
  } else if (
    ['torch', 'bonfire', 'decor_lamp', 'candle', 'decor_candle_set', 'incense_burner'].includes(id)
  ) {
    if (id === 'bonfire') {
      cyl(0.4, 0.1, PALETTE.stone);
      for (const angle of [0, Math.PI / 3, (Math.PI * 2) / 3])
        box(0.7, 0.1, 0.11, PALETTE.wood, 0, 0.17, 0).rotation.y = angle;
      add(new THREE.ConeGeometry(0.22, 0.48, 7), 0xe59544, 0, 0.42, 0, 0.8);
      add(new THREE.ConeGeometry(0.11, 0.3, 6), 0xffdd86, 0, 0.33, 0, 1.1);
    } else if (id === 'torch' || id === 'decor_lamp') {
      cyl(0.12, 0.1, PALETTE.stone);
      cyl(0.055, 1.03, PALETTE.wood, 0, 0.56, 0);
      cyl(0.14, 0.2, PALETTE.metal, 0, 1.09, 0);
      ball(0.1, 0xffcb76, 0, 1.22, 0, 1);
    } else {
      cyl(0.32, 0.18, PALETTE.wood);
      candle(-0.16, 0.18, -0.08);
      candle(0.16, 0.18, -0.08);
      candle(0, 0.18, 0.16);
    }
  } else if (['statue', 'decor_statue', 'decor_ornament'].includes(id)) {
    box(0.68, 0.18, 0.68, PALETTE.stone);
    cyl(0.23, 0.53, PALETTE.stone, 0, 0.44, 0);
    ball(0.19, PALETTE.linen, 0, 0.86, 0);
    add(new THREE.ConeGeometry(0.26, 0.34, 7), PALETTE.stone, 0, 0.91, 0);
  } else if (id === 'decor_painting') {
    box(0.74, 0.7, 0.08, PALETTE.wood, 0, 0.7, 0);
    box(0.6, 0.57, 0.015, 0xa8bc96, 0, 0.7, -0.045);
    ball(0.1, PALETTE.brass, 0.14, 0.83, -0.061);
    for (const x of [-0.22, 0.22]) box(0.055, 0.42, 0.055, PALETTE.dark, x, 0.21, 0);
  } else if (['offering_bowl', 'prayer_beads'].includes(id)) {
    cyl(0.3, 0.14, PALETTE.brass);
    cyl(0.22, 0.02, PALETTE.purple, 0, 0.15, 0);
    for (let i = 0; i < 6; i++)
      ball(0.045, PALETTE.linen, 0.17 * Math.cos(i), 0.18, 0.17 * Math.sin(i));
  } else if (id === 'watch_tower') {
    for (const x of [-0.65, 0.65])
      for (const z of [-0.65, 0.65]) box(0.13, 1.8, 0.13, PALETTE.wood, x, 0.9, z);
    box(1.6, 0.14, 1.6, PALETTE.wood, 0, 1.75, 0);
    for (const z of [-0.7, 0.7]) box(1.5, 0.38, 0.06, PALETTE.dark, 0, 2.03, z);
    add(new THREE.ConeGeometry(1.2, 0.65, 4), PALETTE.green, 0, 2.6, 0).rotation.y = Math.PI / 4;
  } else box(0.82, 0.12, 0.82, PALETTE.stone);
  return group;
}
