# Follower Animation Pipeline

Cult Tycoon uses a shared animation-controller vocabulary across all follower models:

- `idle`
- `walk`
- `work`
- `pray`
- `eat`
- `sleep`

The active follower characters share the same 44-joint rig structure, so the preferred production setup is one shared, labeled animation library rather than embedding anonymous clips into every character GLB.

## Runtime contract

Place a shared animation GLB at:

`public/assets/animations/followers/follower_animation_library.glb`

Then set:

`public/assets/animations/followers/manifest.json`

to:

```json
{
  "enabled": true,
  "source": "./assets/animations/followers/follower_animation_library.glb"
}
```

The GLB should contain semantically named clips. The runtime recognizes clip names containing:

| State | Accepted keywords |
|---|---|
| idle | idle, stand, standing, rest, breath |
| walk | walk, locomotion, move |
| work | work, hammer, build, clean, research, cook, craft |
| pray | pray, prayer, worship, ritual, kneel |
| eat | eat, eating, drink, drinking |
| sleep | sleep, sleeping, lie, lying |

A shared animation clip is preferred over any clip embedded in the character model. If no semantic clip is available, the renderer uses the safe rest pose plus a small procedural fallback rather than guessing from anonymous clips.

## Asset requirements

The animation library must target the same follower rig used by the current character set. CI audits:

- skin/joint structure,
- invalid animation targets,
- animation clip names,
- clip duration and channel counts.

Do not map anonymous clips such as `Armature|Take 001|BaseLayer.003` to gameplay states by index. The current character exports contain different clip counts, so index-based mappings are not reliable.

## Recommended source assets

The POLYGON MINI Fantasy Characters pack is Mecanim-ready but does not include a locomotion set. Use a legally licensed animation source compatible with the Synty POLYGON rig, then export/retarget the six required gameplay states above into the shared library GLB.

Once the manifest is enabled, the existing controller automatically cross-fades between the matching clips based on follower AI/job state.
