/**
 * AudioManager — Centralized audio system using Howler.js.
 *
 * Features:
 * - Background music with crossfade transitions
 * - UI sounds (click, build, error)
 * - Ambient environment loop
 * - Game event sounds (ritual, level up, destroy)
 * - Volume controls (master, music, sfx)
 * - Graceful degradation if audio files missing
 */

import { Howl, Howler } from 'howler';

export type AudioChannel = 'master' | 'music' | 'sfx' | 'ambient';

interface SoundEntry {
  howl: Howl;
  channel: AudioChannel;
}

export class AudioManager {
  private sounds: Map<string, SoundEntry> = new Map();
  private currentMusic: string | null = null;
  private musicHowl: Howl | null = null;
  private ambientHowl: Howl | null = null;
  private volumes: Record<AudioChannel, number> = {
    master: 1.0,
    music: 0.4,
    sfx: 0.6,
    ambient: 0.3,
  };
  private muted = false;
  private initialized = false;

  /**
   * Initialize audio — loads UI sounds and ambient loops.
   * Call after user interaction (browser autoplay policy).
   */
  init(): void {
    if (this.initialized) return;
    this.initialized = true;

    // Register UI sounds (using base64 data URIs for instant availability)
    // These are short synthesized tones so we don't depend on external files.
    this.registerSynthSounds();

    // Try to load ambient loop if file exists
    this.tryLoadAmbient();

    Howler.volume(this.volumes.master);
  }

  /**
   * Register synthesized UI sounds so the game has audio even without asset files.
   */
  private registerSynthSounds(): void {
    // Click — short blip
    this.registerSynth('ui-click', 'sfx', 800, 0.05, 'square');
    // Build — pleasant chime
    this.registerSynth('ui-build', 'sfx', 523, 0.15, 'sine');
    // Error — low buzz
    this.registerSynth('ui-error', 'sfx', 150, 0.2, 'sawtooth');
    // Select — soft tick
    this.registerSynth('ui-select', 'sfx', 1000, 0.03, 'sine');
    // Ritual — mysterious tone
    this.registerSynth('ritual-cast', 'sfx', 220, 0.5, 'sine');
    // Level up — rising arpeggio
    this.registerSynth('level-up', 'sfx', 660, 0.3, 'triangle');
    // Destroy — noise burst
    this.registerSynth('destroy', 'sfx', 100, 0.15, 'sawtooth');
  }

  /**
   * Create a synthesized sound using Web Audio API oscillator.
   */
  private registerSynth(id: string, channel: AudioChannel, freq: number, duration: number, wave: OscillatorType): void {
    // We'll use a Howl with inline data URI generated on the fly
    // For now, use a lightweight approach: store params and play via Web Audio on demand
    this.synthSounds.set(id, { freq, duration, wave, channel });
  }

  private synthSounds: Map<string, { freq: number; duration: number; wave: OscillatorType; channel: AudioChannel }> = new Map();

  /**
   * Try to load ambient background audio from file.
   */
  private tryLoadAmbient(): void {
    const ambientPath = '/assets/audio/ambient_loop.mp3';
    // We check if file exists by attempting to load it; Howler handles 404 gracefully
    this.ambientHowl = new Howl({
      src: [ambientPath],
      loop: true,
      volume: this.volumes.ambient,
      html5: true,
      onloaderror: () => {
        // File doesn't exist yet — that's fine, ambient is optional
        this.ambientHowl = null;
      },
    });
  }

  /**
   * Play a sound by id. Falls back to synthesized tones for UI sounds.
   */
  play(soundId: string): void {
    if (this.muted) return;

    // Check for file-based sound first
    const entry = this.sounds.get(soundId);
    if (entry) {
      const vol = this.volumes[entry.channel] * this.volumes.master;
      entry.howl.volume(vol);
      entry.howl.play();
      return;
    }

    // Fall back to synthesized sound
    const synth = this.synthSounds.get(soundId);
    if (synth) {
      this.playSynth(synth.freq, synth.duration, synth.wave, this.volumes[synth.channel]);
    }
  }

