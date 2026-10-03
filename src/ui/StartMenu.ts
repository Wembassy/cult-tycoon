/**
 * StartMenu — DOM-based main menu overlay shown on game start.
 * Dark fantasy theme with animated particle background.
 */

export interface StartMenuCallbacks {
  onNewGame: () => void;
  onContinue: () => void;
  onSettings: () => void;
  onQuit: () => void;
}

export class StartMenu {
  private container: HTMLDivElement;
  private particleCanvas: HTMLCanvasElement | null = null;
  private particleAnimId = 0;
  private particles: { x: number; y: number; vx: number; vy: number; size: number; alpha: number; hue: number }[] = [];
  private callbacks: StartMenuCallbacks;
  private _isVisible = false;

  constructor(callbacks: StartMenuCallbacks) {
    this.callbacks = callbacks;
    this.container = document.createElement('div');
    this.container.id = 'start-menu';
    this.injectStyles();
    this.buildDOM();
    this.startParticles();
  }

  private injectStyles(): void {
    if (document.getElementById('start-menu-styles')) return;
    const style = document.createElement('style');
    style.id = 'start-menu-styles';
    style.textContent = `
      #start-menu {
        position: fixed;
        inset: 0;
        z-index: 1000;
        display: flex;
        flex-direction: column;
        align-items: center;
        justify-content: center;
        background: radial-gradient(ellipse at center, #1a0a2e 0%, #0a0515 55%, #050208 100%);
                        background-position: center;
        font-family: 'Cinzel', 'Times New Roman', Georgia, serif;
        color: #d4af37;
        user-select: none;
        overflow: hidden;
              }

      #start-menu.hidden {
        display: none;
      }

      #start-menu .sm-particle-canvas {
        position: absolute;
        inset: 0;
        pointer-events: none;
        opacity: 0.6;
      }

      #start-menu .sm-vignette {
        position: absolute;
        inset: 0;
        pointer-events: none;
        background: radial-gradient(ellipse at center, transparent 30%, rgba(0,0,0,0.6) 100%);
      }

      #start-menu .sm-content {
        position: relative;
        z-index: 2;
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 40px;
        animation: sm-fade-in 1.2s ease-out;
      }

      @keyframes sm-fade-in {
        from { opacity: 0; transform: translateY(20px); }
        to { opacity: 1; transform: translateY(0); }
      }

      #start-menu .sm-title-wrap {
        text-align: center;
        position: relative;
      }

      #start-menu .sm-title {
        font-size: 72px;
        font-weight: 900;
        letter-spacing: 12px;
        margin: 0;
        background: linear-gradient(180deg, #f4d03f 0%, #d4af37 40%, #b8860b 60%, #8b6914 100%);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        text-shadow: 0 0 40px rgba(212, 175, 55, 0.3);
        filter: drop-shadow(0 4px 12px rgba(0,0,0,0.8));
        line-height: 1;
      }

      #start-menu .sm-subtitle {
        font-size: 16px;
        letter-spacing: 6px;
        color: #8a6d3b;
        margin-top: 8px;
        font-style: italic;
        font-weight: 400;
      }

      #start-menu .sm-title-divider {
        width: 200px;
        height: 1px;
        margin: 16px auto 0;
        background: linear-gradient(90deg, transparent, #d4af37, transparent);
      }

      #start-menu .sm-buttons {
        display: flex;
        flex-direction: column;
        gap: 14px;
        min-width: 280px;
      }

      #start-menu .sm-btn {
        padding: 14px 48px;
        font-family: 'Cinzel', 'Times New Roman', Georgia, serif;
        font-size: 18px;
        font-weight: 600;
        letter-spacing: 3px;
        color: #d4af37;
        background: rgba(20,14,34,0.90);
                        border: 1px solid rgba(212, 175, 55, 0.3);
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.25s ease;
        text-transform: uppercase;
        position: relative;
        overflow: hidden;
              }

      #start-menu .sm-btn::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent, rgba(212, 175, 55, 0.15), transparent);
        transform: translateX(-100%);
        transition: transform 0.5s ease;
      }

      #start-menu .sm-btn:hover {
        color: #f4d03f;
        border-color: rgba(212, 175, 55, 0.6);
        background: linear-gradient(180deg, rgba(50, 30, 70, 0.9), rgba(25, 15, 40, 0.95));
        box-shadow: 0 0 20px rgba(212, 175, 55, 0.2), inset 0 0 20px rgba(212, 175, 55, 0.05);
        transform: translateY(-1px);
      }

      #start-menu .sm-btn:hover::before {
        transform: translateX(100%);
      }

      #start-menu .sm-btn:active {
        transform: translateY(0);
      }

      #start-menu .sm-btn.sm-btn-primary {
        background: linear-gradient(180deg, rgba(60, 40, 80, 0.9), rgba(30, 20, 50, 0.95));
        border-color: rgba(168, 85, 247, 0.4);
        color: #c4a0e8;
      }

      #start-menu .sm-btn.sm-btn-primary:hover {
        color: #d4af37;
        border-color: rgba(212, 175, 55, 0.6);
        box-shadow: 0 0 25px rgba(168, 85, 247, 0.3);
      }

      #start-menu .sm-btn:disabled {
        opacity: 0.4;
        cursor: not-allowed;
        color: #555;
      }

      #start-menu .sm-btn:disabled:hover {
        background: linear-gradient(180deg, rgba(30, 20, 50, 0.8), rgba(15, 10, 30, 0.9));
        border-color: rgba(212, 175, 55, 0.2);
        box-shadow: none;
        transform: none;
      }

      #start-menu .sm-footer {
        position: absolute;
        bottom: 20px;
        font-size: 11px;
        color: #444;
        letter-spacing: 2px;
        font-family: sans-serif;
      }

      /* Floating ember particles */
      @keyframes sm-ember {
        0% { opacity: 0; transform: translateY(0) scale(1); }
        20% { opacity: 0.8; }
        100% { opacity: 0; transform: translateY(-300px) scale(0.3); }
      }

      #start-menu .sm-ember {
        position: absolute;
        width: 3px;
        height: 3px;
        border-radius: 50%;
        background: #d4af37;
        box-shadow: 0 0 6px #d4af37;
        animation: sm-ember 4s ease-out infinite;
      }
    `;
    document.head.appendChild(style);
  }

