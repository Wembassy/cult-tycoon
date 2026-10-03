#!/usr/bin/env python3
"""Generate a shared follower animation library from the canonical Cult Tycoon rig.

The generator reads the canonical follower GLB, preserves the exact joint hierarchy and
rest transforms, and emits a mesh-free GLB containing semantic animation clips:
Idle, Walk, Work, Pray, Eat, Sleep.

No third-party motion data is used. All motion is authored procedurally below.
"""

from __future__ import annotations

import json
import math
import os
import struct
from pathlib import Path
from typing import Dict, List, Tuple

ROOT = Path(__file__).resolve().parents[1]
SOURCE = ROOT / "public/assets/models/followers/fantasy_wizard_01.glb"
OUTPUT = ROOT / "public/assets/animations/followers/follower_animation_library.glb"
MANIFEST = ROOT / "public/assets/animations/followers/manifest.json"

GLB_JSON = 0x4E4F534A
GLB_BIN = 0x004E4942
GLB_MAGIC = 0x46546C67


def read_glb_json(path: Path) -> dict:
    data = path.read_bytes()
    magic, version, length = struct.unpack_from("<III", data, 0)
    if magic != GLB_MAGIC or version != 2 or length != len(data):
        raise ValueError(f"Invalid GLB: {path}")
    offset = 12
    while offset < len(data):
        chunk_len, chunk_type = struct.unpack_from("<II", data, offset)
        offset += 8
        chunk = data[offset:offset + chunk_len]
        offset += chunk_len
        if chunk_type == GLB_JSON:
            return json.loads(chunk.decode("utf-8").rstrip("\x00 \t\r\n"))
    raise ValueError("GLB JSON chunk not found")


def quat_mul(a: Tuple[float, float, float, float], b: Tuple[float, float, float, float]):
    ax, ay, az, aw = a
    bx, by, bz, bw = b
    return (
        aw * bx + ax * bw + ay * bz - az * by,
        aw * by - ax * bz + ay * bw + az * bx,
        aw * bz + ax * by - ay * bx + az * bw,
        aw * bw - ax * bx - ay * by - az * bz,
    )


def quat_axis(axis: str, degrees: float):
    half = math.radians(degrees) * 0.5
    s, c = math.sin(half), math.cos(half)
    if axis == "x":
        return (s, 0.0, 0.0, c)
    if axis == "y":
        return (0.0, s, 0.0, c)
    if axis == "z":
        return (0.0, 0.0, s, c)
    raise ValueError(axis)


def quat_euler(rx=0.0, ry=0.0, rz=0.0):
    q = (0.0, 0.0, 0.0, 1.0)
    for axis, deg in (("x", rx), ("y", ry), ("z", rz)):
        q = quat_mul(q, quat_axis(axis, deg))
    return q


def normalize(q):
    mag = math.sqrt(sum(v * v for v in q))
    return tuple(v / mag for v in q)


class BufferBuilder:
    def __init__(self):
        self.data = bytearray()
        self.buffer_views = []
        self.accessors = []

    def _align(self):
        while len(self.data) % 4:
            self.data.append(0)

    def add_floats(self, values: List[float], components: int, *, with_minmax=False):
        self._align()
        byte_offset = len(self.data)
        self.data.extend(struct.pack("<" + "f" * len(values), *values))
        view_index = len(self.buffer_views)
        self.buffer_views.append({
            "buffer": 0,
            "byteOffset": byte_offset,
            "byteLength": len(values) * 4,
        })
        count = len(values) // components
        accessor = {
            "bufferView": view_index,
            "componentType": 5126,
            "count": count,
            "type": {1: "SCALAR", 3: "VEC3", 4: "VEC4"}[components],
        }
        if with_minmax and values:
            groups = [values[i:i + components] for i in range(0, len(values), components)]
            accessor["min"] = [min(row[i] for row in groups) for i in range(components)]
            accessor["max"] = [max(row[i] for row in groups) for i in range(components)]
        idx = len(self.accessors)
        self.accessors.append(accessor)
        return idx


