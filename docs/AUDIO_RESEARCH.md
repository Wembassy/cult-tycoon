# Cult Tycoon — Audio Research & Recommendations

**Date:** 2026-10-01  
**Project:** Cult Tycoon (colony sim / cult management, Steam, $14.99)  
**Stack:** Three.js + Vite + TypeScript  
**Vibe Reference:** *Honey I Joined a Cult* + *Cult of the Lamb*

---

## 1. Audio Needs Breakdown

| Category | Examples | Priority |
|----------|----------|----------|
| **Background Music** | Atmospheric cultist ambiance, ritual chants, management screen loops | High |
| **UI Sounds** | Button clicks, placement confirm/deny, menu open/close, tab switches | High |
| **Ambient Environment** | Fire crackling, wind, distant murmurs, night insects | Medium |
| **Ritual/Event Effects** | Bell tolls, choir stabs, dramatic stingers, cosmic effects | Medium |
| **Creature/Cultist Vox** | Mumbles, cheers, gasps (non-verbal) | Low (MVP skip) |

---

## 2. Free Licensed Music Sources

### ⭐ Kenney.nl — CC0 (Public Domain)
- **URL:** <https://kenney.nl/assets?q=audio>
- **License:** CC0 1.0 — no attribution required, commercial use OK
- **What's available:** Impact Sounds (130 assets), Digital Audio (60 assets), UI sounds, arcade SFX
- **Best for:** UI clicks, impact sounds, retro-style effects
- **Verdict:** **Top pick for SFX.** Zero legal burden, huge variety, well-organized packs

### ⭐ Incompetech (Kevin MacLeod) — CC BY 4.0
- **URL:** <https://incompetech.com/music/royalty-free/music.html>
- **License:** CC BY 4.0 — attribution required, commercial use OK
- **What's available:** 2,000+ tracks across all genres, including atmospheric/dark/creepy tracks perfect for cult vibe
- **Attribution format:** `Title — Kevin MacLeod (incompetech.com) — Licensed under Creative Commons: By Attribution 4.0`
- **Verdict:** **Top pick for background music.** Massive library, many tracks fit the cult aesthetic. Just need credits screen

### Free Music Archive (FMA) — Various CC licenses
- **URL:** <https://freemusicarchive.org>
- **License:** Mixed — check per-track (CC BY, CC BY-NC, CC0, etc.)
- **What's available:** Huge catalog across genres, curated collections
- **Caveat:** Must filter for commercial-use licenses. CC BY-NC tracks are off-limits for a paid Steam game
- **Verdict:** Good secondary source, especially for ambient/electronic cult tracks. Requires careful license checking

### FreePD.com — ⚠️ SITE CLOSED
- **URL:** <https://freepd.com>
- **Status:** Officially taken offline after 17 years. Content available via Internet Archive snapshots
- **Mirror:** <https://en.freepd.cn/music> (unofficial mirror, CC0 tracks)
- **Verdict:** Use the mirror cautiously. Was a great CC0 source; now unreliable

### Sonniss GDC Audio Bundles — Royalty-Free
- **URL:** <https://gdc.sonniss.com/>
- **License:** Royalty-free, commercially usable (check individual files)
- **What's available:** 40GB+ of high-quality professional sound effects from multiple vendors. Annual bundles from GDC 2017–2026
- **Best for:** Professional-grade SFX, ambient textures, foley
- **Verdict:** **Excellent resource.** Download the latest bundle (2026 = 7.47GB). Professional quality, free, huge variety

---

## 3. Sound Effect Libraries

### ⭐ Freesound.org
- **URL:** <https://freesound.org>
- **License:** Mixed — CC0 (majority, ~381K of 734K files), CC BY, CC BY-NC (avoid for commercial)
- **What's available:** 734,000+ user-uploaded sounds. Filter by CC0 for safe commercial use
- **Best for:** Specific one-shots (bell tolls, fire crackling, chants, murmurs)
- **Caveat:** Per-file license checking required. Quality varies. Registration required to download
- **Verdict:** **Essential for filling gaps.** Search "cult", "ritual", "chant", "bell", "fire" with CC0 filter

