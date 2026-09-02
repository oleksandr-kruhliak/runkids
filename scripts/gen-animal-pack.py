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
set_u(0.0813)
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
set_u(0.0813)
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
set_u(0.0665)
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
set_u(0.0665)
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
set_u(0.0884)
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

def hash01(a, b, c=0.0):
    """Stable 0..1 noise from a world position — for patches and torn edges."""
    s = math.sin(a * 17.31 + b * 51.97 + c * 37.73) * 43758.5453
    return s - math.floor(s)

# ---- 22 TIGER --------------------------------------------------------------
set_u(0.0838)
tg_o, tg_k, tg_c = "#f0912a", "#2e1d12", "#fff2df"
def tiger_stripes(wx, wy, wz):
    if wy < -0.14:
        return None  # pale belly runs under the stripes
    return tg_k if math.floor((wz + 4) / 0.23) % 2 == 0 else None
packs.append(quadruped(
    "Tiger", tg_o, tg_c, tg_o, size=1.05,
    body_pat=tiger_stripes,
    head_pat=lambda wx, wy, wz: (
        tg_c if (wz > 0.92 and abs(wx) < 0.26 and wy < 0.66) else
        tg_k if (abs(wx) > 0.22 and wy > 0.72) else None),
    muzzle=[
        B("Snout", "head", [0, 0.52, 1.12], [0.36, 0.26, 0.24], tg_c),
        B("Nose", "head", [0, 0.6, 1.26], [0.16, 0.12, 0.1], "#c4707a"),
        B("Eye L", "head", [-0.22, 0.76, 1.05], [0.11, 0.13, 0.06], "#f8d21c"),
        B("Eye R", "head", [0.22, 0.76, 1.05], [0.11, 0.13, 0.06], "#f8d21c"),
        B("Pupil L", "head", [-0.22, 0.76, 1.09], [0.05, 0.1, 0.04], tg_k),
        B("Pupil R", "head", [0.22, 0.76, 1.09], [0.05, 0.1, 0.04], tg_k),
        B("Whisker L", "head", [-0.34, 0.5, 1.14], [0.2, 0.03, 0.03], tg_c),
        B("Whisker R", "head", [0.34, 0.5, 1.14], [0.2, 0.03, 0.03], tg_c),
    ],
    ears=[
        B("Ear L", "ear", [-0.3, 1.04, 0.66], [0.2, 0.2, 0.12], tg_o),
        B("Ear R", "ear", [0.3, 1.04, 0.66], [0.2, 0.2, 0.12], tg_o),
        B("Ear in L", "ear", [-0.3, 1.06, 0.72], [0.11, 0.11, 0.06], tg_c),
        B("Ear in R", "ear", [0.3, 1.06, 0.72], [0.11, 0.11, 0.06], tg_c),
    ],
    tail=[B(f"Tail {i+1}", "tail", [0, 0.16 + i * 0.02, -0.92 - i * 0.26],
            [0.22 - i * 0.02, 0.22 - i * 0.02, 0.28],
            tg_k if i % 2 else tg_o) for i in range(4)],
    legs=legs4(0.34, -0.54, 0.44, -0.44, [0.26, 0.4, 0.26], tg_o,
               feet=[0.28, 0.12, 0.3], foot_color=tg_c),
    anim={"walk": {"legSwing": 38, "speed": 2.4}},
))

# ---- 23 COW ----------------------------------------------------------------
set_u(0.0862)
cw_w, cw_k, cw_p = "#f6f4ee", "#26262b", "#eda3ad"
def cow_patches(wx, wy, wz):
    # Big soft blobs rather than per-voxel speckle: quantise before hashing.
    if hash01(round(wx / 0.34), round(wy / 0.34), round(wz / 0.34)) > 0.52:
        return cw_k
    return None
packs.append(quadruped(
    "Cow", cw_w, cw_w, cw_w, size=1.08,
    body_pat=cow_patches,
    head_pat=lambda wx, wy, wz: cw_k if (wy > 0.78 or (abs(wx) > 0.3 and wz < 0.78)) else None,
    muzzle=[
        B("Snout", "head", [0, 0.48, 1.14], [0.4, 0.3, 0.24], cw_p),
        B("Nostril L", "head", [-0.11, 0.5, 1.27], [0.07, 0.07, 0.06], "#c4767f"),
        B("Nostril R", "head", [0.11, 0.5, 1.27], [0.07, 0.07, 0.06], "#c4767f"),
        B("Eye L", "head", [-0.25, 0.78, 1.02], [0.11, 0.12, 0.06], "#1c1c1c"),
        B("Eye R", "head", [0.25, 0.78, 1.02], [0.11, 0.12, 0.06], "#1c1c1c"),
        B("Horn L", "head", [-0.3, 1.02, 0.72], [0.12, 0.14, 0.12], "#e6dcc0"),
        B("Horn R", "head", [0.3, 1.02, 0.72], [0.12, 0.14, 0.12], "#e6dcc0"),
        B("Horn tip L", "head", [-0.38, 1.12, 0.72], [0.09, 0.1, 0.09], "#fff6e0"),
        B("Horn tip R", "head", [0.38, 1.12, 0.72], [0.09, 0.1, 0.09], "#fff6e0"),
    ],
    ears=[
        B("Ear L", "ear", [-0.44, 0.88, 0.7], [0.24, 0.12, 0.14], cw_w),
        B("Ear R", "ear", [0.44, 0.88, 0.7], [0.24, 0.12, 0.14], cw_w),
    ],
    tail=[
        B("Tail", "tail", [0, 0.2, -0.94], [0.1, 0.1, 0.4], cw_w),
        B("Tail tuft", "tail", [0, 0.02, -1.14], [0.13, 0.26, 0.13], cw_k),
    ],
    legs=legs4(0.36, -0.56, 0.46, -0.46, [0.24, 0.44, 0.24], cw_w,
               feet=[0.26, 0.14, 0.26], foot_color=cw_k),
    extra=[
        B("Udder", "body", [0, -0.44, -0.3], [0.3, 0.2, 0.3], cw_p),
        B("Bell strap", "body", [0, 0.36, 0.62], [0.5, 0.09, 0.4], "#8a4a2a"),
        B("Bell", "body", [0, 0.22, 0.78], [0.14, 0.16, 0.12], "#e8b62c"),
    ],
    anim={"walk": {"legSwing": 26, "speed": 1.7}, "idle": {"bob": 0.04, "speed": 1.3}},
))

# ---- 24 SHEEP --------------------------------------------------------------
set_u(0.0764)
sh_w, sh_k, sh_wd = "#f4f1e6", "#33333a", "#ddd8c8"
packs.append(quadruped(
    "Sheep", sh_w, sh_w, sh_k, size=0.98, wob=0.45,  # a woolly, lumpy silhouette
    body_pat=lambda wx, wy, wz: sh_wd if hash01(round(wx / 0.2), round(wy / 0.2), round(wz / 0.2)) > 0.62 else None,
    head_at=(0, 0.6, 0.78), head_r=(0.3, 0.3, 0.3),
    muzzle=[
        # Fringe of wool over the black face — three lumps, not one slab.
        B("Wool tuft L", "head", [-0.16, 0.79, 0.78], [0.19, 0.17, 0.19], sh_w),
        B("Wool tuft C", "head", [0, 0.83, 0.74], [0.2, 0.18, 0.2], sh_w),
        B("Wool tuft R", "head", [0.16, 0.79, 0.78], [0.19, 0.17, 0.19], sh_w),
        B("Snout", "head", [0, 0.5, 1.02], [0.24, 0.18, 0.18], sh_k),
        B("Nose", "head", [0, 0.56, 1.12], [0.12, 0.09, 0.07], "#1c1c20"),
        B("Eye L", "head", [-0.18, 0.68, 0.98], [0.09, 0.1, 0.06], "#1c1c20"),
        B("Eye R", "head", [0.18, 0.68, 0.98], [0.09, 0.1, 0.06], "#1c1c20"),
    ],
    ears=[
        B("Ear L", "ear", [-0.32, 0.66, 0.76], [0.2, 0.1, 0.12], sh_k, [0, 0, 18]),
        B("Ear R", "ear", [0.32, 0.66, 0.76], [0.2, 0.1, 0.12], sh_k, [0, 0, -18]),
    ],
    tail=[B("Tail", "tail", [0, 0.2, -0.82], [0.18, 0.2, 0.16], sh_w)],
    legs=legs4(0.28, -0.5, 0.38, -0.38, [0.16, 0.4, 0.16], sh_k),
    anim={"walk": {"legSwing": 30, "speed": 2.0}, "jump": {"height": 1.3}},
))

# ---- 25 HORSE --------------------------------------------------------------
set_u(0.0726)
hs_b, hs_m, hs_c = "#8f5a2c", "#4a2f18", "#f6f1e4"
# The neck is chunky blocks raked forward, with the mane lying along its back
# edge rather than standing up off it — upright mane blocks read as antlers.
horse_neck = [
    B("Neck 1", "body", [0, 0.44, 0.6], [0.36, 0.42, 0.36], hs_b, [26, 0, 0]),
    B("Neck 2", "body", [0, 0.72, 0.74], [0.3, 0.4, 0.32], hs_b, [26, 0, 0]),
    B("Mane 1", "body", [0, 0.5, 0.42], [0.13, 0.4, 0.22], hs_m, [26, 0, 0]),
    B("Mane 2", "body", [0, 0.78, 0.58], [0.12, 0.36, 0.2], hs_m, [26, 0, 0]),
    B("Mane 3", "body", [0, 0.98, 0.7], [0.11, 0.22, 0.18], hs_m, [26, 0, 0]),
]
packs.append(quadruped(
    "Horse", hs_b, "#a06c38", hs_b, size=1.06, wob=0.15,
    body_r=(0.4, 0.42, 0.9),
    head_at=(0, 1.0, 0.94), head_r=(0.23, 0.28, 0.32),
    head_pat=lambda wx, wy, wz: hs_c if (abs(wx) < 0.09 and wz > 1.05) else None,
    muzzle=horse_neck + [
        B("Muzzle", "head", [0, 0.86, 1.24], [0.22, 0.24, 0.22], hs_b),
        B("Nose", "head", [0, 0.8, 1.36], [0.18, 0.13, 0.1], "#5a3a1e"),
        B("Forelock", "head", [0, 1.24, 0.94], [0.17, 0.14, 0.22], hs_m),
        B("Eye L", "head", [-0.19, 1.1, 1.06], [0.09, 0.1, 0.06], "#1c1c1c"),
        B("Eye R", "head", [0.19, 1.1, 1.06], [0.09, 0.1, 0.06], "#1c1c1c"),
    ],
    ears=[
        B("Ear L", "ear", [-0.14, 1.34, 0.88], [0.1, 0.19, 0.1], hs_b),
        B("Ear R", "ear", [0.14, 1.34, 0.88], [0.1, 0.19, 0.1], hs_b),
    ],
    tail=[
        B("Tail 1", "tail", [0, 0.32, -0.9], [0.2, 0.34, 0.22], hs_m),
        B("Tail 2", "tail", [0, 0.06, -1.02], [0.18, 0.4, 0.2], hs_m),
        B("Tail 3", "tail", [0, -0.24, -1.06], [0.15, 0.3, 0.17], "#3a2412"),
    ],
    legs=legs4(0.3, -0.6, 0.46, -0.46, [0.2, 0.52, 0.2], hs_b,
               feet=[0.22, 0.12, 0.24], foot_color="#2e2118"),
    anim={"walk": {"legSwing": 40, "speed": 2.5}, "jump": {"height": 1.4}},
))

# ---- 26 HIPPO --------------------------------------------------------------
set_u(0.0871)
hp_g, hp_b, hp_p = "#8e7f96", "#a898ae", "#d99aa4"
packs.append(quadruped(
    "Hippo", hp_g, hp_b, hp_g, size=1.16,
    body_at=(0, 0.06, -0.08), body_r=(0.6, 0.44, 0.86),
    head_at=(0, 0.44, 0.86), head_r=(0.46, 0.34, 0.44),
    muzzle=[
        B("Jaw", "head", [0, 0.24, 1.04], [0.62, 0.24, 0.44], hp_g),
        B("Mouth", "head", [0, 0.36, 1.14], [0.56, 0.06, 0.3], "#5e4a58"),
        B("Tooth L", "head", [-0.19, 0.28, 1.24], [0.08, 0.12, 0.08], "#fff6e0"),
        B("Tooth R", "head", [0.19, 0.28, 1.24], [0.08, 0.12, 0.08], "#fff6e0"),
        B("Nostril L", "head", [-0.14, 0.62, 1.2], [0.09, 0.07, 0.08], "#5e4a58"),
        B("Nostril R", "head", [0.14, 0.62, 1.2], [0.09, 0.07, 0.08], "#5e4a58"),
        B("Eye L", "head", [-0.3, 0.68, 0.96], [0.11, 0.12, 0.08], "#ffffff"),
        B("Eye R", "head", [0.3, 0.68, 0.96], [0.11, 0.12, 0.08], "#ffffff"),
        B("Pupil L", "head", [-0.3, 0.68, 1.02], [0.06, 0.07, 0.05], "#1c1c1c"),
        B("Pupil R", "head", [0.3, 0.68, 1.02], [0.06, 0.07, 0.05], "#1c1c1c"),
    ],
    ears=[
        B("Ear L", "ear", [-0.34, 0.78, 0.66], [0.13, 0.12, 0.1], hp_g),
        B("Ear R", "ear", [0.34, 0.78, 0.66], [0.13, 0.12, 0.1], hp_g),
        B("Ear in L", "ear", [-0.34, 0.8, 0.71], [0.07, 0.07, 0.05], hp_p),
        B("Ear in R", "ear", [0.34, 0.8, 0.71], [0.07, 0.07, 0.05], hp_p),
    ],
    tail=[B("Tail", "tail", [0, 0.14, -0.96], [0.12, 0.16, 0.22], hp_g)],
    legs=legs4(0.42, -0.5, 0.5, -0.5, [0.3, 0.34, 0.3], hp_g,
               feet=[0.34, 0.12, 0.34], foot_color="#6d6172"),
    anim={"walk": {"legSwing": 22, "bodyBob": 0.06, "speed": 1.6},
          "idle": {"bob": 0.04, "speed": 1.2}},
))

# ---- 27 CAT ----------------------------------------------------------------
set_u(0.0692)
ct_g, ct_d, ct_w = "#9aa2ac", "#6e767f", "#f4f4ef"
packs.append(quadruped(
    "Cat", ct_g, ct_w, ct_g, size=0.86,
    body_pat=lambda wx, wy, wz: ct_d if (wy > 0.0 and math.floor((wz + 4) / 0.17) % 2 == 0) else None,
    muzzle=[
        B("Snout", "head", [0, 0.4, 0.92], [0.24, 0.16, 0.16], ct_w),
        B("Nose", "head", [0, 0.46, 1.0], [0.09, 0.07, 0.06], "#d98a94"),
        B("Eye L", "head", [-0.16, 0.6, 0.88], [0.11, 0.13, 0.06], "#8fd44a"),
        B("Eye R", "head", [0.16, 0.6, 0.88], [0.11, 0.13, 0.06], "#8fd44a"),
        B("Pupil L", "head", [-0.16, 0.6, 0.92], [0.04, 0.11, 0.04], "#1c1c1c"),
        B("Pupil R", "head", [0.16, 0.6, 0.92], [0.04, 0.11, 0.04], "#1c1c1c"),
        B("Whisker L", "head", [-0.28, 0.38, 0.94], [0.22, 0.025, 0.025], ct_w),
        B("Whisker R", "head", [0.28, 0.38, 0.94], [0.22, 0.025, 0.025], ct_w),
    ],
    ears=[
        B("Ear L", "ear", [-0.22, 0.86, 0.6], [0.15, 0.2, 0.09], ct_g),
        B("Ear R", "ear", [0.22, 0.86, 0.6], [0.15, 0.2, 0.09], ct_g),
        B("Ear tip L", "ear", [-0.22, 0.99, 0.6], [0.08, 0.09, 0.07], ct_d),
        B("Ear tip R", "ear", [0.22, 0.99, 0.6], [0.08, 0.09, 0.07], ct_d),
    ],
    tail=[B(f"Tail {i+1}", "tail", [0, 0.24 + i * 0.09, -0.76 - i * 0.18],
            [0.13, 0.13, 0.22], ct_d if i % 2 else ct_g) for i in range(4)],
    legs=legs4(0.24, -0.44, 0.34, -0.34, [0.16, 0.34, 0.16], ct_g,
               feet=[0.18, 0.1, 0.2], foot_color=ct_w),
    anim={"walk": {"legSwing": 40, "speed": 2.7}, "jump": {"height": 1.5}},
))

# ---- 28 DOG ----------------------------------------------------------------
set_u(0.0724)
dg_t, dg_w, dg_k = "#c98a48", "#f6f2e8", "#4a3220"
packs.append(quadruped(
    "Dog", dg_t, dg_w, dg_t, size=0.9,
    body_pat=lambda wx, wy, wz: dg_k if (wy > 0.2 and wz < 0.3) else None,
    head_pat=lambda wx, wy, wz: dg_w if (abs(wx) < 0.12 and wz > 0.72) else None,
    muzzle=[
        B("Snout", "head", [0, 0.44, 1.0], [0.26, 0.2, 0.26], dg_w),
        B("Nose", "head", [0, 0.5, 1.16], [0.13, 0.11, 0.08], "#241a14"),
        B("Eye L", "head", [-0.18, 0.66, 0.92], [0.1, 0.11, 0.06], "#241a14"),
        B("Eye R", "head", [0.18, 0.66, 0.92], [0.1, 0.11, 0.06], "#241a14"),
        B("Tongue", "head", [0, 0.34, 1.08], [0.1, 0.05, 0.16], "#e0707c"),
    ],
    ears=[
        B("Ear L", "ear", [-0.36, 0.62, 0.68], [0.13, 0.34, 0.18], dg_k),
        B("Ear R", "ear", [0.36, 0.62, 0.68], [0.13, 0.34, 0.18], dg_k),
    ],
    tail=[
        B("Tail 1", "tail", [0, 0.34, -0.78], [0.14, 0.24, 0.16], dg_t, [-30, 0, 0]),
        B("Tail tip", "tail", [0, 0.56, -0.86], [0.12, 0.16, 0.13], dg_w, [-30, 0, 0]),
    ],
    legs=legs4(0.26, -0.46, 0.36, -0.36, [0.18, 0.36, 0.18], dg_t,
               feet=[0.2, 0.1, 0.22], foot_color=dg_w),
    anim={"walk": {"legSwing": 42, "speed": 2.8}, "jump": {"height": 1.4}},
))

# ---- 29 KOALA --------------------------------------------------------------
set_u(0.0730)
ko_g, ko_l, ko_k = "#9aa1a8", "#d8dce0", "#33363b"
packs.append(quadruped(
    "Koala", ko_g, ko_l, ko_g, size=0.9,
    head_at=(0, 0.7, 0.66), head_r=(0.38, 0.36, 0.34),
    muzzle=[
        B("Nose", "head", [0, 0.64, 0.98], [0.2, 0.24, 0.14], ko_k),
        B("Nose top", "head", [0, 0.78, 0.96], [0.13, 0.08, 0.1], "#4a4e55"),
        B("Eye L", "head", [-0.2, 0.84, 0.9], [0.1, 0.11, 0.06], ko_k),
        B("Eye R", "head", [0.2, 0.84, 0.9], [0.1, 0.11, 0.06], ko_k),
        B("Glint L", "head", [-0.22, 0.87, 0.93], [0.04, 0.04, 0.04], "#ffffff"),
        B("Glint R", "head", [0.18, 0.87, 0.93], [0.04, 0.04, 0.04], "#ffffff"),
    ],
    ears=[
        B("Ear L", "ear", [-0.42, 0.86, 0.56], [0.3, 0.3, 0.14], ko_g),
        B("Ear R", "ear", [0.42, 0.86, 0.56], [0.3, 0.3, 0.14], ko_g),
        B("Ear fluff L", "ear", [-0.5, 0.86, 0.6], [0.2, 0.24, 0.1], ko_l),
        B("Ear fluff R", "ear", [0.5, 0.86, 0.6], [0.2, 0.24, 0.1], ko_l),
    ],
    tail=None,
    legs=legs4(0.28, -0.44, 0.34, -0.34, [0.2, 0.34, 0.2], ko_g,
               feet=[0.22, 0.1, 0.22], foot_color=ko_k),
    anim={"walk": {"legSwing": 26, "speed": 1.8}, "idle": {"bob": 0.04, "speed": 1.3}},
))

# ---- 30 RHINO --------------------------------------------------------------
set_u(0.0884)
rh_g, rh_d, rh_h = "#8d9199", "#71757c", "#e2ddcd"
packs.append(quadruped(
    "Rhino", rh_g, rh_d, rh_g, size=1.14,
    body_at=(0, 0.1, -0.08), body_r=(0.56, 0.48, 0.86),
    body_pat=lambda wx, wy, wz: rh_d if (wy > 0.42 or abs(wz + 0.1) < 0.06) else None,
    head_at=(0, 0.46, 0.88), head_r=(0.4, 0.34, 0.42),
    muzzle=[
        B("Muzzle", "head", [0, 0.34, 1.14], [0.42, 0.28, 0.3], rh_g),
        B("Horn", "head", [0, 0.62, 1.24], [0.18, 0.34, 0.2], rh_h, [22, 0, 0]),
        B("Horn tip", "head", [0, 0.82, 1.32], [0.11, 0.18, 0.12], "#f4efe0", [26, 0, 0]),
        B("Horn 2", "head", [0, 0.66, 0.98], [0.14, 0.16, 0.14], rh_h),
        B("Nostril L", "head", [-0.12, 0.3, 1.28], [0.07, 0.06, 0.06], "#55585e"),
        B("Nostril R", "head", [0.12, 0.3, 1.28], [0.07, 0.06, 0.06], "#55585e"),
        B("Eye L", "head", [-0.34, 0.56, 0.98], [0.09, 0.1, 0.06], "#1c1c1c"),
        B("Eye R", "head", [0.34, 0.56, 0.98], [0.09, 0.1, 0.06], "#1c1c1c"),
    ],
    ears=[
        B("Ear L", "ear", [-0.28, 0.8, 0.68], [0.12, 0.18, 0.1], rh_g),
        B("Ear R", "ear", [0.28, 0.8, 0.68], [0.12, 0.18, 0.1], rh_g),
    ],
    tail=[
        B("Tail", "tail", [0, 0.2, -0.98], [0.1, 0.1, 0.3], rh_g),
        B("Tail tuft", "tail", [0, 0.1, -1.16], [0.1, 0.16, 0.1], "#4a4d53"),
    ],
    legs=legs4(0.4, -0.52, 0.5, -0.5, [0.3, 0.38, 0.3], rh_g,
               feet=[0.34, 0.12, 0.34], foot_color=rh_d),
    anim={"walk": {"legSwing": 24, "bodyBob": 0.07, "speed": 1.8}},
))

# ---- 31 T-REX --------------------------------------------------------------
# The one dinosaur, and the only animal on the two-segment legs the humans use:
# a digitigrade leg needs a real knee, so the shins take the lower* roles.
set_u(0.0728)
tx_g, tx_d, tx_b, tx_k = "#5fa845", "#468330", "#cfe0a2", "#241f1a"
v = Vox()
def trex_body(wx, wy, wz):
    if wy < 0.34 and wz > -0.5:
        return tx_b  # pale underside
    if wy > 0.66:
        return tx_d  # darker along the spine
    return tx_g
v.ellipsoid(0, 0.5, -0.12, 0.34, 0.36, 0.62, trex_body, wob=0.22)
v.ellipsoid(0, 0.68, 0.46, 0.23, 0.24, 0.3, trex_body, wob=0.18, seed=5)  # neck
trex = v.merge("body", "Body")
hv = Vox()
hv.ellipsoid(0, 0.86, 0.86, 0.25, 0.25, 0.36, lambda wx, wy, wz: tx_d if wy > 0.98 else tx_g,
             wob=0.16, seed=9)
hv.box(-0.2, 0.64, 0.9, 0.2, 0.82, 1.28, lambda wx, wy, wz: tx_b if wy < 0.72 else tx_g)  # jaw
trex += hv.merge("head", "Head")
trex += [
    B("Brow L", "head", [-0.18, 1.04, 0.98], [0.13, 0.09, 0.14], tx_d),
    B("Brow R", "head", [0.18, 1.04, 0.98], [0.13, 0.09, 0.14], tx_d),
    B("Eye L", "head", [-0.19, 0.98, 1.04], [0.09, 0.09, 0.06], "#f8d21c"),
    B("Eye R", "head", [0.19, 0.98, 1.04], [0.09, 0.09, 0.06], "#f8d21c"),
    B("Pupil L", "head", [-0.19, 0.98, 1.08], [0.04, 0.07, 0.04], tx_k),
    B("Pupil R", "head", [0.19, 0.98, 1.08], [0.04, 0.07, 0.04], tx_k),
    B("Nostril L", "head", [-0.09, 0.92, 1.26], [0.06, 0.06, 0.05], tx_k),
    B("Nostril R", "head", [0.09, 0.92, 1.26], [0.06, 0.06, 0.05], tx_k),
]
for i in range(4):
    z = 0.98 + i * 0.13
    trex.append(B(f"Tooth L{i+1}", "head", [-0.17, 0.62, z], [0.05, 0.1, 0.05], "#fff6e0"))
    trex.append(B(f"Tooth R{i+1}", "head", [0.17, 0.62, z], [0.05, 0.1, 0.05], "#fff6e0"))
# tail: heavy at the hips, tapering into a counterweight behind
for i in range(6):
    t = i / 5
    trex.append(B(f"Tail {i+1}", "tail", [0, 0.5 - t * 0.12, -0.78 - i * 0.28],
                  [0.34 - t * 0.22, 0.34 - t * 0.22, 0.32],
                  tx_d if i % 2 else tx_g))
# tiny arms, two claws each
for side, role in ((-1, "legFL"), (1, "legFR")):
    ax = side * 0.28
    trex += [
        B("Arm", role, [ax, 0.52, 0.36], [0.1, 0.22, 0.1], tx_g),
        B("Claw 1", role, [ax - side * 0.03, 0.38, 0.44], [0.05, 0.1, 0.06], "#f4efe0"),
        B("Claw 2", role, [ax + side * 0.05, 0.38, 0.44], [0.05, 0.1, 0.06], "#f4efe0"),
    ]
# legs: thick thigh, shin below the knee, three-toed foot
for side, role, lower in ((-1, "legBL", "lowerBL"), (1, "legBR", "lowerBR")):
    lx = side * 0.25
    uv = Vox()
    uv.ellipsoid(lx, 0.1, -0.12, 0.25, 0.32, 0.3, solid(tx_g), wob=0.14, seed=17)
    uv.ellipsoid(lx, -0.2, -0.02, 0.17, 0.12, 0.17, solid(tx_d), seed=21)  # knee
    trex += uv.merge(role, "Leg")
    lv = Vox()
    lv.ellipsoid(lx, -0.44, 0.02, 0.13, 0.26, 0.15, solid(tx_g), wob=0.14, seed=18)
    trex += lv.merge(lower, "Shin")
    trex += [B("Foot", lower, [lx, -0.7, 0.12], [0.26, 0.14, 0.36], tx_g),
             B("Heel", lower, [lx, -0.7, -0.1], [0.18, 0.13, 0.14], tx_d)]
    for j in range(3):
        trex.append(B(f"Toe {j+1}", lower, [lx + (j - 1) * 0.09, -0.72, 0.32],
                      [0.07, 0.1, 0.1], "#f4efe0"))
packs.append(design("T-Rex", trex, {"idle": {"bob": 0.05, "speed": 1.3},
                                    "walk": {"legSwing": 27, "bodyBob": 0.1, "speed": 2.0},
                                    "jump": {"height": 1.3, "tuck": 26, "speed": 0.85}}))

# ---- 32 ANT ----------------------------------------------------------------
# Six legs on four roles: the front and rear pairs share a role so they swing
# together while the middle pair swings opposite — an insect's tripod gait.
set_u(0.0494)
an_k, an_d, an_r = "#2f1c14", "#48291a", "#8a3a1e"
v = Vox()
v.ellipsoid(0, 0.3, -0.5, 0.3, 0.28, 0.38, solid(an_k), wob=0.2)          # gaster
v.ellipsoid(0, 0.26, -0.14, 0.15, 0.14, 0.14, solid(an_d), wob=0.1, seed=3)  # waist
v.ellipsoid(0, 0.3, 0.12, 0.22, 0.21, 0.24, solid(an_r), wob=0.15, seed=4)   # thorax
ant = v.merge("body", "Body")
hv = Vox()
hv.ellipsoid(0, 0.32, 0.5, 0.24, 0.22, 0.2, solid(an_k), wob=0.14, seed=9)
ant += hv.merge("head", "Head")
ant += [
    B("Eye L", "head", [-0.19, 0.4, 0.6], [0.09, 0.1, 0.08], "#f0e4c0"),
    B("Eye R", "head", [0.19, 0.4, 0.6], [0.09, 0.1, 0.08], "#f0e4c0"),
    B("Pupil L", "head", [-0.19, 0.4, 0.65], [0.05, 0.06, 0.04], "#1c1410"),
    B("Pupil R", "head", [0.19, 0.4, 0.65], [0.05, 0.06, 0.04], "#1c1410"),
    B("Mandible L", "head", [-0.11, 0.22, 0.7], [0.06, 0.06, 0.18], an_d, [0, 18, 0]),
    B("Mandible R", "head", [0.11, 0.22, 0.7], [0.06, 0.06, 0.18], an_d, [0, -18, 0]),
    B("Antenna L", "ear", [-0.12, 0.5, 0.66], [0.04, 0.22, 0.04], an_d, [-34, 0, 16]),
    B("Antenna R", "ear", [0.12, 0.5, 0.66], [0.04, 0.22, 0.04], an_d, [-34, 0, -16]),
    B("Antenna tip L", "ear", [-0.21, 0.66, 0.78], [0.05, 0.12, 0.05], an_k, [-52, 0, 24]),
    B("Antenna tip R", "ear", [0.21, 0.66, 0.78], [0.05, 0.12, 0.05], an_k, [-52, 0, -24]),
]
for i, (role, z) in enumerate([("legFL", 0.22), ("legFR", 0.22), ("legBL", 0.02),
                               ("legBR", 0.02), ("legFL", -0.18), ("legFR", -0.18)]):
    side = -1 if role.endswith("L") else 1
    ant += [
        B(f"Leg {i+1}", role, [side * 0.28, 0.22, z], [0.3, 0.05, 0.05], an_k, [0, 0, side * 22]),
        B(f"Shin {i+1}", role, [side * 0.44, 0.06, z + 0.03], [0.05, 0.3, 0.05], an_k, [0, 0, side * -14]),
        B(f"Foot {i+1}", role, [side * 0.47, -0.09, z + 0.05], [0.07, 0.05, 0.1], an_d),
    ]
packs.append(design("Ant", ant, {"idle": {"bob": 0.03, "speed": 2.2},
                                 "walk": {"legSwing": 30, "bodyBob": 0.05, "speed": 3.4},
                                 "jump": {"height": 0.9, "tuck": 30, "speed": 1.1}}))

# ---- 33 SNAKE --------------------------------------------------------------
# No legs at all: the body is voxelised along an S-curve and the back third
# takes the tail role, so the walk clip's wag reads as a slither.
set_u(0.0487)
sk_g, sk_d, sk_b = "#5aa84a", "#2f6a26", "#e4e2ac"
def snake_skin(wx, wy, wz):
    if wy < 0.1:
        return sk_b  # pale belly
    return sk_d if math.floor((wz + 4) / 0.24) % 2 == 0 else sk_g
def coil(t):
    """Centreline of the snake: runs back from the head, weaving in x."""
    return math.sin(t * 5.6) * 0.36, 0.55 - t * 1.85
