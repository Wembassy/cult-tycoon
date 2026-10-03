/**
 * PauseMenu — Pause overlay shown when Esc is pressed during gameplay.
 * Semi-transparent dark overlay with resume, settings, save, and main menu buttons.
 */

export interface PauseMenuCallbacks {
  onResume: () => void;
  onSettings: () => void;
  onSave: () => void;
  onMainMenu: () => void;
}

export class PauseMenu {
  private container: HTMLDivElement;
  private callbacks: PauseMenuCallbacks;
  private _isVisible = false;

  constructor(callbacks: PauseMenuCallbacks) {
    this.callbacks = callbacks;
    this.container = document.createElement('div');
    this.container.id = 'pause-menu';
    this.injectStyles();
    this.buildDOM();
  }

  private injectStyles(): void {
    if (document.getElementById('pause-menu-styles')) return;
    const style = document.createElement('style');
    style.id = 'pause-menu-styles';
    style.textContent = `
      #pause-menu {
        position: fixed;
        inset: 0;
        z-index: 1050;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(5, 2, 10, 0.75);
        backdrop-filter: blur(6px);
        font-family: 'Cinzel', 'Times New Roman', Georgia, serif;
        color: #d4af37;
        user-select: none;
      }

      #pause-menu.hidden {
        display: none;
      }

      #pause-menu .pm-panel {
        display: flex;
        flex-direction: column;
        align-items: center;
        gap: 24px;
        padding: 48px 64px;
        background: rgba(18,12,30,0.96);
                        border: 1px solid rgba(212, 175, 55, 0.25);
        border-radius: 8px;
        box-shadow: 0 0 40px rgba(0,0,0,0.8), 0 0 80px rgba(168, 85, 247, 0.08);
        animation: pm-slide-in 0.25s ease-out;
              }

      @keyframes pm-slide-in {
        from { opacity: 0; transform: scale(0.95); }
        to { opacity: 1; transform: scale(1); }
      }

      #pause-menu .pm-title {
        font-size: 36px;
        font-weight: 700;
        letter-spacing: 8px;
        margin: 0;
        background: linear-gradient(180deg, #f4d03f 0%, #d4af37 50%, #8b6914 100%);
        -webkit-background-clip: text;
        background-clip: text;
        -webkit-text-fill-color: transparent;
        filter: drop-shadow(0 2px 8px rgba(0,0,0,0.6));
      }

      #pause-menu .pm-divider {
        width: 120px;
        height: 1px;
        background: linear-gradient(90deg, transparent, #d4af37, transparent);
        margin: -8px 0 8px;
      }

      #pause-menu .pm-buttons {
        display: flex;
        flex-direction: column;
        gap: 12px;
        min-width: 240px;
      }

      #pause-menu .pm-btn {
        padding: 12px 40px;
        font-family: 'Cinzel', 'Times New Roman', Georgia, serif;
        font-size: 16px;
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

      #pause-menu .pm-btn::before {
        content: '';
        position: absolute;
        inset: 0;
        background: linear-gradient(90deg, transparent, rgba(212, 175, 55, 0.12), transparent);
        transform: translateX(-100%);
        transition: transform 0.5s ease;
      }

      #pause-menu .pm-btn:hover {
        color: #f4d03f;
        border-color: rgba(212, 175, 55, 0.6);
        background: linear-gradient(180deg, rgba(50, 30, 70, 0.9), rgba(25, 15, 40, 0.95));
        box-shadow: 0 0 20px rgba(212, 175, 55, 0.2);
        transform: translateY(-1px);
      }

      #pause-menu .pm-btn:hover::before {
        transform: translateX(100%);
      }

      #pause-menu .pm-btn:active {
        transform: translateY(0);
      }

      #pause-menu .pm-btn.pm-btn-primary {
        background: linear-gradient(180deg, rgba(60, 40, 80, 0.9), rgba(30, 20, 50, 0.95));
        border-color: rgba(168, 85, 247, 0.4);
        color: #c4a0e8;
      }

      #pause-menu .pm-btn.pm-btn-primary:hover {
        color: #d4af37;
        border-color: rgba(212, 175, 55, 0.6);
        box-shadow: 0 0 25px rgba(168, 85, 247, 0.2);
      }

      #pause-menu .pm-btn.pm-btn-danger {
        color: #a05050;
        border-color: rgba(160, 80, 80, 0.3);
      }

      #pause-menu .pm-btn.pm-btn-danger:hover {
        color: #d47070;
        border-color: rgba(180, 90, 90, 0.5);
        background: linear-gradient(180deg, rgba(50, 20, 20, 0.9), rgba(30, 10, 10, 0.95));
        box-shadow: 0 0 20px rgba(160, 80, 80, 0.15);
      }
    `;
    document.head.appendChild(style);
  }

  private buildDOM(): void {
    this.container.innerHTML = `
      <div class="pm-panel">
        <h2 class="pm-title">PAUSED</h2>
        <div class="pm-divider"></div>
        <div class="pm-buttons">
          <button class="pm-btn pm-btn-primary" data-action="resume">Resume</button>
          <button class="pm-btn" data-action="settings">Settings</button>
          <button class="pm-btn" data-action="save">Save Game</button>
          <button class="pm-btn pm-btn-danger" data-action="main-menu">Main Menu</button>
        </div>
      </div>
    `;

    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.dataset.action;
      switch (action) {
        case 'resume': this.callbacks.onResume(); break;
        case 'settings': this.callbacks.onSettings(); break;
        case 'save': this.callbacks.onSave(); break;
        case 'main-menu': this.callbacks.onMainMenu(); break;
      }
    });
  }

  show(): void {
    this._isVisible = true;
    this.container.classList.remove('hidden');
  }

  hide(): void {
    this._isVisible = false;
    this.container.classList.add('hidden');
  }

  get isVisible(): boolean {
    return this._isVisible;
  }

  mount(parent?: HTMLElement): void {
    (parent ?? document.body).appendChild(this.container);
  }

  destroy(): void {
    this.container.remove();
  }
}