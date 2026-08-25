#!/usr/bin/env python3
"""Generate the Cube Kids 20-animal pack as Studio .animal.json files.

v2: bodies and heads are voxelized from a fine cube grid (with a subtle
two-tone dither so individual cubes stay visible, like the reference art),
then greedy-merged into boxes. Animated parts (legs, ears/wings, tails) stay
chunky so the role-pivot animation doesn't shear them.
Output: animal-pack/<name>.animal.json
"""
import json, math, os

OUT = os.path.join(os.path.dirname(__file__), '..', 'animal-pack')
os.makedirs(OUT, exist_ok=True)

U = 0.15  # voxel size (world units); set per animal to land ~1000 blocks each

def set_u(v):
    """Per-animal voxel fineness: smaller cubes -> more blocks (count ~ U^-3)."""
    global U
    U = v

ANIM = {
    "idle": {"bob": 0.05, "speed": 1.6},
    "walk": {"legSwing": 42, "bodyBob": 0.09, "speed": 2.2},
    "jump": {"height": 1.1, "tuck": 34, "speed": 0.9},
}

_n = 0
def B(name, role, pos, size, color, rot=None):
    global _n
    _n += 1
    return {"id": f"b{_n}", "name": name, "role": role,
            "pos": [round(p, 3) for p in pos], "size": [round(s, 3) for s in size],
            "rot": rot or [0, 0, 0], "color": color}

# ---- colour utils ----------------------------------------------------------

def hx(c):  # '#rrggbb' -> (r,g,b)
    return tuple(int(c[i:i+2], 16) for i in (1, 3, 5))

def hs(rgb):
    return '#%02x%02x%02x' % tuple(max(0, min(255, int(v))) for v in rgb)

def mul(c, k):
    return hs(tuple(v * k for v in hx(c)))

def dither(c, ix, iy, iz):
    """Two-tone checker so merged boxes keep a visible cube texture."""
    return c if (ix + iy + iz) % 2 == 0 else mul(c, 0.93)

# ---- voxel grid + greedy merge --------------------------------------------

class Vox:
    def __init__(self):
        self.cells = {}  # (ix,iy,iz) -> color

    def set(self, ix, iy, iz, color):
        self.cells[(ix, iy, iz)] = color

    def ellipsoid(self, cx, cy, cz, rx, ry, rz, color_fn, wob=0.0, seed=1):
        """World-space ellipsoid filled with voxels. color_fn(wx,wy,wz)->hex|None."""
        x0, x1 = int((cx - rx) / U) - 1, int((cx + rx) / U) + 1
        y0, y1 = int((cy - ry) / U) - 1, int((cy + ry) / U) + 1
        z0, z1 = int((cz - rz) / U) - 1, int((cz + rz) / U) + 1
        for ix in range(x0, x1 + 1):
            for iy in range(y0, y1 + 1):
                for iz in range(z0, z1 + 1):
                    wx, wy, wz = ix * U, iy * U, iz * U
                    d = ((wx - cx) / rx) ** 2 + ((wy - cy) / ry) ** 2 + ((wz - cz) / rz) ** 2
                    w = 0.0
                    if wob:
                        s = math.sin(ix * 12.9898 + iy * 78.233 + iz * 37.719 + seed) * 43758.5453
                        w = (s - math.floor(s) - 0.5) * wob
                    if d <= 1 + w:
                        c = color_fn(wx, wy, wz)
                        if c:
                            self.set(ix, iy, iz, dither(c, ix, iy, iz))

    def box(self, x0, y0, z0, x1, y1, z1, color_fn):
        """World-space axis box filled with voxels."""
        for ix in range(int(x0 / U), int(x1 / U) + 1):
            for iy in range(int(y0 / U), int(y1 / U) + 1):
                for iz in range(int(z0 / U), int(z1 / U) + 1):
                    c = color_fn(ix * U, iy * U, iz * U)
                    if c:
                        self.set(ix, iy, iz, dither(c, ix, iy, iz))

    def merge(self, role, name):
        """Greedy-merge same-colour voxel runs into blocks (x, then z, then y)."""
        cells = dict(self.cells)
        blocks = []
        for key in sorted(cells.keys()):
            if key not in cells:
                continue
            ix, iy, iz = key
            c = cells[key]
            # extend along x
            x2 = ix
            while (x2 + 1, iy, iz) in cells and cells[(x2 + 1, iy, iz)] == c:
                x2 += 1
            # extend along z
            z2 = iz
            while all((x, iy, z2 + 1) in cells and cells[(x, iy, z2 + 1)] == c for x in range(ix, x2 + 1)):
                z2 += 1
            # extend along y
            y2 = iy
            while all((x, y2 + 1, z) in cells and cells[(x, y2 + 1, z)] == c
                      for x in range(ix, x2 + 1) for z in range(iz, z2 + 1)):
                y2 += 1
            for x in range(ix, x2 + 1):
                for y in range(iy, y2 + 1):
                    for z in range(iz, z2 + 1):
                        del cells[(x, y, z)]
            pos = [(ix + x2) / 2 * U, (iy + y2) / 2 * U, (iz + z2) / 2 * U]
            size = [(x2 - ix + 1) * U, (y2 - iy + 1) * U, (z2 - iz + 1) * U]
            blocks.append(B(f"{name} {len(blocks)+1}", role, pos, size, c))
        return blocks

def solid(c):
    return lambda wx, wy, wz: c

def design(name, blocks, anim_over=None):
    a = json.loads(json.dumps(ANIM))
    for clip, over in (anim_over or {}).items():
        a[clip].update(over)
    return {"id": f"pack-{name.lower().replace(' ', '-')}", "name": name,
            "updated": 0, "anim": a, "blocks": blocks}

def legs4(x, y, zf, zb, size, color, feet=None, foot_color=None):
    out = [B("Leg FL", "legFL", [-x, y, zf], size, color),
           B("Leg FR", "legFR", [x, y, zf], size, color),
           B("Leg BL", "legBL", [-x, y, zb], size, color),
           B("Leg BR", "legBR", [x, y, zb], size, color)]
    if feet:
        fy = y - size[1] / 2 - feet[1] / 2 + 0.02
        out += [B("Foot FL", "legFL", [-x, fy, zf + 0.03], feet, foot_color),
                B("Foot FR", "legFR", [x, fy, zf + 0.03], feet, foot_color),
                B("Foot BL", "legBL", [-x, fy, zb + 0.03], feet, foot_color),
                B("Foot BR", "legBR", [x, fy, zb + 0.03], feet, foot_color)]
    return out

packs = []

# ============================ QUADRUPED CORE ================================

def quadruped(name, body_c, belly_c, head_c, *, size=1.0, body_pat=None, head_pat=None,
              ears=None, tail=None, extra=None, legs=None, anim=None, head_at=None,
              body_at=None, body_r=None, head_r=None, muzzle=None, wob=0.25):
    """Voxel body + head with chunky limbs. Hooks add patterns and parts."""
    v = Vox()
    bx, by, bz = body_at or (0, 0.12, -0.08)
    brx, bry, brz = body_r or (0.5 * size, 0.44 * size, 0.8 * size)
    def body_fn(wx, wy, wz):
        if body_pat:
            c = body_pat(wx, wy, wz)
            if c:
                return c
        if belly_c and wy < by - bry * 0.35:
            return belly_c
        return body_c
    v.ellipsoid(bx, by, bz, brx, bry, brz, body_fn, wob=wob)
    blocks = v.merge("body", "Body")

    hv = Vox()
    hx_, hy_, hz_ = head_at or (0, 0.62 * size, 0.72 * size)
    hrx, hry, hrz = head_r or (0.42 * size, 0.38 * size, 0.36 * size)
    def head_fn(wx, wy, wz):
        if head_pat:
            c = head_pat(wx, wy, wz)
            if c:
                return c
        return head_c
    hv.ellipsoid(hx_, hy_, hz_, hrx, hry, hrz, head_fn, wob=0.2, seed=7)
    blocks += hv.merge("head", "Head")

    if muzzle:
        blocks += muzzle
    if ears:
        blocks += ears
    if tail:
        blocks += tail
    blocks += legs if legs else legs4(0.32 * size, -0.5 * size, 0.42 * size, -0.42 * size,
                                      [0.24 * size, 0.4 * size, 0.24 * size], body_c)
    if extra:
        blocks += extra
    return design(name, blocks, anim)