v = Vox()
for i in range(10):
    t = i / 13
    x, z = coil(t)
    r = 0.21 - t * 0.06
    v.ellipsoid(x, r, z, r, r, 0.15, snake_skin, wob=0.12, seed=3 + i)
snake = v.merge("body", "Body")
hv = Vox()
shx, shz = coil(-0.06)
hv.ellipsoid(shx, 0.22, shz, 0.24, 0.17, 0.28, lambda wx, wy, wz: sk_b if wy < 0.16 else sk_g,
             wob=0.1, seed=21)
snake += hv.merge("head", "Head")
snake += [
    B("Brow L", "head", [shx - 0.15, 0.33, shz + 0.06], [0.11, 0.06, 0.13], sk_d),
    B("Brow R", "head", [shx + 0.15, 0.33, shz + 0.06], [0.11, 0.06, 0.13], sk_d),
    B("Eye L", "head", [shx - 0.15, 0.28, shz + 0.16], [0.09, 0.09, 0.06], "#f2c341"),
    B("Eye R", "head", [shx + 0.15, 0.28, shz + 0.16], [0.09, 0.09, 0.06], "#f2c341"),
    B("Pupil L", "head", [shx - 0.15, 0.28, shz + 0.2], [0.03, 0.08, 0.04], "#1c1c1c"),
    B("Pupil R", "head", [shx + 0.15, 0.28, shz + 0.2], [0.03, 0.08, 0.04], "#1c1c1c"),
    B("Tongue", "head", [shx, 0.17, shz + 0.34], [0.03, 0.03, 0.2], "#d9425a"),
    B("Fork L", "head", [shx - 0.05, 0.17, shz + 0.47], [0.03, 0.03, 0.1], "#d9425a", [0, 22, 0]),
    B("Fork R", "head", [shx + 0.05, 0.17, shz + 0.47], [0.03, 0.03, 0.1], "#d9425a", [0, -22, 0]),
]
for i in range(5):
    t = 0.77 + i * 0.062
    x, z = coil(t)
    r = 0.15 - i * 0.024
    snake.append(B(f"Tail {i+1}", "tail", [x, r, z], [r * 2, r * 2, 0.26],
                   sk_d if i % 2 else sk_g))
packs.append(design("Snake", snake, {"idle": {"bob": 0.02, "speed": 1.6},
                                     "walk": {"legSwing": 20, "bodyBob": 0.03, "speed": 2.6},
                                     "jump": {"height": 0.9, "tuck": 20, "speed": 0.9}}))

# ---- 34 SQUIRREL -----------------------------------------------------------
set_u(0.0596)
sq_r, sq_c, sq_d = "#b56a33", "#f4e6cf", "#8a4a20"
packs.append(quadruped(
    "Squirrel", sq_r, sq_c, sq_r, size=0.74,
    head_at=(0, 0.6, 0.62), head_r=(0.3, 0.28, 0.28),
    muzzle=[
        B("Snout", "head", [0, 0.5, 0.86], [0.18, 0.14, 0.14], sq_c),
        B("Nose", "head", [0, 0.54, 0.95], [0.08, 0.07, 0.06], "#2a1c14"),
        B("Tooth", "head", [0, 0.44, 0.94], [0.07, 0.07, 0.04], "#ffffff"),
        B("Eye L", "head", [-0.17, 0.66, 0.82], [0.1, 0.11, 0.06], "#1c1410"),
        B("Eye R", "head", [0.17, 0.66, 0.82], [0.1, 0.11, 0.06], "#1c1410"),
        B("Glint L", "head", [-0.19, 0.69, 0.85], [0.04, 0.04, 0.04], "#ffffff"),
        B("Glint R", "head", [0.15, 0.69, 0.85], [0.04, 0.04, 0.04], "#ffffff"),
    ],
    ears=[
        B("Ear L", "ear", [-0.19, 0.9, 0.56], [0.13, 0.19, 0.08], sq_r),
        B("Ear R", "ear", [0.19, 0.9, 0.56], [0.13, 0.19, 0.08], sq_r),
        B("Tuft L", "ear", [-0.19, 1.02, 0.56], [0.08, 0.1, 0.06], sq_d),
        B("Tuft R", "ear", [0.19, 1.02, 0.56], [0.08, 0.1, 0.06], sq_d),
    ],
    # The tail sweeps up and forward over the back — a squirrel's whole read.
    tail=[
        B("Tail 1", "tail", [0, 0.2, -0.62], [0.24, 0.3, 0.26], sq_r),
        B("Tail 2", "tail", [0, 0.58, -0.72], [0.3, 0.42, 0.28], sq_r),
        B("Tail 3", "tail", [0, 0.98, -0.62], [0.32, 0.4, 0.3], sq_d),
        B("Tail 4", "tail", [0, 1.24, -0.36], [0.3, 0.3, 0.34], sq_r),
        B("Tail tip", "tail", [0, 1.34, -0.06], [0.24, 0.22, 0.28], sq_c),
    ],
    legs=legs4(0.22, -0.4, 0.3, -0.3, [0.14, 0.3, 0.14], sq_r,
               feet=[0.16, 0.09, 0.2], foot_color=sq_d),
    anim={"walk": {"legSwing": 42, "speed": 3.0}, "jump": {"height": 1.5}},
))

# ---- 35 DEER ---------------------------------------------------------------
set_u(0.0657)
de_b, de_c, de_a = "#a5713f", "#f6ecd8", "#7a5228"
antler = []
for side in (-1, 1):
    antler += [
        B(f"Antler {side}", "head", [side * 0.16, 1.24, 0.78], [0.07, 0.3, 0.07], de_a, [-14, 0, side * 14]),
        B(f"Prong A {side}", "head", [side * 0.3, 1.4, 0.74], [0.16, 0.06, 0.06], de_a, [0, 0, side * 26]),
        B(f"Prong B {side}", "head", [side * 0.26, 1.5, 0.86], [0.06, 0.16, 0.06], de_a, [-24, 0, side * 20]),
        B(f"Prong C {side}", "head", [side * 0.34, 1.56, 0.66], [0.06, 0.14, 0.06], de_a, [10, 0, side * 34]),
    ]
packs.append(quadruped(
    "Deer", de_b, de_c, de_b, size=0.98, wob=0.16,
    body_r=(0.36, 0.38, 0.82),
    body_pat=lambda wx, wy, wz: de_c if (wy > 0.1 and hash01(round(wx / 0.22), round(wy / 0.22), round(wz / 0.22)) > 0.78) else None,
    head_at=(0, 0.98, 0.88), head_r=(0.21, 0.24, 0.3),
    muzzle=[
        B("Neck 1", "body", [0, 0.44, 0.56], [0.28, 0.4, 0.3], de_b, [24, 0, 0]),
        B("Neck 2", "body", [0, 0.72, 0.7], [0.24, 0.36, 0.26], de_b, [24, 0, 0]),
        B("Muzzle", "head", [0, 0.86, 1.16], [0.18, 0.18, 0.2], de_c),
        B("Nose", "head", [0, 0.88, 1.28], [0.12, 0.09, 0.07], "#2a1c14"),
        B("Eye L", "head", [-0.17, 1.06, 1.0], [0.09, 0.1, 0.06], "#1c1410"),
        B("Eye R", "head", [0.17, 1.06, 1.0], [0.09, 0.1, 0.06], "#1c1410"),
    ] + antler,
    ears=[
        B("Ear L", "ear", [-0.24, 1.12, 0.8], [0.19, 0.11, 0.1], de_b, [0, 0, 26]),
        B("Ear R", "ear", [0.24, 1.12, 0.8], [0.19, 0.11, 0.1], de_b, [0, 0, -26]),
    ],
    tail=[B("Tail", "tail", [0, 0.3, -0.8], [0.16, 0.2, 0.14], de_c)],
    legs=legs4(0.26, -0.58, 0.42, -0.42, [0.16, 0.5, 0.16], de_b,
               feet=[0.18, 0.1, 0.2], foot_color="#2e2118"),
    anim={"walk": {"legSwing": 40, "speed": 2.6}, "jump": {"height": 1.7}},
))

# ---- 36 KANGAROO -----------------------------------------------------------
# Upright, so it gets the two-segment legs: huge thigh, shin, and a long foot.
set_u(0.0554)
kg_t, kg_c, kg_d = "#c08a4e", "#f0dcbc", "#8f6032"
v = Vox()
def roo_body(wx, wy, wz):
    return kg_c if wz > 0.06 and wy < 0.62 else kg_t
v.ellipsoid(0, 0.34, -0.02, 0.28, 0.4, 0.26, roo_body, wob=0.18)
v.ellipsoid(0, 0.74, 0.04, 0.22, 0.2, 0.2, solid(kg_t), wob=0.12, seed=5)  # chest
roo = v.merge("body", "Body")
hv = Vox()
hv.ellipsoid(0, 1.02, 0.14, 0.19, 0.19, 0.26, lambda wx, wy, wz: kg_c if wz > 0.24 else kg_t,
             wob=0.12, seed=9)
roo += hv.merge("head", "Head")
roo += [
    B("Muzzle", "head", [0, 0.96, 0.42], [0.15, 0.14, 0.16], kg_c),
    B("Nose", "head", [0, 0.99, 0.52], [0.09, 0.07, 0.06], "#2a1c14"),
    B("Eye L", "head", [-0.13, 1.09, 0.34], [0.08, 0.09, 0.06], "#1c1410"),
    B("Eye R", "head", [0.13, 1.09, 0.34], [0.08, 0.09, 0.06], "#1c1410"),
    B("Ear L", "ear", [-0.15, 1.28, 0.06], [0.11, 0.26, 0.1], kg_t, [-8, 0, 10]),
    B("Ear R", "ear", [0.15, 1.28, 0.06], [0.11, 0.26, 0.1], kg_t, [-8, 0, -10]),
    B("Ear in L", "ear", [-0.15, 1.28, 0.11], [0.06, 0.18, 0.06], kg_c, [-8, 0, 10]),
    B("Ear in R", "ear", [0.15, 1.28, 0.11], [0.06, 0.18, 0.06], kg_c, [-8, 0, -10]),
    B("Pouch", "body", [0, 0.16, 0.2], [0.32, 0.24, 0.12], kg_d),
    B("Joey", "body", [0, 0.3, 0.24], [0.14, 0.14, 0.1], kg_t),
    B("Joey ear L", "body", [-0.06, 0.4, 0.24], [0.05, 0.09, 0.05], kg_t),
    B("Joey ear R", "body", [0.06, 0.4, 0.24], [0.05, 0.09, 0.05], kg_t),
]
for i in range(5):
    t = i / 4
    roo.append(B(f"Tail {i+1}", "tail", [0, 0.2 - t * 0.14, -0.36 - i * 0.28],
                 [0.26 - t * 0.12, 0.26 - t * 0.12, 0.3], kg_d if i % 2 else kg_t))
for side, role in ((-1, "legFL"), (1, "legFR")):
    roo += [B("Arm", role, [side * 0.26, 0.66, 0.16], [0.1, 0.26, 0.1], kg_t),
            B("Paw", role, [side * 0.26, 0.5, 0.22], [0.09, 0.09, 0.13], kg_d)]
for side, role, lower in ((-1, "legBL", "lowerBL"), (1, "legBR", "lowerBR")):
    lx = side * 0.2
    uv = Vox()
    uv.ellipsoid(lx, 0.1, -0.08, 0.17, 0.3, 0.22, solid(kg_t), wob=0.14, seed=17)
    uv.ellipsoid(lx, -0.2, 0.0, 0.14, 0.1, 0.14, solid(kg_d), seed=21)  # knee
    roo += uv.merge(role, "Leg")
    lv = Vox()
    lv.ellipsoid(lx, -0.42, 0.02, 0.11, 0.24, 0.12, solid(kg_t), wob=0.14, seed=18)
    roo += lv.merge(lower, "Shin")
    roo += [B("Foot", lower, [lx, -0.68, 0.16], [0.19, 0.13, 0.5], kg_d),
            B("Toes", lower, [lx, -0.68, 0.42], [0.17, 0.09, 0.1], kg_c)]
packs.append(design("Kangaroo", roo, {"idle": {"bob": 0.04, "speed": 1.5},
                                      "walk": {"legSwing": 30, "bodyBob": 0.14, "speed": 2.2},
                                      "jump": {"height": 2.0, "tuck": 34, "speed": 0.9}}))

# ---- 37 RACCOON ------------------------------------------------------------
set_u(0.0665)
rc_g, rc_k, rc_c = "#8d8f98", "#33343a", "#e6e4de"
packs.append(quadruped(
    "Raccoon", rc_g, rc_c, rc_g, size=0.84,
    body_pat=lambda wx, wy, wz: rc_k if wy > 0.32 else None,
    head_at=(0, 0.62, 0.68), head_r=(0.32, 0.3, 0.3),
    head_pat=lambda wx, wy, wz: (
        rc_c if (wy > 0.78 or (abs(wx) < 0.08 and wz > 0.72)) else
        rc_k if (0.6 < wy < 0.78 and wz > 0.72) else None),  # bandit mask
    muzzle=[
        B("Snout", "head", [0, 0.5, 0.94], [0.2, 0.16, 0.18], rc_c),
        B("Nose", "head", [0, 0.54, 1.04], [0.1, 0.08, 0.07], "#26262b"),
        B("Eye L", "head", [-0.16, 0.68, 0.9], [0.09, 0.1, 0.06], "#f0efe8"),
        B("Eye R", "head", [0.16, 0.68, 0.9], [0.09, 0.1, 0.06], "#f0efe8"),
        B("Pupil L", "head", [-0.16, 0.68, 0.94], [0.05, 0.06, 0.04], "#1c1c1c"),
        B("Pupil R", "head", [0.16, 0.68, 0.94], [0.05, 0.06, 0.04], "#1c1c1c"),
    ],
    ears=[
        B("Ear L", "ear", [-0.24, 0.9, 0.6], [0.17, 0.15, 0.09], rc_g),
        B("Ear R", "ear", [0.24, 0.9, 0.6], [0.17, 0.15, 0.09], rc_g),
        B("Ear in L", "ear", [-0.24, 0.91, 0.65], [0.1, 0.09, 0.05], rc_c),
        B("Ear in R", "ear", [0.24, 0.91, 0.65], [0.1, 0.09, 0.05], rc_c),
    ],
    tail=[B(f"Tail {i+1}", "tail", [0, 0.24 + i * 0.05, -0.72 - i * 0.2],
            [0.2, 0.2, 0.24], rc_k if i % 2 == 0 else rc_c) for i in range(5)],
    legs=legs4(0.26, -0.42, 0.34, -0.34, [0.17, 0.32, 0.17], rc_k,
               feet=[0.19, 0.09, 0.21], foot_color=rc_k),
    anim={"walk": {"legSwing": 36, "speed": 2.5}},
))

# ---- 38 HEDGEHOG -----------------------------------------------------------
set_u(0.0579)
hg_b, hg_c, hg_s = "#8a6a4a", "#f0ddc0", "#4a3626"
spines = []
for i in range(26):
    a = hash01(i, i * 2.1)
    bq = hash01(i * 1.7, i)
    sx = (a - 0.5) * 0.66
    sz = -0.36 + (bq - 0.5) * 0.86
    sy = 0.3 + (1 - (abs(sx) / 0.4) ** 2) * 0.16
    spines.append(B(f"Spine {i+1}", "body", [sx, sy, sz], [0.09, 0.22, 0.09],
                    hg_s if i % 2 else "#2f2318", [(bq - 0.5) * 34, 0, (a - 0.5) * 40]))
packs.append(quadruped(
    "Hedgehog", hg_s, hg_c, hg_b, size=0.72,
    body_at=(0, 0.1, -0.14), body_r=(0.42, 0.34, 0.5),
    body_pat=lambda wx, wy, wz: hg_c if wy < -0.06 else ("#2f2318" if wy > 0.16 else None),
    head_at=(0, 0.3, 0.44), head_r=(0.26, 0.24, 0.26),
    muzzle=[
        B("Snout", "head", [0, 0.22, 0.68], [0.16, 0.13, 0.18], hg_c),
        B("Nose", "head", [0, 0.24, 0.79], [0.09, 0.08, 0.07], "#26201a"),
        B("Eye L", "head", [-0.15, 0.36, 0.62], [0.08, 0.09, 0.06], "#1c1410"),
        B("Eye R", "head", [0.15, 0.36, 0.62], [0.08, 0.09, 0.06], "#1c1410"),
    ],
    ears=[
        B("Ear L", "ear", [-0.22, 0.5, 0.42], [0.12, 0.11, 0.07], hg_b),
        B("Ear R", "ear", [0.22, 0.5, 0.42], [0.12, 0.11, 0.07], hg_b),
    ],
    tail=None,
    legs=legs4(0.24, -0.28, 0.28, -0.34, [0.13, 0.2, 0.13], hg_b,
               feet=[0.15, 0.07, 0.17], foot_color=hg_c),
    extra=spines,
    anim={"walk": {"legSwing": 38, "bodyBob": 0.06, "speed": 3.0}},
))

# ---- 39 UNICORN ------------------------------------------------------------
set_u(0.0726)
un_w, un_s, un_go = "#f8f6f0", "#e2dced", "#f2c341"
RAINBOW = ["#e0455a", "#f0913a", "#f2d13a", "#5ab84a", "#3a8fd6", "#8a5ac8"]
uni_neck = [
    B("Neck 1", "body", [0, 0.44, 0.6], [0.36, 0.42, 0.36], un_w, [26, 0, 0]),
    B("Neck 2", "body", [0, 0.72, 0.74], [0.3, 0.4, 0.32], un_w, [26, 0, 0]),
# Mane and tail run in four fat overlapping locks: small colour chips at this
# voxel size scatter into confetti instead of reading as flowing hair.
] + [B(f"Mane {i+1}", "body", [0, 0.42 + i * 0.15, 0.36 + i * 0.085], [0.16, 0.3, 0.26],
       RAINBOW[i], [26, 0, 0]) for i in range(4)]
packs.append(quadruped(
    "Unicorn", un_w, un_s, un_w, size=1.06, wob=0.15,
    body_r=(0.4, 0.42, 0.9),
    head_at=(0, 1.0, 0.94), head_r=(0.23, 0.28, 0.32),
    muzzle=uni_neck + [
        B("Muzzle", "head", [0, 0.86, 1.24], [0.22, 0.24, 0.22], un_w),
        B("Nose", "head", [0, 0.8, 1.36], [0.18, 0.13, 0.1], "#d9b6c8"),
        B("Horn 1", "head", [0, 1.3, 1.0], [0.11, 0.18, 0.11], un_go, [16, 0, 0]),
        B("Horn 2", "head", [0, 1.44, 1.04], [0.08, 0.16, 0.08], "#ffe08a", [16, 0, 0]),
        B("Horn tip", "head", [0, 1.56, 1.08], [0.05, 0.12, 0.05], "#fff6d0", [16, 0, 0]),
        B("Forelock", "head", [0, 1.22, 0.9], [0.17, 0.14, 0.22], RAINBOW[0]),
        B("Eye L", "head", [-0.19, 1.1, 1.06], [0.09, 0.1, 0.06], "#4a2a5a"),
        B("Eye R", "head", [0.19, 1.1, 1.06], [0.09, 0.1, 0.06], "#4a2a5a"),
    ],
    ears=[
        B("Ear L", "ear", [-0.14, 1.34, 0.88], [0.1, 0.19, 0.1], un_w),
        B("Ear R", "ear", [0.14, 1.34, 0.88], [0.1, 0.19, 0.1], un_w),
    ],
    tail=[B(f"Tail {i+1}", "tail", [0, 0.34 - i * 0.14, -0.94 - i * 0.02],
            [0.26, 0.3, 0.28], RAINBOW[i]) for i in range(4)],
    legs=legs4(0.3, -0.6, 0.46, -0.46, [0.2, 0.52, 0.2], un_w,
               feet=[0.22, 0.12, 0.24], foot_color=un_go),
    anim={"walk": {"legSwing": 40, "speed": 2.5}, "jump": {"height": 1.8}},
))

# ---- 40 TRICERATOPS --------------------------------------------------------
set_u(0.0820)
tr_g, tr_d, tr_c, tr_h = "#7fa85a", "#5e8440", "#e0dcae", "#efe6cc"
packs.append(quadruped(
    "Triceratops", tr_g, tr_c, tr_g, size=1.12,
    body_at=(0, 0.1, -0.12), body_r=(0.5, 0.46, 0.88),
    body_pat=lambda wx, wy, wz: tr_d if wy > 0.4 else None,
    head_at=(0, 0.42, 0.9), head_r=(0.36, 0.3, 0.4),
    muzzle=[
        # The frill fans back over the neck. Standing it upright made a wall.
        B("Frill", "head", [0, 0.72, 0.56], [0.86, 0.52, 0.16], tr_d, [-34, 0, 0]),
        B("Frill L", "head", [-0.42, 0.66, 0.62], [0.22, 0.42, 0.15], tr_d, [-34, 0, 12]),
        B("Frill R", "head", [0.42, 0.66, 0.62], [0.22, 0.42, 0.15], tr_d, [-34, 0, -12]),
        B("Frill rim", "head", [0, 0.94, 0.38], [0.78, 0.14, 0.17], tr_c, [-34, 0, 0]),
        B("Frill knob L", "head", [-0.44, 0.86, 0.44], [0.12, 0.12, 0.14], tr_h, [-34, 0, 0]),
        B("Frill knob R", "head", [0.44, 0.86, 0.44], [0.12, 0.12, 0.14], tr_h, [-34, 0, 0]),
        B("Beak", "head", [0, 0.26, 1.24], [0.26, 0.2, 0.24], tr_h),
        B("Nose horn", "head", [0, 0.5, 1.16], [0.13, 0.18, 0.13], tr_h, [18, 0, 0]),
        B("Brow horn L", "head", [-0.22, 0.7, 1.0], [0.11, 0.34, 0.11], tr_h, [26, 0, -8]),
        B("Brow horn R", "head", [0.22, 0.7, 1.0], [0.11, 0.34, 0.11], tr_h, [26, 0, 8]),
        B("Horn tip L", "head", [-0.24, 0.92, 1.14], [0.07, 0.16, 0.07], "#fff6e0", [30, 0, -8]),
        B("Horn tip R", "head", [0.24, 0.92, 1.14], [0.07, 0.16, 0.07], "#fff6e0", [30, 0, 8]),
        B("Eye L", "head", [-0.29, 0.5, 1.06], [0.09, 0.1, 0.06], "#f2a83a"),
        B("Eye R", "head", [0.29, 0.5, 1.06], [0.09, 0.1, 0.06], "#f2a83a"),
        B("Pupil L", "head", [-0.29, 0.5, 1.1], [0.04, 0.07, 0.04], "#1c1c1c"),
        B("Pupil R", "head", [0.29, 0.5, 1.1], [0.04, 0.07, 0.04], "#1c1c1c"),
    ],
    ears=None,
    tail=[B(f"Tail {i+1}", "tail", [0, 0.16 - i * 0.02, -1.0 - i * 0.26],
            [0.34 - i * 0.07, 0.32 - i * 0.07, 0.3], tr_d if i % 2 else tr_g) for i in range(4)],
    legs=legs4(0.4, -0.5, 0.5, -0.48, [0.3, 0.4, 0.3], tr_g,
               feet=[0.34, 0.12, 0.34], foot_color=tr_c),
    anim={"walk": {"legSwing": 24, "bodyBob": 0.07, "speed": 1.9}},
))

# ---- 41 BAT ----------------------------------------------------------------
set_u(0.0433)
bt_k, bt_d, bt_w = "#4a3a52", "#332838", "#7a5f86"
packs.append(quadruped(
    "Bat", bt_k, bt_w, bt_k, size=0.62,
    body_at=(0, 0.16, -0.02), body_r=(0.28, 0.34, 0.26),
    head_at=(0, 0.62, 0.16), head_r=(0.24, 0.22, 0.22),
    muzzle=[
        B("Snout", "head", [0, 0.56, 0.36], [0.14, 0.12, 0.12], bt_w),
        B("Nose", "head", [0, 0.58, 0.44], [0.07, 0.06, 0.05], "#2a2030"),
        B("Eye L", "head", [-0.12, 0.68, 0.32], [0.09, 0.1, 0.06], "#f2c341"),
        B("Eye R", "head", [0.12, 0.68, 0.32], [0.09, 0.1, 0.06], "#f2c341"),
        B("Pupil L", "head", [-0.12, 0.68, 0.36], [0.04, 0.06, 0.04], "#1c1c1c"),
        B("Pupil R", "head", [0.12, 0.68, 0.36], [0.04, 0.06, 0.04], "#1c1c1c"),
        B("Fang L", "head", [-0.07, 0.46, 0.38], [0.05, 0.09, 0.05], "#ffffff"),
        B("Fang R", "head", [0.07, 0.46, 0.38], [0.05, 0.09, 0.05], "#ffffff"),
    ],
    ears=[
        B("Ear L", "ear", [-0.16, 0.9, 0.06], [0.14, 0.32, 0.09], bt_k, [-10, 0, 14]),
        B("Ear R", "ear", [0.16, 0.9, 0.06], [0.14, 0.32, 0.09], bt_k, [-10, 0, -14]),
        B("Ear in L", "ear", [-0.16, 0.88, 0.11], [0.08, 0.22, 0.05], bt_w, [-10, 0, 14]),
        B("Ear in R", "ear", [0.16, 0.88, 0.11], [0.08, 0.22, 0.05], bt_w, [-10, 0, -14]),
        # Wings take the ear role so they flap with the run.
        B("Wing arm L", "ear", [-0.42, 0.4, 0.0], [0.4, 0.08, 0.1], bt_d, [0, 0, 16]),
        B("Wing arm R", "ear", [0.42, 0.4, 0.0], [0.4, 0.08, 0.1], bt_d, [0, 0, -16]),
        B("Wing L", "ear", [-0.7, 0.28, -0.1], [0.12, 0.42, 0.6], bt_w, [0, 0, 20]),
        B("Wing R", "ear", [0.7, 0.28, -0.1], [0.12, 0.42, 0.6], bt_w, [0, 0, -20]),
        B("Wing tip L", "ear", [-0.94, 0.14, -0.2], [0.1, 0.3, 0.44], bt_d, [0, 0, 30]),
        B("Wing tip R", "ear", [0.94, 0.14, -0.2], [0.1, 0.3, 0.44], bt_d, [0, 0, -30]),
    ],
    tail=None,
    legs=legs4(0.16, -0.26, 0.16, -0.16, [0.09, 0.24, 0.09], bt_d,
               feet=[0.12, 0.06, 0.14], foot_color=bt_w),
    anim={"idle": {"bob": 0.06, "speed": 2.4},
          "walk": {"legSwing": 26, "bodyBob": 0.14, "speed": 3.4},
          "jump": {"height": 1.8, "tuck": 24, "speed": 1.0}},
))

# ============================== HUMANOID CORE ===============================
# The humans are all one skeleton. On a biped the quadruped roles are remapped:
# arms take the *front* leg roles and legs the *back* ones, so the trot phasing
# (FL+BR together) reads as a human's counter-swing — left arm forward with the
# right leg. Arms and legs are each split at a joint, the upper segment swinging
# from the shoulder/hip and the lower one folding at the elbow/knee on top of
# that swing (the lower* roles). The segments overlap a little, and a joint ball
# centred exactly on the hinge rides with the upper segment so the fold can
# never open a gap.

ELBOW, KNEE = 0.48, -0.14

def sneakers(boot, sole, w=1.0):
    """Chunky shoe on the shin, so it swings with the lower leg. `dy` lifts it
    for short-legged builds (see `squat`)."""
    def build(lx, lower, dy=0.0):
        return [
            B("Shoe", lower, [lx, -0.62 + dy, 0.05], [0.21 * w, 0.16, 0.34 * w], boot),
            B("Sole", lower, [lx, -0.72 + dy, 0.05], [0.22 * w, 0.06, 0.35 * w], sole),
            B("Laces", lower, [lx, -0.55 + dy, 0.11], [0.15 * w, 0.04, 0.1], sole),
            B("Toe cap", lower, [lx, -0.62 + dy, 0.21 * w], [0.2 * w, 0.1, 0.06], sole),
        ]
    return build

def barefoot(skin, nail, w=1.0):
    def build(lx, lower, dy=0.0):
        out = [B("Foot", lower, [lx, -0.62 + dy, 0.06], [0.24 * w, 0.16, 0.32 * w], skin),
               B("Heel", lower, [lx, -0.62 + dy, -0.12], [0.2 * w, 0.15, 0.12], skin)]
        for i in range(3):
            out.append(B(f"Toe {i+1}", lower, [lx + (i - 1) * 0.075 * w, -0.64 + dy, 0.23 * w],
                         [0.07 * w, 0.09, 0.07 * w], nail))
        return out
    return build

def hooves(c, dark, w=1.0):
    def build(lx, lower, dy=0.0):
        return [B("Fetlock", lower, [lx, -0.58 + dy, 0.0], [0.2 * w, 0.14, 0.2 * w], c),
                B("Hoof", lower, [lx, -0.7 + dy, 0.02], [0.23 * w, 0.14, 0.26 * w], dark)]
    return build

def humanoid(name, *, uu=0.0515, bulk=1.0, limb=1.0, squat=1.0,
             torso_fn, hip_c, shoulder_c, neck_c,
             head_fn, head_at=1.12, head_r=(0.26, 0.28, 0.25), head_wob=0.16,
             arm_fn, elbow_c, fore_fn, hand_c,
             thigh_fn, knee_c, shin_fn, feet,
             face=(), extras=(), anim=None):
    """A voxel human. `bulk` widens the torso and stance, `limb` the arms and
    legs, and `squat` shortens the legs toward the hip (dwarves, goblins);
    everything else is a colour function over world space."""
    set_u(uu)
    b, m = bulk, limb
    v = Vox()
    v.ellipsoid(0, 0.44, 0, 0.28 * b, 0.34, 0.18 * b, torso_fn, wob=0.15)
    v.ellipsoid(0, 0.14, 0, 0.24 * b, 0.13, 0.16 * b, solid(hip_c), wob=0.12, seed=3)
    v.ellipsoid(0, 0.66, 0, 0.33 * b, 0.11, 0.17 * b, solid(shoulder_c), wob=0.1, seed=4)
    # Sleeve caps sit around the shoulder hinge so the swing can't open a socket.
    v.ellipsoid(-0.34 * b, 0.72, 0, 0.13 * m, 0.09, 0.13 * m, solid(shoulder_c), seed=7)
    v.ellipsoid(0.34 * b, 0.72, 0, 0.13 * m, 0.09, 0.13 * m, solid(shoulder_c), seed=7)
    v.ellipsoid(0, 0.8, 0, 0.1 * b, 0.09, 0.1 * b, solid(neck_c), seed=6)
    blocks = v.merge("body", "Body")

    hv = Vox()
    hv.ellipsoid(0, head_at, 0, head_r[0], head_r[1], head_r[2], head_fn, wob=head_wob, seed=11)
    blocks += hv.merge("head", "Head")
    blocks += list(face)

    for side, role, lower in ((-1, "legFL", "lowerFL"), (1, "legFR", "lowerFR")):
        ax = side * 0.36 * b
        uv = Vox()
        uv.ellipsoid(ax, 0.6, 0, 0.105 * m, 0.17, 0.105 * m, arm_fn, wob=0.12, seed=13)
        uv.ellipsoid(ax, ELBOW, 0, 0.098 * m, 0.075, 0.098 * m, solid(elbow_c), seed=19)
        blocks += uv.merge(role, "Arm")
        lv = Vox()
        lv.ellipsoid(ax, 0.33, 0, 0.09 * m, 0.16, 0.09 * m, fore_fn, wob=0.12, seed=14)
        lv.ellipsoid(ax, 0.16, 0, 0.1 * m, 0.09, 0.1 * m, solid(hand_c), wob=0.1, seed=15)
        blocks += lv.merge(lower, "Forearm")

    # Short legs stay hung off the same hip: scale their span toward HIP so the
    # walk cycle and the hip hinge are unchanged, only the reach is.
    HIP = 0.22
    ly = lambda y: HIP + (y - HIP) * squat
    for side, role, lower in ((-1, "legBL", "lowerBL"), (1, "legBR", "lowerBR")):
        lx = side * 0.155 * b
        uv = Vox()
        uv.ellipsoid(lx, ly(0.02), 0, 0.125 * m, 0.2 * squat, 0.13 * m, thigh_fn, wob=0.12, seed=17)
        uv.ellipsoid(lx, ly(KNEE), 0, 0.108 * m, 0.085 * squat, 0.108 * m, solid(knee_c), seed=21)
        blocks += uv.merge(role, "Leg")
        lv = Vox()
        lv.ellipsoid(lx, ly(-0.34), 0, 0.1 * m, 0.2 * squat, 0.105 * m, shin_fn, wob=0.12, seed=18)
        blocks += lv.merge(lower, "Shin")
        blocks += feet(lx, lower, ly(-0.62) + 0.62)

    blocks += list(extras)
    return design(name, blocks, anim)