### Kenney Sound Packs (again, for SFX specifically)
- Impact Sounds, Digital Audio, UI Sounds, Arcade SFX, Casino Sounds
- All CC0, all high quality, all game-ready
- **Best for:** Clean UI sounds and game feedback

### itch.io Game Assets
- **URL:** <https://itch.io/game-assets/tag-music>
- **What's available:** Many free and paid music/SFX packs from indie creators
- **License:** Varies per pack (check carefully)
- **Verdict:** Good for discovering niche atmospheric packs. Many free options with attribution

---

## 4. Audio Library Comparison: Web Audio API vs Howler.js vs Three.js Audio

### Option A: Raw Web Audio API
- **Pros:** Maximum control, zero dependencies, native browser API, lowest overhead
- **Cons:** Verbose API, manual handling of everything (loading, caching, pooling, fading), steep learning curve
- **Best for:** Procedural audio, custom DSP, when you need fine-grained control
- **Code complexity:** High — you'll write a wrapper library yourself

### Option B: Howler.js ⭐ RECOMMENDED
- **URL:** <https://howlerjs.com>
- **Size:** 7KB gzipped, zero dependencies
- **Pros:**
  - Simplified, consistent API for all audio needs
  - Defaults to Web Audio API, falls back to HTML5 Audio
  - Audio sprites (multiple sounds in one file = fewer requests)
  - Spatial/3D audio support (positional panning)
  - Full codec support: MP3, OGG, OPUS, WAV, AAC, FLAC, WEBA, etc.
  - Auto-caching, fade/loop/rate control, modular architecture
  - Works everywhere (IE9+, Cordova, all modern browsers)
- **Cons:** Less fine-grained DSP control than raw Web Audio API
- **Best for:** Game audio management layer — SFX, music, ambient, UI sounds
- **Integration with Three.js:** Can share spatial coordinates from Three.js objects to Howler's positional audio. Several community examples exist

### Option C: Three.js Built-in Audio (PositionalAudio / AudioListener)
- **URL:** <https://threejs.org/docs/pages/PositionalAudio.html>
- **Pros:** Native Three.js integration, shares the scene graph, PannerNode for 3D spatialization
- **Cons:** Limited to Three.js context, less feature-rich than Howler for general audio management, no audio sprites, no fallback handling
- **Best for:** 3D positional sound tied to objects in the scene (e.g., a fire pit that crackles louder as you approach)
- **Note:** Uses Web Audio API under the hood

### Option D: Tone.js (Procedural)
- **URL:** <https://tonejs.github.io>
- **Pros:** Full synthesis library, schedule notes, effects, filters, LFOs, reactive to game state
- **Cons:** Larger bundle size, overkill for simple SFX, learning curve for music theory
- **Best for:** Procedural music generation, reactive audio that changes with game state
- **Integration:** Can share Web Audio context with Three.js via `Tone.setContext()`

### 🏆 Recommendation: Howler.js + Three.js PositionalAudio (Hybrid)

```
Howler.js → UI sounds, music playback, ambient loops, event stingers
Three.js PositionalAudio → 3D world sounds (fire, ritual sites, cultist murmurs)
```

This gives you a robust general audio manager (Howler) plus native 3D spatialization for world objects (Three.js). Both use Web Audio API under the hood and can coexist.

---

## 5. File Format Recommendations

| Format | Compression | Browser Support | Quality | Size | Verdict |
|--------|-------------|-----------------|---------|------|---------|
| **OGG Vorbis** | Compressed | Excellent (all modern browsers) | Good | Smallest | ⭐ Best for web games |
| **MP3** | Compressed | Universal (including legacy) | Good | Small | Good fallback |
| **WAV** | Uncompressed | Universal | Best | Large | Use for short SFX only |
| **Opus** | Compressed | Firefox-only issues historically | Excellent | Smallest | Emerging, not yet universal |
| **WEBA** | Compressed | Chrome/Edge | Good | Small | WebM audio, limited support |

