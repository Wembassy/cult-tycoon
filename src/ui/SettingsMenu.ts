/**
 * SettingsMenu — Settings panel with volume, graphics, camera, and keybindings.
 * Dark fantasy themed. Accessible from Start Menu and Pause Menu.
 */

export type GraphicsQuality = 'low' | 'medium' | 'high';

export interface SettingsData {
  masterVolume: number;   // 0-100
  sfxVolume: number;      // 0-100
  graphicsQuality: GraphicsQuality;
  cameraSnap: boolean;
}

export interface SettingsMenuCallbacks {
  onApply: (data: SettingsData) => void;
  onClose: () => void;
}

export class SettingsMenu {
  private container: HTMLDivElement;
  private callbacks: SettingsMenuCallbacks;
  private _isVisible = false;
  private data: SettingsData;

  constructor(callbacks: SettingsMenuCallbacks, initial?: Partial<SettingsData>) {
    this.callbacks = callbacks;
    this.data = {
      masterVolume: initial?.masterVolume ?? 75,
      sfxVolume: initial?.sfxVolume ?? 80,
      graphicsQuality: initial?.graphicsQuality ?? 'high',
      cameraSnap: initial?.cameraSnap ?? false,
    };
    this.container = document.createElement('div');
    this.container.id = 'settings-menu';
    this.injectStyles();
    this.buildDOM();
  }