# A hip swing near 26 deg reads as a human stride once the knees fold on top of
# it; the quadruped default (42) turns into the splits on two legs.
HUMAN_ANIM = {"idle": {"bob": 0.035, "speed": 1.5},
              "walk": {"legSwing": 26, "bodyBob": 0.09, "speed": 2.2},
              "jump": {"height": 1.2, "tuck": 26, "speed": 0.95}}

def anim_like(**over):
    a = json.loads(json.dumps(HUMAN_ANIM))
    for clip, vals in over.items():
        a[clip].update(vals)
    return a

# ---- 22 KID ----------------------------------------------------------------
skin, skin_d = "#f4c396", "#dda276"
hair, hair_d = "#5a3a26", "#432a1b"
shirt, shirt_d, stripe = "#3d8bd6", "#2f6fae", "#f6f6f2"
short = "#41415e"
shoe, sole = "#e8734a", "#f6f6f2"

def kid_torso(wx, wy, wz):
    if wy < 0.16:
        return short  # shorts start at the waist
    if 0.42 < wy < 0.49:
        return stripe  # chest stripe
    if wz < -0.04 and wy > 0.5:
        return shirt_d  # shaded back
    return shirt

def kid_head(wx, wy, wz):
    if wy > 1.2:
        return hair  # cap of hair
    if wz < -0.02 and wy > 1.0:
        return hair  # back of the head
    if wy > 1.14 and wz > 0.06:
        return hair  # fringe over the brow
    if abs(wx) > 0.19 and wy > 1.08:
        return hair_d  # sideburns
    return skin

packs.append(humanoid(
    "Kid",
    torso_fn=kid_torso, hip_c=short, shoulder_c=shirt, neck_c=skin_d,
    head_fn=kid_head,
    arm_fn=lambda wx, wy, wz: shirt if wy > 0.46 else skin,
    elbow_c=skin, fore_fn=solid(skin), hand_c=skin,
    thigh_fn=lambda wx, wy, wz: short if wy > -0.06 else skin,
    knee_c=skin, shin_fn=solid(skin), feet=sneakers(shoe, sole),
    face=[
        B("Ear L", "head", [-0.28, 1.1, -0.01], [0.07, 0.13, 0.1], skin_d),
        B("Ear R", "head", [0.28, 1.1, -0.01], [0.07, 0.13, 0.1], skin_d),
        B("Eye white L", "head", [-0.1, 1.14, 0.23], [0.085, 0.09, 0.04], "#ffffff"),
        B("Eye white R", "head", [0.1, 1.14, 0.23], [0.085, 0.09, 0.04], "#ffffff"),
        B("Pupil L", "head", [-0.095, 1.14, 0.26], [0.05, 0.07, 0.03], "#2a1c14"),
        B("Pupil R", "head", [0.095, 1.14, 0.26], [0.05, 0.07, 0.03], "#2a1c14"),
        B("Brow L", "head", [-0.1, 1.225, 0.22], [0.11, 0.035, 0.05], hair_d),
        B("Brow R", "head", [0.1, 1.225, 0.22], [0.11, 0.035, 0.05], hair_d),
        B("Nose", "head", [0, 1.06, 0.25], [0.07, 0.08, 0.07], skin_d),
        B("Mouth", "head", [0, 0.96, 0.23], [0.13, 0.04, 0.04], "#b2564a"),
        B("Smile L", "head", [-0.09, 0.99, 0.23], [0.05, 0.04, 0.04], "#b2564a"),
        B("Smile R", "head", [0.09, 0.99, 0.23], [0.05, 0.04, 0.04], "#b2564a"),
    ],
    anim=HUMAN_ANIM,
))

# ---- 23 SPIDER-MAN ---------------------------------------------------------
sp_r, sp_rd, sp_b, sp_bd, sp_web = "#cf2b2b", "#a81f1f", "#2c3f96", "#22317a", "#6d1616"

def webbed(c):
    """Suit colour with a web grid laid over it — rings crossed by spokes.
    Line width is about one voxel: any finer and the grid aliases into noise."""
    def fn(wx, wy, wz):
        ring = abs(((wy + 4.0) % 0.155) - 0.0775) < 0.027
        spoke = abs(((wx + 4.0) % 0.155) - 0.0775) < 0.027
        return sp_web if ring or spoke else c
    return fn

web_r, web_rd, web_b, web_bd = webbed(sp_r), webbed(sp_rd), webbed(sp_b), webbed(sp_bd)

def spidey_torso(wx, wy, wz):
    if wy < 0.24:
        return web_b(wx, wy, wz)  # blue below the chest
    if abs(wx) > 0.19 and wz < 0.02:
        return web_rd(wx, wy, wz)  # shaded flanks
    return web_r(wx, wy, wz)

def spidey_head(wx, wy, wz):
    if wz < -0.05 or wy > 1.26:
        return web_rd(wx, wy, wz)  # darker back of the mask
    return web_r(wx, wy, wz)

spider = []
for i, (dy, ang) in enumerate([(0.075, 34), (0.0, 10), (-0.075, -16)]):
    spider.append(B(f"Spider leg L{i+1}", "body", [-0.095, 0.55 + dy, 0.178],
                    [0.15, 0.028, 0.035], "#17171c", [0, 0, ang]))
    spider.append(B(f"Spider leg R{i+1}", "body", [0.095, 0.55 + dy, 0.178],
                    [0.15, 0.028, 0.035], "#17171c", [0, 0, -ang]))

packs.append(humanoid(
    "Spider-Man", uu=0.0518,
    torso_fn=spidey_torso, hip_c=sp_b, shoulder_c=sp_r, neck_c=sp_rd,
    head_fn=spidey_head,
    arm_fn=web_r, elbow_c=sp_rd, fore_fn=web_r, hand_c=sp_r,
    thigh_fn=web_b, knee_c=sp_bd, shin_fn=web_b,
    feet=sneakers(sp_r, sp_rd),
    face=[
        # Big lensed eyes: a black rim with a white lens sitting proud of it.
        B("Eye rim L", "head", [-0.115, 1.15, 0.222], [0.175, 0.15, 0.04], "#17171c", [0, 0, 13]),
        B("Eye rim R", "head", [0.115, 1.15, 0.222], [0.175, 0.15, 0.04], "#17171c", [0, 0, -13]),
        B("Eye L", "head", [-0.115, 1.152, 0.245], [0.135, 0.11, 0.035], "#f2f4f6", [0, 0, 13]),
        B("Eye R", "head", [0.115, 1.152, 0.245], [0.135, 0.11, 0.035], "#f2f4f6", [0, 0, -13]),
    ],
    extras=[
        B("Spider body", "body", [0, 0.55, 0.178], [0.075, 0.15, 0.035], "#17171c"),
        B("Spider head", "body", [0, 0.655, 0.175], [0.055, 0.05, 0.035], "#17171c"),
        B("Belt", "body", [0, 0.2, 0.0], [0.5, 0.05, 0.36], sp_rd),
    ] + spider,
    anim=anim_like(walk={"legSwing": 29, "speed": 2.4}, jump={"height": 1.7, "tuck": 32}),
))

# ---- 24 BATMAN -------------------------------------------------------------
bm_g, bm_gd, bm_k, bm_y = "#79808d", "#626a77", "#212329", "#f2c341"
bm_skin = "#e6b189"

def bat_torso(wx, wy, wz):
    if wy < 0.2:
        return bm_k  # black trunks over the hips
    if wz < -0.04:
        return bm_gd  # shaded back
    return bm_g

def bat_head(wx, wy, wz):
    if wy < 1.02 and wz > 0.02:
        return bm_skin  # the cowl stops at the jaw
    if wz < -0.04 or wy > 1.24:
        return "#17181d"
    return bm_k

bat_cape = [
    B("Cape collar", "tail", [0, 0.72, -0.19], [0.54, 0.22, 0.14], bm_k),
    B("Cape 1", "tail", [0, 0.5, -0.26], [0.62, 0.46, 0.1], bm_k),
    B("Cape 2", "tail", [0, 0.1, -0.3], [0.68, 0.42, 0.1], "#1a1c21"),
    B("Cape 3", "tail", [0, -0.28, -0.33], [0.58, 0.4, 0.1], bm_k),
    B("Cape hem L", "tail", [-0.2, -0.56, -0.34], [0.18, 0.22, 0.1], "#1a1c21"),
    B("Cape hem R", "tail", [0.2, -0.56, -0.34], [0.18, 0.22, 0.1], "#1a1c21"),
]

packs.append(humanoid(
    "Batman", uu=0.0515,
    torso_fn=bat_torso, hip_c=bm_k, shoulder_c=bm_g, neck_c=bm_gd,
    head_fn=bat_head,
    arm_fn=solid(bm_g), elbow_c=bm_gd, fore_fn=solid(bm_k), hand_c=bm_k,
    thigh_fn=lambda wx, wy, wz: bm_k if wy > 0.1 else bm_g,
    knee_c=bm_gd, shin_fn=solid(bm_k), feet=sneakers(bm_k, "#17181d"),
    face=[
        # Bat ears: a wide base tapering to a point, raked back off the cowl.
        B("Ear base L", "head", [-0.135, 1.36, -0.03], [0.12, 0.13, 0.13], bm_k, [-10, 0, 5]),
        B("Ear base R", "head", [0.135, 1.36, -0.03], [0.12, 0.13, 0.13], bm_k, [-10, 0, -5]),
        B("Ear L", "head", [-0.145, 1.45, -0.05], [0.08, 0.12, 0.1], bm_k, [-12, 0, 7]),
        B("Ear R", "head", [0.145, 1.45, -0.05], [0.08, 0.12, 0.1], bm_k, [-12, 0, -7]),
        B("Ear tip L", "head", [-0.155, 1.53, -0.07], [0.045, 0.09, 0.07], "#17181d", [-14, 0, 9]),
        B("Ear tip R", "head", [0.155, 1.53, -0.07], [0.045, 0.09, 0.07], "#17181d", [-14, 0, -9]),
        B("Eye L", "head", [-0.115, 1.17, 0.235], [0.125, 0.055, 0.04], "#f4f7ff", [0, 0, 8]),
        B("Eye R", "head", [0.115, 1.17, 0.235], [0.125, 0.055, 0.04], "#f4f7ff", [0, 0, -8]),
        B("Brow L", "head", [-0.115, 1.235, 0.225], [0.14, 0.05, 0.05], "#17181d", [0, 0, 10]),
        B("Brow R", "head", [0.115, 1.235, 0.225], [0.14, 0.05, 0.05], "#17181d", [0, 0, -10]),
        B("Mouth", "head", [0, 0.955, 0.225], [0.12, 0.035, 0.04], "#9a5b4c"),
    ],
    extras=[
        B("Belt", "body", [0, 0.2, 0], [0.54, 0.09, 0.38], bm_y),
        B("Buckle", "body", [0, 0.2, 0.17], [0.13, 0.11, 0.06], "#d9a423"),
        B("Bat oval", "body", [0, 0.53, 0.172], [0.3, 0.18, 0.035], bm_y),
        B("Bat body", "body", [0, 0.53, 0.19], [0.055, 0.12, 0.035], "#17181d"),
        B("Bat wing L", "body", [-0.085, 0.545, 0.19], [0.12, 0.07, 0.035], "#17181d"),
        B("Bat wing R", "body", [0.085, 0.545, 0.19], [0.12, 0.07, 0.035], "#17181d"),
        B("Bat tip L", "body", [-0.15, 0.505, 0.19], [0.05, 0.045, 0.035], "#17181d"),
        B("Bat tip R", "body", [0.15, 0.505, 0.19], [0.05, 0.045, 0.035], "#17181d"),
        # Gauntlet fins ride on the forearm, so they swing with the elbow.
        B("Fin L1", "lowerFL", [-0.44, 0.34, -0.06], [0.11, 0.035, 0.1], bm_gd, [0, 0, 20]),
        B("Fin L2", "lowerFL", [-0.44, 0.27, -0.06], [0.11, 0.035, 0.1], bm_gd, [0, 0, 20]),
        B("Fin R1", "lowerFR", [0.44, 0.34, -0.06], [0.11, 0.035, 0.1], bm_gd, [0, 0, -20]),
        B("Fin R2", "lowerFR", [0.44, 0.27, -0.06], [0.11, 0.035, 0.1], bm_gd, [0, 0, -20]),
    ] + bat_cape,
    anim=anim_like(walk={"legSwing": 24, "speed": 2.0}, idle={"bob": 0.03, "speed": 1.3}),
))

# ---- 25 HULK ---------------------------------------------------------------
hk_g, hk_gd, hk_gl = "#57a838", "#3f8526", "#6dc24a"
hk_p, hk_pd, hk_hair = "#6d3fa8", "#57318a", "#1d1d22"

def hulk_torso(wx, wy, wz):
    if wy < 0.26:
        return hk_p  # torn purple shorts, worn high on the waist
    if wz > 0.05 and 0.42 < wy < 0.6 and abs(wx) > 0.06:
        return hk_gl  # lit pecs
    if wz < -0.05:
        return hk_gd  # shaded back
    if wz > 0.05 and wy < 0.36:
        return hk_gd  # ab shadow
    return hk_g

def hulk_head(wx, wy, wz):
    if wy > 1.26 or (wz < -0.06 and wy > 1.12):
        return hk_hair
    if wz < -0.04:
        return hk_gd
    return hk_g

def hulk_thigh(wx, wy, wz):
    if wy > -0.02:
        return hk_p
    # torn hem: a hash-driven ragged edge instead of a straight cut
    s = math.sin(wx * 41.3 + wz * 27.7) * 43758.5
    if wy > -0.1 + (s - math.floor(s)) * 0.09:
        return hk_pd
    return hk_g

packs.append(humanoid(
    "Hulk", uu=0.0627, bulk=1.5, limb=1.42,
    torso_fn=hulk_torso, hip_c=hk_p, shoulder_c=hk_g, neck_c=hk_gd,
    head_fn=hulk_head, head_at=1.14, head_r=(0.25, 0.26, 0.24),
    arm_fn=solid(hk_g), elbow_c=hk_gd, fore_fn=solid(hk_g), hand_c=hk_g,
    thigh_fn=hulk_thigh, knee_c=hk_gd, shin_fn=solid(hk_g),
    feet=barefoot(hk_g, hk_gl),
    face=[
        B("Ear L", "head", [-0.27, 1.12, -0.01], [0.07, 0.13, 0.1], hk_gd),
        B("Ear R", "head", [0.27, 1.12, -0.01], [0.07, 0.13, 0.1], hk_gd),
        B("Brow ridge", "head", [0, 1.22, 0.2], [0.36, 0.07, 0.08], hk_gd),
        B("Brow L", "head", [-0.11, 1.19, 0.225], [0.14, 0.05, 0.05], hk_hair, [0, 0, -17]),
        B("Brow R", "head", [0.11, 1.19, 0.225], [0.14, 0.05, 0.05], hk_hair, [0, 0, 17]),
        B("Eye L", "head", [-0.1, 1.13, 0.22], [0.085, 0.07, 0.04], "#f6f6ea"),
        B("Eye R", "head", [0.1, 1.13, 0.22], [0.085, 0.07, 0.04], "#f6f6ea"),
        B("Pupil L", "head", [-0.095, 1.13, 0.245], [0.045, 0.055, 0.03], "#1d1d22"),
        B("Pupil R", "head", [0.095, 1.13, 0.245], [0.045, 0.055, 0.03], "#1d1d22"),
        B("Nose", "head", [0, 1.05, 0.235], [0.1, 0.08, 0.07], hk_gd),
        B("Mouth", "head", [0, 0.95, 0.215], [0.2, 0.06, 0.05], "#2a1a20"),
        B("Teeth", "head", [0, 0.972, 0.222], [0.17, 0.03, 0.045], "#f6f6ea"),
    ],
    anim=anim_like(idle={"bob": 0.055, "speed": 1.2},
                   walk={"legSwing": 23, "bodyBob": 0.13, "speed": 1.85},
                   jump={"height": 1.5, "tuck": 22, "speed": 0.8}),
))

# ---- 26 IRON MAN -----------------------------------------------------------
im_r, im_rd, im_go, im_gd = "#c62828", "#9c1f1f", "#f0b23c", "#c68f22"
im_cy, im_cyl = "#7fdcf2", "#dffaff"

def iron_torso(wx, wy, wz):
    # Gold stays a narrow waist band: with gold gauntlets hanging beside it, a
    # taller gold midsection merges into one blob from three-quarter on.
    if wy < 0.22:
        return im_go
    if wz < -0.04:
        return im_rd  # shaded backplate
    return im_r

def iron_head(wx, wy, wz):
    if wz > 0.06 and wy < 1.22:
        return im_go  # faceplate
    if wz < -0.05 or wy > 1.3:
        return im_rd
    return im_r

packs.append(humanoid(
    "Iron Man", uu=0.0545, bulk=1.14, limb=1.12,
    torso_fn=iron_torso, hip_c=im_go, shoulder_c=im_r, neck_c=im_gd,
    head_fn=iron_head, head_at=1.13, head_r=(0.26, 0.28, 0.25), head_wob=0.1,
    arm_fn=solid(im_r), elbow_c=im_gd, fore_fn=solid(im_go), hand_c=im_go,
    # The knee ball stays red: gold there closes the gap between the gold hip
    # plate and the gold boot and the whole leg reads as one gold column.
    thigh_fn=solid(im_r), knee_c=im_rd, shin_fn=solid(im_go),
    feet=sneakers(im_go, im_gd),
    face=[
        B("Eye L", "head", [-0.11, 1.19, 0.235], [0.11, 0.05, 0.045], im_cy),
        B("Eye R", "head", [0.11, 1.19, 0.235], [0.11, 0.05, 0.045], im_cy),
        B("Eye glow L", "head", [-0.11, 1.19, 0.252], [0.075, 0.03, 0.04], im_cyl),
        B("Eye glow R", "head", [0.11, 1.19, 0.252], [0.075, 0.03, 0.04], im_cyl),
        B("Brow", "head", [0, 1.235, 0.225], [0.34, 0.05, 0.06], im_rd),
        B("Crest", "head", [0, 1.36, 0.02], [0.06, 0.07, 0.26], im_gd),
        B("Jaw", "head", [0, 0.95, 0.2], [0.2, 0.05, 0.07], im_gd),
        B("Vent L", "head", [-0.13, 1.06, 0.235], [0.06, 0.09, 0.04], im_gd),
        B("Vent R", "head", [0.13, 1.06, 0.235], [0.06, 0.09, 0.04], im_gd),
    ],
    extras=[
        B("Reactor ring", "body", [0, 0.54, 0.185], [0.16, 0.16, 0.045], im_gd),
        B("Reactor", "body", [0, 0.54, 0.198], [0.115, 0.115, 0.04], im_cy),
        B("Reactor core", "body", [0, 0.54, 0.212], [0.06, 0.06, 0.035], im_cyl),
        B("Pauldron L", "body", [-0.41, 0.74, 0], [0.16, 0.11, 0.3], im_rd),
        B("Pauldron R", "body", [0.41, 0.74, 0], [0.16, 0.11, 0.3], im_rd),
        # Repulsors face down out of the palms and thrusters out of the heels.
        B("Repulsor L", "lowerFL", [-0.41, 0.098, 0], [0.08, 0.035, 0.08], im_cyl),
        B("Repulsor R", "lowerFR", [0.41, 0.098, 0], [0.08, 0.035, 0.08], im_cyl),
        B("Thruster L", "lowerBL", [-0.177, -0.755, -0.06], [0.13, 0.035, 0.12], im_cy),
        B("Thruster R", "lowerBR", [0.177, -0.755, -0.06], [0.13, 0.035, 0.12], im_cy),
    ],
    anim=anim_like(walk={"legSwing": 25, "speed": 2.1}, idle={"bob": 0.03, "speed": 1.4}),
))

# ---- 32 SUPERMAN -----------------------------------------------------------
su_b, su_bd, su_r, su_rd = "#2f5fc4", "#22479c", "#cf2626", "#a01d1d"
su_y, su_sk, su_hr = "#f2c341", "#f0bd93", "#1e1e26"

def sup_torso(wx, wy, wz):
    if wy < 0.24:
        return su_r  # trunks
    if wz < -0.04:
        return su_bd
    return su_b

def sup_head(wx, wy, wz):
    if wy > 1.22 or (wz < -0.03 and wy > 1.04):
        return su_hr
    if abs(wx) > 0.2 and wy > 1.08:
        return su_hr
    return su_sk

packs.append(humanoid(
    "Superman", uu=0.0515,
    torso_fn=sup_torso, hip_c=su_r, shoulder_c=su_b, neck_c=su_sk,
    head_fn=sup_head,
    arm_fn=solid(su_b), elbow_c=su_bd, fore_fn=solid(su_b), hand_c=su_b,
    thigh_fn=solid(su_b), knee_c=su_bd, shin_fn=solid(su_r),
    feet=sneakers(su_r, su_rd),
    face=[
        B("Curl", "head", [0, 1.29, 0.19], [0.09, 0.09, 0.09], su_hr),
        B("Eye white L", "head", [-0.1, 1.14, 0.23], [0.085, 0.09, 0.04], "#ffffff"),
        B("Eye white R", "head", [0.1, 1.14, 0.23], [0.085, 0.09, 0.04], "#ffffff"),
        B("Pupil L", "head", [-0.095, 1.14, 0.26], [0.05, 0.07, 0.03], "#2b4a8f"),
        B("Pupil R", "head", [0.095, 1.14, 0.26], [0.05, 0.07, 0.03], "#2b4a8f"),
        B("Brow L", "head", [-0.1, 1.225, 0.22], [0.11, 0.035, 0.05], su_hr),
        B("Brow R", "head", [0.1, 1.225, 0.22], [0.11, 0.035, 0.05], su_hr),
        B("Nose", "head", [0, 1.06, 0.25], [0.07, 0.08, 0.07], "#e0a87e"),
        B("Mouth", "head", [0, 0.97, 0.23], [0.12, 0.035, 0.04], "#b2564a"),
    ],
    extras=[
        B("Belt", "body", [0, 0.235, 0], [0.52, 0.07, 0.37], su_y),
        B("Shield", "body", [0, 0.545, 0.172], [0.23, 0.23, 0.035], su_y, [0, 0, 45]),
        B("S top", "body", [0, 0.6, 0.19], [0.125, 0.035, 0.03], su_r),
        B("S mid", "body", [0, 0.545, 0.19], [0.125, 0.035, 0.03], su_r),
        B("S low", "body", [0, 0.49, 0.19], [0.125, 0.035, 0.03], su_r),
        B("S bar L", "body", [-0.045, 0.573, 0.19], [0.035, 0.055, 0.03], su_r),
        B("S bar R", "body", [0.045, 0.518, 0.19], [0.035, 0.055, 0.03], su_r),
        B("Cape collar", "tail", [0, 0.72, -0.18], [0.5, 0.2, 0.13], su_r),
        B("Cape 1", "tail", [0, 0.48, -0.25], [0.58, 0.44, 0.1], su_r),
        B("Cape 2", "tail", [0, 0.08, -0.29], [0.64, 0.42, 0.1], su_rd),
        B("Cape 3", "tail", [0, -0.3, -0.32], [0.56, 0.4, 0.1], su_r),
    ],
    anim=anim_like(walk={"legSwing": 27, "speed": 2.2}, jump={"height": 1.9, "tuck": 30}),
))

# ---- 33 CAPTAIN AMERICA ----------------------------------------------------
ca_b, ca_bd, ca_r, ca_w = "#2b4a8f", "#1f3870", "#cf2b2b", "#f0f0ea"
ca_sk = "#f0bd93"

def cap_torso(wx, wy, wz):
    if wy < 0.38:
        # Belly stripes: horizontal bands of red and white.
        return ca_w if math.floor((wy + 4) / 0.072) % 2 == 0 else ca_r
    if wz < -0.04:
        return ca_bd
    return ca_b

def cap_head(wx, wy, wz):
    if wy < 1.1 and wz > 0.08 and abs(wx) < 0.2:
        return ca_sk  # the cowl opens over the face
    if wy > 1.26 or wz < -0.05:
        return ca_bd
    return ca_b

# The shield rides on his back — which is the view a racer mostly gets.
set_u(0.052)
sv = Vox()
def cap_shield(wx, wy, wz):
    r = math.hypot(wx, wy - 0.5)
    if r < 0.085:
        return ca_b
    if r < 0.145:
        return ca_w
    if r < 0.205:
        return ca_r
    if r < 0.265:
        return ca_w
    return ca_r
sv.ellipsoid(0, 0.5, -0.28, 0.33, 0.33, 0.055, cap_shield)
cap_shield_blocks = sv.merge("body", "Shield")

packs.append(humanoid(
    "Captain America", uu=0.052,
    torso_fn=cap_torso, hip_c=ca_b, shoulder_c=ca_b, neck_c=ca_bd,
    head_fn=cap_head,
    arm_fn=solid(ca_b), elbow_c=ca_bd, fore_fn=solid(ca_r), hand_c=ca_r,
    thigh_fn=solid(ca_b), knee_c=ca_bd, shin_fn=solid(ca_r),
    feet=sneakers(ca_r, "#a02020"),
    face=[
        B("Wing L", "head", [-0.26, 1.21, 0.11], [0.1, 0.13, 0.11], ca_w, [0, 0, 22]),
        B("Wing R", "head", [0.26, 1.21, 0.11], [0.1, 0.13, 0.11], ca_w, [0, 0, -22]),
        B("A stem L", "head", [-0.045, 1.27, 0.2], [0.035, 0.1, 0.05], ca_w, [0, 0, 10]),
        B("A stem R", "head", [0.045, 1.27, 0.2], [0.035, 0.1, 0.05], ca_w, [0, 0, -10]),
        B("A bar", "head", [0, 1.24, 0.21], [0.1, 0.035, 0.05], ca_w),
        B("Eye white L", "head", [-0.1, 1.13, 0.23], [0.085, 0.085, 0.04], "#ffffff"),
        B("Eye white R", "head", [0.1, 1.13, 0.23], [0.085, 0.085, 0.04], "#ffffff"),
        B("Pupil L", "head", [-0.095, 1.13, 0.26], [0.05, 0.065, 0.03], "#3a2a20"),
        B("Pupil R", "head", [0.095, 1.13, 0.26], [0.05, 0.065, 0.03], "#3a2a20"),
        B("Mouth", "head", [0, 0.96, 0.23], [0.12, 0.035, 0.04], "#b2564a"),
    ],
    extras=[
        B("Belt", "body", [0, 0.3, 0], [0.52, 0.09, 0.37], "#6b4a2a"),
        B("Star", "body", [0, 0.56, 0.175], [0.19, 0.19, 0.035], ca_w),
        B("Star point", "body", [0, 0.67, 0.175], [0.07, 0.07, 0.035], ca_w),
        B("Shield star", "body", [0, 0.5, -0.34], [0.1, 0.1, 0.04], ca_w),
    ] + cap_shield_blocks,
    anim=anim_like(walk={"legSwing": 27, "speed": 2.2}),
))

# ---- 34 WONDER WOMAN -------------------------------------------------------
ww_r, ww_rd, ww_go, ww_b = "#c8232f", "#9c1a24", "#f0b93c", "#22357a"
ww_sk, ww_hr = "#f0bd93", "#241a1e"

def ww_torso(wx, wy, wz):
    if wy < 0.24:
        return ww_b  # star-spangled shorts
    if wy < 0.3:
        return ww_go  # gold waistband
    if wz < -0.04:
        return ww_rd
    return ww_r

def ww_head(wx, wy, wz):
    if wy > 1.24 or (wz < -0.02 and wy > 0.98):
        return ww_hr
    if abs(wx) > 0.2 and wy > 1.02:
        return ww_hr
    return ww_sk

packs.append(humanoid(
    "Wonder Woman", uu=0.0512,
    torso_fn=ww_torso, hip_c=ww_b, shoulder_c=ww_sk, neck_c=ww_sk,
    head_fn=ww_head,
    arm_fn=solid(ww_sk), elbow_c=ww_sk,
    fore_fn=lambda wx, wy, wz: ww_go if wy > 0.27 else ww_sk,  # bracers
    hand_c=ww_sk,
    thigh_fn=solid(ww_sk), knee_c=ww_sk, shin_fn=solid(ww_r),
    feet=sneakers(ww_r, ww_go),
    face=[
        B("Hair back", "head", [0, 0.98, -0.2], [0.42, 0.36, 0.14], ww_hr),
        B("Hair L", "head", [-0.24, 0.98, -0.08], [0.13, 0.36, 0.2], ww_hr),
        B("Hair R", "head", [0.24, 0.98, -0.08], [0.13, 0.36, 0.2], ww_hr),
        B("Tiara", "head", [0, 1.245, 0.16], [0.44, 0.06, 0.24], ww_go),
        B("Tiara star", "head", [0, 1.25, 0.25], [0.08, 0.08, 0.04], ww_r),
        B("Eye white L", "head", [-0.1, 1.14, 0.23], [0.08, 0.085, 0.04], "#ffffff"),
        B("Eye white R", "head", [0.1, 1.14, 0.23], [0.08, 0.085, 0.04], "#ffffff"),
        B("Pupil L", "head", [-0.095, 1.14, 0.26], [0.05, 0.065, 0.03], "#2b4a8f"),
        B("Pupil R", "head", [0.095, 1.14, 0.26], [0.05, 0.065, 0.03], "#2b4a8f"),
        B("Brow L", "head", [-0.1, 1.21, 0.22], [0.1, 0.03, 0.05], ww_hr),
        B("Brow R", "head", [0.1, 1.21, 0.22], [0.1, 0.03, 0.05], ww_hr),
        B("Mouth", "head", [0, 0.98, 0.23], [0.1, 0.035, 0.04], "#c2564a"),
    ],
    extras=[
        B("Eagle body", "body", [0, 0.52, 0.175], [0.07, 0.13, 0.035], ww_go),
        B("Eagle wing L", "body", [-0.1, 0.56, 0.175], [0.14, 0.07, 0.035], ww_go),
        B("Eagle wing R", "body", [0.1, 0.56, 0.175], [0.14, 0.07, 0.035], ww_go),
        B("Eagle tip L", "body", [-0.185, 0.52, 0.172], [0.06, 0.05, 0.035], ww_go),
        B("Eagle tip R", "body", [0.185, 0.52, 0.172], [0.06, 0.05, 0.035], ww_go),
        B("Star L", "body", [-0.13, 0.13, 0.15], [0.06, 0.06, 0.035], "#f4f4ee"),
        B("Star R", "body", [0.13, 0.16, 0.15], [0.06, 0.06, 0.035], "#f4f4ee"),
        B("Star C", "body", [0, 0.09, 0.16], [0.06, 0.06, 0.035], "#f4f4ee"),
    ],
    anim=anim_like(walk={"legSwing": 28, "speed": 2.3}, jump={"height": 1.6}),
))

