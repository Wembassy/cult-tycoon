/**
 * WorldStartPanel — two-stage new-game start flow:
 * 1) choose a Global World region by visible stats
 * 2) preview the deterministic local map and click the exact settlement point
 */

import { WorldGen } from '../world/WorldGen';
import {
  generateGlobalWorld,
  getSettlement,
  localParametersForRegion,
  type GlobalRegion,
  type GlobalWorld,
} from '../world/GlobalWorld';
import type { TileMap } from '../world/TileMap';
import type { IdeologyFoundation } from '../game/Ideology';

export interface WorldStartSelection {
  globalSeed: number;
  region: GlobalRegion;
  settlementPoint: { x: number; y: number };
  ideologyFoundation?: IdeologyFoundation;
}

export interface WorldStartPanelCallbacks {
  onConfirm: (selection: WorldStartSelection) => void;
  onCancel: () => void;
}

export class WorldStartPanel {
  private container: HTMLDivElement;
  private panel: HTMLDivElement;
  private world: GlobalWorld;
  private selectedRegion: GlobalRegion | null = null;
  private previewMap: TileMap | null = null;
  private settlementPoint: { x: number; y: number } | null = null;
  private ideologyFoundation: IdeologyFoundation = 'communal_devotion';
  private previewCanvas: HTMLCanvasElement | null = null;
  private _visible = false;

  constructor(
    seed: number,
    private callbacks: WorldStartPanelCallbacks,
  ) {
    this.world = generateGlobalWorld(seed);
    this.container = document.createElement('div');
    this.container.id = 'world-start-overlay';
    this.panel = document.createElement('div');
    this.panel.className = 'world-start-panel';
    this.container.appendChild(this.panel);
    this.injectStyles();
  }

  mount(parent?: HTMLElement): void {
    (parent ?? document.body).appendChild(this.container);
  }

  show(): void {
    this._visible = true;
    this.container.classList.add('visible');
    this.render();
  }

  hide(): void {
    this._visible = false;
    this.container.classList.remove('visible');
  }

  destroy(): void {
    this.container.remove();
  }

  get isVisible(): boolean {
    return this._visible;
  }

  private render(): void {
    const selected = this.selectedRegion;
    const settlement = selected ? getSettlement(this.world, selected.nearestSettlementId) : null;

    this.panel.innerHTML = `
      <div class="world-start-header">
        <div>
          <div class="world-start-title">Choose Your Beginning</div>
          <div class="world-start-subtitle">Global World Seed: ${this.world.seed}</div>
        </div>
        <button class="world-start-close">✕</button>
      </div>

      <div class="world-start-body">
        <section class="world-start-global">
          <h3>1. Select a region</h3>
          <div class="world-region-grid">
            ${this.world.regions.map(region => this.regionButton(region)).join('')}
          </div>
        </section>

        <section class="world-start-detail">
          ${selected ? `
            <h3>2. Choose the settlement point</h3>
            <div class="world-region-stats">
              <div><b>Biome</b><span>${labelBiome(selected.biome)}</span></div>
              <div><b>Temperature</b><span>${selected.temperatureC}°C</span></div>
              <div><b>Trees</b><span>${percent(selected.treeDensity / 0.12)}</span></div>
              <div><b>Stone</b><span>${percent(selected.rockDensity / 0.11)}</span></div>
              <div><b>Wild food</b><span>${selected.foodAvailability}/100</span></div>
              <div><b>Outsider traffic</b><span>${selected.outsiderTraffic}/100</span></div>
              <div><b>Nearest settlement</b><span>${settlement?.name ?? 'Unknown'} · ${selected.settlementDistance} tiles</span></div>
              <div><b>Travel route</b><span>${selected.routeProximity === 0 ? 'On route' : `${selected.routeProximity} tiles away`}</span></div>
            </div>
            <p class="world-start-help">Click a clear location in the local preview. The whole 64×64 area remains playable; this only selects the initial spawn/camera position.</p>
            <canvas class="world-local-preview" width="384" height="384"></canvas>
            <div class="world-start-selection-text">
              ${this.settlementPoint ? `Settlement point: <b>${this.settlementPoint.x}, ${this.settlementPoint.y}</b>` : 'Select a valid point on the preview.'}
            </div>
            <div class="world-ideology-choice">
              <b>3. Choose ideology foundation</b>
              <div class="world-ideology-buttons">
                <button class="world-ideology-btn ${this.ideologyFoundation === 'communal_devotion' ? 'selected' : ''}" data-ideology="communal_devotion">
                  Communal Path
                  <small>Community · devotion · shared purpose</small>
                </button>
                <button class="world-ideology-btn ${this.ideologyFoundation === 'ascetic_order' ? 'selected' : ''}" data-ideology="ascetic_order">
                  Ascetic Order
                  <small>Discipline · sacrifice · hierarchy</small>
                </button>
              </div>
            </div>
          ` : `
            <div class="world-start-placeholder">
              Select a region to inspect its local terrain and settlement conditions.
            </div>
          `}
        </section>
      </div>

      <div class="world-start-footer">
        <button class="world-start-cancel">Back</button>
        <button class="world-start-confirm" ${selected && this.settlementPoint ? '' : 'disabled'}>Found the Cult Here</button>
      </div>
    `;

    this.panel.querySelector('.world-start-close')?.addEventListener('click', () => this.callbacks.onCancel());
    this.panel.querySelector('.world-start-cancel')?.addEventListener('click', () => this.callbacks.onCancel());
    this.panel.querySelector('.world-start-confirm')?.addEventListener('click', () => {
      if (!this.selectedRegion || !this.settlementPoint) return;
      this.callbacks.onConfirm({
        globalSeed: this.world.seed,
        region: { ...this.selectedRegion },
        settlementPoint: { ...this.settlementPoint },
        ideologyFoundation: this.ideologyFoundation,
      });
    });

    this.panel.querySelectorAll<HTMLButtonElement>('.world-region').forEach(button => {
      button.addEventListener('click', () => {
        const id = button.dataset.region;
        const region = this.world.regions.find(candidate => candidate.id === id);
        if (!region) return;
        this.selectedRegion = region;
        this.settlementPoint = null;
        this.previewMap = new WorldGen(region.localSeed).generate(localParametersForRegion(region));
        this.render();
      });
    });

    this.panel.querySelectorAll<HTMLButtonElement>('.world-ideology-btn').forEach(button => {
      button.addEventListener('click', () => {
        this.ideologyFoundation = button.dataset.ideology as IdeologyFoundation;
        this.render();
      });
    });

        this.previewCanvas = this.panel.querySelector<HTMLCanvasElement>('.world-local-preview');
    if (this.previewCanvas && selected && this.previewMap) {
      this.drawPreview();
      this.previewCanvas.addEventListener('click', event => this.chooseSettlementPoint(event));
    }
  }

