/**
 * ParticleSystem — Three.js-based particle effects for game events.
 *
 * Effects:
 * - RitualCast: glowing circle of particles rising from ground
 * - BuildDust: dust puff on building placement
 * - Fireflies: ambient floating points near grass/trees at night
 * - ResourceGain: floating sparkles when resources are gained
 *
 * Uses THREE.Points for performance. Particles are pooled and recycled.
 */

import * as THREE from 'three';

interface ParticleEmitter {
  points: THREE.Points;
  positions: Float32Array;
  velocities: Float32Array;
  lifetimes: Float32Array;
  maxLifetime: Float32Array;
  colors: Float32Array;
  sizes: Float32Array;
  active: boolean;
  age: number;
  maxAge: number;
  emitRate: number;
  emitAccumulator: number;
  particleCount: number;
  gravity: number;
  fadeOut: boolean;
  position: THREE.Vector3;
  colorStart: THREE.Color;
  colorEnd: THREE.Color;
}

interface EmitterConfig {
  position: THREE.Vector3;
  colorStart: THREE.Color;
  colorEnd: THREE.Color;
  maxAge: number;
  emitRate: number;
  gravity: number;
  fadeOut: boolean;
  sizeRange: [number, number];
  speedRange: [number, number];
  spreadRadius: number;
  persistent?: boolean;
}

export class ParticleSystem {
  private scene: THREE.Scene;
  private emitters: ParticleEmitter[] = [];
  private clock = 0;

  // Shared geometry and materials (reused across emitters)
  private particleTexture: THREE.Texture | null = null;

  constructor(scene: THREE.Scene) {
    this.scene = scene;
    this.particleTexture = this.createParticleTexture();
  }

  /**
   * Create a soft circular particle texture procedurally.
   */
  private createParticleTexture(): THREE.Texture {
    const canvas = document.createElement('canvas');
    canvas.width = 64;
    canvas.height = 64;
    const ctx = canvas.getContext('2d')!;
    const gradient = ctx.createRadialGradient(32, 32, 0, 32, 32, 32);
    gradient.addColorStop(0, 'rgba(255,255,255,1)');
    gradient.addColorStop(0.3, 'rgba(255,255,255,0.6)');
    gradient.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = gradient;
    ctx.fillRect(0, 0, 64, 64);
    const texture = new THREE.CanvasTexture(canvas);
    texture.needsUpdate = true;
    return texture;
  }

  /**
   * Spawn a ritual cast effect — glowing particles rising in a circle.
   */
  spawnRitualCast(x: number, z: number): void {
    const count = 80;
    const emitter = this.createEmitter(count, {
      position: new THREE.Vector3(x, 0, z),
      colorStart: new THREE.Color(0xa855f7),
      colorEnd: new THREE.Color(0x6633aa),
      maxAge: 2.5,
      emitRate: 30,
      gravity: -0.5, // particles rise
      fadeOut: true,
      sizeRange: [0.15, 0.35],
      speedRange: [0.5, 2.0],
      spreadRadius: 1.5,
    });
    this.scene.add(emitter.points);
    this.emitters.push(emitter);
  }

  /**
   * Spawn build dust — small brown particles puffing outward.
   */
  spawnBuildDust(x: number, z: number): void {
    const count = 30;
    const emitter = this.createEmitter(count, {
      position: new THREE.Vector3(x, 0, z),
      colorStart: new THREE.Color(0xaa8866),
      colorEnd: new THREE.Color(0x664433),
      maxAge: 0.8,
      emitRate: 50,
      gravity: 0.3,
      fadeOut: true,
      sizeRange: [0.08, 0.18],
      speedRange: [0.3, 1.0],
      spreadRadius: 0.5,
    });
    this.scene.add(emitter.points);
    this.emitters.push(emitter);
  }

