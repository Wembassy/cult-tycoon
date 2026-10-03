/**
 * DialogSystem — Modal dialog system for game events.
 * Shows modal dialogs for ritual results, recruitment, game over, etc.
 * Uses vanilla DOM (same pattern as HUDManager).
 */

export interface DialogButton {
  label: string;
  /** Style: primary (purple), success (green), danger (red), or default. */
  style?: 'default' | 'primary' | 'success' | 'danger';
  /** Callback when button is clicked. If not provided, dialog just closes. */
  onClick?: () => void;
}

export interface DialogOptions {
  /** Dialog title. */
  title: string;
  /** Body text (supports HTML for rich formatting). */
  body: string;
  /** Optional icon emoji shown next to title. */
  icon?: string;
  /** Buttons to show. Defaults to a single "OK" button. */
  buttons?: DialogButton[];
  /** If true, clicking the backdrop does not close the dialog. */
  modal?: boolean;
  /** Optional CSS class for the card (e.g. 'win', 'lose'). */
  cardClass?: string;
}

export class DialogSystem {
  private overlay: HTMLDivElement | null = null;
  private styleEl: HTMLStyleElement | null = null;

  get isVisible(): boolean {
    return !!this.overlay;
  }
  constructor() {
    this.injectStyles();
  }

  private injectStyles(): void {
    if (document.getElementById('dialog-system-styles')) return;
    const style = document.createElement('style');
    style.id = 'dialog-system-styles';
    style.textContent = `
      .ds-overlay {
        position: fixed; top: 0; left: 0; width: 100%; height: 100%;
        background: rgba(0, 0, 0, 0.75);
        display: flex; align-items: center; justify-content: center;
        z-index: 1100; pointer-events: auto;
        font-family: 'Segoe UI', -apple-system, sans-serif;
        animation: ds-fade-in 0.2s ease-out;
      }
      @keyframes ds-fade-in {
        from { opacity: 0; }
        to { opacity: 1; }
      }
      .ds-card {
        background: #162321;
        background-size: 100% 100%, 100% 100%;
        background-repeat: no-repeat;
        border: 2px solid rgba(168,85,247,0.4);
        border-radius: 12px; padding: 32px 40px; text-align: center;
        max-width: 460px; min-width: 300px;
        box-shadow: 0 8px 40px rgba(0,0,0,0.6);
        color: #e0e0e0;
        animation: ds-slide-up 0.25s ease-out;
        image-rendering: pixelated;
      }
      @keyframes ds-slide-up {
        from { transform: translateY(20px); opacity: 0; }
        to { transform: translateY(0); opacity: 1; }
      }
      .ds-card.success { border-color: rgba(16,185,129,0.5); box-shadow: 0 8px 40px rgba(16,185,129,0.3); }
      .ds-card.danger { border-color: rgba(239,68,68,0.5); box-shadow: 0 8px 40px rgba(239,68,68,0.3); }
      .ds-card.win { border-color: rgba(168,85,247,0.6); box-shadow: 0 8px 40px rgba(168,85,247,0.3); }
      .ds-card.lose { border-color: rgba(239,68,68,0.5); box-shadow: 0 8px 40px rgba(239,68,68,0.3); }
      .ds-header {
        display: flex; align-items: center; justify-content: center;
        gap: 12px; margin-bottom: 16px;
      }
      .ds-icon { font-size: 36px; }
      .ds-title { font-size: 22px; font-weight: 700; color: #fff; margin: 0; }
      .ds-body {
        font-size: 14px; line-height: 1.6; color: #ccc;
        margin: 0 0 24px; text-align: left;
      }
      .ds-body p { margin: 4px 0; }
      .ds-buttons {
        display: flex; gap: 12px; justify-content: center; flex-wrap: wrap;
      }
      .ds-btn {
        background: rgba(60,60,90,0.8); border: 1px solid rgba(100,100,160,0.4);
        color: #ccc; padding: 10px 24px; border-radius: 8px;
        cursor: pointer; font-size: 14px; font-weight: 600;
        transition: all 0.15s;
      }
      .ds-btn:hover { background: rgba(80,80,120,0.9); }
      .ds-btn-primary { background: rgba(168,85,247,0.4); border-color: rgba(168,85,247,0.6); color: #fff; }
      .ds-btn-primary:hover { background: rgba(168,85,247,0.6); }
      .ds-btn-success { background: rgba(16,185,129,0.3); border-color: rgba(16,185,129,0.5); color: #fff; }
      .ds-btn-success:hover { background: rgba(16,185,129,0.5); }
      .ds-btn-danger { background: rgba(239,68,68,0.3); border-color: rgba(239,68,68,0.5); color: #fff; }
      .ds-btn-danger:hover { background: rgba(239,68,68,0.5); }
    `;
    document.head.appendChild(style);
    this.styleEl = style;
  }