  private buildDOM(): void {
    this.container.innerHTML = `
      <canvas class="sm-particle-canvas"></canvas>
      <div class="sm-vignette"></div>
      <div class="sm-content">
        <div class="sm-title-wrap">
          <h1 class="sm-title">CULT TYCOON</h1>
          <div class="sm-subtitle">Build Your Following. Bend Reality.</div>
          <div class="sm-title-divider"></div>
        </div>
        <div class="sm-buttons">
          <button class="sm-btn sm-btn-primary" data-action="new-game">New Game</button>
          <button class="sm-btn" data-action="continue" disabled>Continue</button>
          <button class="sm-btn" data-action="settings">Settings</button>
          <button class="sm-btn" data-action="quit">Quit</button>
        </div>
      </div>
      <div class="sm-footer">v0.1.0 — Pre-Alpha</div>
    `;

    // Wire up buttons
    this.container.querySelectorAll('.sm-btn').forEach(btn => {
      btn.addEventListener('click', (e) => {
        const action = (e.currentTarget as HTMLElement).dataset.action;
        switch (action) {
          case 'new-game': this.callbacks.onNewGame(); break;
          case 'continue': this.callbacks.onContinue(); break;
          case 'settings': this.callbacks.onSettings(); break;
          case 'quit': this.callbacks.onQuit(); break;
        }
      });
    });

    // Spawn ember elements
    const contentEl = this.container.querySelector('.sm-content') as HTMLElement;
    if (contentEl) {
      for (let i = 0; i < 12; i++) {
        const ember = document.createElement('div');
        ember.className = 'sm-ember';
        ember.style.left = `${Math.random() * 100}%`;
        ember.style.bottom = `${Math.random() * 30}%`;
        ember.style.animationDelay = `${Math.random() * 4}s`;
        ember.style.animationDuration = `${3 + Math.random() * 3}s`;
        this.container.appendChild(ember);
      }
    }

    this.particleCanvas = this.container.querySelector('.sm-particle-canvas');
  }

  private startParticles(): void {
    if (!this.particleCanvas) return;
    const ctx = this.particleCanvas.getContext('2d');
    if (!ctx) return;

    const resize = () => {
      this.particleCanvas!.width = window.innerWidth;
      this.particleCanvas!.height = window.innerHeight;
    };
    resize();
    window.addEventListener('resize', resize);

    // Initialize particles
    const particleCount = 60;
    this.particles = [];
    for (let i = 0; i < particleCount; i++) {
      this.particles.push({
        x: Math.random() * window.innerWidth,
        y: Math.random() * window.innerHeight,
        vx: (Math.random() - 0.5) * 0.3,
        vy: (Math.random() - 0.5) * 0.3,
        size: Math.random() * 2 + 0.5,
        alpha: Math.random() * 0.5 + 0.1,
        hue: Math.random() * 40 + 30, // gold-ish range
      });
    }

    const animate = () => {
      if (!this._isVisible || !ctx || !this.particleCanvas) return;
      ctx.clearRect(0, 0, this.particleCanvas.width, this.particleCanvas.height);

      for (const p of this.particles) {
        p.x += p.vx;
        p.y += p.vy;
        // Wrap edges
        if (p.x < 0) p.x = this.particleCanvas.width;
        if (p.x > this.particleCanvas.width) p.x = 0;
        if (p.y < 0) p.y = this.particleCanvas.height;
        if (p.y > this.particleCanvas.height) p.y = 0;

        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size, 0, Math.PI * 2);
        ctx.fillStyle = `hsla(${p.hue}, 70%, 50%, ${p.alpha})`;
        ctx.fill();

        // Glow
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size * 3, 0, Math.PI * 2);
        const grad = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size * 3);
        grad.addColorStop(0, `hsla(${p.hue}, 70%, 50%, ${p.alpha * 0.3})`);
        grad.addColorStop(1, `hsla(${p.hue}, 70%, 50%, 0)`);
        ctx.fillStyle = grad;
        ctx.fill();
      }

      this.particleAnimId = requestAnimationFrame(animate);
    };
    animate();
  }

  show(): void {
    this._isVisible = true;
    this.container.classList.remove('hidden');
    this.startParticles();
  }

  hide(): void {
    this._isVisible = false;
    this.container.classList.add('hidden');
    if (this.particleAnimId) {
      cancelAnimationFrame(this.particleAnimId);
      this.particleAnimId = 0;
    }
  }

  setCanContinue(can: boolean): void {
    const btn = this.container.querySelector('[data-action="continue"]') as HTMLButtonElement;
    if (btn) btn.disabled = !can;
  }

  get isVisible(): boolean {
    return this._isVisible;
  }

  mount(parent?: HTMLElement): void {
    (parent ?? document.body).appendChild(this.container);
  }

  destroy(): void {
    this._isVisible = false;
    if (this.particleAnimId) cancelAnimationFrame(this.particleAnimId);
    this.container.remove();
  }
}