  /**
   * Spawn resource gain sparkles — gold floating upward.
   */
  spawnResourceGain(x: number, z: number, color: number = 0xfbbf24): void {
    const count = 15;
    const emitter = this.createEmitter(count, {
      position: new THREE.Vector3(x, 0.2, z),
      colorStart: new THREE.Color(color),
      colorEnd: new THREE.Color(color).multiplyScalar(0.5),
      maxAge: 1.2,
      emitRate: 20,
      gravity: -0.8,
      fadeOut: true,
      sizeRange: [0.1, 0.2],
      speedRange: [0.8, 1.5],
      spreadRadius: 0.3,
    });
    this.scene.add(emitter.points);
    this.emitters.push(emitter);
  }

  /**
   * Spawn ambient fireflies near a position — slow floating glowing points.
   */
  spawnFireflies(x: number, z: number, count: number = 10): void {
    const emitter = this.createEmitter(count, {
      position: new THREE.Vector3(x, 1, z),
      colorStart: new THREE.Color(0x88ff88),
      colorEnd: new THREE.Color(0x44aa44),
      maxAge: 999, // persistent
      emitRate: 0, // all particles start active
      gravity: 0,
      fadeOut: false,
      sizeRange: [0.05, 0.12],
      speedRange: [0.1, 0.3],
      spreadRadius: 3,
      persistent: true,
    });
    this.scene.add(emitter.points);
    this.emitters.push(emitter);
  }

  private createEmitter(count: number, config: EmitterConfig): ParticleEmitter {
    const positions = new Float32Array(count * 3);
    const velocities = new Float32Array(count * 3);
    const lifetimes = new Float32Array(count);
    const maxLifetimes = new Float32Array(count);
    const colors = new Float32Array(count * 3);
    const sizes = new Float32Array(count);

    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('color', new THREE.BufferAttribute(colors, 3));
    geometry.setAttribute('size', new THREE.BufferAttribute(sizes, 1));

    const material = new THREE.PointsMaterial({
      size: 0.3,
      vertexColors: true,
      transparent: true,
      opacity: 1,
      map: this.particleTexture,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      sizeAttenuation: true,
    });

    const points = new THREE.Points(geometry, material);
    points.frustumCulled = false;

    const emitter: ParticleEmitter = {
      points,
      positions,
      velocities,
      lifetimes,
      maxLifetime: maxLifetimes,
      colors,
      sizes,
      active: true,
      age: 0,
      maxAge: config.maxAge,
      emitRate: config.emitRate,
      emitAccumulator: 0,
      particleCount: count,
      gravity: config.gravity,
      fadeOut: config.fadeOut,
      position: config.position.clone(),
      colorStart: config.colorStart.clone(),
      colorEnd: config.colorEnd.clone(),
    };

    // Initialize all particles
    for (let i = 0; i < count; i++) {
      if (config.emitRate === 0 || config.persistent) {
        // Start all particles immediately
        this.spawnParticle(emitter, i, config);
      } else {
        // Start inactive (will be emitted over time)
        lifetimes[i] = 0;
        positions[i * 3] = config.position.x;
        positions[i * 3 + 1] = config.position.y;
        positions[i * 3 + 2] = config.position.z;
      }
    }

    return emitter;
  }

  private spawnParticle(emitter: ParticleEmitter, index: number, config: EmitterConfig): void {
    const i = index;
    const r = config.spreadRadius;
    const angle = Math.random() * Math.PI * 2;
    const dist = Math.random() * r;
    const speed = config.speedRange[0] + Math.random() * (config.speedRange[1] - config.speedRange[0]);
    const size = config.sizeRange[0] + Math.random() * (config.sizeRange[1] - config.sizeRange[0]);

    emitter.positions[i * 3] = emitter.position.x + Math.cos(angle) * dist;
    emitter.positions[i * 3 + 1] = emitter.position.y + Math.random() * 0.5;
    emitter.positions[i * 3 + 2] = emitter.position.z + Math.sin(angle) * dist;

    const velAngle = Math.random() * Math.PI * 2;
    emitter.velocities[i * 3] = Math.cos(velAngle) * speed * 0.3;
    emitter.velocities[i * 3 + 1] = speed * (config.gravity < 0 ? 1 : 0.5) + Math.random() * 0.5;
    emitter.velocities[i * 3 + 2] = Math.sin(velAngle) * speed * 0.3;

    emitter.lifetimes[i] = 0;
    emitter.maxLifetime[i] = config.maxAge === 999 ? 999 : config.maxAge * (0.7 + Math.random() * 0.6);
    emitter.sizes[i] = size;

    // Set initial color
    emitter.colors[i * 3] = emitter.colorStart.r;
    emitter.colors[i * 3 + 1] = emitter.colorStart.g;
    emitter.colors[i * 3 + 2] = emitter.colorStart.b;
  }