  private injectStyles(): void {
    if (document.getElementById('settings-menu-styles')) return;
    const style = document.createElement('style');
    style.id = 'settings-menu-styles';
    style.textContent = `
      #settings-menu {
        position: fixed;
        inset: 0;
        z-index: 1100;
        display: flex;
        align-items: center;
        justify-content: center;
        background: rgba(5, 2, 10, 0.7);
        backdrop-filter: blur(4px);
        font-family: 'Cinzel', 'Times New Roman', Georgia, serif;
        color: #d4af37;
        user-select: none;
      }

      #settings-menu.hidden {
        display: none;
      }

      #settings-menu .sm-panel {
        width: 460px;
        max-height: 85vh;
        overflow-y: auto;
        background: linear-gradient(180deg, #1a0e2e 0%, #0f0820 100%);
        border: 1px solid rgba(212, 175, 55, 0.25);
        border-radius: 8px;
        box-shadow: 0 0 40px rgba(0,0,0,0.8), 0 0 80px rgba(168, 85, 247, 0.1);
        padding: 32px 40px;
        animation: sm-slide-in 0.3s ease-out;
      }

      @keyframes sm-slide-in {
        from { opacity: 0; transform: translateY(-20px) scale(0.97); }
        to { opacity: 1; transform: translateY(0) scale(1); }
      }

      #settings-menu .sm-panel-header {
        display: flex;
        justify-content: space-between;
        align-items: center;
        margin-bottom: 28px;
        padding-bottom: 16px;
        border-bottom: 1px solid rgba(212, 175, 55, 0.15);
      }

      #settings-menu .sm-panel-title {
        font-size: 24px;
        font-weight: 700;
        letter-spacing: 4px;
        color: #d4af37;
        margin: 0;
      }

      #settings-menu .sm-close-btn {
        background: none;
        border: 1px solid rgba(212, 175, 55, 0.3);
        color: #d4af37;
        width: 32px;
        height: 32px;
        border-radius: 4px;
        cursor: pointer;
        font-size: 16px;
        transition: all 0.2s;
        display: flex;
        align-items: center;
        justify-content: center;
      }

      #settings-menu .sm-close-btn:hover {
        background: rgba(212, 175, 55, 0.1);
        border-color: rgba(212, 175, 55, 0.6);
      }

      #settings-menu .sm-setting-group {
        margin-bottom: 24px;
      }

      #settings-menu .sm-setting-label {
        display: flex;
        justify-content: space-between;
        align-items: center;
        font-size: 14px;
        letter-spacing: 2px;
        color: #b8a060;
        margin-bottom: 8px;
        font-weight: 600;
      }

      #settings-menu .sm-setting-value {
        color: #d4af37;
        font-family: 'Consolas', 'Monaco', monospace;
        font-size: 13px;
      }

      /* Slider */
      #settings-menu .sm-slider {
        -webkit-appearance: none;
        appearance: none;
        width: 100%;
        height: 6px;
        background: linear-gradient(90deg, #2a1a40, #1a0e2e);
        border: 1px solid rgba(212, 175, 55, 0.2);
        border-radius: 3px;
        outline: none;
        cursor: pointer;
      }

      #settings-menu .sm-slider::-webkit-slider-thumb {
        -webkit-appearance: none;
        appearance: none;
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: linear-gradient(180deg, #f4d03f, #b8860b);
        border: 1px solid #d4af37;
        box-shadow: 0 0 8px rgba(212, 175, 55, 0.4);
        cursor: pointer;
      }

      #settings-menu .sm-slider::-moz-range-thumb {
        width: 16px;
        height: 16px;
        border-radius: 50%;
        background: linear-gradient(180deg, #f4d03f, #b8860b);
        border: 1px solid #d4af37;
        box-shadow: 0 0 8px rgba(212, 175, 55, 0.4);
        cursor: pointer;
      }

      /* Dropdown */
      #settings-menu .sm-dropdown {
        width: 100%;
        padding: 8px 12px;
        background: rgba(20, 12, 35, 0.9);
        border: 1px solid rgba(212, 175, 55, 0.25);
        border-radius: 4px;
        color: #d4af37;
        font-family: 'Cinzel', 'Times New Roman', Georgia, serif;
        font-size: 14px;
        cursor: pointer;
        outline: none;
        transition: border-color 0.2s;
      }

      #settings-menu .sm-dropdown:hover {
        border-color: rgba(212, 175, 55, 0.5);
      }

      #settings-menu .sm-dropdown option {
        background: #1a0e2e;
        color: #d4af37;
      }

      /* Checkbox */
      #settings-menu .sm-checkbox-wrap {
        display: flex;
        align-items: center;
        gap: 12px;
        cursor: pointer;
      }

      #settings-menu .sm-checkbox {
        appearance: none;
        -webkit-appearance: none;
        width: 20px;
        height: 20px;
        border: 1px solid rgba(212, 175, 55, 0.4);
        border-radius: 3px;
        background: rgba(20, 12, 35, 0.9);
        cursor: pointer;
        position: relative;
        transition: all 0.2s;
      }

      #settings-menu .sm-checkbox:checked {
        background: linear-gradient(180deg, rgba(212, 175, 55, 0.3), rgba(168, 85, 247, 0.2));
        border-color: #d4af37;
      }

      #settings-menu .sm-checkbox:checked::after {
        content: '✦';
        position: absolute;
        top: 50%;
        left: 50%;
        transform: translate(-50%, -50%);
        color: #d4af37;
        font-size: 12px;
      }

      #settings-menu .sm-checkbox-label {
        font-size: 14px;
        letter-spacing: 1px;
        color: #b8a060;
      }

      /* Keybindings */
      #settings-menu .sm-keybinds {
        margin-top: 8px;
        padding: 12px 16px;
        background: rgba(10, 5, 20, 0.6);
        border: 1px solid rgba(212, 175, 55, 0.1);
        border-radius: 4px;
      }

      #settings-menu .sm-keybind-row {
        display: flex;
        justify-content: space-between;
        align-items: center;
        padding: 4px 0;
        font-size: 12px;
        color: #888;
        font-family: 'Consolas', 'Monaco', monospace;
      }

      #settings-menu .sm-keybind-key {
        color: #d4af37;
        font-weight: 600;
        padding: 2px 8px;
        background: rgba(212, 175, 55, 0.1);
        border: 1px solid rgba(212, 175, 55, 0.2);
        border-radius: 3px;
        font-size: 11px;
      }

      /* Footer buttons */
      #settings-menu .sm-panel-footer {
        display: flex;
        gap: 12px;
        justify-content: flex-end;
        margin-top: 28px;
        padding-top: 16px;
        border-top: 1px solid rgba(212, 175, 55, 0.15);
      }

      #settings-menu .sm-footer-btn {
        padding: 10px 28px;
        font-family: 'Cinzel', 'Times New Roman', Georgia, serif;
        font-size: 14px;
        font-weight: 600;
        letter-spacing: 2px;
        border: 1px solid rgba(212, 175, 55, 0.3);
        border-radius: 4px;
        cursor: pointer;
        transition: all 0.2s;
        text-transform: uppercase;
      }

      #settings-menu .sm-footer-btn.sm-apply {
        color: #d4af37;
        background: linear-gradient(180deg, rgba(30, 20, 50, 0.8), rgba(15, 10, 30, 0.9));
      }

      #settings-menu .sm-footer-btn.sm-apply:hover {
        background: linear-gradient(180deg, rgba(50, 30, 70, 0.9), rgba(25, 15, 40, 0.95));
        border-color: rgba(212, 175, 55, 0.6);
        box-shadow: 0 0 15px rgba(212, 175, 55, 0.2);
      }

      #settings-menu .sm-footer-btn.sm-cancel {
        color: #888;
        background: rgba(20, 12, 35, 0.6);
        border-color: rgba(100, 100, 100, 0.3);
      }

      #settings-menu .sm-footer-btn.sm-cancel:hover {
        color: #aaa;
        border-color: rgba(150, 150, 150, 0.5);
      }

      /* Scrollbar */
      #settings-menu .sm-panel::-webkit-scrollbar { width: 4px; }
      #settings-menu .sm-panel::-webkit-scrollbar-thumb {
        background: rgba(212, 175, 55, 0.3); border-radius: 2px;
      }
    `;
    document.head.appendChild(style);
  }