# ---- 35 THE FLASH ----------------------------------------------------------
fl_r, fl_rd, fl_go, fl_w = "#cf2020", "#9e1818", "#f2c341", "#f4f4ee"
fl_sk = "#f0bd93"

def flash_torso(wx, wy, wz):
    if wy < 0.26:
        return fl_go  # gold hips and belt
    if wz < -0.04:
        return fl_rd
    return fl_r

def flash_head(wx, wy, wz):
    if wz > 0.09 and 0.94 < wy < 1.2 and abs(wx) < 0.19:
        return fl_sk  # face opening in the cowl
    if wy > 1.26 or wz < -0.05:
        return fl_rd
    return fl_r

packs.append(humanoid(
    "The Flash", uu=0.0515,
    torso_fn=flash_torso, hip_c=fl_go, shoulder_c=fl_r, neck_c=fl_rd,
    head_fn=flash_head,
    arm_fn=solid(fl_r), elbow_c=fl_rd, fore_fn=solid(fl_r), hand_c=fl_r,
    thigh_fn=solid(fl_r), knee_c=fl_rd, shin_fn=solid(fl_go),
    feet=sneakers(fl_go, "#d19f28"),
    face=[
        # Lightning wings off the ears.
        B("Bolt L1", "head", [-0.29, 1.18, 0.02], [0.14, 0.07, 0.1], fl_go, [0, 0, 26]),
        B("Bolt L2", "head", [-0.37, 1.27, 0.0], [0.11, 0.06, 0.09], fl_go, [0, 0, -20]),
        B("Bolt R1", "head", [0.29, 1.18, 0.02], [0.14, 0.07, 0.1], fl_go, [0, 0, -26]),
        B("Bolt R2", "head", [0.37, 1.27, 0.0], [0.11, 0.06, 0.09], fl_go, [0, 0, 20]),
        B("Eye white L", "head", [-0.1, 1.13, 0.235], [0.085, 0.085, 0.04], "#ffffff"),
        B("Eye white R", "head", [0.1, 1.13, 0.235], [0.085, 0.085, 0.04], "#ffffff"),
        B("Pupil L", "head", [-0.095, 1.13, 0.262], [0.05, 0.065, 0.03], "#3a2a20"),
        B("Pupil R", "head", [0.095, 1.13, 0.262], [0.05, 0.065, 0.03], "#3a2a20"),
        B("Mouth", "head", [0, 0.965, 0.235], [0.12, 0.035, 0.04], "#b2564a"),
    ],
    extras=[
        B("Emblem", "body", [0, 0.55, 0.172], [0.23, 0.23, 0.035], fl_w),
        B("Bolt top", "body", [0, 0.6, 0.192], [0.11, 0.05, 0.03], fl_go, [0, 0, -20]),
        B("Bolt mid", "body", [0, 0.55, 0.192], [0.07, 0.06, 0.03], fl_go, [0, 0, 30]),
        B("Bolt low", "body", [0, 0.5, 0.192], [0.11, 0.05, 0.03], fl_go, [0, 0, -20]),
    ],
    anim=anim_like(idle={"speed": 1.9},
                   walk={"legSwing": 32, "bodyBob": 0.07, "speed": 3.2},
                   jump={"height": 1.5, "speed": 1.1}),
))

# ---- 36 THOR ---------------------------------------------------------------
th_s, th_sd, th_r, th_rd = "#b7bec9", "#939aa6", "#b52a2a", "#8c1f1f"
th_k, th_br, th_bl, th_sk = "#2b2f38", "#6b4a2a", "#e6cf8a", "#f0bd93"

def thor_torso(wx, wy, wz):
    if wy < 0.24:
        return th_k  # dark tunic under the belt
    if wz < -0.04:
        return th_sd
    return th_s

def thor_head(wx, wy, wz):
    if wy > 1.26:
        return th_s  # helmet crown
    if wz < -0.03 and wy > 1.0:
        return th_bl  # hair down the back
    if abs(wx) > 0.2 and wy > 1.06:
        return th_bl
    if wy < 0.99:
        return th_bl  # beard
    return th_sk

packs.append(humanoid(
    "Thor", uu=0.0525, bulk=1.08, limb=1.06,
    torso_fn=thor_torso, hip_c=th_k, shoulder_c=th_s, neck_c=th_sd,
    head_fn=thor_head,
    arm_fn=solid(th_s), elbow_c=th_sd, fore_fn=solid(th_br), hand_c=th_br,
    thigh_fn=solid(th_k), knee_c="#22262d", shin_fn=solid(th_br),
    feet=sneakers(th_br, "#4e3520"),
    face=[
        B("Helm wing L", "head", [-0.27, 1.34, 0.04], [0.11, 0.22, 0.12], th_s, [0, 0, 24]),
        B("Helm wing R", "head", [0.27, 1.34, 0.04], [0.11, 0.22, 0.12], th_s, [0, 0, -24]),
        B("Helm tip L", "head", [-0.35, 1.5, 0.02], [0.07, 0.13, 0.09], "#d6dbe2", [0, 0, 30]),
        B("Helm tip R", "head", [0.35, 1.5, 0.02], [0.07, 0.13, 0.09], "#d6dbe2", [0, 0, -30]),
        B("Helm band", "head", [0, 1.235, 0.16], [0.46, 0.07, 0.26], th_sd),
        B("Eye white L", "head", [-0.1, 1.15, 0.23], [0.085, 0.085, 0.04], "#ffffff"),
        B("Eye white R", "head", [0.1, 1.15, 0.23], [0.085, 0.085, 0.04], "#ffffff"),
        B("Pupil L", "head", [-0.095, 1.15, 0.26], [0.05, 0.065, 0.03], "#2b4a8f"),
        B("Pupil R", "head", [0.095, 1.15, 0.26], [0.05, 0.065, 0.03], "#2b4a8f"),
        B("Nose", "head", [0, 1.07, 0.25], [0.07, 0.08, 0.07], "#e0a87e"),
        B("Moustache", "head", [0, 1.0, 0.235], [0.18, 0.05, 0.05], th_bl),
    ],
    extras=[
        B("Belt", "body", [0, 0.26, 0], [0.58, 0.1, 0.4], th_br),
        B("Buckle", "body", [0, 0.26, 0.19], [0.13, 0.12, 0.06], "#d9a423"),
    ] + [
        B(f"Disc {i+1}", "body", [x, y, 0.19], [0.11, 0.11, 0.04], "#d6dbe2")
        for i, (x, y) in enumerate([(-0.16, 0.62), (0, 0.62), (0.16, 0.62),
                                    (-0.16, 0.46), (0, 0.46), (0.16, 0.46)])
    ] + [
        B("Cape collar", "tail", [0, 0.74, -0.2], [0.56, 0.2, 0.14], th_r),
        B("Cape 1", "tail", [0, 0.5, -0.27], [0.6, 0.46, 0.1], th_r),
        B("Cape 2", "tail", [0, 0.1, -0.31], [0.66, 0.42, 0.1], th_rd),
        B("Cape 3", "tail", [0, -0.28, -0.34], [0.58, 0.4, 0.1], th_r),
        # Mjolnir hangs from the right fist and swings with the arm.
        B("Haft", "lowerFR", [0.39, -0.02, 0.04], [0.07, 0.34, 0.07], th_br),
        B("Thong", "lowerFR", [0.39, 0.14, 0.04], [0.09, 0.05, 0.09], "#4e3520"),
        B("Mjolnir", "lowerFR", [0.39, -0.26, 0.04], [0.32, 0.24, 0.22], th_s),
        B("Mjolnir band", "lowerFR", [0.39, -0.26, 0.04], [0.34, 0.07, 0.24], th_sd),
    ],
    anim=anim_like(walk={"legSwing": 25, "bodyBob": 0.1, "speed": 2.0},
                   idle={"bob": 0.04, "speed": 1.3}),
))

# ---- shared humanoid trimmings ---------------------------------------------

def cape(c, cd, w=0.6):
    """Four slabs on the tail role: hinged where they meet the shoulders, so
    the walk clip's wag reads as a cape swishing."""
    return [
        B("Cape collar", "tail", [0, 0.73, -0.19], [w * 0.9, 0.2, 0.13], c),
        B("Cape 1", "tail", [0, 0.5, -0.26], [w, 0.45, 0.1], c),
        B("Cape 2", "tail", [0, 0.1, -0.3], [w * 1.08, 0.42, 0.1], cd),
        B("Cape 3", "tail", [0, -0.28, -0.33], [w * 0.95, 0.4, 0.1], c),
    ]

def eyes(pupil="#2a1c14", y=1.14, z=0.23, white="#ffffff"):
    """Open eyes for a bare face."""
    return [
        B("Eye white L", "head", [-0.1, y, z], [0.085, 0.09, 0.04], white),
        B("Eye white R", "head", [0.1, y, z], [0.085, 0.09, 0.04], white),
        B("Pupil L", "head", [-0.095, y, z + 0.03], [0.05, 0.07, 0.03], pupil),
        B("Pupil R", "head", [0.095, y, z + 0.03], [0.05, 0.07, 0.03], pupil),
    ]

def lenses(c, y=1.15, z=0.23, w=0.16, h=0.08, tilt=11, rim=None):
    """Masked eyes: a lens per side, optionally on a darker rim behind it."""
    out = []
    if rim:
        out += [B("Eye rim L", "head", [-0.11, y, z - 0.012], [w * 1.25, h * 1.7, 0.04], rim, [0, 0, tilt]),
                B("Eye rim R", "head", [0.11, y, z - 0.012], [w * 1.25, h * 1.7, 0.04], rim, [0, 0, -tilt])]
    out += [B("Eye L", "head", [-0.11, y, z + 0.02], [w, h, 0.04], c, [0, 0, tilt]),
            B("Eye R", "head", [0.11, y, z + 0.02], [w, h, 0.04], c, [0, 0, -tilt])]
    return out

def mouth(c="#b2564a", y=0.965, w=0.12):
    return [B("Mouth", "head", [0, y, 0.23], [w, 0.035, 0.04], c)]

SKIN, SKIN_D = "#f0bd93", "#e0a87e"

# ---- 42 BLACK PANTHER ------------------------------------------------------
bp_k, bp_d, bp_s = "#23252b", "#17181d", "#c2c8d2"
packs.append(humanoid(
    "Black Panther", uu=0.0515,
    torso_fn=lambda wx, wy, wz: bp_d if wz < -0.04 else bp_k,
    hip_c=bp_d, shoulder_c=bp_k, neck_c=bp_d,
    head_fn=lambda wx, wy, wz: bp_d if (wz < -0.05 or wy > 1.28) else bp_k,
    arm_fn=solid(bp_k), elbow_c=bp_d, fore_fn=solid(bp_k), hand_c=bp_d,
    thigh_fn=solid(bp_k), knee_c=bp_d, shin_fn=solid(bp_k),
    feet=sneakers(bp_k, bp_d),
    face=lenses(bp_s, y=1.16, w=0.15, h=0.075, rim=bp_d) + [
        B("Ear L", "head", [-0.17, 1.36, 0.02], [0.11, 0.13, 0.11], bp_k),
        B("Ear R", "head", [0.17, 1.36, 0.02], [0.11, 0.13, 0.11], bp_k),
        B("Ear in L", "head", [-0.17, 1.38, 0.06], [0.06, 0.08, 0.06], bp_d),
        B("Ear in R", "head", [0.17, 1.38, 0.06], [0.06, 0.08, 0.06], bp_d),
        B("Muzzle", "head", [0, 1.0, 0.24], [0.16, 0.07, 0.05], bp_d),
    ],
    extras=[
        B("Necklace", "body", [0, 0.66, 0.06], [0.44, 0.07, 0.34], bp_s),
        B("Tooth", "body", [0, 0.58, 0.19], [0.06, 0.1, 0.05], "#e6e8ee"),
    ] + [
        B(f"Claw {r}{j}", r, [x + (j - 1) * 0.055, 0.095, 0.1], [0.035, 0.05, 0.1], bp_s)
        for r, x in (("lowerFL", -0.36), ("lowerFR", 0.36)) for j in range(3)
    ],
    anim=anim_like(walk={"legSwing": 30, "speed": 2.6}, jump={"height": 1.7, "tuck": 32}),
))

# ---- 43 AQUAMAN ------------------------------------------------------------
aq_o, aq_od, aq_g, aq_gd = "#e08a2a", "#b86a18", "#2f7a4a", "#22603a"
aq_hair, aq_go = "#e8cf7a", "#f0c33a"
def aq_scales(wx, wy, wz):
    on = (math.floor((wy + 4) / 0.09) + math.floor((wx + 4) / 0.09)) % 2 == 0
    return aq_od if on else aq_o
packs.append(humanoid(
    "Aquaman", uu=0.0515, bulk=1.05,
    torso_fn=lambda wx, wy, wz: aq_g if wy < 0.24 else aq_scales(wx, wy, wz),
    hip_c=aq_g, shoulder_c=aq_o, neck_c=SKIN_D,
    head_fn=lambda wx, wy, wz: (aq_hair if (wy > 1.22 or (wz < -0.03 and wy > 1.0)
                                            or (abs(wx) > 0.2 and wy > 1.06)) else SKIN),
    arm_fn=aq_scales, elbow_c=aq_od, fore_fn=solid(aq_go), hand_c=aq_go,
    thigh_fn=solid(aq_g), knee_c=aq_gd, shin_fn=solid(aq_gd),
    feet=sneakers(aq_go, "#c9a02c"),
    face=eyes("#2f8fb8") + mouth() + [
        B("Beard", "head", [0, 0.98, 0.2], [0.28, 0.12, 0.14], aq_hair),
        B("Brow L", "head", [-0.1, 1.225, 0.22], [0.11, 0.035, 0.05], "#c9ab5a"),
        B("Brow R", "head", [0.1, 1.225, 0.22], [0.11, 0.035, 0.05], "#c9ab5a"),
        B("Nose", "head", [0, 1.06, 0.25], [0.07, 0.08, 0.07], SKIN_D),
    ],
    extras=[
        B("Belt", "body", [0, 0.26, 0], [0.56, 0.09, 0.4], aq_go),
        # Trident in the right fist, swinging with the forearm.
        B("Haft", "lowerFR", [0.38, 0.1, 0.06], [0.06, 1.0, 0.06], aq_go),
        B("Prong C", "lowerFR", [0.38, 0.66, 0.06], [0.06, 0.22, 0.06], "#ffe08a"),
        B("Prong L", "lowerFR", [0.28, 0.62, 0.06], [0.055, 0.18, 0.055], "#ffe08a"),
        B("Prong R", "lowerFR", [0.48, 0.62, 0.06], [0.055, 0.18, 0.055], "#ffe08a"),
        B("Crossbar", "lowerFR", [0.38, 0.52, 0.06], [0.24, 0.05, 0.06], aq_go),
    ],
    anim=anim_like(walk={"legSwing": 27, "speed": 2.2}),
))

# ---- 44 GREEN LANTERN ------------------------------------------------------
gl_g, gl_gd, gl_k, gl_w = "#2fa858", "#218040", "#1e2026", "#f2f2ec"
packs.append(humanoid(
    "Green Lantern", uu=0.0515,
    torso_fn=lambda wx, wy, wz: gl_k if (wy < 0.26 or abs(wx) > 0.2) else (gl_gd if wz < -0.04 else gl_g),
    hip_c=gl_k, shoulder_c=gl_k, neck_c=SKIN_D,
    head_fn=lambda wx, wy, wz: ("#2b2118" if (wy > 1.24 or (wz < -0.03 and wy > 1.06)) else SKIN),
    arm_fn=solid(gl_k), elbow_c="#141519", fore_fn=solid(gl_k), hand_c=gl_w,
    thigh_fn=solid(gl_k), knee_c="#141519", shin_fn=solid(gl_g),
    feet=sneakers(gl_g, gl_gd),
    face=eyes("#3a6a4a") + mouth() + [
        B("Mask", "head", [0, 1.155, 0.215], [0.42, 0.13, 0.08], gl_g),
        B("Mask L", "head", [-0.2, 1.16, 0.21], [0.12, 0.15, 0.07], gl_g, [0, 0, 16]),
        B("Mask R", "head", [0.2, 1.16, 0.21], [0.12, 0.15, 0.07], gl_g, [0, 0, -16]),
        B("Nose", "head", [0, 1.06, 0.25], [0.07, 0.08, 0.07], SKIN_D),
    ],
    extras=[
        B("Emblem ring", "body", [0, 0.56, 0.172], [0.2, 0.2, 0.035], gl_w),
        B("Emblem bar T", "body", [0, 0.615, 0.192], [0.16, 0.035, 0.03], gl_g),
        B("Emblem bar B", "body", [0, 0.505, 0.192], [0.16, 0.035, 0.03], gl_g),
        B("Emblem core", "body", [0, 0.56, 0.192], [0.07, 0.07, 0.03], gl_g),
        B("Ring", "lowerFL", [-0.36, 0.115, 0.1], [0.09, 0.06, 0.06], "#9cf2b8"),
    ],
    anim=anim_like(walk={"legSwing": 27, "speed": 2.2}, jump={"height": 1.8}),
))

# ---- 45 ROBIN --------------------------------------------------------------
rb_r, rb_rd, rb_g, rb_y = "#cf2b2b", "#a01f1f", "#2f9a4a", "#f2c341"
packs.append(humanoid(
    "Robin", uu=0.051,
    torso_fn=lambda wx, wy, wz: rb_g if wy < 0.26 else (rb_rd if wz < -0.04 else rb_r),
    hip_c=rb_g, shoulder_c=rb_r, neck_c=SKIN_D,
    head_fn=lambda wx, wy, wz: ("#1e1e26" if (wy > 1.22 or (wz < -0.03 and wy > 1.04)
                                              or (abs(wx) > 0.2 and wy > 1.08)) else SKIN),
    arm_fn=solid(rb_r), elbow_c=rb_rd, fore_fn=solid(rb_g), hand_c=rb_g,
    thigh_fn=solid(rb_g), knee_c="#22803a", shin_fn=solid(rb_g),
    feet=sneakers(rb_g, "#22803a"),
    face=eyes("#3a5a2a") + mouth() + [
        B("Mask", "head", [0, 1.15, 0.215], [0.4, 0.13, 0.08], "#1e1e26"),
        B("Nose", "head", [0, 1.06, 0.25], [0.07, 0.08, 0.07], SKIN_D),
    ],
    extras=[
        B("Belt", "body", [0, 0.26, 0], [0.52, 0.08, 0.37], rb_y),
        B("R disc", "body", [0, 0.56, 0.172], [0.17, 0.17, 0.035], rb_y),
        B("R stem", "body", [-0.04, 0.56, 0.192], [0.03, 0.12, 0.03], rb_r),
        B("R bowl", "body", [0.015, 0.6, 0.192], [0.07, 0.045, 0.03], rb_r),
        B("R leg", "body", [0.03, 0.515, 0.192], [0.035, 0.06, 0.03], rb_r, [0, 0, -22]),
    ] + cape(rb_y, "#d9a628", w=0.56),
    anim=anim_like(walk={"legSwing": 30, "speed": 2.5}, jump={"height": 1.7, "tuck": 32}),
))

# ---- 46 WOLVERINE ----------------------------------------------------------
wv_y, wv_yd, wv_b, wv_bd = "#f2c341", "#d19f28", "#2b4a8f", "#1f3870"
wv_s = "#d6dbe2"
packs.append(humanoid(
    "Wolverine", uu=0.0525, bulk=1.1, limb=1.1,
    torso_fn=lambda wx, wy, wz: (wv_b if (wy < 0.3 or abs(wx) > 0.22) else
                                 (wv_yd if wz < -0.04 else wv_y)),
    hip_c=wv_b, shoulder_c=wv_y, neck_c=wv_bd,
    head_fn=lambda wx, wy, wz: (SKIN if (wy < 1.08 and wz > 0.08 and abs(wx) < 0.17)
                                else (wv_yd if (wz < -0.05 or wy > 1.28) else wv_y)),
    arm_fn=solid(wv_y), elbow_c=wv_yd, fore_fn=solid(wv_b), hand_c=wv_b,
    thigh_fn=solid(wv_b), knee_c=wv_bd, shin_fn=solid(wv_b),
    feet=sneakers(wv_b, wv_bd),
    face=lenses("#f4f4ee", y=1.15, w=0.13, h=0.06, rim=wv_bd) + [
        # The mask's swept-back points.
        B("Point L", "head", [-0.27, 1.34, -0.02], [0.14, 0.2, 0.13], wv_y, [-14, 0, 26]),
        B("Point R", "head", [0.27, 1.34, -0.02], [0.14, 0.2, 0.13], wv_y, [-14, 0, -26]),
        B("Point tip L", "head", [-0.37, 1.5, -0.06], [0.09, 0.13, 0.09], wv_yd, [-18, 0, 32]),
        B("Point tip R", "head", [0.37, 1.5, -0.06], [0.09, 0.13, 0.09], wv_yd, [-18, 0, -32]),
        B("Scowl", "head", [0, 0.955, 0.23], [0.16, 0.04, 0.04], "#8a4238"),
        B("Tooth L", "head", [-0.05, 0.985, 0.235], [0.04, 0.035, 0.04], "#ffffff"),
        B("Tooth R", "head", [0.05, 0.985, 0.235], [0.04, 0.035, 0.04], "#ffffff"),
    ],
    extras=[
        B("Belt", "body", [0, 0.3, 0], [0.6, 0.1, 0.42], wv_y),
        B("Buckle", "body", [0, 0.3, 0.21], [0.14, 0.12, 0.06], wv_yd),
    ] + [
        B(f"Claw {r}{j}", r, [x + (j - 1) * 0.075, 0.07, 0.16], [0.045, 0.05, 0.34], wv_s)
        for r, x in (("lowerFL", -0.396), ("lowerFR", 0.396)) for j in range(3)
    ],
    anim=anim_like(walk={"legSwing": 26, "bodyBob": 0.1, "speed": 2.3}),
))

# ---- 47 BLACK WIDOW --------------------------------------------------------
bw_k, bw_d, bw_s, bw_r = "#26282e", "#17181d", "#b9c0cc", "#c8232f"
bw_hair = "#a83a24"
packs.append(humanoid(
    "Black Widow", uu=0.051,
    torso_fn=lambda wx, wy, wz: bw_d if wz < -0.04 else bw_k,
    hip_c=bw_d, shoulder_c=bw_k, neck_c=bw_d,
    head_fn=lambda wx, wy, wz: (bw_hair if (wy > 1.2 or (wz < -0.02 and wy > 0.98)
                                            or (abs(wx) > 0.2 and wy > 1.02)) else SKIN),
    arm_fn=solid(bw_k), elbow_c=bw_d, fore_fn=solid(bw_k), hand_c=bw_d,
    thigh_fn=solid(bw_k), knee_c=bw_d, shin_fn=solid(bw_k),
    feet=sneakers(bw_d, "#101116"),
    face=eyes("#3a6a4a") + mouth("#c2564a", w=0.1) + [
        B("Hair back", "head", [0, 0.98, -0.2], [0.4, 0.34, 0.14], bw_hair),
        B("Hair L", "head", [-0.24, 1.0, -0.08], [0.12, 0.32, 0.2], bw_hair),
        B("Hair R", "head", [0.24, 1.0, -0.08], [0.12, 0.32, 0.2], bw_hair),
        B("Brow L", "head", [-0.1, 1.21, 0.22], [0.1, 0.03, 0.05], "#7a2a18"),
        B("Brow R", "head", [0.1, 1.21, 0.22], [0.1, 0.03, 0.05], "#7a2a18"),
    ],
    extras=[
        B("Belt", "body", [0, 0.24, 0], [0.52, 0.08, 0.38], bw_s),
        B("Buckle", "body", [0, 0.24, 0.185], [0.11, 0.1, 0.06], bw_r),
        B("Hourglass T", "body", [0, 0.58, 0.175], [0.13, 0.05, 0.035], bw_r),
        B("Hourglass M", "body", [0, 0.535, 0.175], [0.05, 0.05, 0.035], bw_r),
        B("Hourglass B", "body", [0, 0.49, 0.175], [0.13, 0.05, 0.035], bw_r),
        B("Gauntlet L", "lowerFL", [-0.36, 0.29, 0], [0.21, 0.09, 0.21], bw_s),
        B("Gauntlet R", "lowerFR", [0.36, 0.29, 0], [0.21, 0.09, 0.21], bw_s),
    ],
    anim=anim_like(walk={"legSwing": 29, "speed": 2.5}),
))

# ---- 48 HAWKEYE ------------------------------------------------------------
hk_p, hk_pd, hk_k, hk_s = "#6b3fa8", "#54308a", "#26282e", "#b9c0cc"
packs.append(humanoid(
    "Hawkeye", uu=0.0515,
    torso_fn=lambda wx, wy, wz: (hk_k if abs(wx) > 0.21 else (hk_pd if wz < -0.04 else hk_p)),
    hip_c=hk_k, shoulder_c=hk_p, neck_c=hk_k,
    head_fn=lambda wx, wy, wz: ("#3a2a18" if (wy > 1.24 or (wz < -0.03 and wy > 1.08)) else SKIN),
    arm_fn=solid(hk_p), elbow_c=hk_pd, fore_fn=solid(hk_k), hand_c=hk_k,
    thigh_fn=solid(hk_k), knee_c="#17181d", shin_fn=solid(hk_pd),
    feet=sneakers(hk_k, "#17181d"),
    face=eyes("#4a6a8a") + mouth() + [
        B("Mask", "head", [0, 1.155, 0.215], [0.42, 0.14, 0.08], hk_pd),
        B("Mask wing L", "head", [-0.23, 1.2, 0.16], [0.12, 0.11, 0.12], hk_pd, [0, 0, 24]),
        B("Mask wing R", "head", [0.23, 1.2, 0.16], [0.12, 0.11, 0.12], hk_pd, [0, 0, -24]),
        B("Nose", "head", [0, 1.06, 0.25], [0.07, 0.08, 0.07], SKIN_D),
    ],
    extras=[
        B("Strap", "body", [0, 0.5, 0], [0.66, 0.1, 0.42], hk_k, [0, 0, 36]),
        B("Quiver", "body", [0.24, 0.62, -0.24], [0.16, 0.5, 0.16], hk_pd, [10, 0, -12]),
    ] + [
        B(f"Arrow {j}", "body", [0.2 + j * 0.05, 0.94, -0.28], [0.03, 0.16, 0.03],
          ["#e0455a", "#f2c341", "#f4f4ee"][j], [10, 0, -12]) for j in range(3)
    ] + [
        # Bow held in the left fist.
        B("Bow grip", "lowerFL", [-0.36, 0.14, 0.14], [0.05, 0.16, 0.05], "#4a3220"),
        B("Bow arm T", "lowerFL", [-0.36, 0.34, 0.1], [0.05, 0.3, 0.05], "#5e4028", [22, 0, 0]),
        B("Bow arm B", "lowerFL", [-0.36, -0.06, 0.1], [0.05, 0.3, 0.05], "#5e4028", [-22, 0, 0]),
        B("Bow tip T", "lowerFL", [-0.36, 0.5, -0.02], [0.045, 0.14, 0.045], "#4a3220", [40, 0, 0]),
        B("Bow tip B", "lowerFL", [-0.36, -0.22, -0.02], [0.045, 0.14, 0.045], "#4a3220", [-40, 0, 0]),
        B("String", "lowerFL", [-0.36, 0.14, -0.06], [0.02, 0.74, 0.02], "#e8e4d8"),
    ],
    anim=anim_like(walk={"legSwing": 28, "speed": 2.4}),
))

# ---- 49 DOCTOR STRANGE -----------------------------------------------------
ds_b, ds_bd, ds_r, ds_rd = "#2f4a8f", "#233a72", "#b52a3a", "#8c1f2c"
ds_go, ds_hair, ds_grey = "#f0c33a", "#2b2118", "#c8c8cc"
packs.append(humanoid(
    "Doctor Strange", uu=0.0515,
    torso_fn=lambda wx, wy, wz: (ds_bd if wz < -0.04 else
                                 (ds_go if abs(wx) < 0.05 and wy > 0.3 else ds_b)),
    hip_c=ds_bd, shoulder_c=ds_b, neck_c=ds_bd,
    head_fn=lambda wx, wy, wz: (ds_grey if (abs(wx) > 0.2 and 1.04 < wy < 1.24) else
                                (ds_hair if (wy > 1.22 or (wz < -0.03 and wy > 1.06)) else SKIN)),
    arm_fn=solid(ds_b), elbow_c=ds_bd, fore_fn=solid(ds_b), hand_c=ds_b,
    thigh_fn=solid(ds_bd), knee_c="#1c2f5e", shin_fn=solid(ds_bd),
    feet=sneakers("#3a2a1e", "#261c14"),
    face=eyes("#4a6a8a") + [
        B("Brow L", "head", [-0.1, 1.225, 0.22], [0.11, 0.035, 0.05], ds_hair),
        B("Brow R", "head", [0.1, 1.225, 0.22], [0.11, 0.035, 0.05], ds_hair),
        B("Nose", "head", [0, 1.06, 0.25], [0.07, 0.08, 0.07], SKIN_D),
        B("Moustache", "head", [0, 1.0, 0.235], [0.17, 0.045, 0.05], ds_hair),
        B("Goatee", "head", [0, 0.92, 0.22], [0.1, 0.11, 0.06], ds_hair),
    ],
    extras=[
        B("Collar L", "tail", [-0.2, 0.86, -0.1], [0.2, 0.3, 0.14], ds_r, [0, 0, -12]),
        B("Collar R", "tail", [0.2, 0.86, -0.1], [0.2, 0.3, 0.14], ds_r, [0, 0, 12]),
        B("Sash", "body", [0, 0.26, 0], [0.56, 0.1, 0.4], ds_go),
        B("Eye amulet", "body", [0, 0.6, 0.175], [0.11, 0.14, 0.04], ds_go),
        B("Eye stone", "body", [0, 0.6, 0.195], [0.05, 0.07, 0.03], "#8ce8a8"),
    ] + cape(ds_r, ds_rd, w=0.62),
    anim=anim_like(walk={"legSwing": 25, "speed": 2.1}, idle={"bob": 0.03, "speed": 1.3}),
))

# ---- 50 GROOT --------------------------------------------------------------
gr_w, gr_wd, gr_m, gr_e = "#6f4e30", "#513722", "#4a7a3a", "#f2d98a"
def groot_bark(wx, wy, wz):
    # Vertical grain plus moss patches so the bark reads as wood, not mud.
    if hash01(round(wx / 0.14), round(wy / 0.3), round(wz / 0.14)) > 0.82:
        return gr_m
    return gr_wd if math.floor((wx + 4) / 0.075) % 2 == 0 else gr_w