  /**
   * Play a synthesized tone using Web Audio API.
   */
  private playSynth(freq: number, duration: number, wave: OscillatorType, volume: number): void {
    try {
      const AudioCtx = window.AudioContext || (window as any).webkitAudioContext;
      if (!AudioCtx) return;
      const ctx = Howler.ctx || new AudioCtx();
      if (ctx.state === 'suspended') ctx.resume();

      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = wave;
      osc.frequency.value = freq;
      gain.gain.value = 0;
      gain.gain.linearRampToValueAtTime(volume, ctx.currentTime + 0.01);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + duration);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start(ctx.currentTime);
      osc.stop(ctx.currentTime + duration);
    } catch {
      // Audio not available — silent fail
    }
  }

  /**
   * Start background music. Crossfades if another track is playing.
   */
  playMusic(trackPath: string): void {
    if (this.currentMusic === trackPath && this.musicHowl) return;

    const newHowl = new Howl({
      src: [trackPath],
      loop: true,
      volume: 0,
      html5: true,
      onloaderror: () => {
        // Music file not found — skip silently
      },
    });

    // Fade out current music
    if (this.musicHowl && this.currentMusic) {
      const oldHowl = this.musicHowl;
      oldHowl.fade(oldHowl.volume(), 0, 1000);
      setTimeout(() => oldHowl.unload(), 1200);
    }

    // Fade in new music
    this.musicHowl = newHowl;
    this.currentMusic = trackPath;
    newHowl.once('load', () => {
      newHowl.fade(0, this.volumes.music * this.volumes.master, 2000);
      newHowl.play();
    });
  }

  /**
   * Stop all music.
   */
  stopMusic(): void {
    if (this.musicHowl) {
      this.musicHowl.fade(this.musicHowl.volume(), 0, 500);
      setTimeout(() => this.musicHowl?.unload(), 700);
      this.musicHowl = null;
      this.currentMusic = null;
    }
  }

  /**
   * Start ambient environment loop.
   */
  startAmbient(): void {
    if (this.ambientHowl) {
      this.ambientHowl.volume(this.volumes.ambient * this.volumes.master);
      this.ambientHowl.play();
    }
  }

  /**
   * Stop ambient loop.
   */
  stopAmbient(): void {
    if (this.ambientHowl) {
      this.ambientHowl.stop();
    }
  }

  /**
   * Set volume for a channel.
   */
  setVolume(channel: AudioChannel, volume: number): void {
    this.volumes[channel] = Math.max(0, Math.min(1, volume));
    if (channel === 'master') {
      Howler.volume(this.volumes.master);
    } else if (channel === 'music' && this.musicHowl) {
      this.musicHowl.volume(this.volumes.music * this.volumes.master);
    } else if (channel === 'ambient' && this.ambientHowl) {
      this.ambientHowl.volume(this.volumes.ambient * this.volumes.master);
    }
  }

  /**
   * Get volume for a channel.
   */
  getVolume(channel: AudioChannel): number {
    return this.volumes[channel];
  }

  /**
   * Mute/unmute all audio.
   */
  setMuted(muted: boolean): void {
    this.muted = muted;
    Howler.mute(muted);
  }

  get isMuted(): boolean { return this.muted; }

  /**
   * Register a file-based sound effect.
   */
  registerSound(id: string, path: string, channel: AudioChannel = 'sfx'): void {
    const howl = new Howl({
      src: [path],
      volume: this.volumes[channel],
      onloaderror: () => {
        // File not found — remove from registry
        this.sounds.delete(id);
      },
    });
    this.sounds.set(id, { howl, channel });
  }

  dispose(): void {
    this.stopMusic();
    this.stopAmbient();
    this.sounds.forEach(s => s.howl.unload());
    this.sounds.clear();
    this.synthSounds.clear();
  }
}