  private buildDOM(): void {
    this.container.innerHTML = `
      <div class="sm-panel">
        <div class="sm-panel-header">
          <h2 class="sm-panel-title">SETTINGS</h2>
          <button class="sm-close-btn" data-action="close">✕</button>
        </div>

        <div class="sm-setting-group">
          <div class="sm-setting-label">
            <span>Master Volume</span>
            <span class="sm-setting-value" id="sm-master-val">${this.data.masterVolume}</span>
          </div>
          <input type="range" class="sm-slider" id="sm-master" min="0" max="100" value="${this.data.masterVolume}">
        </div>

        <div class="sm-setting-group">
          <div class="sm-setting-label">
            <span>SFX Volume</span>
            <span class="sm-setting-value" id="sm-sfx-val">${this.data.sfxVolume}</span>
          </div>
          <input type="range" class="sm-slider" id="sm-sfx" min="0" max="100" value="${this.data.sfxVolume}">
        </div>

        <div class="sm-setting-group">
          <div class="sm-setting-label">
            <span>Graphics Quality</span>
          </div>
          <select class="sm-dropdown" id="sm-quality">
            <option value="low" ${this.data.graphicsQuality === 'low' ? 'selected' : ''}>Low</option>
            <option value="medium" ${this.data.graphicsQuality === 'medium' ? 'selected' : ''}>Medium</option>
            <option value="high" ${this.data.graphicsQuality === 'high' ? 'selected' : ''}>High</option>
          </select>
        </div>

        <div class="sm-setting-group">
          <label class="sm-checkbox-wrap">
            <input type="checkbox" class="sm-checkbox" id="sm-snap" ${this.data.cameraSnap ? 'checked' : ''}>
            <span class="sm-checkbox-label">Camera Rotation Snap (45°)</span>
          </label>
        </div>

        <div class="sm-setting-group">
          <div class="sm-setting-label"><span>Keybindings</span></div>
          <div class="sm-keybinds">
            <div class="sm-keybind-row"><span>Build Mode</span><span class="sm-keybind-key">B</span></div>
            <div class="sm-keybind-row"><span>Demolish</span><span class="sm-keybind-key">X</span></div>
            <div class="sm-keybind-row"><span>Tech Tree</span><span class="sm-keybind-key">T</span></div>
            <div class="sm-keybind-row"><span>Ritual Menu</span><span class="sm-keybind-key">R</span></div>
            <div class="sm-keybind-row"><span>Pause / Menu</span><span class="sm-keybind-key">Esc</span></div>
            <div class="sm-keybind-row"><span>Time: Pause</span><span class="sm-keybind-key">Space</span></div>
            <div class="sm-keybind-row"><span>Time: 1x Speed</span><span class="sm-keybind-key">1</span></div>
            <div class="sm-keybind-row"><span>Time: 3x Speed</span><span class="sm-keybind-key">2</span></div>
          </div>
        </div>

        <div class="sm-panel-footer">
          <button class="sm-footer-btn sm-cancel" data-action="cancel">Cancel</button>
          <button class="sm-footer-btn sm-apply" data-action="apply">Apply</button>
        </div>
      </div>
    `;

    // Wire up sliders to show values
    const masterSlider = this.container.querySelector('#sm-master') as HTMLInputElement;
    const masterVal = this.container.querySelector('#sm-master-val') as HTMLElement;
    masterSlider.addEventListener('input', () => {
      masterVal.textContent = masterSlider.value;
    });

    const sfxSlider = this.container.querySelector('#sm-sfx') as HTMLInputElement;
    const sfxVal = this.container.querySelector('#sm-sfx-val') as HTMLElement;
    sfxSlider.addEventListener('input', () => {
      sfxVal.textContent = sfxSlider.value;
    });

    // Wire up buttons
    this.container.addEventListener('click', (e) => {
      const target = e.target as HTMLElement;
      const action = target.dataset.action;
      switch (action) {
        case 'close':
        case 'cancel':
          this.callbacks.onClose();
          break;
        case 'apply':
          this.applySettings();
          break;
      }
    });
  }

  private applySettings(): void {
    this.data.masterVolume = parseInt((this.container.querySelector('#sm-master') as HTMLInputElement).value);
    this.data.sfxVolume = parseInt((this.container.querySelector('#sm-sfx') as HTMLInputElement).value);
    this.data.graphicsQuality = (this.container.querySelector('#sm-quality') as HTMLSelectElement).value as GraphicsQuality;
    this.data.cameraSnap = (this.container.querySelector('#sm-snap') as HTMLInputElement).checked;
    this.callbacks.onApply(this.data);
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

  getData(): SettingsData {
    return { ...this.data };
  }

  setData(data: Partial<SettingsData>): void {
    if (data.masterVolume !== undefined) this.data.masterVolume = data.masterVolume;
    if (data.sfxVolume !== undefined) this.data.sfxVolume = data.sfxVolume;
    if (data.graphicsQuality !== undefined) this.data.graphicsQuality = data.graphicsQuality;
    if (data.cameraSnap !== undefined) this.data.cameraSnap = data.cameraSnap;
    this.buildDOM(); // Rebuild with updated values
  }

  mount(parent?: HTMLElement): void {
    (parent ?? document.body).appendChild(this.container);
  }

  destroy(): void {
    this.container.remove();
  }
}