packs.append(humanoid(
    "Groot", uu=0.0505, bulk=0.96, limb=0.98,
    torso_fn=groot_bark, hip_c=gr_wd, shoulder_c=gr_w, neck_c=gr_wd,
    head_fn=groot_bark, head_at=1.14, head_r=(0.25, 0.27, 0.24),
    arm_fn=groot_bark, elbow_c=gr_wd, fore_fn=groot_bark, hand_c=gr_w,
    thigh_fn=groot_bark, knee_c=gr_wd, shin_fn=groot_bark,
    feet=barefoot(gr_w, gr_wd),
    face=[
        B("Brow L", "head", [-0.11, 1.24, 0.2], [0.14, 0.06, 0.07], gr_wd),
        B("Brow R", "head", [0.11, 1.24, 0.2], [0.14, 0.06, 0.07], gr_wd),
        B("Eye L", "head", [-0.1, 1.15, 0.225], [0.11, 0.12, 0.05], gr_e),
        B("Eye R", "head", [0.1, 1.15, 0.225], [0.11, 0.12, 0.05], gr_e),
        B("Pupil L", "head", [-0.1, 1.15, 0.25], [0.055, 0.075, 0.03], "#2b1f14"),
        B("Pupil R", "head", [0.1, 1.15, 0.25], [0.055, 0.075, 0.03], "#2b1f14"),
        B("Mouth", "head", [0, 0.98, 0.225], [0.18, 0.05, 0.05], "#3a2818"),
        B("Sprout", "head", [0, 1.42, 0.02], [0.05, 0.14, 0.05], gr_m),
        B("Leaf L", "head", [-0.09, 1.5, 0.02], [0.13, 0.05, 0.09], "#5e9a48", [0, 0, 22]),
        B("Leaf R", "head", [0.09, 1.5, 0.02], [0.13, 0.05, 0.09], "#5e9a48", [0, 0, -22]),
    ],
    extras=[
        B("Twig L", "body", [-0.36, 0.78, -0.06], [0.2, 0.06, 0.06], gr_wd, [0, 0, 28]),
        B("Twig R", "body", [0.36, 0.78, -0.06], [0.2, 0.06, 0.06], gr_wd, [0, 0, -28]),
        B("Moss L", "body", [-0.2, 0.7, 0.1], [0.12, 0.06, 0.12], gr_m),
        B("Moss R", "body", [0.16, 0.34, 0.14], [0.1, 0.06, 0.1], gr_m),
    ],
    anim=anim_like(walk={"legSwing": 24, "bodyBob": 0.08, "speed": 1.9},
                   idle={"bob": 0.03, "speed": 1.1}),
))

# ---- 51 STAR-LORD ----------------------------------------------------------
sl_r, sl_rd, sl_k, sl_o = "#a83a2a", "#822a1e", "#2b2b32", "#f2913a"
packs.append(humanoid(
    "Star-Lord", uu=0.0515, bulk=1.04,
    torso_fn=lambda wx, wy, wz: (sl_k if abs(wx) < 0.12 and wz > 0.06 else
                                 (sl_rd if wz < -0.04 else sl_r)),
    hip_c=sl_k, shoulder_c=sl_r, neck_c=sl_k,
    head_fn=lambda wx, wy, wz: (sl_k if wz > 0.04 and wy < 1.24 else sl_rd),
    arm_fn=solid(sl_r), elbow_c=sl_rd, fore_fn=solid(sl_k), hand_c=sl_k,
    thigh_fn=solid(sl_k), knee_c="#1c1c22", shin_fn=solid("#4a3220"),
    feet=sneakers("#4a3220", "#33220f"),
    face=lenses(sl_o, y=1.15, w=0.17, h=0.075, tilt=8, rim="#1c1c22") + [
        B("Grille", "head", [0, 0.99, 0.24], [0.22, 0.08, 0.04], "#3f3f48"),
        B("Grille bar L", "head", [-0.06, 0.99, 0.26], [0.025, 0.08, 0.03], sl_k),
        B("Grille bar R", "head", [0.06, 0.99, 0.26], [0.025, 0.08, 0.03], sl_k),
        B("Ridge", "head", [0, 1.28, 0.1], [0.09, 0.07, 0.32], sl_rd),
    ],
    extras=[
        B("Belt", "body", [0, 0.28, 0], [0.58, 0.1, 0.42], "#4a3220"),
        B("Buckle", "body", [0, 0.28, 0.2], [0.12, 0.11, 0.06], "#c9a02c"),
        B("Coat L", "tail", [-0.28, 0.1, -0.28], [0.24, 0.62, 0.11], sl_rd),
        B("Coat R", "tail", [0.28, 0.1, -0.28], [0.24, 0.62, 0.11], sl_rd),
        B("Coat back", "tail", [0, 0.35, -0.3], [0.62, 0.5, 0.1], sl_r),
    ],
    anim=anim_like(walk={"legSwing": 28, "speed": 2.3}),
))

# ============================== ANTAGONISTS =================================

# ---- 52 THE JOKER ----------------------------------------------------------
jk_p, jk_pd, jk_g, jk_o = "#6b3fa8", "#54308a", "#4aa83a", "#e08a2a"
jk_w, jk_r = "#f2f0ea", "#c8232f"
packs.append(humanoid(
    "The Joker", uu=0.0515, bulk=0.98,
    torso_fn=lambda wx, wy, wz: (jk_o if (abs(wx) < 0.13 and wz > 0.06 and wy > 0.34) else
                                 (jk_g if (abs(wx) < 0.2 and wz > 0.02) else
                                  (jk_pd if wz < -0.04 else jk_p))),
    hip_c=jk_p, shoulder_c=jk_p, neck_c=jk_w,
    head_fn=lambda wx, wy, wz: (jk_g if (wy > 1.2 or (wz < -0.03 and wy > 1.06)
                                         or (abs(wx) > 0.21 and wy > 1.1)) else jk_w),
    arm_fn=solid(jk_p), elbow_c=jk_pd, fore_fn=solid(jk_p), hand_c=jk_w,
    thigh_fn=solid(jk_p), knee_c=jk_pd, shin_fn=solid(jk_pd),
    feet=sneakers("#3a2a1e", "#261c14"),
    face=[
        B("Hair tuft L", "head", [-0.24, 1.32, -0.02], [0.13, 0.14, 0.13], jk_g, [0, 0, 22]),
        B("Hair tuft R", "head", [0.24, 1.32, -0.02], [0.13, 0.14, 0.13], jk_g, [0, 0, -22]),
        B("Eye L", "head", [-0.1, 1.15, 0.225], [0.09, 0.1, 0.04], "#ffffff"),
        B("Eye R", "head", [0.1, 1.15, 0.225], [0.09, 0.1, 0.04], "#ffffff"),
        B("Pupil L", "head", [-0.095, 1.15, 0.25], [0.045, 0.075, 0.03], "#1c1c22"),
        B("Pupil R", "head", [0.095, 1.15, 0.25], [0.045, 0.075, 0.03], "#1c1c22"),
        B("Brow L", "head", [-0.1, 1.23, 0.22], [0.12, 0.035, 0.05], jk_g, [0, 0, -22]),
        B("Brow R", "head", [0.1, 1.23, 0.22], [0.12, 0.035, 0.05], jk_g, [0, 0, 22]),
        B("Nose", "head", [0, 1.06, 0.25], [0.07, 0.08, 0.07], "#e0d8d0"),
        # The grin: a wide bar with corners hooked up.
        B("Grin", "head", [0, 0.945, 0.23], [0.24, 0.05, 0.045], jk_r),
        B("Grin up L", "head", [-0.135, 0.985, 0.228], [0.05, 0.06, 0.045], jk_r),
        B("Grin up R", "head", [0.135, 0.985, 0.228], [0.05, 0.06, 0.045], jk_r),
        B("Teeth", "head", [0, 0.955, 0.245], [0.18, 0.03, 0.04], "#ffffff"),
    ],
    extras=[
        B("Lapel L", "body", [-0.13, 0.6, 0.16], [0.12, 0.24, 0.06], jk_pd, [0, 0, 14]),
        B("Lapel R", "body", [0.13, 0.6, 0.16], [0.12, 0.24, 0.06], jk_pd, [0, 0, -14]),
        B("Flower", "body", [-0.2, 0.66, 0.15], [0.11, 0.11, 0.06], jk_r),
        B("Flower mid", "body", [-0.2, 0.66, 0.18], [0.05, 0.05, 0.05], "#f2d13a"),
        B("Bow tie", "body", [0, 0.76, 0.13], [0.2, 0.08, 0.06], jk_r),
    ],
    anim=anim_like(walk={"legSwing": 32, "bodyBob": 0.11, "speed": 2.4},
                   idle={"bob": 0.05, "speed": 1.8}),
))

# ---- 53 GREEN GOBLIN -------------------------------------------------------
gg_g, gg_gd, gg_p, gg_pd = "#5aa83a", "#42802a", "#6b3fa8", "#54308a"
packs.append(humanoid(
    "Green Goblin", uu=0.0515, bulk=1.04,
    torso_fn=lambda wx, wy, wz: (gg_pd if wz < -0.04 else gg_p),
    hip_c=gg_pd, shoulder_c=gg_p, neck_c=gg_gd,
    head_fn=lambda wx, wy, wz: (gg_gd if (wz < -0.05 or wy > 1.28) else gg_g),
    arm_fn=solid(gg_p), elbow_c=gg_gd, fore_fn=solid(gg_g), hand_c=gg_g,
    thigh_fn=solid(gg_p), knee_c=gg_pd, shin_fn=solid(gg_pd),
    feet=sneakers(gg_pd, "#3f2470"),
    face=[
        B("Ear L", "head", [-0.28, 1.24, -0.02], [0.1, 0.24, 0.11], gg_g, [-10, 0, 20]),
        B("Ear R", "head", [0.28, 1.24, -0.02], [0.1, 0.24, 0.11], gg_g, [-10, 0, -20]),
        B("Ear tip L", "head", [-0.35, 1.4, -0.05], [0.06, 0.14, 0.07], gg_gd, [-12, 0, 26]),
        B("Ear tip R", "head", [0.35, 1.4, -0.05], [0.06, 0.14, 0.07], gg_gd, [-12, 0, -26]),
        B("Brow L", "head", [-0.11, 1.235, 0.21], [0.15, 0.06, 0.06], gg_gd, [0, 0, -26]),
        B("Brow R", "head", [0.11, 1.235, 0.21], [0.15, 0.06, 0.06], gg_gd, [0, 0, 26]),
        B("Eye L", "head", [-0.1, 1.15, 0.225], [0.1, 0.09, 0.04], "#f2d13a"),
        B("Eye R", "head", [0.1, 1.15, 0.225], [0.1, 0.09, 0.04], "#f2d13a"),
        B("Pupil L", "head", [-0.095, 1.15, 0.25], [0.04, 0.06, 0.03], "#1c1c1c"),
        B("Pupil R", "head", [0.095, 1.15, 0.25], [0.04, 0.06, 0.03], "#1c1c1c"),
        B("Nose", "head", [0, 1.06, 0.26], [0.08, 0.12, 0.09], gg_gd),
        B("Chin", "head", [0, 0.9, 0.2], [0.13, 0.11, 0.1], gg_gd),
        B("Grin", "head", [0, 0.97, 0.235], [0.22, 0.05, 0.04], "#2b1c14"),
        B("Teeth", "head", [0, 0.978, 0.25], [0.19, 0.035, 0.035], "#f0eddf"),
    ],
    extras=[
        B("Hood", "body", [0, 0.78, -0.1], [0.46, 0.2, 0.34], gg_pd),
        B("Satchel", "body", [-0.3, 0.36, -0.2], [0.2, 0.24, 0.16], gg_pd),
        B("Pumpkin", "lowerFR", [0.38, 0.09, 0.16], [0.19, 0.19, 0.19], "#e08a2a"),
        B("Pumpkin stem", "lowerFR", [0.38, 0.2, 0.16], [0.06, 0.07, 0.06], gg_gd),
    ],
    anim=anim_like(walk={"legSwing": 30, "bodyBob": 0.1, "speed": 2.5},
                   jump={"height": 1.8, "tuck": 34}),
))

# ---- 54 THANOS -------------------------------------------------------------
th2_p, th2_pd, th2_b, th2_bd = "#9a6ab8", "#7d4f9c", "#2f4a8f", "#233a72"
th2_go = "#f0c33a"
packs.append(humanoid(
    "Thanos", uu=0.0612, bulk=1.44, limb=1.34,
    torso_fn=lambda wx, wy, wz: (th2_go if (abs(wx) < 0.1 and wz > 0.06 and wy > 0.4) else
                                 (th2_bd if wz < -0.04 else th2_b)),
    # Blue shoulders, so the gold stays collar-belt-and-stripe instead of
    # merging into one bib across the whole chest.
    hip_c=th2_bd, shoulder_c=th2_b, neck_c=th2_pd,
    head_fn=lambda wx, wy, wz: (th2_pd if (wz < -0.04 or wy > 1.28) else th2_p),
    head_at=1.15, head_r=(0.27, 0.27, 0.25),
    arm_fn=solid(th2_p), elbow_c=th2_pd,
    # Only the left arm carries the gauntlet.
    fore_fn=lambda wx, wy, wz: th2_go if wx < 0 else th2_p,
    hand_c=th2_p,
    thigh_fn=solid(th2_b), knee_c=th2_bd, shin_fn=solid(th2_bd),
    feet=sneakers(th2_bd, "#1a2b56"),
    face=[
        B("Brow L", "head", [-0.12, 1.25, 0.2], [0.15, 0.07, 0.07], th2_pd, [0, 0, -18]),
        B("Brow R", "head", [0.12, 1.25, 0.2], [0.15, 0.07, 0.07], th2_pd, [0, 0, 18]),
        B("Eye L", "head", [-0.11, 1.16, 0.225], [0.09, 0.08, 0.04], "#f0e8f4"),
        B("Eye R", "head", [0.11, 1.16, 0.225], [0.09, 0.08, 0.04], "#f0e8f4"),
        B("Pupil L", "head", [-0.105, 1.16, 0.25], [0.045, 0.06, 0.03], "#2b1c3a"),
        B("Pupil R", "head", [0.105, 1.16, 0.25], [0.045, 0.06, 0.03], "#2b1c3a"),
        B("Chin", "head", [0, 0.92, 0.19], [0.24, 0.13, 0.12], th2_p),
        B("Chin line L", "head", [-0.07, 0.92, 0.25], [0.03, 0.1, 0.04], th2_pd),
        B("Chin line R", "head", [0.07, 0.92, 0.25], [0.03, 0.1, 0.04], th2_pd),
        B("Mouth", "head", [0, 1.0, 0.235], [0.16, 0.04, 0.05], "#5e3a6a"),
    ],
    extras=[
        B("Collar L", "body", [-0.3, 0.78, 0], [0.22, 0.14, 0.4], th2_go),
        B("Collar R", "body", [0.3, 0.78, 0], [0.22, 0.14, 0.4], th2_go),
        B("Belt", "body", [0, 0.3, 0], [0.78, 0.12, 0.56], th2_go),
    ] + [
        B(f"Stone {j}", "lowerFL", [-0.52 + j * 0.055, 0.1, 0.14], [0.045, 0.045, 0.045],
          ["#8a4ad8", "#3a7ad8", "#d84a4a", "#d8a83a", "#4ad86a", "#f0f0f0"][j])
        for j in range(6)
    ],
    anim=anim_like(idle={"bob": 0.045, "speed": 1.2},
                   walk={"legSwing": 22, "bodyBob": 0.12, "speed": 1.8},
                   jump={"height": 1.3, "tuck": 22, "speed": 0.8}),
))

# ---- 55 VENOM --------------------------------------------------------------
vn_k, vn_kd, vn_w = "#1c1c22", "#111116", "#f0f0ea"
packs.append(humanoid(
    "Venom", uu=0.0596, bulk=1.3, limb=1.26,
    torso_fn=lambda wx, wy, wz: vn_kd if wz < -0.04 else vn_k,
    hip_c=vn_kd, shoulder_c=vn_k, neck_c=vn_kd,
    head_fn=lambda wx, wy, wz: vn_kd if (wz < -0.05 or wy > 1.3) else vn_k,
    head_at=1.15, head_r=(0.28, 0.28, 0.26),
    arm_fn=solid(vn_k), elbow_c=vn_kd, fore_fn=solid(vn_k), hand_c=vn_kd,
    thigh_fn=solid(vn_k), knee_c=vn_kd, shin_fn=solid(vn_k),
    feet=sneakers(vn_k, vn_kd),
    face=[
        # Huge tapered lenses and a mouthful of teeth.
        B("Eye L", "head", [-0.13, 1.19, 0.225], [0.21, 0.14, 0.045], vn_w, [0, 0, 17]),
        B("Eye R", "head", [0.13, 1.19, 0.225], [0.21, 0.14, 0.045], vn_w, [0, 0, -17]),
        B("Eye tip L", "head", [-0.27, 1.25, 0.19], [0.1, 0.06, 0.04], vn_w, [0, 0, 24]),
        B("Eye tip R", "head", [0.27, 1.25, 0.19], [0.1, 0.06, 0.04], vn_w, [0, 0, -24]),
        B("Maw", "head", [0, 0.97, 0.22], [0.3, 0.13, 0.06], "#5e1c2a"),
        B("Tongue", "head", [0, 0.93, 0.3], [0.06, 0.05, 0.22], "#c8324a", [18, 0, 0]),
    ] + [
        B(f"Tooth T{j}", "head", [-0.11 + j * 0.055, 1.015, 0.245], [0.04, 0.06, 0.04], vn_w)
        for j in range(5)
    ] + [
        B(f"Tooth B{j}", "head", [-0.11 + j * 0.055, 0.935, 0.245], [0.04, 0.06, 0.04], vn_w)
        for j in range(5)
    ],
    extras=[
        B("Spider body", "body", [0, 0.55, 0.235], [0.1, 0.2, 0.04], vn_w),
        B("Spider head", "body", [0, 0.68, 0.232], [0.07, 0.06, 0.04], vn_w),
    ] + [
        B(f"Spider leg {s}{j}", "body", [s * 0.13, 0.55 + (1 - j) * 0.1, 0.232],
          [0.2, 0.035, 0.04], vn_w, [0, 0, s * (38 - j * 26)])
        for s in (-1, 1) for j in range(3)
    ],
    anim=anim_like(idle={"bob": 0.045, "speed": 1.4},
                   walk={"legSwing": 26, "bodyBob": 0.11, "speed": 2.3},
                   jump={"height": 1.7, "tuck": 30}),
))

# ---- 56 LOKI ---------------------------------------------------------------
lk_g, lk_gd, lk_go, lk_k = "#2f7a4a", "#22603a", "#f0c33a", "#1e1e26"
packs.append(humanoid(
    "Loki", uu=0.0515, bulk=1.0,
    torso_fn=lambda wx, wy, wz: (lk_go if (abs(wx) < 0.07 and wz > 0.06) else
                                 (lk_gd if wz < -0.04 else lk_g)),
    hip_c=lk_k, shoulder_c=lk_gd, neck_c=lk_k,
    head_fn=lambda wx, wy, wz: (lk_k if (wy > 1.2 or (wz < -0.03 and wy > 1.0)
                                         or (abs(wx) > 0.2 and wy > 1.04)) else SKIN),
    arm_fn=solid(lk_g), elbow_c=lk_gd, fore_fn=solid(lk_k), hand_c=lk_k,
    thigh_fn=solid(lk_k), knee_c="#141419", shin_fn=solid(lk_k),
    feet=sneakers(lk_k, "#141419"),
    face=eyes("#3a6a4a") + mouth("#a8564a", w=0.1) + [
        # The horns: two long gold curves swept up and back off the helm.
        B("Helm", "head", [0, 1.245, 0.14], [0.44, 0.08, 0.28], lk_go),
        B("Horn L", "head", [-0.17, 1.42, 0.0], [0.09, 0.34, 0.11], lk_go, [-18, 0, 12]),
        B("Horn R", "head", [0.17, 1.42, 0.0], [0.09, 0.34, 0.11], lk_go, [-18, 0, -12]),
        B("Horn mid L", "head", [-0.23, 1.68, -0.1], [0.075, 0.24, 0.09], lk_go, [-34, 0, 18]),
        B("Horn mid R", "head", [0.23, 1.68, -0.1], [0.075, 0.24, 0.09], lk_go, [-34, 0, -18]),
        B("Horn tip L", "head", [-0.3, 1.86, -0.26], [0.06, 0.18, 0.07], "#ffe08a", [-48, 0, 24]),
        B("Horn tip R", "head", [0.3, 1.86, -0.26], [0.06, 0.18, 0.07], "#ffe08a", [-48, 0, -24]),
        B("Brow L", "head", [-0.1, 1.185, 0.22], [0.11, 0.035, 0.05], lk_k, [0, 0, -14]),
        B("Brow R", "head", [0.1, 1.185, 0.22], [0.11, 0.035, 0.05], lk_k, [0, 0, 14]),
    ],
    extras=[
        B("Belt", "body", [0, 0.26, 0], [0.54, 0.09, 0.39], lk_go),
        B("Chest plate L", "body", [-0.16, 0.62, 0.16], [0.13, 0.26, 0.06], lk_go, [0, 0, 12]),
        B("Chest plate R", "body", [0.16, 0.62, 0.16], [0.13, 0.26, 0.06], lk_go, [0, 0, -12]),
    ] + cape(lk_g, lk_gd, w=0.6),
    anim=anim_like(walk={"legSwing": 26, "speed": 2.2}, idle={"bob": 0.03, "speed": 1.4}),
))

# ---- 57 HARLEY QUINN -------------------------------------------------------
hq_r, hq_rd, hq_k, hq_w = "#c8232f", "#9c1a24", "#23242b", "#f2f0ea"
hq_bl, hq_blu = "#f0dc9a", "#3a6ad8"
def harley(wx, wy, wz):
    """Harlequin halves: red on the left, black on the right, swapped below."""
    left = wx < 0
    if wy < 0.3:
        left = not left
    return hq_r if left else hq_k
packs.append(humanoid(
    "Harley Quinn", uu=0.051,
    torso_fn=harley, hip_c=hq_k, shoulder_c=hq_r, neck_c=hq_w,
    head_fn=lambda wx, wy, wz: (
        (hq_r if wx < 0 else hq_k) if (wy > 1.2 or (wz < -0.03 and wy > 1.06)) else hq_w),
    arm_fn=lambda wx, wy, wz: hq_r if wx < 0 else hq_k,
    elbow_c=hq_rd, fore_fn=lambda wx, wy, wz: hq_k if wx < 0 else hq_r,
    hand_c=hq_w,
    thigh_fn=lambda wx, wy, wz: hq_k if wx < 0 else hq_r,
    knee_c=hq_rd, shin_fn=lambda wx, wy, wz: hq_r if wx < 0 else hq_k,
    feet=sneakers(hq_k, hq_w),
    face=[
        # Pigtails, one red-tipped and one blue.
        B("Tail base L", "head", [-0.28, 1.26, -0.06], [0.13, 0.13, 0.13], hq_bl),
        B("Tail base R", "head", [0.28, 1.26, -0.06], [0.13, 0.13, 0.13], hq_bl),
        B("Tail L", "head", [-0.4, 1.16, -0.12], [0.14, 0.3, 0.14], hq_bl, [0, 0, 18]),
        B("Tail R", "head", [0.4, 1.16, -0.12], [0.14, 0.3, 0.14], hq_bl, [0, 0, -18]),
        B("Tail tip L", "head", [-0.46, 0.96, -0.16], [0.12, 0.16, 0.12], hq_r, [0, 0, 22]),
        B("Tail tip R", "head", [0.46, 0.96, -0.16], [0.12, 0.16, 0.12], hq_blu, [0, 0, -22]),
        B("Mask", "head", [0, 1.155, 0.215], [0.42, 0.13, 0.08], hq_k),
        B("Eye L", "head", [-0.1, 1.15, 0.245], [0.075, 0.08, 0.04], "#ffffff"),
        B("Eye R", "head", [0.1, 1.15, 0.245], [0.075, 0.08, 0.04], "#ffffff"),
        B("Pupil L", "head", [-0.095, 1.15, 0.265], [0.045, 0.055, 0.03], "#2b3a6a"),
        B("Pupil R", "head", [0.095, 1.15, 0.265], [0.045, 0.055, 0.03], "#2b3a6a"),
        B("Mouth", "head", [0, 0.965, 0.23], [0.14, 0.045, 0.045], hq_r),
        B("Grin L", "head", [-0.085, 0.995, 0.228], [0.045, 0.05, 0.045], hq_r),
        B("Grin R", "head", [0.085, 0.995, 0.228], [0.045, 0.05, 0.045], hq_r),
    ],
    extras=[
        B("Collar", "body", [0, 0.76, 0.02], [0.44, 0.11, 0.34], hq_w),
        B("Ruff L", "body", [-0.2, 0.74, 0.14], [0.12, 0.12, 0.1], hq_r),
        B("Ruff R", "body", [0.2, 0.74, 0.14], [0.12, 0.12, 0.1], hq_k),
        B("Belt", "body", [0, 0.26, 0], [0.52, 0.08, 0.38], hq_w),
        # Mallet in the right fist.
        B("Mallet haft", "lowerFR", [0.37, -0.04, 0.05], [0.06, 0.4, 0.06], "#8a6a3a"),
        B("Mallet head", "lowerFR", [0.37, -0.3, 0.05], [0.34, 0.2, 0.2], hq_k),
        B("Mallet band", "lowerFR", [0.37, -0.3, 0.05], [0.36, 0.06, 0.22], hq_w),
    ],
    anim=anim_like(walk={"legSwing": 32, "bodyBob": 0.1, "speed": 2.6},
                   jump={"height": 1.7, "tuck": 32}),
))

# ================================= FANTASY ==================================

def cone_hat(y0, h, r0, c, trim=None, n=6, brim=None):
    """A stacked-block cone — wizard and witch hats, drawn as a taper."""
    out = []
    if brim:
        out.append(B("Brim", "head", [0, y0 - 0.01, 0.02], [r0 * 2.5, 0.06, r0 * 2.5], brim))
    for i in range(n):
        t = i / (n - 1)
        out.append(B(f"Hat {i+1}", "head", [0, y0 + 0.03 + t * h, -t * 0.06],
                     [r0 * 2 * (1 - t * 0.82), h / n * 1.5, r0 * 2 * (1 - t * 0.82)],
                     trim if (trim and i == 0) else c))
    return out

# ---- 58 WIZARD -------------------------------------------------------------
wz_b, wz_bd, wz_go, wz_w = "#33409c", "#26307a", "#f0c33a", "#f2f0e6"
def wiz_robe(wx, wy, wz):
    # Sparse gold stars scattered over deep blue.
    if hash01(round(wx / 0.11), round(wy / 0.11), round(wz / 0.11)) > 0.93:
        return wz_go
    return wz_bd if wz < -0.04 else wz_b
packs.append(humanoid(
    "Wizard", uu=0.0525, bulk=1.06,
    torso_fn=wiz_robe, hip_c=wz_bd, shoulder_c=wz_b, neck_c=wz_bd,
    head_fn=lambda wx, wy, wz: (wz_w if (abs(wx) > 0.2 and wy > 1.06) else SKIN),
    arm_fn=wiz_robe, elbow_c=wz_bd, fore_fn=wiz_robe, hand_c=SKIN,
    thigh_fn=wiz_robe, knee_c=wz_bd, shin_fn=wiz_robe,
    feet=sneakers("#4a3220", "#33220f"),
    face=cone_hat(1.36, 0.44, 0.2, wz_b, trim=wz_go, brim=wz_bd) + [
        B("Brow L", "head", [-0.11, 1.235, 0.21], [0.13, 0.05, 0.06], wz_w),
        B("Brow R", "head", [0.11, 1.235, 0.21], [0.13, 0.05, 0.06], wz_w),
        B("Eye L", "head", [-0.1, 1.15, 0.225], [0.075, 0.075, 0.04], "#ffffff"),
        B("Eye R", "head", [0.1, 1.15, 0.225], [0.075, 0.075, 0.04], "#ffffff"),
        B("Pupil L", "head", [-0.095, 1.15, 0.25], [0.04, 0.05, 0.03], "#3a6a8a"),
        B("Pupil R", "head", [0.095, 1.15, 0.25], [0.04, 0.05, 0.03], "#3a6a8a"),
        B("Nose", "head", [0, 1.07, 0.26], [0.08, 0.11, 0.1], SKIN_D),
        B("Moustache", "head", [0, 1.0, 0.24], [0.24, 0.07, 0.07], wz_w),
        B("Beard 1", "head", [0, 0.9, 0.2], [0.28, 0.2, 0.16], wz_w),
        B("Beard 2", "head", [0, 0.74, 0.16], [0.24, 0.22, 0.14], wz_w),
        B("Beard 3", "head", [0, 0.58, 0.14], [0.16, 0.2, 0.12], "#e2e0d4"),
    ],
    extras=[
        B("Robe L", "body", [-0.3, 0.06, 0], [0.2, 0.5, 0.4], wz_bd, [0, 0, 10]),
        B("Robe R", "body", [0.3, 0.06, 0], [0.2, 0.5, 0.4], wz_bd, [0, 0, -10]),
        B("Sash", "body", [0, 0.28, 0], [0.6, 0.09, 0.42], wz_go),
        B("Staff", "lowerFR", [0.4, 0.24, 0.06], [0.06, 1.3, 0.06], "#6b4a2a"),
        B("Knot", "lowerFR", [0.4, 0.78, 0.06], [0.11, 0.13, 0.11], "#5a3d22"),
        B("Crystal", "lowerFR", [0.4, 0.93, 0.06], [0.13, 0.17, 0.13], "#8ce8ff"),
        B("Glow", "lowerFR", [0.4, 0.93, 0.06], [0.17, 0.09, 0.17], "#d8f8ff"),
    ],
    anim=anim_like(walk={"legSwing": 22, "speed": 1.9}, idle={"bob": 0.03, "speed": 1.2}),
))

# ---- 59 KNIGHT -------------------------------------------------------------
kn_s, kn_sd, kn_r, kn_go = "#c2c8d2", "#98a0ac", "#c8232f", "#f0c33a"
packs.append(humanoid(
    "Knight", uu=0.0535, bulk=1.12, limb=1.08,
    torso_fn=lambda wx, wy, wz: kn_sd if wz < -0.04 else kn_s,
    hip_c=kn_sd, shoulder_c=kn_s, neck_c=kn_sd,
    head_fn=lambda wx, wy, wz: kn_sd if (wz < -0.05 or wy > 1.28) else kn_s,
    arm_fn=solid(kn_s), elbow_c=kn_sd, fore_fn=solid(kn_s), hand_c=kn_sd,
    thigh_fn=solid(kn_sd), knee_c=kn_s, shin_fn=solid(kn_s),
    feet=sneakers(kn_sd, "#7d8590"),
    face=[
        B("Visor", "head", [0, 1.14, 0.235], [0.34, 0.09, 0.05], "#3f454e"),
        B("Visor bar", "head", [0, 1.14, 0.255], [0.05, 0.1, 0.04], kn_sd),
        B("Vent L", "head", [-0.07, 1.0, 0.245], [0.035, 0.13, 0.04], "#3f454e"),
        B("Vent R", "head", [0.07, 1.0, 0.245], [0.035, 0.13, 0.04], "#3f454e"),
        B("Crown", "head", [0, 1.36, 0], [0.4, 0.1, 0.44], kn_sd),
        B("Plume base", "head", [0, 1.44, -0.02], [0.11, 0.09, 0.13], kn_go),
        B("Plume 1", "head", [0, 1.56, -0.06], [0.13, 0.24, 0.15], kn_r),
        B("Plume 2", "head", [0, 1.7, -0.16], [0.12, 0.18, 0.16], "#a01d24", [26, 0, 0]),
    ],
    extras=[
        B("Belt", "body", [0, 0.28, 0], [0.62, 0.1, 0.44], "#6b4a2a"),
        B("Buckle", "body", [0, 0.28, 0.21], [0.13, 0.12, 0.06], kn_go),
        B("Pauldron L", "body", [-0.42, 0.76, 0], [0.18, 0.13, 0.36], kn_sd),
        B("Pauldron R", "body", [0.42, 0.76, 0], [0.18, 0.13, 0.36], kn_sd),
        # Sword right, kite shield left.
        B("Grip", "lowerFR", [0.4, 0.12, 0.06], [0.06, 0.18, 0.06], "#5a3d22"),
        B("Guard", "lowerFR", [0.4, 0.23, 0.06], [0.26, 0.06, 0.08], kn_go),
        B("Blade", "lowerFR", [0.4, 0.66, 0.06], [0.1, 0.82, 0.04], "#e0e6ee"),
        B("Blade tip", "lowerFR", [0.4, 1.12, 0.06], [0.06, 0.12, 0.04], "#f2f6fa"),
        B("Shield", "lowerFL", [-0.5, 0.22, 0.1], [0.1, 0.62, 0.5], kn_sd),
        B("Shield face", "lowerFL", [-0.55, 0.22, 0.1], [0.04, 0.5, 0.4], kn_r),
        B("Shield cross V", "lowerFL", [-0.58, 0.22, 0.1], [0.04, 0.4, 0.09], kn_go),
        B("Shield cross H", "lowerFL", [-0.58, 0.3, 0.1], [0.04, 0.09, 0.3], kn_go),
    ],
    anim=anim_like(walk={"legSwing": 23, "bodyBob": 0.1, "speed": 1.9}),
))