# ---- 1 FOX -----------------------------------------------------------------
set_u(0.081)
o, cream, dark = "#e8722e", "#fff1dd", "#8a4a1f"
packs.append(quadruped(
    "Fox", o, cream, o,
    body_pat=lambda wx, wy, wz: "#d8641f" if wy > 0.38 else None,
    head_pat=lambda wx, wy, wz: cream if (abs(wx) > 0.26 and wy < 0.62 and wz > 0.7) else None,
    muzzle=[
        B("Snout", "head", [0, 0.5, 1.12], [0.34, 0.28, 0.3], cream),
        B("Nose", "head", [0, 0.56, 1.3], [0.15, 0.13, 0.1], "#2a1c14"),
        B("Eye L", "head", [-0.2, 0.72, 1.02], [0.1, 0.13, 0.06], "#1c1c1c"),
        B("Eye R", "head", [0.2, 0.72, 1.02], [0.1, 0.13, 0.06], "#1c1c1c"),
    ],
    ears=[
        B("Ear L", "ear", [-0.26, 1.06, 0.6], [0.22, 0.3, 0.12], o),
        B("Ear R", "ear", [0.26, 1.06, 0.6], [0.22, 0.3, 0.12], o),
        B("Ear tip L", "ear", [-0.26, 1.24, 0.6], [0.15, 0.12, 0.1], "#2a1c14"),
        B("Ear tip R", "ear", [0.26, 1.24, 0.6], [0.15, 0.12, 0.1], "#2a1c14"),
    ],
    tail=[
        B("Tail 1", "tail", [0, 0.18, -0.92], [0.3, 0.3, 0.35], o),
        B("Tail 2", "tail", [0, 0.26, -1.2], [0.38, 0.38, 0.32], "#d8641f"),
        B("Tail tip", "tail", [0, 0.32, -1.45], [0.28, 0.28, 0.22], cream),
    ],
    legs=legs4(0.32, -0.52, 0.42, -0.42, [0.22, 0.36, 0.22], dark,
               feet=[0.24, 0.12, 0.26], foot_color="#6d3a18"),
))

# ---- 2 PANDA ---------------------------------------------------------------
set_u(0.0849)
w, k = "#f5f5f0", "#232323"
packs.append(quadruped(
    "Panda", w, None, w, size=1.05,
    body_pat=lambda wx, wy, wz: k if 0.18 < wz < 0.55 else None,  # shoulder band
    head_pat=lambda wx, wy, wz: None,
    head_at=(0, 0.68, 0.72), head_r=(0.46, 0.42, 0.38),
    muzzle=[
        B("Eye patch L", "head", [-0.24, 0.72, 1.02], [0.26, 0.3, 0.1], k),
        B("Eye patch R", "head", [0.24, 0.72, 1.02], [0.26, 0.3, 0.1], k),
        B("Eye L", "head", [-0.24, 0.74, 1.08], [0.1, 0.12, 0.05], "#ffffff"),
        B("Eye R", "head", [0.24, 0.74, 1.08], [0.1, 0.12, 0.05], "#ffffff"),
        B("Pupil L", "head", [-0.24, 0.74, 1.11], [0.05, 0.06, 0.04], k),
        B("Pupil R", "head", [0.24, 0.74, 1.11], [0.05, 0.06, 0.04], k),
        B("Snout", "head", [0, 0.5, 1.06], [0.32, 0.24, 0.16], w),
        B("Nose", "head", [0, 0.56, 1.15], [0.14, 0.11, 0.08], k),
    ],
    ears=[
        B("Ear L", "ear", [-0.36, 1.12, 0.62], [0.26, 0.26, 0.16], k),
        B("Ear R", "ear", [0.36, 1.12, 0.62], [0.26, 0.26, 0.16], k),
    ],
    tail=[B("Tail", "tail", [0, 0.08, -0.9], [0.24, 0.24, 0.16], k)],
    legs=legs4(0.38, -0.55, 0.42, -0.42, [0.3, 0.42, 0.3], k),
    extra=[
        B("Bamboo", "legFR", [0.55, -0.32, 0.6], [0.09, 0.55, 0.09], "#59b53c"),
        B("Bamboo leaf", "legFR", [0.64, 0.0, 0.6], [0.2, 0.07, 0.12], "#6fd24a"),
    ],
))

# ---- 3 LION ----------------------------------------------------------------
set_u(0.0802)
g, mane, tuft = "#f2b53c", "#9a5b22", "#7a441a"
mane_blocks = []
for i, (mx, my) in enumerate([(-0.44, 1.02), (0, 1.14), (0.44, 1.02), (-0.56, 0.62), (0.56, 0.62),
                              (-0.44, 0.22), (0, 0.1), (0.44, 0.22)]):
    c = mane if i % 2 == 0 else tuft
    mane_blocks.append(B(f"Mane {i+1}", "head", [mx, my, 0.48], [0.34, 0.38, 0.3], c))
packs.append(quadruped(
    "Lion", g, "#ffe0a8", g,
    head_at=(0, 0.62, 0.72), head_r=(0.4, 0.38, 0.34),
    muzzle=mane_blocks + [
        B("Muzzle", "head", [0, 0.5, 1.06], [0.4, 0.32, 0.2], "#ffe0a8"),
        B("Nose", "head", [0, 0.6, 1.16], [0.15, 0.12, 0.08], "#4a2c16"),
        B("Eye L", "head", [-0.19, 0.74, 1.02], [0.1, 0.12, 0.06], "#1c1c1c"),
        B("Eye R", "head", [0.19, 0.74, 1.02], [0.1, 0.12, 0.06], "#1c1c1c"),
    ],
    ears=[
        B("Ear L", "ear", [-0.32, 1.1, 0.55], [0.18, 0.16, 0.12], g),
        B("Ear R", "ear", [0.32, 1.1, 0.55], [0.18, 0.16, 0.12], g),
    ],
    tail=[
        B("Tail", "tail", [0, 0.2, -1.0], [0.13, 0.13, 0.45], g),
        B("Tail tuft", "tail", [0, 0.2, -1.32], [0.22, 0.22, 0.2], tuft),
    ],
))