### 🏆 Recommendation: OGG Vorbis primary + MP3 fallback

```typescript
// Howler.js supports multiple formats with fallback
const sound = new Howl({
  src: ['sounds/click.ogg', 'sounds/click.mp3'],
  format: ['ogg', 'mp3']
});
```

**Why OGG primary:**
- ~30-50% smaller than equivalent MP3 at same quality
- Better quality at low bitrates (important for web delivery)
- Supported by all modern browsers (Chrome, Firefox, Safari 11+, Edge)
- Standard format for web games

**Why MP3 fallback:**
- Universal support including older browsers
- Howler.js handles format fallback automatically

**For short SFX (< 1 second):** WAV is acceptable — the size difference is negligible for tiny files and quality is pristine. But OGG is still fine.

**Bitrate recommendations:**
- Background music: 128-160 kbps OGG
- UI/SFX: 96-128 kbps OGG (or WAV for < 0.5s sounds)
- Ambient loops: 112-128 kbps OGG

---

## 6. Procedural Audio Options (Tone.js)

### When to Consider Procedural Audio
- **Reactive music:** Tempo/intensity changes based on cult size, ritual activity, or danger level
- **Dynamic rituals:** Each ritual generates unique audio based on parameters (cultist count, deity type, sacrifice type)
- **Adaptive ambience:** Layered ambient drones that add/subtract layers based on game state

### Tone.js Capabilities
- Synthesizers (MonoSynth, PolySynth, FMSynth, AMSynth)
- Samples + playback (Tone.Player, Tone.Players)
- Effects chain (reverb, delay, distortion, filter, chorus)
- Sequencing (Tone.Sequence, Tone.Pattern)
- Transport control (BPM, swing, loop points)
- LFOs and automation for evolving textures

### Cult Tycoon Procedural Ideas
1. **Cultist chant generator:** Layer detuned oscillators with reverb → crowd chant texture that grows with cult size
2. **Ritual stinger system:** Trigger dissonant tone clusters + reverb sweeps on ritual events
3. **Adaptive background drone:** Low-frequency drone (40-80 Hz) + slow LFO on filter → eerie atmosphere that intensifies with cult devotion level
4. **UI feedback:** Procedurally generated blips with pitch shifting for satisfying interactions

### Verdict: Optional enhancement, not MVP-critical

Procedural audio adds significant development complexity. For MVP, use pre-recorded assets. Consider Tone.js for a post-launch "adaptive audio" update if the game gains traction — it would be a strong differentiator and great for Steam updates.

---

## 7. Budget Options

### Tier 0: $0 MVP (Fully Free)
| Source | Use For | License |
|--------|---------|---------|
| Kenney.nl sound packs | UI clicks, impacts, placement | CC0 |
| Incompetech (Kevin MacLeod) | Background music tracks | CC BY 4.0 (attribute) |
| Freesound.org (CC0 filter) | Ambient loops, ritual SFX, fire/wind | CC0 |
| Sonniss GDC bundles | Professional-grade SFX fills | Royalty-free |
| itch.io free packs | Niche atmospheric sounds | Varies (check) |

**Total cost: $0**  
**Requirement:** Credits screen with Kevin MacLeod attribution + any other CC BY attributions  
**Quality:** Good enough for Steam release. Many successful indie games use exactly this stack.

### Tier 1: $20-50 (Light Investment)
- Buy 1-2 paid music packs from itch.io ($10-25 each) for unique cult-themed tracks
- Consider a paid SFX pack from Sonniss or Pond5 for higher-quality ritual sounds
- Commission a custom intro/outro track from an indie composer on Fiverr ($20-50)

### Tier 2: $100-300 (Professional Touch)
- Hire a composer for 3-5 custom looping tracks ($60-150 per track, indie rates)
- Buy professional SFX libraries (Sonniss full packs, $30-100 each)
- Commission custom UI sound design ($50-100)

### Tier 3: $500-2000 (Full Custom Audio)
- Full original soundtrack (10-15 tracks, ~$500-1500 at indie rates)
- Custom SFX library + implementation ($300-500)
- This is what "Cult of the Lamb" level polish would cost