# ---- 60 ELF ----------------------------------------------------------------
el_g, el_gd, el_br, el_h = "#4a8a4a", "#376a37", "#6b4a2a", "#e8d99a"
packs.append(humanoid(
    "Elf", uu=0.0517, bulk=0.98,
    torso_fn=lambda wx, wy, wz: el_gd if wz < -0.04 else el_g,
    hip_c=el_br, shoulder_c=el_g, neck_c=SKIN_D,
    head_fn=lambda wx, wy, wz: (el_h if (wy > 1.22 or (wz < -0.02 and wy > 0.98)
                                         or (abs(wx) > 0.21 and wy > 1.04)) else SKIN),
    arm_fn=solid(el_g), elbow_c=el_gd, fore_fn=solid(SKIN), hand_c=SKIN,
    thigh_fn=solid("#5e7a4a"), knee_c="#4a6238", shin_fn=solid(el_br),
    feet=sneakers(el_br, "#4e3520"),
    face=eyes("#4a8a6a") + mouth("#c2564a", w=0.1) + [
        # Long swept ears, the elf's whole silhouette read.
        B("Ear L", "head", [-0.28, 1.16, -0.02], [0.14, 0.1, 0.11], SKIN, [0, 0, 26]),
        B("Ear R", "head", [0.28, 1.16, -0.02], [0.14, 0.1, 0.11], SKIN, [0, 0, -26]),
        B("Ear tip L", "head", [-0.38, 1.29, -0.04], [0.1, 0.07, 0.08], SKIN_D, [0, 0, 34]),
        B("Ear tip R", "head", [0.38, 1.29, -0.04], [0.1, 0.07, 0.08], SKIN_D, [0, 0, -34]),
        B("Hair back", "head", [0, 0.98, -0.2], [0.4, 0.34, 0.14], el_h),
        B("Brow L", "head", [-0.1, 1.215, 0.22], [0.1, 0.03, 0.05], "#c9b478"),
        B("Brow R", "head", [0.1, 1.215, 0.22], [0.1, 0.03, 0.05], "#c9b478"),
        B("Nose", "head", [0, 1.06, 0.25], [0.06, 0.08, 0.07], SKIN_D),
    ],
    extras=[
        B("Belt", "body", [0, 0.28, 0], [0.5, 0.08, 0.36], el_br),
        B("Clasp", "body", [0, 0.66, 0.14], [0.09, 0.09, 0.06], "#c9c9a8"),
        B("Quiver", "body", [-0.24, 0.6, -0.24], [0.15, 0.46, 0.15], el_br, [10, 0, 12]),
    ] + [
        B(f"Arrow {j}", "body", [-0.2 - j * 0.05, 0.9, -0.28], [0.03, 0.16, 0.03],
          "#e8e0c8", [10, 0, 12]) for j in range(3)
    ] + [
        B("Bow grip", "lowerFR", [0.37, 0.14, 0.14], [0.05, 0.18, 0.05], el_br),
        B("Bow arm T", "lowerFR", [0.37, 0.36, 0.1], [0.05, 0.32, 0.05], "#8a6a3a", [22, 0, 0]),
        B("Bow arm B", "lowerFR", [0.37, -0.08, 0.1], [0.05, 0.32, 0.05], "#8a6a3a", [-22, 0, 0]),
        B("String", "lowerFR", [0.37, 0.14, -0.06], [0.02, 0.78, 0.02], "#e8e4d8"),
    ],
    anim=anim_like(walk={"legSwing": 29, "speed": 2.5}, jump={"height": 1.6}),
))

# ---- 61 DWARF --------------------------------------------------------------
dw_br, dw_brd, dw_r, dw_s = "#7a5230", "#5e3d22", "#c85a2a", "#b9c0cc"
packs.append(humanoid(
    "Dwarf", uu=0.0572, bulk=1.34, limb=1.22, squat=0.52,
    torso_fn=lambda wx, wy, wz: dw_brd if wz < -0.04 else dw_br,
    hip_c=dw_brd, shoulder_c=dw_br, neck_c=dw_brd,
    head_fn=lambda wx, wy, wz: SKIN,
    arm_fn=solid(dw_br), elbow_c=dw_brd, fore_fn=solid(SKIN), hand_c=SKIN,
    thigh_fn=solid(dw_brd), knee_c="#4a3020", shin_fn=solid("#4a3020"),
    feet=sneakers("#3f2a1a", "#2b1c12", w=1.2),
    face=[
        B("Helm", "head", [0, 1.34, 0], [0.5, 0.16, 0.5], dw_s),
        B("Helm band", "head", [0, 1.22, 0], [0.52, 0.09, 0.52], "#98a0ac"),
        B("Helm wing L", "head", [-0.3, 1.42, -0.02], [0.14, 0.2, 0.11], dw_s, [0, 0, 26]),
        B("Helm wing R", "head", [0.3, 1.42, -0.02], [0.14, 0.2, 0.11], dw_s, [0, 0, -26]),
        B("Brow L", "head", [-0.11, 1.16, 0.22], [0.13, 0.05, 0.06], dw_r),
        B("Brow R", "head", [0.11, 1.16, 0.22], [0.13, 0.05, 0.06], dw_r),
        B("Eye L", "head", [-0.1, 1.09, 0.225], [0.07, 0.07, 0.04], "#ffffff"),
        B("Eye R", "head", [0.1, 1.09, 0.225], [0.07, 0.07, 0.04], "#ffffff"),
        B("Pupil L", "head", [-0.095, 1.09, 0.25], [0.04, 0.05, 0.03], "#3a2a18"),
        B("Pupil R", "head", [0.095, 1.09, 0.25], [0.04, 0.05, 0.03], "#3a2a18"),
        B("Nose", "head", [0, 1.02, 0.26], [0.11, 0.12, 0.11], SKIN_D),
        # The beard is most of the character.
        B("Beard 1", "head", [0, 0.9, 0.16], [0.4, 0.22, 0.24], dw_r),
        B("Beard 2", "head", [0, 0.72, 0.12], [0.36, 0.22, 0.2], dw_r),
        B("Beard 3", "head", [0, 0.56, 0.1], [0.26, 0.18, 0.16], "#a8481f"),
        B("Moustache", "head", [0, 0.99, 0.245], [0.3, 0.08, 0.09], dw_r),
    ],
    extras=[
        B("Belt", "body", [0, 0.26, 0], [0.74, 0.13, 0.52], "#3f2a1a"),
        B("Buckle", "body", [0, 0.26, 0.25], [0.16, 0.15, 0.06], "#e8b62c"),
        B("Haft", "lowerFR", [0.48, 0.02, 0.06], [0.07, 0.6, 0.07], "#5a3d22"),
        B("Axe head", "lowerFR", [0.48, 0.3, 0.2], [0.1, 0.34, 0.3], dw_s),
        B("Axe edge", "lowerFR", [0.48, 0.3, 0.37], [0.06, 0.3, 0.06], "#e0e6ee"),
        B("Axe back", "lowerFR", [0.48, 0.3, -0.06], [0.1, 0.2, 0.14], "#98a0ac"),
    ],
    anim=anim_like(walk={"legSwing": 28, "bodyBob": 0.12, "speed": 2.4},
                   idle={"bob": 0.04, "speed": 1.4}),
))

# ---- 62 ORC ----------------------------------------------------------------
or_g, or_gd, or_br, or_t = "#6a9a4a", "#4e7a34", "#6b4a2a", "#e8e0c0"
packs.append(humanoid(
    "Orc", uu=0.0605, bulk=1.38, limb=1.32,
    torso_fn=lambda wx, wy, wz: (or_br if (abs(wx) < 0.24 and wz > 0.02 and wy > 0.36)
                                 else (or_gd if wz < -0.04 else or_g)),
    hip_c=or_br, shoulder_c=or_g, neck_c=or_gd,
    head_fn=lambda wx, wy, wz: or_gd if (wz < -0.04 or wy > 1.28) else or_g,
    head_at=1.14, head_r=(0.26, 0.26, 0.24),
    arm_fn=solid(or_g), elbow_c=or_gd, fore_fn=solid(or_g), hand_c=or_g,
    thigh_fn=solid(or_br), knee_c="#4e3520", shin_fn=solid(or_g),
    feet=barefoot(or_g, or_t, w=1.15),
    face=[
        B("Ear L", "head", [-0.28, 1.18, -0.02], [0.11, 0.2, 0.1], or_g, [-8, 0, 28]),
        B("Ear R", "head", [0.28, 1.18, -0.02], [0.11, 0.2, 0.1], or_g, [-8, 0, -28]),
        B("Brow L", "head", [-0.12, 1.24, 0.2], [0.15, 0.07, 0.07], or_gd, [0, 0, -20]),
        B("Brow R", "head", [0.12, 1.24, 0.2], [0.15, 0.07, 0.07], or_gd, [0, 0, 20]),
        B("Eye L", "head", [-0.1, 1.15, 0.22], [0.08, 0.07, 0.04], "#f2d13a"),
        B("Eye R", "head", [0.1, 1.15, 0.22], [0.08, 0.07, 0.04], "#f2d13a"),
        B("Pupil L", "head", [-0.095, 1.15, 0.245], [0.04, 0.05, 0.03], "#1c1c1c"),
        B("Pupil R", "head", [0.095, 1.15, 0.245], [0.04, 0.05, 0.03], "#1c1c1c"),
        B("Nose", "head", [0, 1.06, 0.25], [0.12, 0.09, 0.09], or_gd),
        B("Jaw", "head", [0, 0.94, 0.18], [0.28, 0.12, 0.14], or_g),
        B("Mouth", "head", [0, 0.97, 0.24], [0.2, 0.04, 0.05], "#2b1c14"),
        # Tusks jutting up out of the lower jaw.
        B("Tusk L", "head", [-0.1, 1.02, 0.24], [0.06, 0.14, 0.06], or_t, [0, 0, 10]),
        B("Tusk R", "head", [0.1, 1.02, 0.24], [0.06, 0.14, 0.06], or_t, [0, 0, -10]),
    ],
    extras=[
        B("Strap", "body", [0, 0.5, 0], [0.7, 0.11, 0.46], or_br, [0, 0, 34]),
        B("Belt", "body", [0, 0.28, 0], [0.76, 0.12, 0.54], "#4e3520"),
        B("Shoulder L", "body", [-0.44, 0.78, 0], [0.2, 0.14, 0.4], or_br),
        B("Spike L", "body", [-0.46, 0.9, 0], [0.09, 0.14, 0.09], or_t),
        B("Club", "lowerFR", [0.5, -0.04, 0.06], [0.12, 0.6, 0.12], "#5a3d22"),
        B("Club head", "lowerFR", [0.5, -0.36, 0.06], [0.24, 0.28, 0.24], "#4a3220"),
    ] + [
        B(f"Stud {j}", "lowerFR", [0.5 + (j - 1) * 0.11, -0.36, 0.2], [0.06, 0.06, 0.06], or_t)
        for j in range(3)
    ],
    anim=anim_like(idle={"bob": 0.045, "speed": 1.3},
                   walk={"legSwing": 24, "bodyBob": 0.12, "speed": 2.0}),
))

# ---- 63 PIRATE -------------------------------------------------------------
pi_r, pi_rd, pi_k, pi_w = "#a83a3a", "#822a2a", "#2b2b32", "#f0ecdc"
pi_br, pi_go = "#6b4a2a", "#f0c33a"
packs.append(humanoid(
    "Pirate", uu=0.0518, bulk=1.05,
    torso_fn=lambda wx, wy, wz: (pi_w if (abs(wx) < 0.12 and wz > 0.05) else
                                 (pi_rd if wz < -0.04 else pi_r)),
    hip_c=pi_k, shoulder_c=pi_r, neck_c=pi_w,
    head_fn=lambda wx, wy, wz: ("#2b2118" if (wz < -0.03 and wy > 1.08) else SKIN),
    arm_fn=solid(pi_r), elbow_c=pi_rd, fore_fn=solid(pi_w), hand_c=SKIN,
    thigh_fn=solid(pi_k), knee_c="#1c1c22", shin_fn=solid(pi_br),
    feet=sneakers(pi_br, "#4e3520", w=1.1),
    face=[
        B("Hat brim", "head", [0, 1.32, -0.02], [0.62, 0.08, 0.56], pi_k),
        B("Hat crown", "head", [0, 1.42, -0.02], [0.4, 0.16, 0.36], pi_k),
        B("Hat front", "head", [0, 1.4, 0.24], [0.34, 0.16, 0.12], pi_k, [22, 0, 0]),
        B("Skull", "head", [0, 1.4, 0.31], [0.11, 0.11, 0.05], pi_w),
        B("Skull jaw", "head", [0, 1.32, 0.3], [0.08, 0.05, 0.05], pi_w),
        B("Patch", "head", [-0.11, 1.15, 0.235], [0.13, 0.11, 0.04], pi_k),
        B("Patch strap", "head", [0, 1.2, 0.02], [0.5, 0.04, 0.46], pi_k),
        B("Eye R", "head", [0.1, 1.14, 0.23], [0.085, 0.09, 0.04], "#ffffff"),
        B("Pupil R", "head", [0.095, 1.14, 0.26], [0.05, 0.07, 0.03], "#3a2a18"),
        B("Nose", "head", [0, 1.06, 0.25], [0.07, 0.08, 0.07], SKIN_D),
        B("Beard", "head", [0, 0.93, 0.2], [0.24, 0.14, 0.14], "#2b2118"),
        B("Earring", "head", [-0.26, 1.06, 0.02], [0.05, 0.08, 0.05], pi_go),
    ],
    extras=[
        B("Sash", "body", [0, 0.3, 0], [0.62, 0.14, 0.44], pi_go),
        B("Baldric", "body", [0, 0.52, 0], [0.68, 0.1, 0.44], pi_br, [0, 0, -34]),
        B("Lapel L", "body", [-0.16, 0.6, 0.16], [0.13, 0.26, 0.06], pi_rd, [0, 0, 12]),
        B("Lapel R", "body", [0.16, 0.6, 0.16], [0.13, 0.26, 0.06], pi_rd, [0, 0, -12]),
        B("Grip", "lowerFR", [0.4, 0.12, 0.06], [0.06, 0.16, 0.06], pi_br),
        B("Guard", "lowerFR", [0.4, 0.22, 0.06], [0.2, 0.06, 0.14], pi_go),
        B("Cutlass", "lowerFR", [0.4, 0.56, 0.1], [0.09, 0.6, 0.04], "#e0e6ee", [12, 0, 0]),
        B("Cutlass tip", "lowerFR", [0.4, 0.88, 0.2], [0.06, 0.16, 0.04], "#f2f6fa", [30, 0, 0]),
    ],
    anim=anim_like(walk={"legSwing": 28, "bodyBob": 0.1, "speed": 2.2}),
))

# ---- 64 WITCH --------------------------------------------------------------
wi_p, wi_pd, wi_k, wi_g = "#5e3a8a", "#472a6b", "#26242e", "#7aa84a"
packs.append(humanoid(
    "Witch", uu=0.0518,
    torso_fn=lambda wx, wy, wz: wi_pd if wz < -0.04 else wi_p,
    hip_c=wi_k, shoulder_c=wi_p, neck_c=wi_g,
    head_fn=lambda wx, wy, wz: ("#2b1f2e" if (wz < -0.03 and wy > 1.02) else wi_g),
    arm_fn=solid(wi_p), elbow_c=wi_pd, fore_fn=solid(wi_pd), hand_c=wi_g,
    thigh_fn=solid(wi_k), knee_c="#1a1920", shin_fn=solid(wi_k),
    feet=sneakers(wi_k, "#1a1920"),
    face=cone_hat(1.36, 0.5, 0.22, wi_k, trim=wi_p, brim=wi_k) + [
        B("Hair L", "head", [-0.26, 0.98, -0.06], [0.13, 0.36, 0.2], "#2b1f2e"),
        B("Hair R", "head", [0.26, 0.98, -0.06], [0.13, 0.36, 0.2], "#2b1f2e"),
        B("Brow L", "head", [-0.1, 1.22, 0.22], [0.11, 0.035, 0.05], "#2b1f2e", [0, 0, -18]),
        B("Brow R", "head", [0.1, 1.22, 0.22], [0.11, 0.035, 0.05], "#2b1f2e", [0, 0, 18]),
        B("Eye L", "head", [-0.1, 1.15, 0.225], [0.08, 0.08, 0.04], "#f2d13a"),
        B("Eye R", "head", [0.1, 1.15, 0.225], [0.08, 0.08, 0.04], "#f2d13a"),
        B("Pupil L", "head", [-0.095, 1.15, 0.25], [0.04, 0.055, 0.03], "#1c1c1c"),
        B("Pupil R", "head", [0.095, 1.15, 0.25], [0.04, 0.055, 0.03], "#1c1c1c"),
        B("Nose", "head", [0, 1.04, 0.28], [0.07, 0.09, 0.16], "#6b9a3f"),
        B("Wart", "head", [0.05, 1.06, 0.33], [0.04, 0.04, 0.04], "#5a8434"),
        B("Grin", "head", [0, 0.95, 0.23], [0.16, 0.04, 0.04], "#3a2b18"),
        B("Tooth", "head", [-0.05, 0.97, 0.24], [0.035, 0.045, 0.04], "#f0ecdc"),
    ],
    extras=[
        B("Robe L", "body", [-0.3, 0.06, 0], [0.2, 0.5, 0.4], wi_pd, [0, 0, 10]),
        B("Robe R", "body", [0.3, 0.06, 0], [0.2, 0.5, 0.4], wi_pd, [0, 0, -10]),
        B("Belt", "body", [0, 0.28, 0], [0.56, 0.09, 0.4], "#3a2b18"),
        B("Broom", "lowerFR", [0.4, 0.3, 0.06], [0.06, 1.2, 0.06], "#8a6a3a", [0, 0, 6]),
        B("Bristles", "lowerFR", [0.44, -0.36, 0.06], [0.2, 0.34, 0.2], "#c9a45a"),
        B("Bristle tip", "lowerFR", [0.46, -0.58, 0.06], [0.14, 0.16, 0.14], "#a8863f"),
        B("Binding", "lowerFR", [0.42, -0.16, 0.06], [0.11, 0.08, 0.11], "#5a3d22"),
    ],
    anim=anim_like(walk={"legSwing": 26, "speed": 2.2}, idle={"bob": 0.04, "speed": 1.6}),
))

# ---- 65 VIKING -------------------------------------------------------------
vk_br, vk_brd, vk_f, vk_s = "#7a5230", "#5a3d22", "#c9bda6", "#b9c0cc"
vk_r = "#c85a2a"
packs.append(humanoid(
    "Viking", uu=0.0562, bulk=1.2, limb=1.16,
    torso_fn=lambda wx, wy, wz: (vk_s if (abs(wx) < 0.24 and wz > 0.02 and wy > 0.34)
                                 else (vk_brd if wz < -0.04 else vk_br)),
    hip_c=vk_brd, shoulder_c=vk_f, neck_c=vk_brd,
    head_fn=lambda wx, wy, wz: SKIN,
    arm_fn=solid(vk_br), elbow_c=vk_brd, fore_fn=solid(SKIN), hand_c=SKIN,
    thigh_fn=solid(vk_brd), knee_c="#4a3020", shin_fn=solid(vk_br),
    feet=sneakers("#4a3020", "#33220f", w=1.1),
    face=[
        B("Helm", "head", [0, 1.3, 0], [0.5, 0.2, 0.5], vk_s),
        B("Helm rim", "head", [0, 1.18, 0], [0.52, 0.08, 0.52], "#98a0ac"),
        B("Nasal", "head", [0, 1.14, 0.26], [0.07, 0.18, 0.06], vk_s),
        # Curved horns off the helm.
        B("Horn L", "head", [-0.33, 1.34, 0], [0.2, 0.11, 0.11], vk_f, [0, 0, 22]),
        B("Horn R", "head", [0.33, 1.34, 0], [0.2, 0.11, 0.11], vk_f, [0, 0, -22]),
        B("Horn tip L", "head", [-0.47, 1.5, 0], [0.1, 0.2, 0.1], "#e2dcc4", [0, 0, 34]),
        B("Horn tip R", "head", [0.47, 1.5, 0], [0.1, 0.2, 0.1], "#e2dcc4", [0, 0, -34]),
        B("Eye L", "head", [-0.1, 1.08, 0.225], [0.075, 0.08, 0.04], "#ffffff"),
        B("Eye R", "head", [0.1, 1.08, 0.225], [0.075, 0.08, 0.04], "#ffffff"),
        B("Pupil L", "head", [-0.095, 1.08, 0.25], [0.04, 0.055, 0.03], "#3a6a8a"),
        B("Pupil R", "head", [0.095, 1.08, 0.25], [0.04, 0.055, 0.03], "#3a6a8a"),
        B("Beard 1", "head", [0, 0.94, 0.17], [0.38, 0.2, 0.22], vk_r),
        B("Beard 2", "head", [0, 0.78, 0.14], [0.32, 0.2, 0.18], vk_r),
        B("Beard 3", "head", [0, 0.64, 0.12], [0.22, 0.16, 0.14], "#a8481f"),
        B("Moustache", "head", [0, 1.0, 0.25], [0.28, 0.08, 0.08], vk_r),
    ],
    extras=[
        B("Fur collar", "body", [0, 0.76, -0.02], [0.72, 0.18, 0.46], vk_f),
        B("Belt", "body", [0, 0.28, 0], [0.68, 0.12, 0.48], "#3f2a1a"),
        B("Buckle", "body", [0, 0.28, 0.23], [0.14, 0.13, 0.06], "#e8b62c"),
        B("Haft", "lowerFR", [0.44, 0.06, 0.06], [0.07, 0.66, 0.07], "#5a3d22"),
        B("Axe head", "lowerFR", [0.44, 0.36, 0.22], [0.09, 0.32, 0.3], vk_s),
        B("Axe edge", "lowerFR", [0.44, 0.36, 0.39], [0.05, 0.28, 0.06], "#e0e6ee"),
        B("Shield", "lowerFL", [-0.5, 0.2, 0.06], [0.11, 0.56, 0.56], vk_br),
        B("Shield face", "lowerFL", [-0.56, 0.2, 0.06], [0.04, 0.46, 0.46], vk_r),
        B("Shield boss", "lowerFL", [-0.6, 0.2, 0.06], [0.05, 0.14, 0.14], vk_s),
        B("Shield rim", "lowerFL", [-0.55, 0.2, 0.06], [0.05, 0.56, 0.56], "#4a3020"),
    ],
    anim=anim_like(walk={"legSwing": 25, "bodyBob": 0.12, "speed": 2.1},
                   idle={"bob": 0.04, "speed": 1.3}),
))

# ---- 66 GRIFFIN ------------------------------------------------------------
set_u(0.0797)
gf_t, gf_td, gf_w, gf_go = "#d9a85e", "#b8873f", "#f4f2e8", "#f0b93c"
packs.append(quadruped(
    "Griffin", gf_t, "#e8c98e", gf_w, size=1.04,
    body_pat=lambda wx, wy, wz: gf_w if wz > 0.4 else None,  # feathered forequarters
    head_at=(0, 0.72, 0.8), head_r=(0.34, 0.32, 0.32),
    head_pat=lambda wx, wy, wz: "#e2ded0" if wy < 0.6 else None,
    muzzle=[
        B("Beak top", "head", [0, 0.66, 1.12], [0.22, 0.14, 0.28], gf_go),
        B("Beak hook", "head", [0, 0.56, 1.24], [0.16, 0.14, 0.12], "#d9a12c", [26, 0, 0]),
        B("Beak low", "head", [0, 0.54, 1.06], [0.18, 0.08, 0.2], "#d9a12c"),
        B("Eye L", "head", [-0.22, 0.82, 1.0], [0.12, 0.13, 0.07], "#f2c341"),
        B("Eye R", "head", [0.22, 0.82, 1.0], [0.12, 0.13, 0.07], "#f2c341"),
        B("Pupil L", "head", [-0.22, 0.82, 1.05], [0.06, 0.08, 0.04], "#1c1c1c"),
        B("Pupil R", "head", [0.22, 0.82, 1.05], [0.06, 0.08, 0.04], "#1c1c1c"),
        B("Crest L", "head", [-0.2, 1.02, 0.68], [0.14, 0.14, 0.16], gf_w),
        B("Crest R", "head", [0.2, 1.02, 0.68], [0.14, 0.14, 0.16], gf_w),
    ],
    ears=[
        B("Wing arm L", "ear", [-0.58, 0.68, -0.1], [0.5, 0.12, 0.16], gf_td, [0, 0, 22]),
        B("Wing arm R", "ear", [0.58, 0.68, -0.1], [0.5, 0.12, 0.16], gf_td, [0, 0, -22]),
        B("Wing L", "ear", [-0.94, 0.62, -0.3], [0.16, 0.6, 0.9], gf_w, [0, 0, 26]),
        B("Wing R", "ear", [0.94, 0.62, -0.3], [0.16, 0.6, 0.9], gf_w, [0, 0, -26]),
        B("Wing tip L", "ear", [-1.24, 0.44, -0.5], [0.13, 0.44, 0.66], "#e2ded0", [0, 0, 38]),
        B("Wing tip R", "ear", [1.24, 0.44, -0.5], [0.13, 0.44, 0.66], "#e2ded0", [0, 0, -38]),
    ],
    tail=[
        B("Tail 1", "tail", [0, 0.16, -0.94], [0.2, 0.2, 0.3], gf_t),
        B("Tail 2", "tail", [0, 0.12, -1.2], [0.16, 0.16, 0.3], gf_td),
        B("Tuft", "tail", [0, 0.1, -1.45], [0.26, 0.26, 0.24], gf_w),
    ],
    legs=legs4(0.36, -0.54, 0.46, -0.44, [0.24, 0.4, 0.24], gf_t,
               feet=[0.28, 0.12, 0.32], foot_color=gf_go),
    anim={"walk": {"legSwing": 34, "speed": 2.5}, "jump": {"height": 1.9}},
))

# ---- 67 PEGASUS ------------------------------------------------------------
set_u(0.0723)
pg_w, pg_s, pg_go = "#f6f5f0", "#dfe4ee", "#f0c33a"
pg_neck = [
    B("Neck 1", "body", [0, 0.44, 0.6], [0.36, 0.42, 0.36], pg_w, [26, 0, 0]),
    B("Neck 2", "body", [0, 0.72, 0.74], [0.3, 0.4, 0.32], pg_w, [26, 0, 0]),
] + [B(f"Mane {i+1}", "body", [0, 0.42 + i * 0.15, 0.36 + i * 0.085], [0.16, 0.3, 0.26],
       pg_s if i % 2 else "#c9d4e8", [26, 0, 0]) for i in range(4)]
packs.append(quadruped(
    "Pegasus", pg_w, pg_s, pg_w, size=1.06, wob=0.15,
    body_r=(0.4, 0.42, 0.9),
    head_at=(0, 1.0, 0.94), head_r=(0.23, 0.28, 0.32),
    muzzle=pg_neck + [
        B("Muzzle", "head", [0, 0.86, 1.24], [0.22, 0.24, 0.22], pg_w),
        B("Nose", "head", [0, 0.8, 1.36], [0.18, 0.13, 0.1], "#c9c4d4"),
        B("Forelock", "head", [0, 1.22, 0.9], [0.17, 0.14, 0.22], pg_s),
        B("Eye L", "head", [-0.19, 1.1, 1.06], [0.09, 0.1, 0.06], "#3a5a8a"),
        B("Eye R", "head", [0.19, 1.1, 1.06], [0.09, 0.1, 0.06], "#3a5a8a"),
    ],
    ears=[
        B("Ear L", "ear", [-0.14, 1.34, 0.88], [0.1, 0.19, 0.1], pg_w),
        B("Ear R", "ear", [0.14, 1.34, 0.88], [0.1, 0.19, 0.1], pg_w),
        B("Wing arm L", "ear", [-0.5, 0.62, 0.06], [0.44, 0.12, 0.16], pg_s, [0, 0, 24]),
        B("Wing arm R", "ear", [0.5, 0.62, 0.06], [0.44, 0.12, 0.16], pg_s, [0, 0, -24]),
        B("Wing L", "ear", [-0.86, 0.58, -0.16], [0.15, 0.66, 0.86], pg_w, [0, 0, 28]),
        B("Wing R", "ear", [0.86, 0.58, -0.16], [0.15, 0.66, 0.86], pg_w, [0, 0, -28]),
        B("Wing tip L", "ear", [-1.16, 0.4, -0.4], [0.12, 0.48, 0.62], pg_s, [0, 0, 40]),
        B("Wing tip R", "ear", [1.16, 0.4, -0.4], [0.12, 0.48, 0.62], pg_s, [0, 0, -40]),
    ],
    tail=[B(f"Tail {i+1}", "tail", [0, 0.34 - i * 0.14, -0.94 - i * 0.02],
            [0.26, 0.3, 0.28], pg_s if i % 2 else "#c9d4e8") for i in range(4)],
    legs=legs4(0.3, -0.6, 0.46, -0.46, [0.2, 0.52, 0.2], pg_w,
               feet=[0.22, 0.12, 0.24], foot_color=pg_go),
    anim={"walk": {"legSwing": 40, "speed": 2.5}, "jump": {"height": 2.1}},
))

# ---- 68 CERBERUS -----------------------------------------------------------
# Three heads on one head role: they merge into a single group that nods as one.
set_u(0.0813)
cb_k, cb_kd, cb_r = "#33333c", "#22222a", "#d94a2a"
v = Vox()
v.ellipsoid(0, 0.14, -0.1, 0.5, 0.44, 0.82, lambda wx, wy, wz: cb_kd if wy > 0.34 else cb_k, wob=0.22)
cerb = v.merge("body", "Body")
hv = Vox()
for hxx, hzz in ((-0.4, 0.6), (0, 0.78), (0.4, 0.6)):
    hv.ellipsoid(hxx, 0.62, hzz, 0.26, 0.25, 0.26, solid(cb_k), wob=0.18, seed=9)
    hv.box(hxx - 0.13, 0.44, hzz + 0.16, hxx + 0.13, 0.62, hzz + 0.42, solid(cb_kd))
cerb += hv.merge("head", "Head")
for i, (hxx, hzz) in enumerate(((-0.4, 0.6), (0, 0.78), (0.4, 0.6))):
    cerb += [
        B(f"Nose {i}", "head", [hxx, 0.56, hzz + 0.44], [0.13, 0.1, 0.08], "#141419"),
        B(f"Eye L{i}", "head", [hxx - 0.13, 0.74, hzz + 0.2], [0.09, 0.1, 0.06], cb_r),
        B(f"Eye R{i}", "head", [hxx + 0.13, 0.74, hzz + 0.2], [0.09, 0.1, 0.06], cb_r),
        B(f"Glow L{i}", "head", [hxx - 0.13, 0.74, hzz + 0.24], [0.05, 0.06, 0.04], "#ffb07a"),
        B(f"Glow R{i}", "head", [hxx + 0.13, 0.74, hzz + 0.24], [0.05, 0.06, 0.04], "#ffb07a"),
        B(f"Fang L{i}", "head", [hxx - 0.08, 0.42, hzz + 0.36], [0.05, 0.1, 0.05], "#f0ecdc"),
        B(f"Fang R{i}", "head", [hxx + 0.08, 0.42, hzz + 0.36], [0.05, 0.1, 0.05], "#f0ecdc"),
        B(f"Ear L{i}", "ear", [hxx - 0.19, 0.9, hzz - 0.06], [0.13, 0.2, 0.09], cb_kd),
        B(f"Ear R{i}", "ear", [hxx + 0.19, 0.9, hzz - 0.06], [0.13, 0.2, 0.09], cb_kd),
    ]