# ---- 4 ELEPHANT ------------------------------------------------------------
set_u(0.0984)
e, ed = "#a8adb8", "#8d93a0"
packs.append(quadruped(
    "Elephant", e, None, e, size=1.25,
    body_pat=lambda wx, wy, wz: ed if wy > 0.55 else None,
    head_at=(0, 0.72, 0.95), head_r=(0.52, 0.46, 0.4),
    muzzle=[
        B("Trunk 1", "head", [0, 0.42, 1.38], [0.3, 0.34, 0.28], e),
        B("Trunk 2", "head", [0, 0.06, 1.48], [0.26, 0.44, 0.24], ed),
        B("Trunk 3", "head", [0, -0.3, 1.54], [0.22, 0.36, 0.2], e),
        B("Trunk tip", "head", [0, -0.52, 1.6], [0.18, 0.14, 0.18], ed),
        B("Tusk L", "head", [-0.3, 0.32, 1.32], [0.12, 0.3, 0.12], "#fff6e0"),
        B("Tusk R", "head", [0.3, 0.32, 1.32], [0.12, 0.3, 0.12], "#fff6e0"),
        B("Eye L", "head", [-0.3, 0.85, 1.28], [0.1, 0.12, 0.06], "#1c1c1c"),
        B("Eye R", "head", [0.3, 0.85, 1.28], [0.1, 0.12, 0.06], "#1c1c1c"),
    ],
    ears=[
        B("Ear L", "ear", [-0.68, 0.78, 0.72], [0.22, 0.66, 0.55], ed),
        B("Ear R", "ear", [0.68, 0.78, 0.72], [0.22, 0.66, 0.55], ed),
        B("Ear inner L", "ear", [-0.74, 0.78, 0.72], [0.1, 0.46, 0.38], "#c8a8a8"),
        B("Ear inner R", "ear", [0.74, 0.78, 0.72], [0.1, 0.46, 0.38], "#c8a8a8"),
    ],
    tail=[
        B("Tail", "tail", [0, 0.3, -1.18], [0.1, 0.4, 0.1], ed),
        B("Tail tuft", "tail", [0, 0.05, -1.2], [0.14, 0.14, 0.12], "#6d7480"),
    ],
    legs=legs4(0.44, -0.6, 0.48, -0.48, [0.36, 0.5, 0.36], e,
               feet=[0.4, 0.12, 0.4], foot_color="#e8e2d5"),
    anim={"walk": {"legSwing": 28, "speed": 1.7}},
))

# ---- 5 PIG -----------------------------------------------------------------
set_u(0.0794)
p, pd = "#f2a0b4", "#e0879e"
packs.append(quadruped(
    "Pig", p, "#f8c2d0", p,
    body_pat=lambda wx, wy, wz: pd if (wx > 0.3 and -0.45 < wz < -0.1 and wy > 0) else None,
    head_at=(0, 0.5, 0.78), head_r=(0.42, 0.38, 0.32),
    muzzle=[
        B("Snout", "head", [0, 0.46, 1.12], [0.4, 0.3, 0.16], pd),
        B("Nostril L", "head", [-0.09, 0.46, 1.21], [0.07, 0.1, 0.04], "#8d5060"),
        B("Nostril R", "head", [0.09, 0.46, 1.21], [0.07, 0.1, 0.04], "#8d5060"),
        B("Eye L", "head", [-0.22, 0.66, 1.03], [0.1, 0.12, 0.06], "#1c1c1c"),
        B("Eye R", "head", [0.22, 0.66, 1.03], [0.1, 0.12, 0.06], "#1c1c1c"),
    ],
    ears=[
        B("Ear L", "ear", [-0.28, 0.92, 0.72], [0.24, 0.26, 0.12], pd, [25, 0, 0]),
        B("Ear R", "ear", [0.28, 0.92, 0.72], [0.24, 0.26, 0.12], pd, [25, 0, 0]),
    ],
    tail=[
        B("Tail 1", "tail", [0, 0.28, -0.92], [0.1, 0.1, 0.16], pd),
        B("Tail 2", "tail", [0.08, 0.38, -1.0], [0.09, 0.09, 0.12], p),
        B("Tail 3", "tail", [0, 0.46, -1.04], [0.08, 0.08, 0.1], pd),
    ],
    legs=legs4(0.34, -0.5, 0.4, -0.4, [0.24, 0.32, 0.24], pd),
))

# ---- 6 GIRAFFE -------------------------------------------------------------
set_u(0.0778)
y, spot = "#f0c04a", "#b57427"
def giraffe_spots(wx, wy, wz):
    s = math.sin(round(wx / 0.3) * 12.7 + round(wy / 0.3) * 31.7 + round(wz / 0.3) * 74.3) * 43758.5
    return spot if (s - math.floor(s)) > 0.62 else None
gv = Vox()
gv.ellipsoid(0, 0.15, -0.25, 0.46, 0.42, 0.72, lambda wx, wy, wz: giraffe_spots(wx, wy, wz) or y, wob=0.2)
# neck: angled voxel column with spots
for i in range(6):
    t = i / 5
    gv.ellipsoid(0, 0.45 + t * 1.0, 0.35 + t * 0.28, 0.24, 0.2, 0.24,
                 lambda wx, wy, wz: giraffe_spots(wx, wy, wz) or y, seed=i + 3)
gbl = gv.merge("body", "Body")
hv = Vox()
hv.ellipsoid(0, 1.85, 0.85, 0.26, 0.24, 0.36, solid(y), wob=0.2)
gbl += hv.merge("head", "Head")
gbl += [
    B("Muzzle", "head", [0, 1.78, 1.15], [0.32, 0.26, 0.2], "#e8d2a0"),
    B("Eye L", "head", [-0.15, 1.95, 1.05], [0.09, 0.11, 0.06], "#1c1c1c"),
    B("Eye R", "head", [0.15, 1.95, 1.05], [0.09, 0.11, 0.06], "#1c1c1c"),
    B("Ossicone L", "head", [-0.12, 2.16, 0.75], [0.08, 0.2, 0.08], spot),
    B("Ossicone R", "head", [0.12, 2.16, 0.75], [0.08, 0.2, 0.08], spot),
    B("Ear L", "ear", [-0.3, 2.0, 0.75], [0.2, 0.12, 0.1], y),
    B("Ear R", "ear", [0.3, 2.0, 0.75], [0.2, 0.12, 0.1], y),
    B("Mane", "body", [0, 1.05, 0.3], [0.09, 1.0, 0.14], spot, [14, 0, 0]),
    B("Tail", "tail", [0, 0.4, -1.02], [0.09, 0.35, 0.09], y),
    B("Tail tuft", "tail", [0, 0.16, -1.04], [0.13, 0.16, 0.11], spot),
]
gbl += legs4(0.3, -0.42, 0.35, -0.5, [0.2, 0.72, 0.2], y, feet=[0.22, 0.12, 0.22], foot_color=spot)
packs.append(design("Giraffe", gbl, {"walk": {"legSwing": 30}}))

# ---- 7 ZEBRA ---------------------------------------------------------------
set_u(0.0778)
zw, zk = "#f2f2ee", "#22222a"
def zebra_stripes(wx, wy, wz):
    # thin vertical stripes: one dark band every three voxel columns
    return zk if int(math.floor((wz + 6) / U)) % 3 == 0 else zw
packs.append(quadruped(
    "Zebra", zw, None, zw, wob=0.0,
    body_pat=lambda wx, wy, wz: zebra_stripes(wx, wy, wz),
    head_at=(0, 0.85, 0.8), head_r=(0.3, 0.3, 0.4),
    head_pat=lambda wx, wy, wz: zk if int(math.floor((wy + 6) / U)) % 3 == 0 and wz < 0.95 else None,
    muzzle=[
        B("Muzzle", "head", [0, 0.74, 1.14], [0.3, 0.24, 0.18], zk),
        B("Eye L", "head", [-0.17, 0.95, 1.02], [0.09, 0.11, 0.06], "#1c1c1c"),
        B("Eye R", "head", [0.17, 0.95, 1.02], [0.09, 0.11, 0.06], "#1c1c1c"),
        B("Mane", "body", [0, 0.85, 0.35], [0.1, 0.55, 0.2], zk, [16, 0, 0]),
    ],
    ears=[
        B("Ear L", "ear", [-0.18, 1.2, 0.68], [0.14, 0.22, 0.1], zw),
        B("Ear R", "ear", [0.18, 1.2, 0.68], [0.14, 0.22, 0.1], zw),
    ],
    tail=[
        B("Tail", "tail", [0, 0.25, -1.0], [0.09, 0.3, 0.09], zw),
        B("Tail tuft", "tail", [0, 0.02, -1.02], [0.13, 0.16, 0.11], zk),
    ],
    legs=legs4(0.3, -0.48, 0.42, -0.48, [0.2, 0.5, 0.2], zw, feet=[0.21, 0.12, 0.21], foot_color=zk),
))

