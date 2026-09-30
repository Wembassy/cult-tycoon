# Steam Publishing Guide

## Overview
Cult Tycoon is packaged as an Electron app for Steam distribution.

## Prerequisites
- [Steamworks SDK](https://partner.steamgames.com/downloads/steamworks_sdk.zip)
- [Steam Direct](https://partner.steamgames.com/steamdirect) account ($100 one-time fee)
- `steamworks.js` npm package (optional, for achievements/cloud saves)

## Build Process

### 1. Build the game
```bash
npm run build      # Vite + TypeScript build
```

### 2. Package with Electron Builder
```bash
npm run electron:dist    # All platforms
npm run steam:build      # Windows only (for Steam upload)
```

Output goes to `release/` directory.

### 3. Steamworks Integration (Optional)
```bash
npm install steamworks.js
```

Add to `electron/main.js`:
```js
const Steamworks = require('steamworks.js');
const steam = Steamworks.init(PLACEHOLDER_STEAM_APP_ID);
// steam.stats.set('followers_recruited', 100);
// steam.cloud.write('save.json', saveData);
```

### 4. Upload to Steam
1. Download [SteamPipe GUI Tool](https://partner.steamgames.com/tools-steampipe-gui)
2. Create a depot for your app
3. Upload the contents of `release/` via SteamPipe
4. Set store page metadata on Steamworks partner site

## Configuration

### electron-builder.json
- `appId`: Unique app identifier
- `steam.steamAppId`: Replace `PLACEHOLDER_STEAM_APP_ID` with your actual Steam App ID

### Steam Store Page
- **Price**: $14.99 USD base
- **Genres**: Strategy, Simulation, Indie
- **Tags**: Tycoon, Base Building, Resource Management, Cult
- **Features**: Single-player, Steam Cloud (saves), Steam Achievements

## Steam Achievements (Future)
- First Follower — Recruit your first cult member
- Cult Leader — Reach 20 followers
- Divine Intervention — Unlock all tech tree nodes
- Architect — Build 100 structures
- Survivalist — Survive 30 days without any follower deaths

## DLC Roadmap
- Cult Tycoon: Ancient Rites — New rituals, buildings, and tech tree branch
- Cult Tycoon: The Investigator — Enemy AI that raids your compound
- Steam Workshop support for custom buildings and scenarios