def main():
    src = read_glb_json(SOURCE)
    nodes = src.get("nodes", [])
    skins = src.get("skins", [])
    if not skins:
        raise SystemExit("Canonical follower has no skin")

    joint_indices = list(dict.fromkeys(i for skin in skins for i in skin.get("joints", [])))
    joint_set = set(joint_indices)
    old_to_new = {old: new for new, old in enumerate(joint_indices)}

    # Copy only canonical joints, retaining local rest transforms and joint hierarchy.
    out_nodes = []
    names = {}
    for old_index in joint_indices:
        node = nodes[old_index]
        name = node.get("name", f"joint_{old_index}")
        names[name] = old_to_new[old_index]
        copied = {"name": name}
        for key in ("translation", "rotation", "scale", "matrix"):
            if key in node:
                copied[key] = node[key]
        children = [old_to_new[c] for c in node.get("children", []) if c in joint_set]
        if children:
            copied["children"] = children
        out_nodes.append(copied)

    child_joints = {child for n in out_nodes for child in n.get("children", [])}
    roots = [i for i in range(len(out_nodes)) if i not in child_joints]

    base_rot = {
        node["name"]: tuple(node.get("rotation", [0.0, 0.0, 0.0, 1.0]))
        for node in out_nodes
    }
    base_pos = {
        node["name"]: tuple(node.get("translation", [0.0, 0.0, 0.0]))
        for node in out_nodes
    }

    builder = BufferBuilder()
    animations = []

    def rotation_track(bone: str, times: List[float], poses: List[Tuple[float, float, float]]):
        if bone not in names:
            return None
        values = []
        base = base_rot[bone]
        for rx, ry, rz in poses:
            q = normalize(quat_mul(base, quat_euler(rx, ry, rz)))
            values.extend(q)
        return bone, times, values, "rotation"

    def translation_track(bone: str, times: List[float], offsets: List[Tuple[float, float, float]]):
        if bone not in names:
            return None
        bx, by, bz = base_pos[bone]
        values = []
        for ox, oy, oz in offsets:
            values.extend((bx + ox, by + oy, bz + oz))
        return bone, times, values, "translation"

    def add_clip(name: str, tracks):
        samplers = []
        channels = []
        time_cache = {}
        for track in tracks:
            if track is None:
                continue
            bone, times, values, path = track
            times_key = tuple(times)
            if times_key not in time_cache:
                time_cache[times_key] = builder.add_floats(list(times), 1, with_minmax=True)
            input_accessor = time_cache[times_key]
            output_accessor = builder.add_floats(values, 4 if path == "rotation" else 3)
            sampler_index = len(samplers)
            samplers.append({
                "input": input_accessor,
                "output": output_accessor,
                "interpolation": "LINEAR",
            })
            channels.append({
                "sampler": sampler_index,
                "target": {"node": names[bone], "path": path},
            })
        animations.append({"name": name, "samplers": samplers, "channels": channels})

    # IDLE — slow breathing and weight shift.
    t = [0.0, 0.5, 1.0, 1.5, 2.0]
    add_clip("Idle", [
        translation_track("pelvis", t, [(0,0,0),(0,0.012,0),(0,0,0),(0,0.008,0),(0,0,0)]),
        rotation_track("spine_02", t, [(0,0,0),(1.2,0,0),(0,0,0),(-0.8,0,0),(0,0,0)]),
        rotation_track("head", t, [(0,0,0),(0,1.5,0),(0,0,0),(0,-1.5,0),(0,0,0)]),
    ])

    # WALK — in-place cycle with opposing arm/leg swing and pelvis bob.
    t = [0.0, 0.2, 0.4, 0.6, 0.8]
    add_clip("Walk", [
        translation_track("pelvis", t, [(0,0,0),(0,0.025,0),(0,0,0),(0,0.025,0),(0,0,0)]),
        rotation_track("thigh_l", t, [(25,0,0),(0,0,0),(-25,0,0),(0,0,0),(25,0,0)]),
        rotation_track("thigh_r", t, [(-25,0,0),(0,0,0),(25,0,0),(0,0,0),(-25,0,0)]),
        rotation_track("calf_l", t, [(0,0,0),(22,0,0),(5,0,0),(0,0,0),(0,0,0)]),
        rotation_track("calf_r", t, [(5,0,0),(0,0,0),(0,0,0),(22,0,0),(5,0,0)]),
        rotation_track("upperarm_l", t, [(-20,0,0),(0,0,0),(20,0,0),(0,0,0),(-20,0,0)]),
        rotation_track("upperarm_r", t, [(20,0,0),(0,0,0),(-20,0,0),(0,0,0),(20,0,0)]),
        rotation_track("spine_02", t, [(0,0,-2),(0,0,0),(0,0,2),(0,0,0),(0,0,-2)]),
    ])

    # WORK — repeated right-arm tool motion with torso lean.
    t = [0.0, 0.3, 0.6, 0.9, 1.2]
    add_clip("Work", [
        rotation_track("spine_02", t, [(-5,0,0),(-10,0,0),(-3,0,0),(-10,0,0),(-5,0,0)]),
        rotation_track("upperarm_r", t, [(-10,0,-15),(-42,0,-12),(-8,0,-10),(-42,0,-12),(-10,0,-15)]),
        rotation_track("lowerarm_r", t, [(-25,0,0),(-60,0,0),(-20,0,0),(-60,0,0),(-25,0,0)]),
        rotation_track("upperarm_l", t, [(-15,0,10),(-20,0,10),(-15,0,10),(-20,0,10),(-15,0,10)]),
    ])

    # PRAY — hands raised toward the chest with a gentle bow.
    t = [0.0, 0.5, 1.0, 1.5, 2.0]
    add_clip("Pray", [
        rotation_track("spine_02", t, [(-5,0,0),(-9,0,0),(-7,0,0),(-9,0,0),(-5,0,0)]),
        rotation_track("head", t, [(5,0,0),(9,0,0),(7,0,0),(9,0,0),(5,0,0)]),
        rotation_track("upperarm_l", t, [(-30,0,28),(-34,0,30),(-32,0,29),(-34,0,30),(-30,0,28)]),
        rotation_track("upperarm_r", t, [(-30,0,-28),(-34,0,-30),(-32,0,-29),(-34,0,-30),(-30,0,-28)]),
        rotation_track("lowerarm_l", t, [(-65,0,0),(-70,0,0),(-67,0,0),(-70,0,0),(-65,0,0)]),
        rotation_track("lowerarm_r", t, [(-65,0,0),(-70,0,0),(-67,0,0),(-70,0,0),(-65,0,0)]),
    ])

    # EAT — right hand repeatedly comes toward the face.
    t = [0.0, 0.4, 0.8, 1.2, 1.6]
    add_clip("Eat", [
        rotation_track("upperarm_r", t, [(-20,0,-10),(-45,0,-18),(-20,0,-10),(-45,0,-18),(-20,0,-10)]),
        rotation_track("lowerarm_r", t, [(-35,0,0),(-85,0,0),(-35,0,0),(-85,0,0),(-35,0,0)]),
        rotation_track("head", t, [(0,0,0),(6,-3,0),(0,0,0),(6,-3,0),(0,0,0)]),
    ])

    # SLEEP — curled/resting pose with slow breathing; wrapper applies the horizontal lean.
    t = [0.0, 0.75, 1.5, 2.25, 3.0]
    add_clip("Sleep", [
        translation_track("pelvis", t, [(0,0,0),(0,0.008,0),(0,0,0),(0,0.008,0),(0,0,0)]),
        rotation_track("spine_01", t, [(4,0,3),(5,0,3),(4,0,3),(5,0,3),(4,0,3)]),
        rotation_track("thigh_l", t, [(12,0,0),(12,0,0),(12,0,0),(12,0,0),(12,0,0)]),
        rotation_track("thigh_r", t, [(10,0,0),(10,0,0),(10,0,0),(10,0,0),(10,0,0)]),
        rotation_track("calf_l", t, [(-20,0,0),(-20,0,0),(-20,0,0),(-20,0,0),(-20,0,0)]),
        rotation_track("calf_r", t, [(-18,0,0),(-18,0,0),(-18,0,0),(-18,0,0),(-18,0,0)]),
        rotation_track("upperarm_l", t, [(-15,0,18),(-15,0,18),(-15,0,18),(-15,0,18),(-15,0,18)]),
        rotation_track("upperarm_r", t, [(-18,0,-15),(-18,0,-15),(-18,0,-15),(-18,0,-15),(-18,0,-15)]),
    ])

    gltf = {
        "asset": {"version": "2.0", "generator": "Cult Tycoon procedural follower animator"},
        "scene": 0,
        "scenes": [{"nodes": roots}],
        "nodes": out_nodes,
        "animations": animations,
        "buffers": [{"byteLength": len(builder.data)}],
        "bufferViews": builder.buffer_views,
        "accessors": builder.accessors,
    }

    json_bytes = json.dumps(gltf, separators=(",", ":")).encode("utf-8")
    while len(json_bytes) % 4:
        json_bytes += b" "
    bin_bytes = bytes(builder.data)
    while len(bin_bytes) % 4:
        bin_bytes += b"\x00"

    total_length = 12 + 8 + len(json_bytes) + 8 + len(bin_bytes)
    out = bytearray()
    out.extend(struct.pack("<III", GLB_MAGIC, 2, total_length))
    out.extend(struct.pack("<II", len(json_bytes), GLB_JSON))
    out.extend(json_bytes)
    out.extend(struct.pack("<II", len(bin_bytes), GLB_BIN))
    out.extend(bin_bytes)

    OUTPUT.parent.mkdir(parents=True, exist_ok=True)
    OUTPUT.write_bytes(out)

    MANIFEST.write_text(json.dumps({
        "enabled": True,
        "source": "./assets/animations/followers/follower_animation_library.glb",
    }, indent=2) + "\n", encoding="utf-8")

    print(f"Generated {OUTPUT.relative_to(ROOT)} ({len(out)} bytes)")
    print("Clips:", ", ".join(a["name"] for a in animations))
    print("Joint roots:", [out_nodes[i]["name"] for i in roots])


if __name__ == "__main__":
    main()