# ---- 8 RABBIT --------------------------------------------------------------
set_u(0.0683)
rw, rp = "#f6f4ef", "#f0b8c8"
packs.append(quadruped(
    "Rabbit", rw, "#ffffff", rw, size=0.9,
    body_at=(0, 0.02, -0.12), body_r=(0.42, 0.4, 0.58),
    head_at=(0, 0.52, 0.48), head_r=(0.38, 0.36, 0.32),
    muzzle=[
        B("Muzzle", "head", [0, 0.42, 0.82], [0.26, 0.2, 0.12], "#e8e2d8"),
        B("Nose", "head", [0, 0.52, 0.84], [0.1, 0.08, 0.07], rp),
        B("Tooth", "head", [0, 0.3, 0.82], [0.1, 0.12, 0.05], "#ffffff"),
        B("Eye L", "head", [-0.19, 0.6, 0.76], [0.1, 0.13, 0.06], "#1c1c1c"),
        B("Eye R", "head", [0.19, 0.6, 0.76], [0.1, 0.13, 0.06], "#1c1c1c"),
    ],
    ears=[
        B("Ear L", "ear", [-0.17, 1.2, 0.4], [0.18, 0.7, 0.12], rw, [0, 0, 5]),
        B("Ear R", "ear", [0.17, 1.2, 0.4], [0.18, 0.7, 0.12], rw, [0, 0, -5]),
        B("Ear inner L", "ear", [-0.17, 1.22, 0.45], [0.1, 0.5, 0.08], rp, [0, 0, 5]),
        B("Ear inner R", "ear", [0.17, 1.22, 0.45], [0.1, 0.5, 0.08], rp, [0, 0, -5]),
    ],
    tail=[B("Tail", "tail", [0, 0.08, -0.72], [0.26, 0.26, 0.2], "#ffffff")],
    legs=legs4(0.28, -0.42, 0.3, -0.3, [0.22, 0.28, 0.26], rw),
    anim={"jump": {"height": 1.5}, "walk": {"speed": 2.6}},
))

# ---- 9 POLAR BEAR ----------------------------------------------------------
set_u(0.0913)
pw, pc = "#f2f0e8", "#e0dcd0"
packs.append(quadruped(
    "Polar Bear", pw, None, pw, size=1.2,
    body_pat=lambda wx, wy, wz: pc if wy < -0.25 else None,
    head_at=(0, 0.68, 0.9), head_r=(0.44, 0.4, 0.35),
    muzzle=[
        B("Muzzle", "head", [0, 0.55, 1.24], [0.36, 0.3, 0.2], pc),
        B("Nose", "head", [0, 0.62, 1.35], [0.15, 0.12, 0.08], "#1c1c1c"),
        B("Eye L", "head", [-0.2, 0.8, 1.16], [0.09, 0.11, 0.06], "#1c1c1c"),
        B("Eye R", "head", [0.2, 0.8, 1.16], [0.09, 0.11, 0.06], "#1c1c1c"),
    ],
    ears=[
        B("Ear L", "ear", [-0.3, 1.08, 0.75], [0.18, 0.16, 0.12], pw),
        B("Ear R", "ear", [0.3, 1.08, 0.75], [0.18, 0.16, 0.12], pw),
    ],
    tail=[B("Tail", "tail", [0, 0.2, -1.1], [0.2, 0.2, 0.14], pc)],
    legs=legs4(0.42, -0.58, 0.5, -0.48, [0.34, 0.42, 0.34], pw,
               feet=[0.36, 0.12, 0.36], foot_color=pc),
    anim={"walk": {"legSwing": 30, "speed": 1.8}},
))

# ---- 10 PENGUIN ------------------------------------------------------------
set_u(0.0698)
pk, pw2, po = "#23232e", "#f6f6f2", "#f29a2e"
v = Vox()
def penguin_body(wx, wy, wz):
    # white front oval
    if wz > 0.12 and abs(wx) < 0.3 and -0.42 < wy < 0.5:
        return pw2
    return pk
v.ellipsoid(0, 0.12, 0, 0.46, 0.62, 0.42, penguin_body, wob=0.2)
pbl = v.merge("body", "Body")
hv = Vox()
def penguin_head(wx, wy, wz):
    if wz > 0.2 and abs(wx) < 0.24 and 0.85 < wy < 1.12:
        return pw2  # face patch
    return pk
hv.ellipsoid(0, 1.0, 0.05, 0.36, 0.32, 0.34, penguin_head, wob=0.2, seed=5)
pbl += hv.merge("head", "Head")
pbl += [
    B("Eye L", "head", [-0.14, 1.06, 0.36], [0.09, 0.11, 0.05], "#1c1c1c"),
    B("Eye R", "head", [0.14, 1.06, 0.36], [0.09, 0.11, 0.05], "#1c1c1c"),
    B("Beak", "head", [0, 0.94, 0.42], [0.2, 0.12, 0.18], po),
    B("Flipper L", "ear", [-0.52, 0.28, 0], [0.13, 0.6, 0.34], pk, [0, 0, 14]),
    B("Flipper R", "ear", [0.52, 0.28, 0], [0.13, 0.6, 0.34], pk, [0, 0, -14]),
    B("Foot L", "legFL", [-0.18, -0.56, 0.12], [0.24, 0.12, 0.36], po),
    B("Toes L", "legFL", [-0.18, -0.56, 0.33], [0.3, 0.1, 0.1], "#d9821c"),
    B("Foot R", "legFR", [0.18, -0.56, 0.12], [0.24, 0.12, 0.36], po),
    B("Toes R", "legFR", [0.18, -0.56, 0.33], [0.3, 0.1, 0.1], "#d9821c"),
    B("Tail", "tail", [0, -0.35, -0.44], [0.34, 0.14, 0.22], pk),
]
packs.append(design("Penguin", pbl, {"walk": {"legSwing": 20, "bodyBob": 0.16, "speed": 3.0}}))

# ---- 11 CROCODILE ----------------------------------------------------------
set_u(0.0722)
cg, cd, cl = "#5da33c", "#417a28", "#c8e09a"
v = Vox()
def croc_body(wx, wy, wz):
    if wy > 0.12 and int(math.floor((wz + 4) / 0.3)) % 2 == 0:
        return cd  # scute ridges
    if wy < -0.22:
        return cl
    return cg
v.ellipsoid(0, -0.05, -0.25, 0.46, 0.32, 0.85, croc_body, wob=0.2)
cbl = v.merge("body", "Body")
hv = Vox()
hv.ellipsoid(0, 0.02, 0.75, 0.36, 0.22, 0.4, solid(cg), wob=0.15, seed=9)
hv.box(-0.26, -0.12, 0.95, 0.26, 0.1, 1.45, lambda wx, wy, wz: cd if wy > 0 else cg)
cbl += hv.merge("head", "Head")
cbl += [
    B("Eye bump L", "head", [-0.2, 0.28, 0.68], [0.18, 0.16, 0.2], cg),
    B("Eye bump R", "head", [0.2, 0.28, 0.68], [0.18, 0.16, 0.2], cg),
    B("Eye L", "head", [-0.2, 0.36, 0.78], [0.09, 0.09, 0.05], "#f8d21c"),
    B("Eye R", "head", [0.2, 0.36, 0.78], [0.09, 0.09, 0.05], "#f8d21c"),
    B("Pupil L", "head", [-0.2, 0.36, 0.82], [0.04, 0.07, 0.04], "#1c1c1c"),
    B("Pupil R", "head", [0.2, 0.36, 0.82], [0.04, 0.07, 0.04], "#1c1c1c"),
]
for i in range(4):
    cbl.append(B(f"Tooth L{i+1}", "head", [-0.2, -0.16, 1.0 + i * 0.14], [0.06, 0.09, 0.06], "#ffffff"))
    cbl.append(B(f"Tooth R{i+1}", "head", [0.2, -0.16, 1.0 + i * 0.14], [0.06, 0.09, 0.06], "#ffffff"))