  /**
   * Show a modal dialog.
   */
  show(options: DialogOptions): void {
    // Close any existing dialog first
    this.close();

    const overlay = document.createElement('div');
    overlay.className = 'ds-overlay';

    const card = document.createElement('div');
    card.className = `ds-card ${options.cardClass ?? ''}`.trim();

    // Header
    const header = document.createElement('div');
    header.className = 'ds-header';
    if (options.icon) {
      const iconEl = document.createElement('span');
      iconEl.className = 'ds-icon';
      iconEl.textContent = options.icon;
      header.appendChild(iconEl);
    }
    const titleEl = document.createElement('h2');
    titleEl.className = 'ds-title';
    titleEl.textContent = options.title;
    header.appendChild(titleEl);
    card.appendChild(header);

    // Body
    const bodyEl = document.createElement('div');
    bodyEl.className = 'ds-body';
    bodyEl.innerHTML = options.body;
    card.appendChild(bodyEl);

    // Buttons
    const btnContainer = document.createElement('div');
    btnContainer.className = 'ds-buttons';

    const buttons = options.buttons ?? [{ label: 'OK' }];
    for (const btn of buttons) {
      const btnEl = document.createElement('button');
      btnEl.className = `ds-btn ds-btn-${btn.style ?? 'default'}`;
      btnEl.textContent = btn.label;
      btnEl.addEventListener('click', () => {
        this.close();
        btn.onClick?.();
      });
      btnContainer.appendChild(btnEl);
    }
    card.appendChild(btnContainer);

    overlay.appendChild(card);

    // Backdrop click handler
    if (!options.modal) {
      overlay.addEventListener('click', (e) => {
        if (e.target === overlay) this.close();
      });
    }

    document.body.appendChild(overlay);
    this.overlay = overlay;

    // Focus the last button (typically the primary action)
    const allBtns = overlay.querySelectorAll('button');
    if (allBtns.length > 0) {
      (allBtns[allBtns.length - 1] as HTMLButtonElement).focus();
    }
  }

  /**
   * Show a simple alert dialog with a single OK button.
   */
  alert(title: string, body: string, icon?: string): void {
    this.show({ title, body, icon, buttons: [{ label: 'OK' }] });
  }

  /**
   * Show a confirm dialog with OK/Cancel buttons.
   * Returns via callbacks on the buttons.
   */
  confirm(
    title: string,
    body: string,
    onConfirm: () => void,
    onCancel?: () => void,
    icon?: string,
  ): void {
    this.show({
      title,
      body,
      icon,
      modal: true,
      buttons: [
        { label: 'Cancel', onClick: onCancel },
        { label: 'Confirm', style: 'primary', onClick: onConfirm },
      ],
    });
  }

  /**
   * Show a ritual result dialog.
   */
  ritualResult(
    ritualName: string,
    result: {
      influenceGain: number;
      faithGain: number;
      notorietyGain: number;
      sideEffects?: string[];
    },
  ): void {
    const body = `
      <p><b>${ritualName}</b> has been completed!</p>
      <p>✨ Influence: +${result.influenceGain}</p>
      <p>🙏 Faith: +${result.faithGain}</p>
      <p>⚠️ Notoriety: +${result.notorietyGain}</p>
      ${result.sideEffects?.length ? `<p><i>Side effects: ${result.sideEffects.join(', ')}</i></p>` : ''}
    `;
    this.show({
      title: 'Ritual Complete',
      icon: '🔮',
      body,
      cardClass: 'success',
      buttons: [{ label: 'Continue', style: 'success' }],
    });
  }

  /**
   * Show a recruitment result dialog.
   */
  recruitmentResult(success: boolean, followerName?: string, reason?: string): void {
    if (success) {
      this.show({
        title: 'New Follower!',
        icon: '🧙',
        body: `<p><b>${followerName ?? 'A new follower'}</b> has joined your cult!</p>`,
        cardClass: 'success',
        buttons: [{ label: 'Welcome', style: 'success' }],
      });
    } else {
      this.show({
        title: 'Recruitment Failed',
        icon: '😕',
        body: `<p>${reason ?? 'The recruit was not convinced to join your cult.'}</p>`,
        buttons: [{ label: 'OK' }],
      });
    }
  }

  /**
   * Show a game over dialog.
   */
  gameOver(
    victory: boolean,
    stats: {
      day: number;
      pop: number;
      influence: number;
      wealth: number;
      notoriety: number;
    },
    onNewGame: () => void,
  ): void {
    const body = `
      <div style="display:flex;flex-wrap:wrap;gap:16px;justify-content:center;margin:12px 0;">
        <div>Day: <b>${stats.day}</b></div>
        <div>Followers: <b>${stats.pop}</b></div>
        <div>Influence: <b>${stats.influence}</b></div>
        <div>Wealth: <b>${stats.wealth}</b></div>
        <div>Notoriety: <b>${stats.notoriety}</b></div>
      </div>
    `;
    this.show({
      title: victory ? 'Ascension Achieved!' : 'Cult Fallen',
      icon: victory ? '🌟' : '💀',
      body,
      cardClass: victory ? 'win' : 'lose',
      modal: true,
      buttons: [
        ...(victory ? [{ label: 'Continue Playing' } as DialogButton] : []),
        { label: 'New Game', style: victory ? 'primary' : 'danger', onClick: onNewGame },
      ],
    });
  }

  /**
   * Close the current dialog if one is open.
   */
  close(): void {
    if (this.overlay) {
      this.overlay.remove();
      this.overlay = null;
    }
  }

  /**
   * Check if a dialog is currently open.
   */
  get isOpen(): boolean {
    return this.overlay !== null;
  }

  /**
   * Clean up all DOM elements.
   */
  destroy(): void {
    this.close();
    this.styleEl?.remove();
    this.styleEl = null;
  }
}