cerb += [B(f"Tail {i+1}", "tail", [0, 0.3 + i * 0.06, -0.9 - i * 0.22],
           [0.2 - i * 0.03, 0.2 - i * 0.03, 0.26], cb_kd if i % 2 else cb_k) for i in range(4)]
cerb += legs4(0.38, -0.5, 0.48, -0.48, [0.26, 0.42, 0.26], cb_k,
              feet=[0.3, 0.12, 0.32], foot_color=cb_kd)
packs.append(design("Cerberus", cerb, {"idle": {"bob": 0.05, "speed": 1.5},
                                       "walk": {"legSwing": 34, "bodyBob": 0.1, "speed": 2.6},
                                       "jump": {"height": 1.5, "tuck": 30, "speed": 0.95}}))

# ---- 69 PHOENIX ------------------------------------------------------------
set_u(0.0534)
ph_r, ph_o, ph_y, ph_w = "#d93a2a", "#f0872a", "#f6c93a", "#fff0b0"
def phoenix_fire(wx, wy, wz):
    """Heat gradient: red at the belly, through orange, to white at the crown."""
    if wy > 0.72:
        return ph_y
    if wy > 0.42:
        return ph_o
    return ph_r
packs.append(quadruped(
    "Phoenix", ph_o, ph_r, ph_y, size=0.86,
    body_at=(0, 0.24, -0.02), body_r=(0.34, 0.44, 0.36),
    body_pat=phoenix_fire,
    head_at=(0, 0.86, 0.26), head_r=(0.24, 0.24, 0.26),
    head_pat=lambda wx, wy, wz: ph_w if wy > 0.94 else None,
    muzzle=[
        B("Beak top", "head", [0, 0.84, 0.54], [0.13, 0.09, 0.24], "#f0b93c"),
        B("Beak low", "head", [0, 0.76, 0.5], [0.11, 0.06, 0.18], "#d9a12c"),
        B("Eye L", "head", [-0.15, 0.94, 0.42], [0.1, 0.11, 0.06], "#fff0b0"),
        B("Eye R", "head", [0.15, 0.94, 0.42], [0.1, 0.11, 0.06], "#fff0b0"),
        B("Pupil L", "head", [-0.15, 0.94, 0.46], [0.05, 0.06, 0.04], "#8a2a14"),
        B("Pupil R", "head", [0.15, 0.94, 0.46], [0.05, 0.06, 0.04], "#8a2a14"),
        B("Crest 1", "head", [0, 1.12, 0.18], [0.09, 0.24, 0.12], ph_y, [-18, 0, 0]),
        B("Crest 2", "head", [0, 1.24, 0.02], [0.08, 0.2, 0.12], ph_w, [-34, 0, 0]),
        B("Crest 3", "head", [-0.12, 1.14, 0.06], [0.07, 0.18, 0.1], ph_o, [-24, 0, 18]),
        B("Crest 4", "head", [0.12, 1.14, 0.06], [0.07, 0.18, 0.1], ph_o, [-24, 0, -18]),
    ],
    ears=[
        # Fire runs red at the shoulder out to yellow at the tip, not the other
        # way round — pale outer feathers washed the whole bird out.
        B("Wing arm L", "ear", [-0.42, 0.44, -0.02], [0.4, 0.12, 0.2], ph_r, [0, 0, 20]),
        B("Wing arm R", "ear", [0.42, 0.44, -0.02], [0.4, 0.12, 0.2], ph_r, [0, 0, -20]),
        B("Wing L", "ear", [-0.76, 0.5, -0.16], [0.14, 0.68, 0.6], ph_o, [0, 0, 28]),
        B("Wing R", "ear", [0.76, 0.5, -0.16], [0.14, 0.68, 0.6], ph_o, [0, 0, -28]),
        B("Wing tip L", "ear", [-1.04, 0.66, -0.34], [0.12, 0.56, 0.44], ph_y, [0, 0, 42]),
        B("Wing tip R", "ear", [1.04, 0.66, -0.34], [0.12, 0.56, 0.44], ph_y, [0, 0, -42]),
    ],
    tail=[
        B("Tail 1", "tail", [0, 0.3, -0.46], [0.28, 0.22, 0.34], ph_o),
        B("Plume C", "tail", [0, 0.44, -0.86], [0.12, 0.5, 0.5], ph_o, [-22, 0, 0]),
        B("Plume L", "tail", [-0.24, 0.3, -0.8], [0.11, 0.4, 0.44], ph_r, [-16, 0, 20]),
        B("Plume R", "tail", [0.24, 0.3, -0.8], [0.11, 0.4, 0.44], ph_r, [-16, 0, -20]),
        B("Plume tip", "tail", [0, 0.72, -1.24], [0.1, 0.42, 0.42], ph_w, [-34, 0, 0]),
    ],
    legs=legs4(0.17, -0.34, 0.14, -0.14, [0.1, 0.28, 0.1], "#f0b93c",
               feet=[0.14, 0.07, 0.2], foot_color="#d9a12c"),
    anim={"idle": {"bob": 0.06, "speed": 2.0},
          "walk": {"legSwing": 24, "bodyBob": 0.14, "speed": 3.0},
          "jump": {"height": 2.2, "tuck": 24, "speed": 0.95}},
))

# ---- 70 YETI ---------------------------------------------------------------
yt_w, yt_s, yt_k, yt_b = "#eef1f4", "#d2d9e2", "#3a3f48", "#a8c4d8"
def yeti_fur(wx, wy, wz):
    if hash01(round(wx / 0.13), round(wy / 0.13), round(wz / 0.13)) > 0.62:
        return yt_s
    return yt_w
packs.append(humanoid(
    "Yeti", uu=0.0632, bulk=1.5, limb=1.44,
    torso_fn=yeti_fur, hip_c=yt_s, shoulder_c=yt_w, neck_c=yt_s,
    head_fn=lambda wx, wy, wz: (yt_b if (wz > 0.08 and 0.95 < wy < 1.24 and abs(wx) < 0.2)
                                else yeti_fur(wx, wy, wz)),
    head_at=1.14, head_r=(0.26, 0.26, 0.24),
    arm_fn=yeti_fur, elbow_c=yt_s, fore_fn=yeti_fur, hand_c=yt_s,
    thigh_fn=yeti_fur, knee_c=yt_s, shin_fn=yeti_fur,
    feet=barefoot(yt_s, "#c2ccd8", w=1.3),
    face=[
        B("Brow L", "head", [-0.12, 1.24, 0.2], [0.16, 0.08, 0.08], yt_w, [0, 0, -14]),
        B("Brow R", "head", [0.12, 1.24, 0.2], [0.16, 0.08, 0.08], yt_w, [0, 0, 14]),
        B("Eye L", "head", [-0.11, 1.16, 0.225], [0.09, 0.08, 0.04], "#ffffff"),
        B("Eye R", "head", [0.11, 1.16, 0.225], [0.09, 0.08, 0.04], "#ffffff"),
        B("Pupil L", "head", [-0.105, 1.16, 0.25], [0.045, 0.055, 0.03], "#2b3a4a"),
        B("Pupil R", "head", [0.105, 1.16, 0.25], [0.045, 0.055, 0.03], "#2b3a4a"),
        B("Nose", "head", [0, 1.07, 0.25], [0.12, 0.09, 0.09], "#8fb0c8"),
        B("Mouth", "head", [0, 0.97, 0.235], [0.24, 0.07, 0.05], yt_k),
        B("Tooth L", "head", [-0.07, 0.995, 0.25], [0.05, 0.06, 0.04], "#ffffff"),
        B("Tooth R", "head", [0.07, 0.995, 0.25], [0.05, 0.06, 0.04], "#ffffff"),
        B("Horn L", "head", [-0.24, 1.34, 0.02], [0.09, 0.16, 0.09], "#e2e8ee", [0, 0, 18]),
        B("Horn R", "head", [0.24, 1.34, 0.02], [0.09, 0.16, 0.09], "#e2e8ee", [0, 0, -18]),
    ],
    extras=[
        B("Shag L", "body", [-0.46, 0.62, 0], [0.16, 0.3, 0.34], yt_s),
        B("Shag R", "body", [0.46, 0.62, 0], [0.16, 0.3, 0.34], yt_s),
        B("Chest tuft", "body", [0, 0.66, 0.22], [0.3, 0.24, 0.12], yt_s),
    ],
    anim=anim_like(idle={"bob": 0.05, "speed": 1.2},
                   walk={"legSwing": 23, "bodyBob": 0.13, "speed": 1.9},
                   jump={"height": 1.4, "tuck": 24, "speed": 0.85}),
))

# ---- 71 WEREWOLF -----------------------------------------------------------
wf_g, wf_gd, wf_c, wf_k = "#6b6259", "#4e463f", "#c9c0b2", "#26242a"
def wolf_fur(wx, wy, wz):
    if hash01(round(wx / 0.12), round(wy / 0.12), round(wz / 0.12)) > 0.7:
        return wf_gd
    return wf_g
packs.append(humanoid(
    "Werewolf", uu=0.0575, bulk=1.28, limb=1.24,
    torso_fn=lambda wx, wy, wz: wf_c if (wz > 0.06 and abs(wx) < 0.18) else wolf_fur(wx, wy, wz),
    hip_c=wf_gd, shoulder_c=wf_g, neck_c=wf_gd,
    head_fn=wolf_fur, head_at=1.14, head_r=(0.25, 0.25, 0.25),
    arm_fn=wolf_fur, elbow_c=wf_gd, fore_fn=wolf_fur, hand_c=wf_gd,
    thigh_fn=wolf_fur, knee_c=wf_gd, shin_fn=wolf_fur,
    feet=barefoot(wf_gd, "#d8d2c4", w=1.2),
    face=[
        # Muzzle built forward off the skull, with the jaw under it.
        B("Muzzle", "head", [0, 1.06, 0.36], [0.2, 0.16, 0.24], wf_g),
        B("Muzzle top", "head", [0, 1.14, 0.32], [0.16, 0.08, 0.2], wf_gd),
        B("Nose", "head", [0, 1.09, 0.5], [0.11, 0.09, 0.07], "#141419"),
        B("Jaw", "head", [0, 0.96, 0.32], [0.17, 0.07, 0.2], wf_c),
        B("Fang L", "head", [-0.07, 0.99, 0.45], [0.045, 0.09, 0.045], "#ffffff"),
        B("Fang R", "head", [0.07, 0.99, 0.45], [0.045, 0.09, 0.045], "#ffffff"),
        B("Brow L", "head", [-0.13, 1.25, 0.16], [0.15, 0.07, 0.09], wf_gd, [0, 0, -16]),
        B("Brow R", "head", [0.13, 1.25, 0.16], [0.15, 0.07, 0.09], wf_gd, [0, 0, 16]),
        B("Eye L", "head", [-0.12, 1.18, 0.2], [0.09, 0.08, 0.05], "#f2c341"),
        B("Eye R", "head", [0.12, 1.18, 0.2], [0.09, 0.08, 0.05], "#f2c341"),
        B("Pupil L", "head", [-0.12, 1.18, 0.235], [0.04, 0.055, 0.03], "#1c1c1c"),
        B("Pupil R", "head", [0.12, 1.18, 0.235], [0.04, 0.055, 0.03], "#1c1c1c"),
        B("Ear L", "head", [-0.19, 1.38, -0.04], [0.12, 0.22, 0.1], wf_g, [-8, 0, 12]),
        B("Ear R", "head", [0.19, 1.38, -0.04], [0.12, 0.22, 0.1], wf_g, [-8, 0, -12]),
        B("Ear in L", "head", [-0.19, 1.36, 0.01], [0.06, 0.14, 0.06], wf_c, [-8, 0, 12]),
        B("Ear in R", "head", [0.19, 1.36, 0.01], [0.06, 0.14, 0.06], wf_c, [-8, 0, -12]),
    ],
    extras=[
        B("Ruff L", "body", [-0.3, 0.76, -0.04], [0.22, 0.2, 0.3], wf_gd),
        B("Ruff R", "body", [0.3, 0.76, -0.04], [0.22, 0.2, 0.3], wf_gd),
        B("Shorts", "body", [0, 0.16, 0], [0.7, 0.22, 0.5], "#5a3d22"),
        B("Tail 1", "tail", [0, 0.16, -0.34], [0.24, 0.24, 0.3], wf_g),
        B("Tail 2", "tail", [0, 0.06, -0.62], [0.2, 0.2, 0.3], wf_gd),
        B("Tail tip", "tail", [0, -0.02, -0.86], [0.16, 0.16, 0.24], wf_c),
    ] + [
        B(f"Claw {r}{j}", r, [x + (j - 1) * 0.07, 0.05, 0.14], [0.045, 0.06, 0.14], "#e8e2d4")
        for r, x in (("lowerFL", -0.39), ("lowerFR", 0.39)) for j in range(3)
    ],
    anim=anim_like(idle={"bob": 0.045, "speed": 1.6},
                   walk={"legSwing": 30, "bodyBob": 0.12, "speed": 2.8},
                   jump={"height": 1.8, "tuck": 32}),
))

# ---- 72 MINOTAUR -----------------------------------------------------------
mn_br, mn_brd, mn_h, mn_r = "#7a4a2a", "#5c3520", "#e8ddc4", "#c85a2a"
def bull_fur(wx, wy, wz):
    if hash01(round(wx / 0.14), round(wy / 0.14), round(wz / 0.14)) > 0.72:
        return mn_brd
    return mn_br
packs.append(humanoid(
    "Minotaur", uu=0.0622, bulk=1.44, limb=1.36,
    torso_fn=lambda wx, wy, wz: "#a8703f" if (wz > 0.06 and abs(wx) < 0.2 and wy > 0.36)
                                else bull_fur(wx, wy, wz),
    hip_c=mn_brd, shoulder_c=mn_br, neck_c=mn_brd,
    head_fn=bull_fur, head_at=1.14, head_r=(0.26, 0.25, 0.24),
    arm_fn=bull_fur, elbow_c=mn_brd, fore_fn=bull_fur, hand_c=mn_brd,
    thigh_fn=bull_fur, knee_c=mn_brd, shin_fn=solid(mn_brd),
    feet=hooves(mn_brd, "#2e2118", w=1.25),
    face=[
        B("Muzzle", "head", [0, 1.03, 0.32], [0.24, 0.18, 0.22], "#a8703f"),
        B("Nostril L", "head", [-0.07, 1.05, 0.44], [0.05, 0.05, 0.05], "#3a2818"),
        B("Nostril R", "head", [0.07, 1.05, 0.44], [0.05, 0.05, 0.05], "#3a2818"),
        B("Ring", "head", [0, 0.96, 0.44], [0.14, 0.12, 0.05], "#e8b62c"),
        # Horns sweep out then up.
        B("Horn L", "head", [-0.3, 1.24, 0.02], [0.22, 0.11, 0.12], mn_h, [0, 0, 14]),
        B("Horn R", "head", [0.3, 1.24, 0.02], [0.22, 0.11, 0.12], mn_h, [0, 0, -14]),
        B("Horn up L", "head", [-0.44, 1.4, 0.02], [0.11, 0.24, 0.11], mn_h, [0, 0, 24]),
        B("Horn up R", "head", [0.44, 1.4, 0.02], [0.11, 0.24, 0.11], mn_h, [0, 0, -24]),
        B("Horn tip L", "head", [-0.5, 1.58, 0.02], [0.08, 0.16, 0.08], "#f4eeda", [0, 0, 32]),
        B("Horn tip R", "head", [0.5, 1.58, 0.02], [0.08, 0.16, 0.08], "#f4eeda", [0, 0, -32]),
        B("Ear L", "head", [-0.28, 1.14, -0.02], [0.18, 0.1, 0.1], mn_br, [0, 0, 22]),
        B("Ear R", "head", [0.28, 1.14, -0.02], [0.18, 0.1, 0.1], mn_br, [0, 0, -22]),
        B("Brow L", "head", [-0.12, 1.26, 0.18], [0.15, 0.07, 0.08], mn_brd, [0, 0, -16]),
        B("Brow R", "head", [0.12, 1.26, 0.18], [0.15, 0.07, 0.08], mn_brd, [0, 0, 16]),
        B("Eye L", "head", [-0.12, 1.18, 0.21], [0.09, 0.08, 0.05], "#f2a83a"),
        B("Eye R", "head", [0.12, 1.18, 0.21], [0.09, 0.08, 0.05], "#f2a83a"),
        B("Pupil L", "head", [-0.12, 1.18, 0.245], [0.04, 0.055, 0.03], "#1c1c1c"),
        B("Pupil R", "head", [0.12, 1.18, 0.245], [0.04, 0.055, 0.03], "#1c1c1c"),
        B("Tuft", "head", [0, 1.36, 0.14], [0.13, 0.12, 0.13], mn_brd),
    ],
    extras=[
        B("Belt", "body", [0, 0.3, 0], [0.8, 0.14, 0.56], "#4a3020"),
        B("Buckle", "body", [0, 0.3, 0.27], [0.16, 0.15, 0.06], "#e8b62c"),
        B("Tail 1", "tail", [0, 0.14, -0.34], [0.12, 0.12, 0.32], mn_br),
        B("Tail tuft", "tail", [0, 0.02, -0.6], [0.14, 0.2, 0.14], mn_brd),
        B("Haft", "lowerFR", [0.53, 0.0, 0.06], [0.08, 0.7, 0.08], "#5a3d22"),
        B("Axe L", "lowerFR", [0.53, 0.34, -0.24], [0.1, 0.34, 0.3], "#b9c0cc"),
        B("Axe R", "lowerFR", [0.53, 0.34, 0.36], [0.1, 0.34, 0.3], "#b9c0cc"),
        B("Edge L", "lowerFR", [0.53, 0.34, -0.41], [0.06, 0.3, 0.06], "#e0e6ee"),
        B("Edge R", "lowerFR", [0.53, 0.34, 0.53], [0.06, 0.3, 0.06], "#e0e6ee"),
    ],
    anim=anim_like(idle={"bob": 0.05, "speed": 1.2},
                   walk={"legSwing": 24, "bodyBob": 0.13, "speed": 2.0},
                   jump={"height": 1.4, "tuck": 22, "speed": 0.85}),
))

# ---- 73 SLIME --------------------------------------------------------------
# No limbs at all: a blob whose whole performance is the root bob and a wobble.
set_u(0.0652)
sl_g, sl_gd, sl_gl = "#5ad07a", "#3fae5e", "#a8f2bc"
v = Vox()
def slime_body(wx, wy, wz):
    if wy > 0.42 and wz < 0.0:
        return sl_gl  # highlight on the crown
    return sl_gd if wy < 0.06 else sl_g
v.ellipsoid(0, 0.3, 0, 0.52, 0.34, 0.5, slime_body, wob=0.22)
v.ellipsoid(0, 0.12, 0, 0.6, 0.16, 0.56, solid(sl_gd), wob=0.3, seed=5)  # spreading base
slime = v.merge("body", "Body")
hv = Vox()
hv.ellipsoid(0, 0.46, 0.12, 0.34, 0.2, 0.3, solid(sl_g), wob=0.16, seed=9)
slime += hv.merge("head", "Head")
slime += [
    B("Eye L", "head", [-0.17, 0.5, 0.36], [0.14, 0.16, 0.08], "#ffffff"),
    B("Eye R", "head", [0.17, 0.5, 0.36], [0.14, 0.16, 0.08], "#ffffff"),
    B("Pupil L", "head", [-0.17, 0.48, 0.42], [0.08, 0.1, 0.05], "#1c2b20"),
    B("Pupil R", "head", [0.17, 0.48, 0.42], [0.08, 0.1, 0.05], "#1c2b20"),
    B("Glint L", "head", [-0.2, 0.54, 0.44], [0.04, 0.04, 0.04], "#ffffff"),
    B("Glint R", "head", [0.14, 0.54, 0.44], [0.04, 0.04, 0.04], "#ffffff"),
    B("Mouth", "head", [0, 0.34, 0.38], [0.16, 0.05, 0.06], "#2b6b3a"),
    B("Smile L", "head", [-0.1, 0.37, 0.37], [0.05, 0.05, 0.06], "#2b6b3a"),
    B("Smile R", "head", [0.1, 0.37, 0.37], [0.05, 0.05, 0.06], "#2b6b3a"),
    B("Drip L", "ear", [-0.4, 0.16, 0.16], [0.12, 0.22, 0.12], sl_g),
    B("Drip R", "ear", [0.42, 0.2, -0.1], [0.11, 0.18, 0.11], sl_g),
    B("Blob", "tail", [0, 0.1, -0.5], [0.2, 0.16, 0.2], sl_gd),
]
packs.append(design("Slime", slime, {"idle": {"bob": 0.1, "speed": 2.4},
                                     "walk": {"legSwing": 20, "bodyBob": 0.26, "speed": 2.8},
                                     "jump": {"height": 1.6, "tuck": 20, "speed": 1.1}}))

# ============================ FANTASY BEASTS ================================

# ---- 84 HYDRA --------------------------------------------------------------
# Three necks off one body. The necks are body blocks (they hold their arc) and
# only the heads take the head role, so all three nod together.
set_u(0.0788)
hy_g, hy_gd, hy_b, hy_e = "#3f9a7a", "#2d7159", "#cfe8b8", "#f2c341"
v = Vox()
v.ellipsoid(0, 0.14, -0.16, 0.52, 0.44, 0.78,
            lambda wx, wy, wz: hy_b if wy < -0.12 else (hy_gd if wy > 0.36 else hy_g), wob=0.22)
hyd = v.merge("body", "Body")
# Wide splay and a raised centre head, so the three read as three rather
# than as one lumpy mass.
NECKS = ((-0.58, 0.44, -24), (0.0, 0.78, 0), (0.58, 0.44, 24))
for n, (nx, ny, roll) in enumerate(NECKS):
    for i in range(4):
        t = i / 3
        hyd.append(B(f"Neck {n+1}-{i+1}", "body",
                     [nx * (0.4 + t * 0.6), 0.34 + ny * t, 0.42 + t * 0.34],
                     [0.24 - t * 0.05, 0.26, 0.24 - t * 0.05],
                     hy_gd if i % 2 else hy_g, [26, 0, roll]))
hv = Vox()
for nx, ny, roll in NECKS:
    hv.ellipsoid(nx, 0.34 + ny + 0.26, 0.82, 0.2, 0.19, 0.24, solid(hy_g), wob=0.14, seed=9)
    hv.box(nx - 0.14, 0.34 + ny + 0.1, 0.94, nx + 0.14, 0.34 + ny + 0.26, 1.2, solid(hy_gd))
hyd += hv.merge("head", "Head")
for n, (nx, ny, roll) in enumerate(NECKS):
    hy0 = 0.34 + ny + 0.26
    hyd += [
        B(f"Brow L{n}", "head", [nx - 0.13, hy0 + 0.14, 0.9], [0.11, 0.08, 0.12], hy_gd),
        B(f"Brow R{n}", "head", [nx + 0.13, hy0 + 0.14, 0.9], [0.11, 0.08, 0.12], hy_gd),
        B(f"Eye L{n}", "head", [nx - 0.12, hy0 + 0.06, 0.98], [0.09, 0.09, 0.06], hy_e),
        B(f"Eye R{n}", "head", [nx + 0.12, hy0 + 0.06, 0.98], [0.09, 0.09, 0.06], hy_e),
        B(f"Pupil L{n}", "head", [nx - 0.12, hy0 + 0.06, 1.02], [0.03, 0.07, 0.04], "#1c1c1c"),
        B(f"Pupil R{n}", "head", [nx + 0.12, hy0 + 0.06, 1.02], [0.03, 0.07, 0.04], "#1c1c1c"),
        B(f"Fang L{n}", "head", [nx - 0.08, hy0 + 0.04, 1.16], [0.05, 0.09, 0.05], "#f4f2e2"),
        B(f"Fang R{n}", "head", [nx + 0.08, hy0 + 0.04, 1.16], [0.05, 0.09, 0.05], "#f4f2e2"),
        B(f"Frill L{n}", "ear", [nx - 0.2, hy0 + 0.12, 0.7], [0.14, 0.2, 0.08], hy_b, [0, 0, 26]),
        B(f"Frill R{n}", "ear", [nx + 0.2, hy0 + 0.12, 0.7], [0.14, 0.2, 0.08], hy_b, [0, 0, -26]),
    ]
hyd += [B(f"Tail {i+1}", "tail", [0, 0.14 - i * 0.02, -0.96 - i * 0.28],
          [0.32 - i * 0.06, 0.3 - i * 0.06, 0.32], hy_gd if i % 2 else hy_g) for i in range(4)]
hyd += legs4(0.38, -0.52, 0.44, -0.5, [0.28, 0.4, 0.28], hy_g,
             feet=[0.32, 0.12, 0.34], foot_color=hy_b)
packs.append(design("Hydra", hyd, {"idle": {"bob": 0.05, "speed": 1.4},
                                   "walk": {"legSwing": 26, "bodyBob": 0.09, "speed": 2.0},
                                   "jump": {"height": 1.4, "tuck": 26, "speed": 0.9}}))

# ---- 85 KITSUNE ------------------------------------------------------------
# Nine tails fanned across the tail role — the whole silhouette of the thing.
set_u(0.0755)
ki_w, ki_c, ki_o, ki_go = "#f6f1e6", "#e2d8c6", "#e8823a", "#f0c33a"
nine = []
for i in range(9):
    a = (i - 4) / 4.0
    nine += [
        B(f"Tail {i+1}", "tail", [a * 0.5, 0.34 + abs(a) * -0.12, -0.86 - abs(a) * 0.08],
          [0.16, 0.34, 0.3], ki_w, [-24, a * 26, a * 22]),
        B(f"Tail tip {i+1}", "tail", [a * 0.72, 0.66 - abs(a) * 0.2, -1.0 - abs(a) * 0.1],
          [0.14, 0.28, 0.24], ki_o if i % 2 else ki_go, [-38, a * 30, a * 28]),
    ]
packs.append(quadruped(
    "Kitsune", ki_w, ki_c, ki_w, size=0.94,
    body_pat=lambda wx, wy, wz: ki_o if (wy > 0.34 and wz > 0.3) else None,
    head_pat=lambda wx, wy, wz: ki_go if (abs(wx) > 0.24 and wy > 0.7) else None,
    muzzle=[
        B("Snout", "head", [0, 0.5, 1.06], [0.28, 0.22, 0.28], ki_c),
        B("Nose", "head", [0, 0.56, 1.24], [0.12, 0.1, 0.08], "#3a2a24"),
        B("Mask L", "head", [-0.2, 0.72, 1.02], [0.16, 0.1, 0.06], ki_o),
        B("Mask R", "head", [0.2, 0.72, 1.02], [0.16, 0.1, 0.06], ki_o),
        B("Eye L", "head", [-0.2, 0.74, 1.06], [0.11, 0.1, 0.06], ki_go),
        B("Eye R", "head", [0.2, 0.74, 1.06], [0.11, 0.1, 0.06], ki_go),
        B("Pupil L", "head", [-0.2, 0.74, 1.1], [0.04, 0.08, 0.04], "#2b1c1c"),
        B("Pupil R", "head", [0.2, 0.74, 1.1], [0.04, 0.08, 0.04], "#2b1c1c"),
        B("Flame", "head", [0, 1.08, 0.86], [0.12, 0.2, 0.12], ki_go, [-18, 0, 0]),
    ],
    ears=[
        B("Ear L", "ear", [-0.26, 1.04, 0.62], [0.19, 0.3, 0.1], ki_w),
        B("Ear R", "ear", [0.26, 1.04, 0.62], [0.19, 0.3, 0.1], ki_w),
        B("Ear tip L", "ear", [-0.26, 1.24, 0.62], [0.13, 0.14, 0.08], ki_o),
        B("Ear tip R", "ear", [0.26, 1.24, 0.62], [0.13, 0.14, 0.08], ki_o),
    ],
    tail=nine,
    legs=legs4(0.3, -0.5, 0.4, -0.4, [0.2, 0.36, 0.2], ki_w,
               feet=[0.22, 0.11, 0.26], foot_color=ki_o),
    anim={"walk": {"legSwing": 40, "speed": 2.8}, "jump": {"height": 1.7}},
))

# ---- 86 WYVERN -------------------------------------------------------------
# A two-legged dragon, so the shins take the lower* roles and the wings the ear
# role. The wing arms double as its forelimbs.
set_u(0.0713)
wy_p, wy_pd, wy_b, wy_h = "#7a4a9a", "#5e3578", "#d8c2e8", "#f0d08a"
v = Vox()
def wyv_hide(wx, wy, wz):
    if wy < 0.34 and wz > -0.4:
        return wy_b
    return wy_pd if wy > 0.68 else wy_p
v.ellipsoid(0, 0.52, -0.1, 0.34, 0.36, 0.56, wyv_hide, wob=0.2)
for i in range(4):
    t = i / 3
    v.ellipsoid(0, 0.66 + t * 0.42, 0.4 + t * 0.28, 0.21 - t * 0.03, 0.21, 0.24 - t * 0.03,
                wyv_hide, wob=0.14, seed=5 + i)
wyv = v.merge("body", "Body")
hv = Vox()
hv.ellipsoid(0, 1.14, 0.82, 0.23, 0.23, 0.3, lambda wx, wy, wz: wy_pd if wy > 1.24 else wy_p,
             wob=0.14, seed=9)
hv.box(-0.17, 0.94, 0.9, 0.17, 1.1, 1.28, lambda wx, wy, wz: wy_b if wy < 1.0 else wy_p)
wyv += hv.merge("head", "Head")
wyv += [
    B("Horn L", "head", [-0.16, 1.36, 0.66], [0.09, 0.26, 0.09], wy_h, [-26, 0, 10]),
    B("Horn R", "head", [0.16, 1.36, 0.66], [0.09, 0.26, 0.09], wy_h, [-26, 0, -10]),
    B("Horn tip L", "head", [-0.19, 1.52, 0.56], [0.06, 0.14, 0.06], "#fff0c0", [-34, 0, 14]),
    B("Horn tip R", "head", [0.19, 1.52, 0.56], [0.06, 0.14, 0.06], "#fff0c0", [-34, 0, -14]),
    B("Brow L", "head", [-0.17, 1.28, 0.94], [0.12, 0.08, 0.13], wy_pd),
    B("Brow R", "head", [0.17, 1.28, 0.94], [0.12, 0.08, 0.13], wy_pd),
    B("Eye L", "head", [-0.17, 1.2, 1.0], [0.09, 0.1, 0.06], "#8cf0d8"),
    B("Eye R", "head", [0.17, 1.2, 1.0], [0.09, 0.1, 0.06], "#8cf0d8"),
    B("Pupil L", "head", [-0.17, 1.2, 1.04], [0.03, 0.08, 0.04], "#1c1c1c"),
    B("Pupil R", "head", [0.17, 1.2, 1.04], [0.03, 0.08, 0.04], "#1c1c1c"),
    B("Nostril L", "head", [-0.08, 1.06, 1.28], [0.05, 0.05, 0.05], wy_pd),
    B("Nostril R", "head", [0.08, 1.06, 1.28], [0.05, 0.05, 0.05], wy_pd),
    B("Fang L", "head", [-0.13, 0.94, 1.16], [0.05, 0.1, 0.05], "#f4f2e2"),
    B("Fang R", "head", [0.13, 0.94, 1.16], [0.05, 0.1, 0.05], "#f4f2e2"),
    B("Wing arm L", "ear", [-0.56, 0.78, 0.02], [0.5, 0.13, 0.15], wy_pd, [0, 0, 24]),
    B("Wing arm R", "ear", [0.56, 0.78, 0.02], [0.5, 0.13, 0.15], wy_pd, [0, 0, -24]),
    B("Wing L", "ear", [-0.96, 0.72, -0.22], [0.15, 0.68, 1.0], wy_b, [0, 0, 28]),
    B("Wing R", "ear", [0.96, 0.72, -0.22], [0.15, 0.68, 1.0], wy_b, [0, 0, -28]),
    B("Wing tip L", "ear", [-1.28, 0.5, -0.44], [0.12, 0.5, 0.74], "#b89ccc", [0, 0, 40]),
    B("Wing tip R", "ear", [1.28, 0.5, -0.44], [0.12, 0.5, 0.74], "#b89ccc", [0, 0, -40]),
    B("Claw L", "ear", [-0.8, 0.98, 0.1], [0.09, 0.14, 0.09], wy_h, [0, 0, 24]),
    B("Claw R", "ear", [0.8, 0.98, 0.1], [0.09, 0.14, 0.09], wy_h, [0, 0, -24]),
]
for i in range(5):
    t = i / 4
    wyv.append(B(f"Tail {i+1}", "tail", [0, 0.42 - t * 0.1, -0.66 - i * 0.3],
                 [0.3 - t * 0.19, 0.3 - t * 0.19, 0.32], wy_pd if i % 2 else wy_p))