cbl += [
    B("Tail 1", "tail", [0, -0.08, -1.25], [0.55, 0.36, 0.45], cg),
    B("Tail ridge 1", "tail", [0, 0.18, -1.25], [0.14, 0.14, 0.3], cd),
    B("Tail 2", "tail", [0, -0.1, -1.62], [0.4, 0.28, 0.38], cd),
    B("Tail 3", "tail", [0, -0.12, -1.95], [0.26, 0.22, 0.32], cg),
    B("Tail tip", "tail", [0, -0.12, -2.18], [0.16, 0.16, 0.2], cd),
]
cbl += legs4(0.44, -0.32, 0.32, -0.6, [0.22, 0.22, 0.26], cg)
packs.append(design("Crocodile", cbl, {"walk": {"legSwing": 24, "bodyBob": 0.04, "speed": 2.4}}))

# ---- 12 FROG ---------------------------------------------------------------
set_u(0.073)
fg, fl = "#5cc23e", "#bfe89a"
v = Vox()
def frog_body(wx, wy, wz):
    if wy < -0.12 and wz > -0.3:
        return fl
    s = math.sin(round(wx / 0.3) * 17.3 + round(wz / 0.3) * 51.9) * 43758.5
    if wy > 0.1 and (s - math.floor(s)) > 0.75:
        return "#3f9a28"
    return fg
v.ellipsoid(0, -0.02, 0, 0.52, 0.4, 0.55, frog_body, wob=0.25)
fbl = v.merge("body", "Body")
hv = Vox()
hv.ellipsoid(0, 0.38, 0.35, 0.5, 0.28, 0.34, solid(fg), wob=0.2, seed=4)
hv.ellipsoid(-0.3, 0.72, 0.4, 0.17, 0.17, 0.17, solid(fg), seed=5)
hv.ellipsoid(0.3, 0.72, 0.4, 0.17, 0.17, 0.17, solid(fg), seed=6)
fbl += hv.merge("head", "Head")
fbl += [
    B("Eye L", "head", [-0.3, 0.76, 0.55], [0.18, 0.18, 0.08], "#ffffff"),
    B("Eye R", "head", [0.3, 0.76, 0.55], [0.18, 0.18, 0.08], "#ffffff"),
    B("Pupil L", "head", [-0.3, 0.76, 0.6], [0.09, 0.11, 0.05], "#1c1c1c"),
    B("Pupil R", "head", [0.3, 0.76, 0.6], [0.09, 0.11, 0.05], "#1c1c1c"),
    B("Mouth", "head", [0, 0.28, 0.68], [0.6, 0.07, 0.1], "#2f7a1c"),
]
fbl += legs4(0.44, -0.35, 0.32, -0.32, [0.26, 0.24, 0.3], fg,
             feet=[0.32, 0.1, 0.24], foot_color="#3f9a28")
packs.append(design("Frog", fbl, {"jump": {"height": 1.7, "tuck": 40}, "walk": {"bodyBob": 0.14}}))

# ---- 13 MONKEY -------------------------------------------------------------
set_u(0.0706)
mb, mt = "#8a5a34", "#e8c89a"
packs.append(quadruped(
    "Monkey", mb, mt, mb, size=0.9,
    body_at=(0, 0.05, -0.05), body_r=(0.42, 0.46, 0.52),
    head_at=(0, 0.72, 0.42), head_r=(0.38, 0.36, 0.34),
    head_pat=lambda wx, wy, wz: mt if (wz > 0.6 and abs(wx) < 0.28 and wy < 0.85) else None,
    muzzle=[
        B("Muzzle", "head", [0, 0.58, 0.76], [0.28, 0.18, 0.1], mt),
        B("Nostrils", "head", [0, 0.6, 0.82], [0.14, 0.05, 0.04], "#5a3a1e"),
        B("Eye L", "head", [-0.13, 0.8, 0.76], [0.09, 0.11, 0.06], "#1c1c1c"),
        B("Eye R", "head", [0.13, 0.8, 0.76], [0.09, 0.11, 0.06], "#1c1c1c"),
    ],
    ears=[
        B("Ear L", "ear", [-0.4, 0.76, 0.38], [0.16, 0.24, 0.14], mb),
        B("Ear R", "ear", [0.4, 0.76, 0.38], [0.16, 0.24, 0.14], mb),
        B("Ear inner L", "ear", [-0.45, 0.76, 0.4], [0.08, 0.14, 0.1], mt),
        B("Ear inner R", "ear", [0.45, 0.76, 0.4], [0.08, 0.14, 0.1], mt),
    ],
    tail=[
        B("Tail 1", "tail", [0, 0.2, -0.68], [0.13, 0.13, 0.4], mb),
        B("Tail 2", "tail", [0, 0.5, -0.88], [0.11, 0.4, 0.11], mb),
        B("Tail 3", "tail", [0, 0.75, -0.78], [0.1, 0.11, 0.3], mt),
    ],
    legs=[
        B("Arm L", "legFL", [-0.32, -0.32, 0.3], [0.2, 0.55, 0.2], mb),
        B("Arm R", "legFR", [0.32, -0.32, 0.3], [0.2, 0.55, 0.2], mb),
        B("Hand L", "legFL", [-0.32, -0.62, 0.32], [0.22, 0.12, 0.22], mt),
        B("Hand R", "legFR", [0.32, -0.62, 0.32], [0.22, 0.12, 0.22], mt),
        B("Leg BL", "legBL", [-0.26, -0.48, -0.3], [0.22, 0.38, 0.22], mb),
        B("Leg BR", "legBR", [0.26, -0.48, -0.3], [0.22, 0.38, 0.22], mb),
        B("Foot BL", "legBL", [-0.26, -0.7, -0.26], [0.22, 0.1, 0.26], mt),
        B("Foot BR", "legBR", [0.26, -0.7, -0.26], [0.22, 0.1, 0.26], mt),
    ],
    anim={"walk": {"speed": 2.6, "bodyBob": 0.12}},
))

# ---- 14 TURTLE -------------------------------------------------------------
set_u(0.0675)
tg, ts, tp = "#6fbf4a", "#4a7a3a", "#8a5a34"
v = Vox()
def turtle_shell(wx, wy, wz):
    if wy < -0.08:
        return tg  # underside body
    gx, gz = round(wx / 0.32), round((wz + 0.05) / 0.32)
    s = math.sin(gx * 12.7 + gz * 74.3) * 43758.5
    return tp if (gx + gz) % 2 == 0 and (s - math.floor(s)) > 0.3 else ts
v.ellipsoid(0, 0.12, -0.05, 0.55, 0.35, 0.66, turtle_shell, wob=0.15)
tbl = v.merge("body", "Body")
hv = Vox()
hv.ellipsoid(0, 0.08, 0.78, 0.24, 0.22, 0.26, solid(tg), wob=0.2, seed=8)
tbl += hv.merge("head", "Head")
tbl += [
    B("Eye L", "head", [-0.13, 0.18, 0.95], [0.08, 0.1, 0.05], "#1c1c1c"),
    B("Eye R", "head", [0.13, 0.18, 0.95], [0.08, 0.1, 0.05], "#1c1c1c"),
    B("Mouth", "head", [0, 0.0, 0.99], [0.18, 0.06, 0.05], "#3a6130"),
    B("Tail", "tail", [0, -0.15, -0.75], [0.14, 0.12, 0.2], tg),
]
tbl += legs4(0.48, -0.32, 0.42, -0.42, [0.26, 0.2, 0.3], tg)
packs.append(design("Turtle", tbl, {"walk": {"legSwing": 20, "speed": 1.5, "bodyBob": 0.03}}))