  private regionButton(region: GlobalRegion): string {
    const selected = this.selectedRegion?.id === region.id;
    return `
      <button class="world-region ${selected ? 'selected' : ''}" data-region="${region.id}">
        <span class="world-region-biome">${biomeIcon(region.biome)}</span>
        <span class="world-region-coord">${region.x},${region.y}</span>
        <span class="world-region-temp">${region.temperatureC}°</span>
        <span class="world-region-traffic">👥 ${region.outsiderTraffic}</span>
      </button>
    `;
  }

  private chooseSettlementPoint(event: MouseEvent): void {
    if (!this.previewCanvas || !this.previewMap) return;
    const rect = this.previewCanvas.getBoundingClientRect();
    const x = Math.floor((event.clientX - rect.left) / rect.width * this.previewMap.width);
    const y = Math.floor((event.clientY - rect.top) / rect.height * this.previewMap.height);
    const tile = this.previewMap.getTile(x, y);
    if (!tile || tile.terrain === 'water' || tile.terrain === 'stone' || tile.decor === 'tree' || tile.decor === 'rock') {
      return;
    }

    this.settlementPoint = { x, y };
    this.render();
  }

  private drawPreview(): void {
    if (!this.previewCanvas || !this.previewMap) return;
    const ctx = this.previewCanvas.getContext('2d');
    if (!ctx) return;

    const sx = this.previewCanvas.width / this.previewMap.width;
    const sy = this.previewCanvas.height / this.previewMap.height;

    for (const tile of this.previewMap.getAllTiles()) {
      ctx.fillStyle =
        tile.terrain === 'water' ? '#245b78' :
        tile.terrain === 'stone' ? '#777a78' :
        tile.terrain === 'dirt' ? '#806447' : '#466f3c';
      ctx.fillRect(tile.x * sx, tile.y * sy, Math.ceil(sx), Math.ceil(sy));

      if (tile.decor === 'tree') {
        ctx.fillStyle = '#203f27';
        ctx.fillRect(tile.x * sx + sx * 0.2, tile.y * sy + sy * 0.2, sx * 0.6, sy * 0.6);
      } else if (tile.decor === 'rock') {
        ctx.fillStyle = '#b0b0aa';
        ctx.fillRect(tile.x * sx + sx * 0.25, tile.y * sy + sy * 0.25, sx * 0.5, sy * 0.5);
      } else if (tile.decor === 'bush') {
        ctx.fillStyle = '#76a34d';
        ctx.fillRect(tile.x * sx + sx * 0.3, tile.y * sy + sy * 0.3, sx * 0.4, sy * 0.4);
      }
    }

    if (this.settlementPoint) {
      const { x, y } = this.settlementPoint;
      ctx.strokeStyle = '#fbbf24';
      ctx.lineWidth = 3;
      ctx.strokeRect(x * sx - sx * 1.5, y * sy - sy * 1.5, sx * 4, sy * 4);
      ctx.beginPath();
      ctx.arc((x + 0.5) * sx, (y + 0.5) * sy, Math.max(4, sx * 1.2), 0, Math.PI * 2);
      ctx.stroke();
    }
  }