wyv.append(B("Tail barb", "tail", [0, 0.32, -2.06], [0.24, 0.12, 0.26], wy_h))
for side, role, lower in ((-1, "legBL", "lowerBL"), (1, "legBR", "lowerBR")):
    lx = side * 0.25
    uv = Vox()
    uv.ellipsoid(lx, 0.14, -0.1, 0.22, 0.3, 0.26, solid(wy_p), wob=0.14, seed=17)
    uv.ellipsoid(lx, -0.16, 0.0, 0.16, 0.11, 0.16, solid(wy_pd), seed=21)  # knee
    wyv += uv.merge(role, "Leg")
    lv = Vox()
    lv.ellipsoid(lx, -0.4, 0.02, 0.13, 0.26, 0.15, solid(wy_p), wob=0.14, seed=18)
    wyv += lv.merge(lower, "Shin")
    wyv += [B("Foot", lower, [lx, -0.68, 0.1], [0.24, 0.14, 0.34], wy_p),
            B("Heel", lower, [lx, -0.68, -0.12], [0.17, 0.13, 0.13], wy_pd)]
    for j in range(3):
        wyv.append(B(f"Talon {j+1}", lower, [lx + (j - 1) * 0.085, -0.7, 0.3],
                     [0.06, 0.09, 0.12], wy_h))
packs.append(design("Wyvern", wyv, {"idle": {"bob": 0.055, "speed": 1.4},
                                    "walk": {"legSwing": 27, "bodyBob": 0.11, "speed": 2.1},
                                    "jump": {"height": 2.0, "tuck": 30, "speed": 0.9}}))

# ---- 87 CHIMERA ------------------------------------------------------------
# Lion in front, goat rising off the back, snake for a tail.
set_u(0.0812)
ch_t, ch_td, ch_m, ch_gt = "#c9903f", "#a06f28", "#7a4a22", "#d8cfbc"
ch_sn = "#5aa84a"
packs.append(quadruped(
    "Chimera", ch_t, "#e2b874", ch_t, size=1.06,
    head_at=(0, 0.66, 0.78), head_r=(0.34, 0.32, 0.32),
    muzzle=[
        B("Snout", "head", [0, 0.5, 1.1], [0.3, 0.22, 0.24], "#e2b874"),
        B("Nose", "head", [0, 0.58, 1.24], [0.14, 0.1, 0.09], "#4a2f18"),
        B("Eye L", "head", [-0.2, 0.76, 1.02], [0.11, 0.12, 0.06], "#f2a83a"),
        B("Eye R", "head", [0.2, 0.76, 1.02], [0.11, 0.12, 0.06], "#f2a83a"),
        B("Pupil L", "head", [-0.2, 0.76, 1.06], [0.05, 0.08, 0.04], "#1c1c1c"),
        B("Pupil R", "head", [0.2, 0.76, 1.06], [0.05, 0.08, 0.04], "#1c1c1c"),
        B("Fang L", "head", [-0.1, 0.4, 1.16], [0.05, 0.1, 0.05], "#f4f2e2"),
        B("Fang R", "head", [0.1, 0.4, 1.16], [0.05, 0.1, 0.05], "#f4f2e2"),
    ] + [
        B(f"Mane {i+1}", "head", [mx, my, 0.6], [0.24, 0.24, 0.2], ch_m if i % 2 else "#8f5a28")
        for i, (mx, my) in enumerate([(-0.4, 0.9), (0, 1.02), (0.4, 0.9),
                                      (-0.5, 0.54), (0.5, 0.54), (-0.4, 0.24), (0.4, 0.24)])
    ] + [
        # Goat head standing off the shoulders.
        B("Goat neck", "head", [0, 0.78, 0.06], [0.2, 0.4, 0.2], ch_gt, [-16, 0, 0]),
        B("Goat head", "head", [0, 1.08, 0.16], [0.24, 0.24, 0.32], ch_gt),
        B("Goat muzzle", "head", [0, 1.02, 0.38], [0.16, 0.14, 0.16], "#eee7d8"),
        B("Goat eye L", "head", [-0.12, 1.14, 0.3], [0.08, 0.08, 0.05], "#f2d13a"),
        B("Goat eye R", "head", [0.12, 1.14, 0.3], [0.08, 0.08, 0.05], "#f2d13a"),
        B("Goat pupil L", "head", [-0.12, 1.14, 0.34], [0.05, 0.03, 0.04], "#1c1c1c"),
        B("Goat pupil R", "head", [0.12, 1.14, 0.34], [0.05, 0.03, 0.04], "#1c1c1c"),
        B("Goat horn L", "head", [-0.14, 1.28, 0.06], [0.09, 0.22, 0.09], "#b8a888", [-28, 0, 12]),
        B("Goat horn R", "head", [0.14, 1.28, 0.06], [0.09, 0.22, 0.09], "#b8a888", [-28, 0, -12]),
        B("Goat tip L", "head", [-0.18, 1.4, -0.1], [0.07, 0.16, 0.07], "#d4c8a8", [-44, 0, 16]),
        B("Goat tip R", "head", [0.18, 1.4, -0.1], [0.07, 0.16, 0.07], "#d4c8a8", [-44, 0, -16]),
        B("Goat beard", "head", [0, 0.9, 0.34], [0.1, 0.16, 0.1], "#eee7d8"),
    ],
    ears=[
        B("Ear L", "ear", [-0.34, 1.0, 0.68], [0.15, 0.15, 0.1], ch_td),
        B("Ear R", "ear", [0.34, 1.0, 0.68], [0.15, 0.15, 0.1], ch_td),
    ],
    tail=[
        B("Tail 1", "tail", [0, 0.2, -0.92], [0.2, 0.2, 0.3], ch_sn),
        B("Tail 2", "tail", [0, 0.34, -1.16], [0.18, 0.18, 0.3], "#42902f"),
        B("Tail 3", "tail", [0, 0.56, -1.3], [0.17, 0.17, 0.28], ch_sn, [-40, 0, 0]),
        B("Snake head", "tail", [0, 0.78, -1.3], [0.2, 0.17, 0.26], "#42902f", [-20, 0, 0]),
        B("Snake eye L", "tail", [-0.09, 0.82, -1.18], [0.06, 0.06, 0.05], "#f2c341"),
        B("Snake eye R", "tail", [0.09, 0.82, -1.18], [0.06, 0.06, 0.05], "#f2c341"),
        B("Snake tongue", "tail", [0, 0.74, -1.14], [0.03, 0.03, 0.14], "#d9425a"),
    ],
    legs=legs4(0.38, -0.54, 0.46, -0.46, [0.26, 0.42, 0.26], ch_t,
               feet=[0.3, 0.12, 0.32], foot_color=ch_td),
    anim={"walk": {"legSwing": 32, "speed": 2.3}},
))

# ---- 88 MANTICORE ----------------------------------------------------------
set_u(0.0798)
mc_r, mc_rd, mc_k, mc_h = "#a8442a", "#82301c", "#2b2028", "#e8d9b8"
packs.append(quadruped(
    "Manticore", mc_r, "#c26a44", mc_r, size=1.04,
    body_pat=lambda wx, wy, wz: mc_rd if wy > 0.36 else None,
    head_at=(0, 0.68, 0.78), head_r=(0.32, 0.31, 0.31),
    muzzle=[
        B("Snout", "head", [0, 0.52, 1.08], [0.26, 0.2, 0.22], "#c26a44"),
        B("Nose", "head", [0, 0.6, 1.22], [0.12, 0.09, 0.08], mc_k),
        B("Brow L", "head", [-0.19, 0.88, 1.0], [0.13, 0.07, 0.1], mc_rd),
        B("Brow R", "head", [0.19, 0.88, 1.0], [0.13, 0.07, 0.1], mc_rd),
        B("Eye L", "head", [-0.19, 0.78, 1.02], [0.11, 0.11, 0.06], "#f2d13a"),
        B("Eye R", "head", [0.19, 0.78, 1.02], [0.11, 0.11, 0.06], "#f2d13a"),
        B("Pupil L", "head", [-0.19, 0.78, 1.06], [0.04, 0.09, 0.04], "#1c1c1c"),
        B("Pupil R", "head", [0.19, 0.78, 1.06], [0.04, 0.09, 0.04], "#1c1c1c"),
        B("Mouth", "head", [0, 0.42, 1.06], [0.24, 0.05, 0.2], "#3a1a1a"),
    ] + [
        B(f"Fang {j+1}", "head", [-0.12 + j * 0.08, 0.45, 1.14], [0.05, 0.11, 0.05], mc_h)
        for j in range(4)
    ] + [
        B(f"Mane {i+1}", "head", [mx, my, 0.58], [0.22, 0.22, 0.2], mc_k if i % 2 else "#3f2f36")
        for i, (mx, my) in enumerate([(-0.38, 0.94), (0, 1.06), (0.38, 0.94),
                                      (-0.5, 0.6), (0.5, 0.6)])
    ],
    ears=[
        B("Ear L", "ear", [-0.28, 1.0, 0.7], [0.13, 0.16, 0.09], mc_rd),
        B("Ear R", "ear", [0.28, 1.0, 0.7], [0.13, 0.16, 0.09], mc_rd),
        B("Wing arm L", "ear", [-0.54, 0.6, -0.16], [0.44, 0.11, 0.14], mc_k, [0, 0, 24]),
        B("Wing arm R", "ear", [0.54, 0.6, -0.16], [0.44, 0.11, 0.14], mc_k, [0, 0, -24]),
        B("Wing L", "ear", [-0.88, 0.54, -0.36], [0.14, 0.6, 0.8], "#4a3742", [0, 0, 28]),
        B("Wing R", "ear", [0.88, 0.54, -0.36], [0.14, 0.6, 0.8], "#4a3742", [0, 0, -28]),
        B("Wing tip L", "ear", [-1.16, 0.36, -0.56], [0.11, 0.44, 0.6], mc_k, [0, 0, 40]),
        B("Wing tip R", "ear", [1.16, 0.36, -0.56], [0.11, 0.44, 0.6], mc_k, [0, 0, -40]),
    ],
    # Scorpion tail arcing up and forward over the back.
    tail=[
        B("Tail 1", "tail", [0, 0.24, -0.92], [0.19, 0.19, 0.28], mc_rd),
        B("Tail 2", "tail", [0, 0.52, -1.06], [0.17, 0.17, 0.26], mc_r, [-46, 0, 0]),
        B("Tail 3", "tail", [0, 0.84, -1.06], [0.16, 0.16, 0.24], mc_rd, [-78, 0, 0]),
        B("Tail 4", "tail", [0, 1.1, -0.9], [0.15, 0.15, 0.24], mc_r, [-112, 0, 0]),
        B("Barb bulb", "tail", [0, 1.24, -0.66], [0.18, 0.18, 0.2], mc_rd),
        B("Stinger", "tail", [0, 1.2, -0.44], [0.09, 0.16, 0.18], mc_h, [40, 0, 0]),
    ],
    legs=legs4(0.36, -0.54, 0.46, -0.46, [0.26, 0.42, 0.26], mc_r,
               feet=[0.3, 0.12, 0.32], foot_color=mc_k),
    anim={"walk": {"legSwing": 34, "speed": 2.5}, "jump": {"height": 1.8}},
))

# ---- 89 KRAKEN -------------------------------------------------------------
# No legs: four tentacles take the leg roles so they sweep with the gait, and
# four more hang static. Each is a chain curling out and down from the mantle.
set_u(0.0619)
kr_p, kr_pd, kr_b, kr_su = "#6b3f8a", "#523068", "#c88ad8", "#f0c0a8"
v = Vox()
def kraken_hide(wx, wy, wz):
    if wy > 0.72:
        return kr_pd
    if wy < 0.32 and wz > 0.1:
        return kr_b
    return kr_p
v.ellipsoid(0, 0.5, -0.06, 0.42, 0.42, 0.4, kraken_hide, wob=0.2)
v.ellipsoid(0, 0.92, -0.16, 0.3, 0.34, 0.3, solid(kr_pd), wob=0.24, seed=5)  # mantle
krak = v.merge("body", "Body")
hv = Vox()
hv.ellipsoid(0, 0.56, 0.3, 0.3, 0.26, 0.2, solid(kr_p), wob=0.14, seed=9)
krak += hv.merge("head", "Head")
krak += [
    B("Eye L", "head", [-0.19, 0.6, 0.46], [0.19, 0.2, 0.1], "#f6f2e2"),
    B("Eye R", "head", [0.19, 0.6, 0.46], [0.19, 0.2, 0.1], "#f6f2e2"),
    B("Pupil L", "head", [-0.19, 0.58, 0.53], [0.09, 0.14, 0.05], "#1c1420"),
    B("Pupil R", "head", [0.19, 0.58, 0.53], [0.09, 0.14, 0.05], "#1c1420"),
    B("Glint L", "head", [-0.24, 0.66, 0.55], [0.05, 0.05, 0.04], "#ffffff"),
    B("Glint R", "head", [0.14, 0.66, 0.55], [0.05, 0.05, 0.04], "#ffffff"),
    B("Beak", "head", [0, 0.36, 0.4], [0.14, 0.12, 0.12], "#3a2a30"),
]
def tentacle(name, role, ax, az, spread, n=5):
    out = []
    for i in range(n):
        t = i / (n - 1)
        out.append(B(f"{name} {i+1}", role,
                     [ax + spread[0] * t * 0.5, 0.3 - t * 0.72, az + spread[1] * t * 0.5],
                     [0.2 - t * 0.1, 0.22 - t * 0.07, 0.2 - t * 0.1],
                     kr_pd if i % 2 else kr_p,
                     [spread[1] * 22, 0, -spread[0] * 22]))
        if i % 2 == 0 and i < n - 1:
            out.append(B(f"{name} cup {i+1}", role,
                         [ax + spread[0] * t * 0.5 + spread[0] * 0.08, 0.3 - t * 0.72,
                          az + spread[1] * t * 0.5 + spread[1] * 0.08],
                         [0.09, 0.08, 0.09], kr_su))
    return out
krak += tentacle("Arm FL", "legFL", -0.3, 0.28, (-1.1, 0.8))
krak += tentacle("Arm FR", "legFR", 0.3, 0.28, (1.1, 0.8))
krak += tentacle("Arm BL", "legBL", -0.32, -0.24, (-1.1, -0.8))
krak += tentacle("Arm BR", "legBR", 0.32, -0.24, (1.1, -0.8))
krak += tentacle("Arm L", "body", -0.4, 0.02, (-1.3, 0.0), n=4)
krak += tentacle("Arm R", "body", 0.4, 0.02, (1.3, 0.0), n=4)
krak += tentacle("Arm C", "tail", 0.0, -0.36, (0.0, -1.3), n=4)
krak += tentacle("Arm F", "body", 0.0, 0.34, (0.0, 1.1), n=4)
packs.append(design("Kraken", krak, {"idle": {"bob": 0.07, "speed": 1.5},
                                     "walk": {"legSwing": 30, "bodyBob": 0.16, "speed": 2.2},
                                     "jump": {"height": 1.5, "tuck": 30, "speed": 0.9}}))

# ---- 90 JACKALOPE ----------------------------------------------------------
set_u(0.0598)
jk_b, jk_c, jk_a = "#a8834e", "#f4ece0", "#7a5a30"
jack_antler = []
for side in (-1, 1):
    jack_antler += [
        B(f"Antler {side}", "ear", [side * 0.13, 1.06, 0.28], [0.07, 0.28, 0.07], jk_a, [-12, 0, side * 16]),
        B(f"Prong A {side}", "ear", [side * 0.26, 1.2, 0.24], [0.15, 0.06, 0.06], jk_a, [0, 0, side * 30]),
        B(f"Prong B {side}", "ear", [side * 0.23, 1.32, 0.36], [0.06, 0.16, 0.06], jk_a, [-26, 0, side * 22]),
        B(f"Prong C {side}", "ear", [side * 0.31, 1.34, 0.16], [0.06, 0.13, 0.06], jk_a, [12, 0, side * 36]),
    ]
packs.append(quadruped(
    "Jackalope", jk_b, jk_c, jk_b, size=0.78,
    body_at=(0, 0.14, -0.1), body_r=(0.36, 0.38, 0.52),
    head_at=(0, 0.66, 0.46), head_r=(0.3, 0.28, 0.3),
    muzzle=[
        B("Snout", "head", [0, 0.56, 0.72], [0.2, 0.16, 0.16], jk_c),
        B("Nose", "head", [0, 0.6, 0.82], [0.09, 0.07, 0.06], "#d98a94"),
        B("Tooth L", "head", [-0.05, 0.48, 0.78], [0.05, 0.08, 0.04], "#ffffff"),
        B("Tooth R", "head", [0.05, 0.48, 0.78], [0.05, 0.08, 0.04], "#ffffff"),
        B("Eye L", "head", [-0.19, 0.72, 0.66], [0.11, 0.12, 0.06], "#2b1c14"),
        B("Eye R", "head", [0.19, 0.72, 0.66], [0.11, 0.12, 0.06], "#2b1c14"),
        B("Glint L", "head", [-0.21, 0.75, 0.7], [0.04, 0.04, 0.04], "#ffffff"),
        B("Glint R", "head", [0.17, 0.75, 0.7], [0.04, 0.04, 0.04], "#ffffff"),
        B("Whisker L", "head", [-0.3, 0.54, 0.74], [0.2, 0.025, 0.025], jk_c),
        B("Whisker R", "head", [0.3, 0.54, 0.74], [0.2, 0.025, 0.025], jk_c),
    ],
    ears=[
        B("Ear L", "ear", [-0.2, 1.02, 0.3], [0.12, 0.42, 0.1], jk_b, [-8, 0, 10]),
        B("Ear R", "ear", [0.2, 1.02, 0.3], [0.12, 0.42, 0.1], jk_b, [-8, 0, -10]),
        B("Ear in L", "ear", [-0.2, 1.0, 0.35], [0.06, 0.3, 0.06], "#e8b8b8", [-8, 0, 10]),
        B("Ear in R", "ear", [0.2, 1.0, 0.35], [0.06, 0.3, 0.06], "#e8b8b8", [-8, 0, -10]),
    ] + jack_antler,
    tail=[B("Tail", "tail", [0, 0.28, -0.58], [0.2, 0.2, 0.16], jk_c)],
    legs=legs4(0.24, -0.4, 0.26, -0.3, [0.16, 0.3, 0.2], jk_b,
               feet=[0.18, 0.09, 0.3], foot_color=jk_c),
    anim={"walk": {"legSwing": 34, "bodyBob": 0.14, "speed": 2.8},
          "jump": {"height": 2.0, "tuck": 34}},
))

# ---- 91 COCKATRICE ---------------------------------------------------------
set_u(0.0543)
ck_g, ck_gd, ck_r, ck_go = "#8fa84a", "#6d8434", "#d0342a", "#f0b93c"
packs.append(quadruped(
    "Cockatrice", ck_g, "#c2d48a", ck_g, size=0.84,
    body_at=(0, 0.26, -0.06), body_r=(0.34, 0.42, 0.4),
    body_pat=lambda wx, wy, wz: ck_gd if wy > 0.5 else None,
    head_at=(0, 0.9, 0.3), head_r=(0.24, 0.24, 0.26),
    muzzle=[
        B("Beak top", "head", [0, 0.88, 0.6], [0.14, 0.1, 0.24], ck_go),
        B("Beak low", "head", [0, 0.8, 0.56], [0.12, 0.07, 0.18], "#d9a12c"),
        B("Eye L", "head", [-0.16, 0.98, 0.46], [0.11, 0.12, 0.06], "#f2d13a"),
        B("Eye R", "head", [0.16, 0.98, 0.46], [0.11, 0.12, 0.06], "#f2d13a"),
        B("Pupil L", "head", [-0.16, 0.98, 0.5], [0.04, 0.08, 0.04], "#1c1c1c"),
        B("Pupil R", "head", [0.16, 0.98, 0.5], [0.04, 0.08, 0.04], "#1c1c1c"),
        B("Comb 1", "head", [0, 1.16, 0.34], [0.07, 0.16, 0.12], ck_r),
        B("Comb 2", "head", [0, 1.2, 0.18], [0.07, 0.2, 0.12], ck_r),
        B("Comb 3", "head", [0, 1.14, 0.04], [0.07, 0.14, 0.11], "#a82820"),
        B("Wattle L", "head", [-0.07, 0.72, 0.5], [0.07, 0.16, 0.08], ck_r),
        B("Wattle R", "head", [0.07, 0.72, 0.5], [0.07, 0.16, 0.08], ck_r),
    ],
    ears=[
        B("Wing arm L", "ear", [-0.42, 0.44, -0.04], [0.38, 0.11, 0.16], ck_gd, [0, 0, 22]),
        B("Wing arm R", "ear", [0.42, 0.44, -0.04], [0.38, 0.11, 0.16], ck_gd, [0, 0, -22]),
        B("Wing L", "ear", [-0.74, 0.4, -0.22], [0.13, 0.54, 0.66], "#5e7a2c", [0, 0, 26]),
        B("Wing R", "ear", [0.74, 0.4, -0.22], [0.13, 0.54, 0.66], "#5e7a2c", [0, 0, -26]),
        B("Wing tip L", "ear", [-1.0, 0.24, -0.4], [0.11, 0.4, 0.5], ck_gd, [0, 0, 38]),
        B("Wing tip R", "ear", [1.0, 0.24, -0.4], [0.11, 0.4, 0.5], ck_gd, [0, 0, -38]),
    ],
    # A rooster in front, a serpent behind.
    tail=[B(f"Tail {i+1}", "tail", [0, 0.34 - i * 0.05, -0.5 - i * 0.26],
            [0.22 - i * 0.035, 0.22 - i * 0.035, 0.28], ck_gd if i % 2 else ck_g)
          for i in range(5)] + [
        B("Tail barb", "tail", [0, 0.14, -1.86], [0.14, 0.1, 0.2], ck_go),
        B("Plume L", "tail", [-0.16, 0.6, -0.6], [0.09, 0.34, 0.4], ck_r, [-24, 0, 16]),
        B("Plume R", "tail", [0.16, 0.6, -0.6], [0.09, 0.34, 0.4], ck_r, [-24, 0, -16]),
    ],
    legs=legs4(0.18, -0.36, 0.14, -0.16, [0.11, 0.3, 0.11], ck_go,
               feet=[0.16, 0.08, 0.24], foot_color="#d9a12c"),
    anim={"idle": {"bob": 0.05, "speed": 1.9},
          "walk": {"legSwing": 28, "bodyBob": 0.14, "speed": 3.0},
          "jump": {"height": 1.6}},
))

# ---- 92 FENRIR -------------------------------------------------------------
set_u(0.0884)
fn_w, fn_s, fn_b, fn_ic = "#e2eaf2", "#b8c6d6", "#5a7a9a", "#8ce0ff"
ice = []
for i, (sx, sy, sz) in enumerate([(0, 0.62, 0.3), (0, 0.66, -0.02), (0, 0.6, -0.34),
                                  (-0.26, 0.5, 0.12), (0.26, 0.5, 0.12),
                                  (-0.24, 0.46, -0.24), (0.24, 0.46, -0.24)]):
    ice += [B(f"Ice {i+1}", "body", [sx, sy, sz], [0.12, 0.3, 0.12], fn_ic, [0, 0, sx * 40]),
            B(f"Ice tip {i+1}", "body", [sx, sy + 0.2, sz], [0.07, 0.16, 0.07], "#d8f6ff", [0, 0, sx * 46])]
packs.append(quadruped(
    "Fenrir", fn_w, "#f4f8fc", fn_w, size=1.16,
    body_pat=lambda wx, wy, wz: fn_s if (wy > 0.3 or hash01(round(wx / 0.2), round(wy / 0.2), round(wz / 0.2)) > 0.72) else None,
    head_at=(0, 0.66, 0.86), head_r=(0.34, 0.32, 0.34),
    muzzle=[
        B("Snout", "head", [0, 0.5, 1.2], [0.3, 0.24, 0.34], fn_w),
        B("Snout top", "head", [0, 0.66, 1.16], [0.24, 0.12, 0.3], fn_s),
        B("Nose", "head", [0, 0.56, 1.4], [0.14, 0.11, 0.09], "#3a4a5a"),
        B("Jaw", "head", [0, 0.34, 1.16], [0.26, 0.1, 0.3], "#f4f8fc"),
        B("Brow L", "head", [-0.2, 0.86, 1.02], [0.14, 0.08, 0.12], fn_s),
        B("Brow R", "head", [0.2, 0.86, 1.02], [0.14, 0.08, 0.12], fn_s),
        B("Eye L", "head", [-0.2, 0.78, 1.06], [0.11, 0.1, 0.06], fn_ic),
        B("Eye R", "head", [0.2, 0.78, 1.06], [0.11, 0.1, 0.06], fn_ic),
        B("Glow L", "head", [-0.2, 0.78, 1.1], [0.06, 0.06, 0.04], "#e0faff"),
        B("Glow R", "head", [0.2, 0.78, 1.1], [0.06, 0.06, 0.04], "#e0faff"),
    ] + [
        B(f"Fang {j+1}", "head", [-0.13 + j * 0.086, 0.4, 1.3], [0.055, 0.13, 0.055], "#f6fbff")
        for j in range(4)
    ],
    ears=[
        B("Ear L", "ear", [-0.24, 1.02, 0.7], [0.16, 0.26, 0.1], fn_w, [-6, 0, 12]),
        B("Ear R", "ear", [0.24, 1.02, 0.7], [0.16, 0.26, 0.1], fn_w, [-6, 0, -12]),
        B("Ear in L", "ear", [-0.24, 1.0, 0.75], [0.09, 0.17, 0.06], fn_b, [-6, 0, 12]),
        B("Ear in R", "ear", [0.24, 1.0, 0.75], [0.09, 0.17, 0.06], fn_b, [-6, 0, -12]),
    ],
    tail=[B(f"Tail {i+1}", "tail", [0, 0.3 + i * 0.08, -1.0 - i * 0.24],
            [0.28 - i * 0.04, 0.28 - i * 0.04, 0.3], fn_s if i % 2 else fn_w) for i in range(4)],
    legs=legs4(0.42, -0.56, 0.52, -0.52, [0.3, 0.44, 0.3], fn_w,
               feet=[0.34, 0.12, 0.36], foot_color=fn_s),
    extra=ice,
    anim={"idle": {"bob": 0.05, "speed": 1.3},
          "walk": {"legSwing": 32, "bodyBob": 0.1, "speed": 2.4},
          "jump": {"height": 1.7}},
))

# ---- 93 MIMIC --------------------------------------------------------------
# A treasure chest that got hungry. The lid IS the head, so the head role's nod
# reads as the chest breathing open and shut. Its slab is voxelised through a
# rotated frame, since Vox only fills axis-aligned boxes.
set_u(0.0548)
mi_w, mi_wd, mi_go, mi_r = "#8a5a2e", "#6b431f", "#e8b62c", "#c8324a"
LID_A = math.radians(32)

def chest_wood(wx, wy, wz):
    if abs(abs(wx) - 0.3) < 0.055:
        return mi_go  # iron bands
    if wy > 0.28 or abs(abs(wz) - 0.31) < 0.03:
        return mi_wd
    return mi_wd if math.floor((wz + 4) / 0.09) % 2 == 0 else mi_w

v = Vox()
v.box(-0.45, -0.12, -0.31, 0.45, 0.34, 0.31, chest_wood)
mimic = v.merge("body", "Body")

lv = Vox()
def lid_slab(wx, wy, wz):
    """Inside the lid once (y,z) is rotated back about the rear hinge."""
    dy, dz = wy - 0.42, wz + 0.32
    ry = dy * math.cos(LID_A) + dz * math.sin(LID_A)
    rz = -dy * math.sin(LID_A) + dz * math.cos(LID_A)
    if abs(wx) > 0.45 or not (-0.1 <= ry <= 0.1) or not (0.0 <= rz <= 0.6):
        return None
    if abs(abs(wx) - 0.3) < 0.055:
        return mi_go
    if abs(ry) > 0.06 or rz > 0.54:
        return mi_wd
    return mi_wd if math.floor((rz + 4) / 0.09) % 2 == 0 else mi_w
lv.box(-0.46, 0.3, -0.34, 0.46, 1.0, 0.4, lid_slab)
mimic += lv.merge("head", "Lid")

mimic += [
    B("Lock", "body", [0, 0.3, 0.33], [0.16, 0.2, 0.06], mi_go),
    B("Keyhole", "body", [0, 0.28, 0.37], [0.05, 0.08, 0.04], "#4a3016"),
    B("Gullet", "body", [0, 0.28, 0.0], [0.72, 0.14, 0.46], "#5e1c2a"),
    B("Tongue", "body", [0, 0.32, 0.2], [0.34, 0.09, 0.36], mi_r, [14, 0, 0]),
    B("Eye L", "head", [-0.24, 0.72, 0.06], [0.16, 0.16, 0.08], "#f6f2e2", [-32, 0, 0]),
    B("Eye R", "head", [0.24, 0.72, 0.06], [0.16, 0.16, 0.08], "#f6f2e2", [-32, 0, 0]),
    B("Pupil L", "head", [-0.24, 0.7, 0.11], [0.07, 0.09, 0.05], "#1c1420", [-32, 0, 0]),
    B("Pupil R", "head", [0.24, 0.7, 0.11], [0.07, 0.09, 0.05], "#1c1420", [-32, 0, 0]),
    B("Foot FL", "legFL", [-0.32, -0.24, 0.2], [0.16, 0.3, 0.16], mi_wd),
    B("Foot FR", "legFR", [0.32, -0.24, 0.2], [0.16, 0.3, 0.16], mi_wd),
    B("Foot BL", "legBL", [-0.32, -0.24, -0.2], [0.16, 0.3, 0.16], mi_wd),
    B("Foot BR", "legBR", [0.32, -0.24, -0.2], [0.16, 0.3, 0.16], mi_wd),
]
for role, sx, sz in (("legFL", -0.32, 0.2), ("legFR", 0.32, 0.2),
                     ("legBL", -0.32, -0.2), ("legBR", 0.32, -0.2)):
    mimic.append(B("Claw", role, [sx, -0.4, sz + 0.1], [0.18, 0.09, 0.12], "#f0e6d0"))
for j in range(5):
    x = -0.28 + j * 0.14
    mimic.append(B(f"Tooth T{j+1}", "head", [x, 0.5, 0.14], [0.11, 0.15, 0.07], "#f4f0e0", [-26, 0, 0]))
    mimic.append(B(f"Tooth B{j+1}", "body", [x, 0.34, 0.26], [0.11, 0.14, 0.07], "#f4f0e0"))
packs.append(design("Mimic", mimic, {"idle": {"bob": 0.05, "speed": 2.2},
                                     "walk": {"legSwing": 40, "bodyBob": 0.16, "speed": 3.2},
                                     "jump": {"height": 1.4, "tuck": 40, "speed": 1.0}}))

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