# ---- 15 WOLF ---------------------------------------------------------------
set_u(0.081)
wg, wl, wd = "#9aa2ac", "#d8dde2", "#5f6772"
packs.append(quadruped(
    "Wolf", wg, wl, wg,
    body_pat=lambda wx, wy, wz: wd if wy > 0.4 else None,
    head_at=(0, 0.58, 0.72), head_r=(0.42, 0.38, 0.35),
    head_pat=lambda wx, wy, wz: wl if (abs(wx) > 0.3 and wy < 0.55) else None,
    muzzle=[
        B("Snout", "head", [0, 0.44, 1.1], [0.34, 0.28, 0.28], wl),
        B("Nose", "head", [0, 0.5, 1.26], [0.14, 0.12, 0.08], "#1c1c1c"),
        B("Eye L", "head", [-0.19, 0.68, 1.02], [0.1, 0.12, 0.06], "#f8d21c"),
        B("Eye R", "head", [0.19, 0.68, 1.02], [0.1, 0.12, 0.06], "#f8d21c"),
        B("Pupil L", "head", [-0.19, 0.68, 1.06], [0.05, 0.08, 0.04], "#1c1c1c"),
        B("Pupil R", "head", [0.19, 0.68, 1.06], [0.05, 0.08, 0.04], "#1c1c1c"),
    ],
    ears=[
        B("Ear L", "ear", [-0.25, 1.02, 0.6], [0.2, 0.3, 0.12], wg),
        B("Ear R", "ear", [0.25, 1.02, 0.6], [0.2, 0.3, 0.12], wg),
        B("Ear inner L", "ear", [-0.25, 1.04, 0.64], [0.1, 0.18, 0.08], wd),
        B("Ear inner R", "ear", [0.25, 1.04, 0.64], [0.1, 0.18, 0.08], wd),
    ],
    tail=[
        B("Tail 1", "tail", [0, 0.2, -0.95], [0.26, 0.26, 0.38], wg),
        B("Tail 2", "tail", [0, 0.3, -1.24], [0.3, 0.3, 0.3], wd),
        B("Tail tip", "tail", [0, 0.36, -1.46], [0.22, 0.22, 0.18], wl),
    ],
    legs=legs4(0.32, -0.5, 0.42, -0.42, [0.22, 0.38, 0.22], wg,
               feet=[0.25, 0.12, 0.26], foot_color=wl),
))

# ---- 16 OWL ----------------------------------------------------------------
set_u(0.0698)
ob, ol, oy = "#8a6844", "#e0cfa8", "#f2b53c"
v = Vox()
def owl_body(wx, wy, wz):
    if wz > 0.15 and abs(wx) < 0.3 and wy < 0.55:
        # chest with chevron banding
        return ol if int(math.floor((wy + 4) / 0.22)) % 2 == 0 else "#c9b489"
    return ob
v.ellipsoid(0, 0.15, 0, 0.46, 0.55, 0.4, owl_body, wob=0.2)
obl = v.merge("body", "Body")
hv = Vox()
def owl_head(wx, wy, wz):
    if wz > 0.18 and 0.72 < wy < 1.12 and abs(wx) < 0.36:
        return ol  # facial disc
    return ob
hv.ellipsoid(0, 0.95, 0.05, 0.42, 0.34, 0.36, owl_head, wob=0.2, seed=11)
obl += hv.merge("head", "Head")
obl += [
    B("Eye ring L", "head", [-0.18, 0.98, 0.4], [0.22, 0.22, 0.05], "#ffffff"),
    B("Eye ring R", "head", [0.18, 0.98, 0.4], [0.22, 0.22, 0.05], "#ffffff"),
    B("Pupil L", "head", [-0.18, 0.98, 0.44], [0.11, 0.11, 0.05], "#1c1c1c"),
    B("Pupil R", "head", [0.18, 0.98, 0.44], [0.11, 0.11, 0.05], "#1c1c1c"),
    B("Beak", "head", [0, 0.82, 0.44], [0.12, 0.16, 0.12], oy),
    B("Tuft L", "ear", [-0.28, 1.3, 0.05], [0.14, 0.2, 0.12], ob, [0, 0, -14]),
    B("Tuft R", "ear", [0.28, 1.3, 0.05], [0.14, 0.2, 0.12], ob, [0, 0, 14]),
    B("Wing L", "ear", [-0.5, 0.2, -0.05], [0.14, 0.7, 0.45], "#6d5236", [0, 0, 10]),
    B("Wing R", "ear", [0.5, 0.2, -0.05], [0.14, 0.7, 0.45], "#6d5236", [0, 0, -10]),
    B("Foot L", "legFL", [-0.18, -0.5, 0.1], [0.2, 0.12, 0.28], oy),
    B("Foot R", "legFR", [0.18, -0.5, 0.1], [0.2, 0.12, 0.28], oy),
    B("Tail", "tail", [0, -0.32, -0.45], [0.42, 0.16, 0.28], "#6d5236"),
]
packs.append(design("Owl", obl, {"walk": {"legSwing": 18, "bodyBob": 0.13, "speed": 2.8}}))

# ---- 17 BEE ----------------------------------------------------------------
set_u(0.0667)
by, bk, bw = "#f6c62e", "#26262e", "#e8f2fa"
v = Vox()
def bee_body(wx, wy, wz):
    return by if int(math.floor((wz + 4) / 0.28)) % 2 == 0 else bk
v.ellipsoid(0, 0.25, -0.12, 0.42, 0.4, 0.62, bee_body, wob=0.2)
bbl = v.merge("body", "Body")
hv = Vox()
hv.ellipsoid(0, 0.35, 0.62, 0.32, 0.3, 0.26, solid(by), wob=0.2, seed=13)
bbl += hv.merge("head", "Head")
bbl += [
    B("Eye L", "head", [-0.17, 0.4, 0.82], [0.13, 0.15, 0.06], "#1c1c1c"),
    B("Eye R", "head", [0.17, 0.4, 0.82], [0.13, 0.15, 0.06], "#1c1c1c"),
    B("Smile", "head", [0, 0.22, 0.82], [0.18, 0.06, 0.05], bk),
    B("Antenna L", "head", [-0.14, 0.72, 0.65], [0.05, 0.24, 0.05], bk),
    B("Antenna R", "head", [0.14, 0.72, 0.65], [0.05, 0.24, 0.05], bk),
    B("Antenna tip L", "head", [-0.14, 0.88, 0.65], [0.09, 0.09, 0.09], bk),
    B("Antenna tip R", "head", [0.14, 0.88, 0.65], [0.09, 0.09, 0.09], bk),
    B("Stinger", "tail", [0, 0.2, -0.85], [0.13, 0.13, 0.2], bk),
    B("Wing L", "ear", [-0.36, 0.68, -0.08], [0.5, 0.07, 0.34], bw, [0, 0, 18]),
    B("Wing R", "ear", [0.36, 0.68, -0.08], [0.5, 0.07, 0.34], bw, [0, 0, -18]),
    B("Wing back L", "ear", [-0.3, 0.64, -0.35], [0.36, 0.06, 0.24], bw, [0, 0, 24]),
    B("Wing back R", "ear", [0.3, 0.64, -0.35], [0.36, 0.06, 0.24], bw, [0, 0, -24]),
]
bbl += legs4(0.24, -0.28, 0.25, -0.25, [0.11, 0.18, 0.11], bk)
packs.append(design("Bee", bbl, {"idle": {"bob": 0.12, "speed": 3.2}, "walk": {"bodyBob": 0.16, "speed": 3.4}}))