  /**
   * Update all particle emitters. Call each frame.
   */
  update(dt: number): void {
    this.clock += dt;

    for (let e = this.emitters.length - 1; e >= 0; e--) {
      const emitter = this.emitters[e];
      if (!emitter.active) continue;

      emitter.age += dt;
      const geom = emitter.points.geometry;
      const posAttr = geom.getAttribute('position') as THREE.BufferAttribute;
      const colAttr = geom.getAttribute('color') as THREE.BufferAttribute;

      let allDead = true;

      for (let i = 0; i < emitter.particleCount; i++) {
        if (emitter.lifetimes[i] >= emitter.maxLifetime[i]) {
          // Particle is dead — skip
          if (emitter.emitRate > 0 && emitter.age < emitter.maxAge) {
            // Respawn with emitter's original config
            this.spawnParticle(emitter, i, {
              position: emitter.position,
              colorStart: emitter.colorStart,
              colorEnd: emitter.colorEnd,
              maxAge: emitter.maxAge,
              emitRate: emitter.emitRate,
              gravity: emitter.gravity,
              fadeOut: emitter.fadeOut,
              sizeRange: [0.1, 0.3],
              speedRange: [0.5, 2],
              spreadRadius: 1.5,
            });
            allDead = false;
          }
          continue;
        }

        allDead = false;
        emitter.lifetimes[i] += dt;

        // Apply velocity
        emitter.positions[i * 3] += emitter.velocities[i * 3] * dt;
        emitter.positions[i * 3 + 1] += emitter.velocities[i * 3 + 1] * dt;
        emitter.positions[i * 3 + 2] += emitter.velocities[i * 3 + 2] * dt;

        // Apply gravity
        emitter.velocities[i * 3 + 1] += emitter.gravity * dt;

        // Fade color
        const t = emitter.lifetimes[i] / emitter.maxLifetime[i];
        if (t <= 1) {
          const r = emitter.colorStart.r + (emitter.colorEnd.r - emitter.colorStart.r) * t;
          const g = emitter.colorStart.g + (emitter.colorEnd.g - emitter.colorStart.g) * t;
          const b = emitter.colorStart.b + (emitter.colorEnd.b - emitter.colorStart.b) * t;
          emitter.colors[i * 3] = r;
          emitter.colors[i * 3 + 1] = g;
          emitter.colors[i * 3 + 2] = b;
        }

        // Fade out opacity
        if (emitter.fadeOut) {
          const remaining = 1 - t;
          (emitter.points.material as THREE.PointsMaterial).opacity = remaining;
        }
      }

      posAttr.needsUpdate = true;
      colAttr.needsUpdate = true;

      // Remove dead non-persistent emitters
      if (allDead && emitter.maxAge < 999) {
        this.scene.remove(emitter.points);
        emitter.points.geometry.dispose();
        (emitter.points.material as THREE.Material).dispose();
        this.emitters.splice(e, 1);
      }
    }
  }

  /**
   * Clear all particle effects.
   */
  clear(): void {
    for (const emitter of this.emitters) {
      this.scene.remove(emitter.points);
      emitter.points.geometry.dispose();
      (emitter.points.material as THREE.Material).dispose();
    }
    this.emitters = [];
  }

  dispose(): void {
    this.clear();
    this.particleTexture?.dispose();
  }
}