### 🏆 Recommendation for Cult Tycoon MVP: **Tier 0 ($0)**

Use free sources for MVP. The quality is sufficient for a $14.99 indie game. Budget for Tier 1-2 improvements post-launch if the game sells well. Many successful Steam indie games use CC0/CC BY audio exclusively.

---

## 8. Implementation Architecture

### Recommended Setup

```
src/
├── audio/
│   ├── AudioManager.ts      # Howler.js wrapper, central controller
│   ├── AudioManifest.ts     # Sound definitions, paths, settings
│   ├── PositionalAudio.ts   # Three.js PositionalAudio helpers
│   └── sprites/             # Audio sprite definitions
├── assets/
│   ├── audio/
│   │   ├── music/           # Background tracks (.ogg)
│   │   ├── sfx/             # UI + event sounds (.ogg)
│   │   ├── ambient/         # Looped environment sounds (.ogg)
│   │   └── rituals/         # Ritual stingers (.ogg)
```

### AudioManager Skeleton

```typescript
import { Howl, Howler } from 'howler';

export class AudioManager {
  private sounds: Map<string, Howl> = new Map();
  private musicVolume = 0.5;
  private sfxVolume = 0.7;
  private currentMusic: Howl | null = null;

  // Preload critical SFX at game start
  async preload(manifest: Record<string, string>): Promise<void> {
    const entries = Object.entries(manifest);
    await Promise.all(entries.map(([key, path]) => this.load(key, path)));
  }

  load(key: string, path: string): Promise<void> {
    return new Promise((resolve) => {
      const sound = new Howl({
        src: [`${path}.ogg`, `${path}.mp3`],
        format: ['ogg', 'mp3'],
        onload: () => resolve(),
      });
      this.sounds.set(key, sound);
    });
  }

  playSfx(key: string, volume?: number): void {
    const sound = this.sounds.get(key);
    if (sound) sound.volume((volume ?? 1) * this.sfxVolume).play();
  }

  playMusic(key: string, loop = true, fadeMs = 2000): void {
    this.currentMusic?.fade(this.currentMusic.volume(), 0, fadeMs);
    const sound = this.sounds.get(key);
    if (sound) {
      sound.loop(loop);
      sound.volume(0);
      sound.play();
      sound.fade(0, this.musicVolume, fadeMs);
      this.currentMusic = sound;
    }
  }

  setMusicVolume(v: number): void {
    this.musicVolume = v;
    this.currentMusic?.volume(v);
  }

  setSfxVolume(v: number): void {
    this.sfxVolume = v;
    Howler.volume(v);
  }
}
```

### Three.js Positional Audio (for world sounds)

```typescript
import * as THREE from 'three';

export function createPositionalSound(
  listener: THREE.AudioListener,
  path: string,
  refDistance = 15,
  loop = true
): THREE.PositionalAudio {
  const sound = new THREE.PositionalAudio(listener);
  const loader = new THREE.AudioLoader();
  loader.load(path, (buffer) => {
    sound.setBuffer(buffer);
    sound.setRefDistance(refDistance);
    sound.setLoop(loop);
    sound.play();
  });
  return sound;
}

// Attach to a scene object
const fireSound = createPositionalSound(listener, 'assets/audio/ambient/fire.ogg', 10);
campfireMesh.add(fireSound);
```

---

## 9. Specific Asset Recommendations for Cult Tycoon

### Background Music (from free sources)
| Track/Source | Vibe | URL |
|--------------|------|-----|
| Kevin MacLeod — "Lurking" | Sneaky, dark ambient | <https://incompetech.com> |
| Kevin MacLeod — "Court and Page" | Medieval, cultish | <https://incompetech.com> |
| Kevin MacLeod — "Anguish" | Tense, ritualistic | <https://incompetech.com> |
| Kevin MacLeod — "Unholy Knight" | Dark fantasy | <https://incompetech.com> |
| Kevin MacLeod — "The Descent" | Ominous, building dread | <https://incompetech.com> |
| FMA — Search "dark ambient" | Various artists | <https://freemusicarchive.org> |