# ---- 18 SPIDER -------------------------------------------------------------
set_u(0.0659)
sk, sr = "#2a2a32", "#e02e2e"
v = Vox()
def spider_abdomen(wx, wy, wz):
    if wy > 0.35 and abs(wx) < 0.16 and wz < -0.25:
        return sr  # back marking
    return sk
v.ellipsoid(0, 0.15, -0.5, 0.46, 0.4, 0.48, spider_abdomen, wob=0.2)
sbl = v.merge("body", "Body")
hv = Vox()
hv.ellipsoid(0, 0.05, 0.32, 0.34, 0.28, 0.32, solid(sk), wob=0.2, seed=17)
sbl += hv.merge("head", "Head")
for i, (ex, ey) in enumerate([(-0.22, 0.2), (-0.08, 0.25), (0.08, 0.25), (0.22, 0.2),
                              (-0.14, 0.08), (-0.05, 0.1), (0.05, 0.1), (0.14, 0.08)]):
    s = 0.09 if i < 4 else 0.06
    sbl.append(B(f"Eye {i+1}", "head", [ex, ey, 0.6], [s, s, 0.05], sr))
sbl += [
    B("Fang L", "head", [-0.11, -0.22, 0.55], [0.08, 0.15, 0.08], "#f2f2f2"),
    B("Fang R", "head", [0.11, -0.22, 0.55], [0.08, 0.15, 0.08], "#f2f2f2"),
]
for i, (role, z) in enumerate([("legFL", 0.35), ("legFR", 0.35), ("legBL", -0.15), ("legBR", -0.15),
                               ("legFL", 0.1), ("legFR", 0.1), ("legBL", -0.55), ("legBR", -0.55)]):
    side = -1 if "L" in role else 1
    lift = 0.05 if i < 4 else 0.14
    sbl.append(B(f"Leg {i+1}a", role, [side * 0.5, 0.0 + lift, z], [0.45, 0.09, 0.09], sk, [0, 0, side * -28]))
    sbl.append(B(f"Leg {i+1}b", role, [side * 0.78, -0.26 + lift, z], [0.09, 0.45, 0.09], sk, [0, 0, side * 12]))
packs.append(design("Spider", sbl, {"walk": {"legSwing": 26, "speed": 3.2, "bodyBob": 0.05}}))

# ---- 19 CHAMELEON ----------------------------------------------------------
set_u(0.0659)
ch, cl2, cc = "#5cc23e", "#a8e07a", "#2f8a4a"
v = Vox()
def cham_body(wx, wy, wz):
    if abs(wx) > 0.24 and int(math.floor((wz + 4) / 0.32)) % 2 == 0:
        return cl2  # side stripes
    if wy < -0.12:
        return cl2
    return ch
v.ellipsoid(0, 0.1, -0.1, 0.36, 0.4, 0.62, cham_body, wob=0.2)
chbl = v.merge("body", "Body")
hv = Vox()
hv.ellipsoid(0, 0.42, 0.6, 0.3, 0.3, 0.3, solid(ch), wob=0.2, seed=19)
hv.ellipsoid(0, 0.75, 0.42, 0.2, 0.18, 0.24, solid(cc), seed=20)  # casque
chbl += hv.merge("head", "Head")
chbl += [
    B("Eye turret L", "head", [-0.28, 0.52, 0.68], [0.22, 0.22, 0.22], cc),
    B("Eye turret R", "head", [0.28, 0.52, 0.68], [0.22, 0.22, 0.22], cc),
    B("Eye L", "head", [-0.28, 0.52, 0.8], [0.12, 0.12, 0.06], "#f8d21c"),
    B("Eye R", "head", [0.28, 0.52, 0.8], [0.12, 0.12, 0.06], "#f8d21c"),
    B("Pupil L", "head", [-0.28, 0.52, 0.84], [0.05, 0.05, 0.04], "#1c1c1c"),
    B("Pupil R", "head", [0.28, 0.52, 0.84], [0.05, 0.05, 0.04], "#1c1c1c"),
    B("Mouth", "head", [0, 0.3, 0.85], [0.36, 0.07, 0.1], cc),
    B("Tongue", "head", [0, 0.28, 1.02], [0.08, 0.06, 0.2], "#f078a0"),
    B("Tail 1", "tail", [0, 0.1, -0.85], [0.22, 0.22, 0.32], ch),
    B("Tail 2", "tail", [0, 0.32, -1.02], [0.17, 0.34, 0.17], ch),
    B("Tail 3", "tail", [0, 0.56, -0.92], [0.14, 0.14, 0.28], cc),
    B("Tail curl", "tail", [0, 0.48, -0.7], [0.12, 0.18, 0.12], ch),
]
chbl += legs4(0.28, -0.35, 0.35, -0.4, [0.17, 0.3, 0.17], ch)
packs.append(design("Chameleon", chbl, {"walk": {"legSwing": 22, "speed": 1.8}}))

# ---- 20 BIRD ---------------------------------------------------------------
set_u(0.0635)
bb, bl2, bo = "#2e8ae8", "#7cc4f8", "#f2b53c"
v = Vox()
def bird_body(wx, wy, wz):
    if wz > 0.15 and abs(wx) < 0.26 and wy < 0.35:
        return bl2  # chest
    return bb
v.ellipsoid(0, 0.15, 0, 0.4, 0.4, 0.5, bird_body, wob=0.2)
bibl = v.merge("body", "Body")
hv = Vox()
hv.ellipsoid(0, 0.72, 0.32, 0.33, 0.3, 0.3, solid(bb), wob=0.2, seed=23)
bibl += hv.merge("head", "Head")
bibl += [
    B("Eye L", "head", [-0.17, 0.78, 0.56], [0.11, 0.13, 0.05], "#ffffff"),
    B("Eye R", "head", [0.17, 0.78, 0.56], [0.11, 0.13, 0.05], "#ffffff"),
    B("Pupil L", "head", [-0.17, 0.78, 0.6], [0.05, 0.06, 0.04], "#1c1c1c"),
    B("Pupil R", "head", [0.17, 0.78, 0.6], [0.05, 0.06, 0.04], "#1c1c1c"),
    B("Beak top", "head", [0, 0.68, 0.68], [0.2, 0.12, 0.24], bo),
    B("Beak bottom", "head", [0, 0.58, 0.64], [0.16, 0.08, 0.16], "#d99a1c"),
    B("Crest", "head", [0, 1.02, 0.2], [0.15, 0.18, 0.28], bl2, [15, 0, 0]),
    B("Wing L", "ear", [-0.42, 0.25, -0.05], [0.15, 0.5, 0.6], bb, [0, 0, 16]),
    B("Wing R", "ear", [0.42, 0.25, -0.05], [0.15, 0.5, 0.6], bb, [0, 0, -16]),
    B("Wing tip L", "ear", [-0.56, 0.0, -0.28], [0.12, 0.28, 0.38], bl2, [0, 0, 24]),
    B("Wing tip R", "ear", [0.56, 0.0, -0.28], [0.12, 0.28, 0.38], bl2, [0, 0, -24]),
    B("Foot L", "legFL", [-0.15, -0.32, 0.08], [0.13, 0.13, 0.2], bo),
    B("Foot R", "legFR", [0.15, -0.32, 0.08], [0.13, 0.13, 0.2], bo),
    B("Tail 1", "tail", [0, 0.22, -0.6], [0.34, 0.13, 0.38], bb, [-18, 0, 0]),
    B("Tail 2", "tail", [0, 0.32, -0.8], [0.22, 0.1, 0.28], bl2, [-24, 0, 0]),
]
packs.append(design("Bird", bibl, {"idle": {"bob": 0.1, "speed": 2.6},
                                   "walk": {"bodyBob": 0.15, "speed": 3.0}, "jump": {"height": 1.5}}))