  private injectStyles(): void {
    if (document.getElementById('world-start-styles')) return;
    const style = document.createElement('style');
    style.id = 'world-start-styles';
    style.textContent = `
      #world-start-overlay{position:fixed;inset:0;z-index:1200;display:none;align-items:center;justify-content:center;background:rgba(3,6,12,.94);pointer-events:auto;font-family:'Segoe UI',sans-serif;color:#e5e7eb}
      #world-start-overlay.visible{display:flex}
      .world-start-panel{width:min(1180px,96vw);height:min(820px,94vh);display:flex;flex-direction:column;background:#0d1422;border:1px solid rgba(100,145,205,.45);border-radius:10px;box-shadow:0 12px 50px rgba(0,0,0,.75);overflow:hidden}
      .world-start-header,.world-start-footer{display:flex;align-items:center;justify-content:space-between;padding:14px 18px;border-bottom:1px solid rgba(100,145,205,.2)}
      .world-start-footer{border-top:1px solid rgba(100,145,205,.2);border-bottom:0}
      .world-start-title{font-size:20px;font-weight:800}.world-start-subtitle{font-size:11px;color:#94a3b8;margin-top:3px}
      .world-start-close,.world-start-cancel,.world-start-confirm{border:1px solid rgba(100,145,205,.35);background:rgba(24,38,60,.85);color:#dbeafe;padding:8px 12px;border-radius:5px;cursor:pointer}
      .world-start-confirm{background:rgba(16,185,129,.25);border-color:rgba(16,185,129,.5)}
      .world-start-confirm:disabled{opacity:.35;cursor:not-allowed}
      .world-start-body{flex:1;min-height:0;display:grid;grid-template-columns:minmax(440px,1.2fr) minmax(400px,1fr);gap:14px;padding:14px}
      .world-start-global,.world-start-detail{min-height:0;overflow:auto;background:rgba(0,0,0,.16);border:1px solid rgba(100,145,205,.15);border-radius:7px;padding:12px}
      .world-start-global h3,.world-start-detail h3{margin:0 0 10px;font-size:14px}
      .world-region-grid{display:grid;grid-template-columns:repeat(8,minmax(44px,1fr));gap:5px}
      .world-region{min-height:66px;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:2px;background:rgba(22,34,52,.9);border:1px solid rgba(100,145,205,.2);color:#cbd5e1;border-radius:5px;cursor:pointer}
      .world-region:hover{border-color:rgba(120,180,255,.6)}.world-region.selected{outline:2px solid #fbbf24;background:rgba(83,65,22,.35)}
      .world-region-biome{font-size:18px}.world-region-coord,.world-region-temp,.world-region-traffic{font-size:9px}
      .world-region-stats{display:grid;grid-template-columns:1fr 1fr;gap:6px 12px;margin-bottom:10px}
      .world-region-stats div{display:flex;justify-content:space-between;gap:12px;padding:6px;background:rgba(0,0,0,.2);font-size:11px}
      .world-region-stats span{color:#cbd5e1}.world-start-help,.world-start-selection-text{font-size:11px;color:#94a3b8}
      .world-local-preview{width:min(100%,384px);aspect-ratio:1;display:block;margin:10px auto;border:1px solid rgba(148,163,184,.35);image-rendering:pixelated;cursor:crosshair;background:#111827}
      .world-start-placeholder{height:100%;display:flex;align-items:center;justify-content:center;text-align:center;color:#64748b;padding:30px}
      .world-ideology-choice{margin-top:12px;padding-top:10px;border-top:1px solid rgba(100,145,205,.18);font-size:11px}
      .world-ideology-buttons{display:grid;grid-template-columns:1fr 1fr;gap:7px;margin-top:7px}
      .world-ideology-btn{display:flex;flex-direction:column;gap:3px;text-align:left;padding:8px;border:1px solid rgba(100,145,205,.25);border-radius:5px;background:rgba(20,32,50,.75);color:#dbeafe;cursor:pointer}
      .world-ideology-btn small{color:#94a3b8}.world-ideology-btn.selected{border-color:#fbbf24;background:rgba(83,65,22,.32)}
      @media(max-width:900px){.world-start-body{grid-template-columns:1fr}.world-region-grid{grid-template-columns:repeat(8,1fr)}}
    `;
    document.head.appendChild(style);
  }
}

function biomeIcon(biome: GlobalRegion['biome']): string {
  switch (biome) {
    case 'temperate_forest': return '🌲';
    case 'dry_plains': return '🌾';
    case 'rocky_highlands': return '⛰️';
    case 'cold_steppe': return '❄️';
  }
}

function labelBiome(biome: GlobalRegion['biome']): string {
  return biome.replaceAll('_', ' ').replace(/\b\w/g, char => char.toUpperCase());
}

function percent(value: number): string {
  return `${Math.round(Math.max(0, Math.min(1, value)) * 100)}%`;
}