### UI Sounds (from Kenney)
| Pack | Contents | URL |
|------|----------|-----|
| Impact Sounds | 130 impact/hit SFX | <https://kenney.nl/assets/impact-sounds> |
| Digital Audio | 60 digital/electronic SFX | <https://kenney.nl/assets/digital-audio> |
| UI Sounds | Clicks, toggles, confirms | <https://kenney.nl/assets/ui-sounds> |

### Ambient/Ritual SFX (from Freesound + Sonniss)
| Need | Search Terms (Freesound CC0) |
|------|------------------------------|
| Fire crackling | "fire campfire crackling" |
| Wind/night | "wind ambient night" |
| Bell/chime | "bell toll church" |
| Chant/choir | "chant choir drone" |
| Cosmic/stinger | "impact cinematic riser" |
| Crowd murmur | "crowd murmur ambient" |

### Sonniss GDC 2026 Bundle
- Download: <https://gdc.sonniss.com/>
- 7.47GB of professional SFX — includes foley, ambiences, impacts, whooshes
- Filter for: ambient textures, metallic impacts (ritual), choir/vocal sounds

---

## 10. Credits/Legal Checklist

For a commercial Steam game at $14.99, ensure:

- [ ] **CC0 assets (Kenney, Freesound CC0):** No attribution required, but nice to include in credits
- [ ] **CC BY 4.0 assets (Kevin MacLeod/Incompetech):** Attribution REQUIRED in credits screen + README
- [ ] **CC BY-NC assets:** DO NOT USE (non-commercial only)
- [ ] **Sonniss bundles:** Check each file's license — most are royalty-free for commercial use
- [ ] **Credits screen:** Include in-game credits section listing all audio sources
- [ ] **LICENSE file:** Include in game files listing all third-party audio assets and their licenses
- [ ] **Steam store page:** Some jurisdictions require disclosing third-party content licenses

### Credits Screen Template

```
AUDIO CREDITS

Music:
  Track Name — Kevin MacLeod (incompetech.com)
  Licensed under Creative Commons: By Attribution 4.0
  https://creativecommons.org/licenses/by/4.0/

Sound Effects:
  Kenney (kenney.nl) — CC0 1.0
  Freesound.org contributors (see LICENSE file)
  Sonniss GDC Game Audio Bundle

Additional audio: See LICENSE file in game directory
```

---

## 11. Action Items

1. **Download immediately:** Kenney sound packs (UI, Impact, Digital Audio)
2. **Download immediately:** Sonniss GDC 2026 bundle (7.47GB, huge professional SFX library)
3. **Browse & select:** Kevin MacLeod tracks on Incompetech that fit cult vibe (5-10 tracks)
4. **Search & download:** Freesound.org CC0 sounds for ambient + ritual SFX
5. **Install:** `npm install howler` + `@types/howler`
6. **Implement:** AudioManager class (see Section 8)
7. **Set up:** Audio manifest with all selected assets
8. **Create:** Credits screen with all attributions
9. **Convert:** All audio to OGG Vorbis (use ffmpeg: `ffmpeg -i input.wav -c:a libvorbis -qscale:a 4 output.ogg`)
10. **Test:** Volume mixing, music transitions, positional audio with Three.js

---

## Summary

| Decision | Recommendation |
|----------|----------------|
| **SFX library** | Howler.js (7KB, zero deps, full codec support) |
| **3D audio** | Three.js PositionalAudio (native integration) |
| **Music format** | OGG Vorbis primary, MP3 fallback |
| **Background music** | Kevin MacLeod / Incompetech (CC BY 4.0) |
| **UI sounds** | Kenney.nl sound packs (CC0) |
| **Ambient/SFX** | Freesound.org (CC0 filter) + Sonniss GDC bundles |
| **Procedural audio** | Skip for MVP; consider Tone.js post-launch |
| **Budget** | $0 MVP, revisit if game sells well |
| **Total external deps** | 1 (howler.js, 7KB gzipped) |