# ---- 21 DRAGON (2000-block showcase) ---------------------------------------
set_u(0.0865)
dg, dd, db, dw, dh = "#43b04a", "#2e7d3a", "#cfe89a", "#37968f", "#f2e2b8"
v = Vox()
def dragon_body(wx, wy, wz):
    if wy < -0.1 and wz > -0.75:
        return db  # belly plates
    if wy > 0.42:
        return dd  # darker back
    return dg
v.ellipsoid(0, 0.15, -0.25, 0.52, 0.46, 0.88, dragon_body, wob=0.25)
# chest + neck rising to the head
v.ellipsoid(0, 0.2, 0.5, 0.42, 0.42, 0.35, lambda wx, wy, wz: db if wz > 0.55 and wy < 0.3 else dg, seed=31)
for i in range(5):
    t = i / 4
    v.ellipsoid(0, 0.45 + t * 0.75, 0.62 + t * 0.28, 0.24 - t * 0.04, 0.2, 0.24 - t * 0.03,
                lambda wx, wy, wz: db if wz > 0.75 else dg, seed=33 + i)
dbl = v.merge("body", "Body")
hv = Vox()
hv.ellipsoid(0, 1.32, 0.98, 0.3, 0.26, 0.34, lambda wx, wy, wz: dd if wy > 1.48 else dg, wob=0.2, seed=41)
hv.box(-0.18, 1.14, 1.2, 0.18, 1.36, 1.55, lambda wx, wy, wz: dg if wy > 1.24 else db)  # snout
dbl += hv.merge("head", "Head")
dbl += [
    B("Nostril L", "head", [-0.09, 1.34, 1.58], [0.06, 0.06, 0.05], "#1c4a24"),
    B("Nostril R", "head", [0.09, 1.34, 1.58], [0.06, 0.06, 0.05], "#1c4a24"),
    B("Flame L", "head", [-0.09, 1.3, 1.7], [0.08, 0.1, 0.12], "#ff8a2e"),
    B("Flame R", "head", [0.09, 1.3, 1.7], [0.08, 0.1, 0.12], "#ffd447"),
    B("Eye L", "head", [-0.22, 1.42, 1.18], [0.09, 0.12, 0.06], "#ffd21c"),
    B("Eye R", "head", [0.22, 1.42, 1.18], [0.09, 0.12, 0.06], "#ffd21c"),
    B("Pupil L", "head", [-0.22, 1.42, 1.22], [0.04, 0.1, 0.04], "#1c1c1c"),
    B("Pupil R", "head", [0.22, 1.42, 1.22], [0.04, 0.1, 0.04], "#1c1c1c"),
    B("Horn L", "head", [-0.16, 1.62, 0.78], [0.1, 0.26, 0.1], dh, [-20, 0, 0]),
    B("Horn R", "head", [0.16, 1.62, 0.78], [0.1, 0.26, 0.1], dh, [-20, 0, 0]),
    B("Horn tip L", "head", [-0.16, 1.78, 0.72], [0.07, 0.14, 0.07], "#fff6e0", [-30, 0, 0]),
    B("Horn tip R", "head", [0.16, 1.78, 0.72], [0.07, 0.14, 0.07], "#fff6e0", [-30, 0, 0]),
    B("Tooth L", "head", [-0.12, 1.18, 1.5], [0.05, 0.09, 0.05], "#ffffff"),
    B("Tooth R", "head", [0.12, 1.18, 1.5], [0.05, 0.09, 0.05], "#ffffff"),
]
# back spikes along the spine
for i, (sy, sz) in enumerate([(0.98, 0.55), (0.86, 0.3), (0.72, 0.02), (0.66, -0.28),
                              (0.6, -0.58), (0.5, -0.88)]):
    dbl.append(B(f"Spike {i+1}", "body", [0, sy, sz], [0.1, 0.22, 0.12], dh))
    dbl.append(B(f"Spike {i+1} tip", "body", [0, sy + 0.14, sz], [0.06, 0.12, 0.08], "#fff6e0"))
# wings (ear role -> they flap while running/jumping)
dbl += [
    B("Wing arm L", "ear", [-0.6, 0.75, 0.05], [0.5, 0.12, 0.14], dd, [0, 0, 26]),
    B("Wing arm R", "ear", [0.6, 0.75, 0.05], [0.5, 0.12, 0.14], dd, [0, 0, -26]),
    B("Wing L", "ear", [-0.95, 0.72, -0.15], [0.16, 0.65, 1.05], dw, [0, 0, 30]),
    B("Wing R", "ear", [0.95, 0.72, -0.15], [0.16, 0.65, 1.05], dw, [0, 0, -30]),
    B("Wing tip L", "ear", [-1.22, 0.52, -0.3], [0.12, 0.45, 0.75], "#5cc2ba", [0, 0, 42]),
    B("Wing tip R", "ear", [1.22, 0.52, -0.3], [0.12, 0.45, 0.75], "#5cc2ba", [0, 0, -42]),
]
# tail: five shrinking segments + spike tip
for i in range(5):
    t = i / 4
    dbl.append(B(f"Tail {i+1}", "tail", [0, 0.12 - t * 0.02, -1.15 - i * 0.3],
                 [0.34 - t * 0.2, 0.3 - t * 0.18, 0.34], dg if i % 2 == 0 else dd))
dbl.append(B("Tail spike", "tail", [0, 0.14, -2.42], [0.1, 0.28, 0.16], dh))
dbl += legs4(0.38, -0.42, 0.42, -0.45, [0.26, 0.42, 0.26], dg, feet=[0.3, 0.12, 0.32], foot_color=dd)
for side, role in ((-1, "legFL"), (1, "legFR"), (-1, "legBL"), (1, "legBR")):
    zf = 0.42 if "F" in role else -0.45
    for j in range(3):
        dbl.append(B(f"Claw {role} {j}", role, [side * 0.38 + (j - 1) * 0.1, -0.66, zf + 0.2],
                     [0.06, 0.08, 0.1], "#ffffff"))
packs.append(design("Dragon", dbl, {"walk": {"legSwing": 34, "bodyBob": 0.11, "speed": 2.0},
                                    "jump": {"height": 1.6, "tuck": 30},
                                    "idle": {"bob": 0.07, "speed": 1.4}}))

# ---- write files -----------------------------------------------------------
# The pack is written twice: animal-pack/ is the versioned source of truth,
# public/animal-pack/ ships with the app so the Studio's "Animal pack" button
# can restore the whole set in one click.
PUB = os.path.join(os.path.dirname(__file__), '..', 'public', 'animal-pack')
os.makedirs(PUB, exist_ok=True)
total = 0
manifest = []
for d in packs:
    slug = d["name"].lower().replace(" ", "-")
    for base in (OUT, PUB):
        with open(os.path.join(base, f"{slug}.animal.json"), "w") as f:
            json.dump(d, f, separators=(",", ":"))
    manifest.append({"name": d["name"], "file": f"{slug}.animal.json"})
    total += len(d["blocks"])
    print(f"{d['name']:<12} {len(d['blocks']):>4} blocks")
with open(os.path.join(PUB, "manifest.json"), "w") as f:
    json.dump(manifest, f, separators=(",", ":"))
print(f"\n{len(packs)} animals, {total} blocks total (+ public/animal-pack for one-click restore)")
