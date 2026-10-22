import base64
import colorsys
import io
import json
import math
import os
from collections import deque
from PIL import Image, ImageDraw, ImageFilter

UP_DIR = "/tmp/arena-coding-uploads"
RAW_DIR = "raw_assets"
OUT_TS = "src/assets/studioAssets.ts"


def flood_bg_pred(im: Image.Image, is_bg_fn, choke: bool = False, blur: float = 0.75) -> Image.Image:
    """
    Exact non-drifting border flood-fill using an explicit color predicate `is_bg_fn(r, g, b, x, y)`.
    Never drifts into green tanks, gray steel, orange flames, gold coins, or dark shadows!
    """
    rgba = im.convert("RGBA")
    w, h = rgba.size
    px = rgba.load()

    visited = bytearray(w * h)
    mask = Image.new("L", (w, h), 255)
    mpx = mask.load()
    q = deque()

    for x in range(w):
        for y in (0, h - 1):
            idx = y * w + x
            r, g, b, _ = px[x, y]
            if not visited[idx] and is_bg_fn(r, g, b, x, y):
                visited[idx] = 1
                q.append((x, y))
    for y in range(h):
        for x in (0, w - 1):
            idx = y * w + x
            r, g, b, _ = px[x, y]
            if not visited[idx] and is_bg_fn(r, g, b, x, y):
                visited[idx] = 1
                q.append((x, y))

    while q:
        x, y = q.popleft()
        mpx[x, y] = 0
        for nx, ny in ((x + 1, y), (x - 1, y), (x, y + 1), (x, y - 1)):
            if 0 <= nx < w and 0 <= ny < h:
                nidx = ny * w + nx
                if not visited[nidx]:
                    r, g, b, _ = px[nx, ny]
                    if is_bg_fn(r, g, b, nx, ny):
                        visited[nidx] = 1
                        q.append((nx, ny))

    if choke:
        mask = mask.filter(ImageFilter.MinFilter(3))
    if blur > 0:
        mask = mask.filter(ImageFilter.GaussianBlur(blur))

    # Despill semi-transparent white fringe pixels so sprites look razor-dark-outlined on any ground!
    for y in range(h):
        for x in range(w):
            a = mpx[x, y]
            if 0 < a < 220:
                r, g, b, _ = px[x, y]
                if r > 215 and g > 215 and b > 215:
                    mpx[x, y] = a // 3

    rgba.putalpha(mask)
    return rgba


def trim_and_fit(rgba: Image.Image, size: int, pad: int = 6, add_shadow: bool = False) -> Image.Image:
    bbox = rgba.getbbox()
    if bbox:
        rgba = rgba.crop(bbox)
    cw, ch = rgba.size
    target = size - pad * 2
    scale = min(target / max(1, cw), target / max(1, ch))
    nw = max(1, int(round(cw * scale)))
    nh = max(1, int(round(ch * scale)))
    resized = rgba.resize((nw, nh), Image.Resampling.LANCZOS)

    canvas = Image.new("RGBA", (size, size), (0, 0, 0, 0))
    ox = (size - nw) // 2
    oy = (size - nh) // 2

    if add_shadow:
        alpha = resized.getchannel("A")
        sh_alpha = alpha.point(lambda a: int(a * 0.42)).filter(ImageFilter.GaussianBlur(2.8))
        shadow = Image.new("RGBA", (nw, nh), (8, 12, 20, 0))
        shadow.putalpha(sh_alpha)
        canvas.paste(shadow, (ox + 2, min(size - nh, oy + 4)), shadow)

    canvas.paste(resized, (ox, oy), resized)
    return canvas


def shift_blue_to_red(rgba: Image.Image) -> Image.Image:
    out = rgba.copy()
    px = out.load()
    w, h = out.size
    for y in range(h):
        for x in range(w):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            hue, sat, val = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
            if 0.48 <= hue <= 0.75 and sat >= 0.22:
                new_h = (0.985 + (hue - 0.60) * 0.22) % 1.0
                new_s = min(1.0, sat * 1.08)
                nr, ng, nb = colorsys.hsv_to_rgb(new_h, new_s, val)
                px[x, y] = (int(nr * 255), int(ng * 255), int(nb * 255), a)
    return out


def extract_clean_building(src: Image.Image, cx: int, cy: int, hr: int = 66, out_size: int = 148) -> Image.Image:
    """
    Crops inside the inner flat-top hexagon (inside stone walls so walls & pin numbers never intrude)
    and strips only outer grass / desert sand / green clock overlay if not base.
    """
    rad = hr + 6
    box = src.crop((cx - rad, cy - rad, cx + rad, cy + rad)).convert("RGBA")
    w, h = box.size

    poly = Image.new("L", (w, h), 0)
    d = ImageDraw.Draw(poly)
    pts = [(rad + hr * math.cos(math.radians(i * 60)), rad + hr * math.sin(math.radians(i * 60)) * 0.95) for i in range(6)]
    d.polygon(pts, fill=255)
    pm = poly.load()

    def is_terrain(r, g, b, x, y):
        if pm[x, y] < 128:
            return True
        is_grass = (g > r + 12 and g > b + 34 and g > 110)
        is_sand = (r > 196 and g > 152 and b < 138 and (r - b) > 65)
        return is_grass or is_sand

    keyed = flood_bg_pred(box, is_terrain, choke=False, blur=0.8)
    return trim_and_fit(keyed, out_size, pad=5, add_shadow=True)


def make_textured_hex_tile(patch: Image.Image, border_rgba: tuple, variant: int) -> Image.Image:
    tw, th = 160, 140
    tex = patch.rotate(180 if variant == 1 else 0).resize((tw, th), Image.Resampling.LANCZOS).convert("RGBA")
    mask = Image.new("L", (tw, th), 0)
    md = ImageDraw.Draw(mask)
    cx, cy = tw / 2.0, th / 2.0
    r = 77.2
    pts = [(cx + r * math.cos(math.radians(i * 60)), cy + r * math.sin(math.radians(i * 60))) for i in range(6)]
    md.polygon(pts, fill=255)

    out = Image.new("RGBA", (tw, th), (0, 0, 0, 0))
    out.paste(tex, (0, 0), mask)
    od = ImageDraw.Draw(out)
    od.polygon(pts, outline=border_rgba, width=2)
    return out


def make_coastal_prop_palm() -> Image.Image:
    """Super-sampled 4x painted 3D tropical palm trees cluster matching Screenshot 1 & 7 shoreline."""
    S = 256
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    # Soft beach shadow
    d.ellipse([54, 196, 206, 240], fill=(20, 48, 36, 95))
    # Two curved 3D coconut trunks with bark segments
    for base_x, top_x, top_y, lean in [(108, 76, 84, -1), (138, 174, 96, 1)]:
        steps = 12
        for i in range(steps):
            t0 = i / steps
            t1 = (i + 1) / steps
            x0 = base_x + (top_x - base_x) * (t0 ** 1.35)
            y0 = 218 + (top_y - 218) * t0
            x1 = base_x + (top_x - base_x) * (t1 ** 1.35)
            y1 = 218 + (top_y - 218) * t1
            w0 = 13 * (1 - 0.42 * t0)
            d.polygon(
                [(x0 - w0, y0), (x0 + w0, y0), (x1 + w0 * 0.9, y1), (x1 - w0 * 0.9, y1)],
                fill=(126, 82, 42, 255) if i % 2 == 0 else (104, 66, 33, 255),
                outline=(58, 35, 16, 255),
            )
        # Coconuts
        for cxo, cyo in [(-7, 5), (6, 6), (0, -2)]:
            d.ellipse([top_x + cxo - 7, top_y + cyo - 6, top_x + cxo + 7, top_y + cyo + 7], fill=(92, 54, 24, 255))
        # Lush layered palm fronds
        frond_angles = [-165, -125, -75, -25, 20, 68, 130]
        for idx, deg in enumerate(frond_angles):
            rad = math.radians(deg)
            length = 64 if idx % 2 == 0 else 56
            ex = top_x + math.cos(rad) * length
            ey = top_y + math.sin(rad) * length * 0.72 + 12
            mx = (top_x + ex) / 2 + math.cos(rad - 1.5) * 14 * lean
            my = (top_y + ey) / 2 - 14
            shade = (44, 138, 42, 255) if idx % 2 == 0 else (68, 168, 52, 255)
            d.polygon(
                [(top_x, top_y), (mx, my - 9), (ex, ey), (mx, my + 7)],
                fill=shade,
                outline=(26, 84, 26, 255),
            )
    return im.resize((112, 112), Image.Resampling.LANCZOS)


def make_coastal_prop_ruins() -> Image.Image:
    """Super-sampled 4x painted 3D sandstone coastal ruins & rocks matching Screenshot 1 & 7."""
    S = 256
    im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    d.ellipse([36, 174, 224, 232], fill=(28, 44, 38, 95))
    # Weathered ancient sandstone blocks & broken pillar archway
    blocks = [
        [(48, 188), (118, 160), (144, 176), (76, 206)],
        [(118, 198), (196, 170), (214, 188), (138, 216)],
    ]
    for poly in blocks:
        d.polygon(poly, fill=(214, 182, 138, 255), outline=(112, 88, 58, 255))
    # Two standing carved sandstone pillars
    for px, py, pw, ph in [(68, 86, 36, 102), (144, 108, 34, 84)]:
        d.rectangle([px, py, px + pw, py + ph], fill=(224, 194, 150, 255), outline=(108, 84, 54, 255), width=3)
        d.rectangle([px + pw, py + 6, px + pw + 12, py + ph - 4], fill=(168, 138, 98, 255), outline=(108, 84, 54, 255), width=2)
        d.rectangle([px + 8, py + 18, px + pw - 8, py + ph - 18], outline=(146, 116, 78, 255), width=2)
    # Lintel stone cap on left pillar
    d.polygon([(58, 88), (118, 88), (128, 74), (68, 74)], fill=(236, 208, 166, 255), outline=(108, 84, 54, 255))
    return im.resize((104, 104), Image.Resampling.LANCZOS)


def to_data_url(im: Image.Image, quality: int = 87) -> str:
    buf = io.BytesIO()
    im.save(buf, format="WEBP", quality=quality, method=6)
    b64 = base64.b64encode(buf.getvalue()).decode("ascii")
    return f"data:image/webp;base64,{b64}"


def main():
    os.makedirs("src/assets", exist_ok=True)

    s_troops = Image.open(f"{UP_DIR}/Screenshot_2026-10-21-18-50-13-17_e356b991cd990f7fa503d570a02f01fe.jpg")
    s_lobby = Image.open(f"{UP_DIR}/Screenshot_2026-10-21-18-50-18-67_e356b991cd990f7fa503d570a02f01fe.jpg")
    s_start = Image.open(f"{UP_DIR}/Screenshot_2026-10-21-18-50-40-38_e356b991cd990f7fa503d570a02f01fe.jpg")
    s_mid = Image.open(f"{UP_DIR}/Screenshot_2026-10-21-18-51-41-71_e356b991cd990f7fa503d570a02f01fe.jpg")
    s_late = Image.open(f"{UP_DIR}/Screenshot_2026-10-21-18-52-03-29_e356b991cd990f7fa503d570a02f01fe.jpg")

    assets: dict[str, Image.Image] = {}

    # 1. Snowy Watchtower Hex Island Diorama (1254x1254 on pure black -> exact dark-only border flood!)
    island_raw = Image.open(f"{RAW_DIR}/island_diorama.png")
    island_clean = flood_bg_pred(island_raw, lambda r, g, b, x, y: r < 24 and g < 24 and b < 28, choke=True, blur=0.9)
    assets["island_diorama"] = trim_and_fit(island_clean, 480, pad=6)

    # 2. High-Res Avatars (Player Red-Eye Stormtrooper + Enemy SAM Avatar + Clean Commander Portraits without cost badge!)
    assets["avatar_player"] = Image.open(f"{RAW_DIR}/avatar_player.png").convert("RGBA").resize((144, 144), Image.Resampling.LANCZOS)
    assets["avatar_sam"] = s_mid.crop((1106, 256, 1244, 394)).convert("RGBA").resize((128, 128), Image.Resampling.LANCZOS)
    assets["avatar_cmd_natasha"] = s_troops.crop((92, 1500, 294, 1702)).convert("RGBA").resize((128, 128), Image.Resampling.LANCZOS)
    assets["avatar_cmd_commando"] = s_troops.crop((398, 1500, 600, 1702)).convert("RGBA").resize((128, 128), Image.Resampling.LANCZOS)
    assets["avatar_cmd_iron"] = s_troops.crop((1002, 1500, 1204, 1702)).convert("RGBA").resize((128, 128), Image.Resampling.LANCZOS)

    # 3. All 8 Generated AAA 3D Isometric Units -> Pure White ONLY flood-fill (keeps 100% of orange flames!)
    gen_units = [
        "rhino_tank",
        "apocalypse_tank",
        "missile_car",
        "artillery_car",
        "jet_fighter",
        "jetpack_trooper",
        "heavy_gunner",
        "assault_infantry",
    ]
    for uid in gen_units:
        raw_im = Image.open(f"{RAW_DIR}/{uid}.png")
        keyed = flood_bg_pred(
            raw_im,
            lambda r, g, b, x, y: r >= 238 and g >= 238 and b >= 238,
            choke=True,
            blur=0.8,
        )
        assets[f"card_{uid}"] = trim_and_fit(keyed, 204, pad=5, add_shadow=True)
        u_blue = trim_and_fit(keyed, 128, pad=5, add_shadow=True)
        u_red = shift_blue_to_red(u_blue)
        assets[f"unit_{uid}_blue"] = u_blue
        assets[f"unit_{uid}_red"] = u_red

    # 4. Defense Turrets & Gold Mine — Color-Exact Background Predicate (ZERO parts missing, ZERO corner badge!)
    # Mask top-left cost orb corner (x < 56 and y < 56) into background automatically!
    sam_crop = s_troops.crop((910, 350, 1142, 566))
    sam_keyed = flood_bg_pred(
        sam_crop,
        lambda r, g, b, x, y: (x < 52 and y < 48) or (b > 195 and r < 145 and b - r > 65),
        choke=True,
        blur=0.8,
    )
    assets["card_sam_tower"] = trim_and_fit(sam_keyed, 196, pad=8, add_shadow=True)
    b_sam_red = trim_and_fit(sam_keyed, 136, pad=6, add_shadow=True)
    b_sam_blue = b_sam_red.copy()
    px = b_sam_blue.load()
    for y in range(b_sam_blue.height):
        for x in range(b_sam_blue.width):
            r, g, b, a = px[x, y]
            if a == 0:
                continue
            h_v, s_v, v_v = colorsys.rgb_to_hsv(r / 255.0, g / 255.0, b / 255.0)
            if (h_v >= 0.92 or h_v <= 0.06) and s_v >= 0.35:
                nr, ng, nb = colorsys.hsv_to_rgb(0.59, s_v * 0.95, v_v)
                px[x, y] = (int(nr * 255), int(ng * 255), int(nb * 255), a)
    assets["bldg_sam_red"] = b_sam_red
    assets["bldg_sam_blue"] = b_sam_blue

    mine_crop = s_troops.crop((904, 796, 1142, 1005))
    mine_keyed = flood_bg_pred(
        mine_crop,
        lambda r, g, b, x, y: (x < 58 and y < 46) or (r > 185 and g > 132 and b < 178 and r - b > 35),
        choke=True,
        blur=0.8,
    )
    assets["card_gold_mine"] = trim_and_fit(mine_keyed, 196, pad=8, add_shadow=True)
    assets["bldg_mine_blue"] = trim_and_fit(mine_keyed, 138, pad=6, add_shadow=True)
    assets["bldg_mine_red"] = shift_blue_to_red(assets["bldg_mine_blue"])

    prism_crop = s_troops.crop((684, 1480, 906, 1692))
    prism_keyed = flood_bg_pred(
        prism_crop,
        lambda r, g, b, x, y: (x < 52 and y < 52) or (r > 185 and g > 132 and b < 180 and r - b > 32),
        choke=True,
        blur=0.8,
    )
    assets["card_prism_tower"] = trim_and_fit(prism_keyed, 196, pad=8, add_shadow=True)
    assets["bldg_prism_blue"] = trim_and_fit(prism_keyed, 138, pad=6, add_shadow=True)
    assets["bldg_prism_red"] = shift_blue_to_red(assets["bldg_prism_blue"])

    bunker_crop = s_troops.crop((380, 1942, 600, 2145))
    bunker_keyed = flood_bg_pred(
        bunker_crop,
        lambda r, g, b, x, y: (x < 48 and y < 46) or (g > 136 and b > 100 and r < 118 and g - r > 42),
        choke=True,
        blur=0.8,
    )
    assets["card_bunker"] = trim_and_fit(bunker_keyed, 196, pad=8, add_shadow=True)
    assets["bldg_bunker_blue"] = trim_and_fit(bunker_keyed, 136, pad=6, add_shadow=True)
    assets["bldg_bunker_red"] = shift_blue_to_red(assets["bldg_bunker_blue"])

    # 5. Clean Battlefield Structures & Rubble (From s_mid exact hex centers, inside inner wall!)
    assets["bldg_base_blue"] = extract_clean_building(s_mid, 357, 1982, hr=60, out_size=144)
    assets["bldg_base_red"] = extract_clean_building(s_mid, 520, 650, hr=60, out_size=144)
    assets["bldg_factory_blue"] = extract_clean_building(s_mid, 520, 1696, hr=60, out_size=144)
    assets["bldg_factory_red"] = extract_clean_building(s_mid, 684, 748, hr=60, out_size=144)
    assets["bldg_barracks_blue"] = extract_clean_building(s_mid, 684, 1792, hr=58, out_size=140)
    assets["bldg_barracks_red"] = shift_blue_to_red(assets["bldg_barracks_blue"])
    assets["bldg_airfield_blue"] = extract_clean_building(s_mid, 846, 1888, hr=58, out_size=140)
    assets["bldg_airfield_red"] = shift_blue_to_red(assets["bldg_airfield_blue"])
    assets["rubble_pile"] = extract_clean_building(s_late, 622, 1635, hr=58, out_size=132)

    # 6. Coastal Tropical Palm Trees, Sandstone Ruins & Real Painted Seamless Grass/Sand Hex Tiles!
    assets["prop_palm"] = make_coastal_prop_palm()
    assets["prop_ruins"] = make_coastal_prop_ruins()

    grass_patch = s_start.crop((90, 1180, 290, 1380))
    sand_patch = s_start.crop((430, 560, 630, 760))
    assets["hex_grass_0"] = make_textured_hex_tile(grass_patch, (108, 145, 45, 130), 0)
    assets["hex_grass_1"] = make_textured_hex_tile(grass_patch, (108, 145, 45, 130), 1)
    assets["hex_sand_0"] = make_textured_hex_tile(sand_patch, (194, 148, 78, 148), 0)
    assets["hex_sand_1"] = make_textured_hex_tile(sand_patch, (194, 148, 78, 148), 1)

    # 7. Exact Zero-Drift 3D Chests, Top Bar Icons, Battle Skill Icons & 5 Pedestal Nav Icons!
    bronze_crop = s_lobby.crop((84, 2248, 286, 2402))
    assets["chest_bronze"] = trim_and_fit(
        flood_bg_pred(bronze_crop, lambda r, g, b, x, y: b > 165 and b > g + 8, choke=True, blur=0.8),
        128,
        pad=4,
    )
    gold_crop = s_lobby.crop((676, 2244, 882, 2404))
    assets["chest_gold"] = trim_and_fit(
        flood_bg_pred(gold_crop, lambda r, g, b, x, y: b > 155 and b > r - 25 and g > 140, choke=True, blur=0.8),
        128,
        pad=4,
    )

    # Top bar pills have dark charcoal/slate background — strip cleanly without touching gold/cyan!
    for key, box in [
        ("ui_power", (24, 140, 92, 204)),
        ("ui_gem", (374, 140, 446, 204)),
        ("ui_coin", (732, 140, 806, 206)),
    ]:
        c = s_lobby.crop(box)
        assets[key] = trim_and_fit(
            flood_bg_pred(c, lambda r, g, b, x, y: r < 82 and g < 92 and b < 168, choke=False, blur=0.7),
            64,
            pad=3,
        )

    trophy_crop = s_lobby.crop((352, 1412, 452, 1508))
    assets["ui_trophy"] = trim_and_fit(
        flood_bg_pred(trophy_crop, lambda r, g, b, x, y: b > r + 15, choke=False, blur=0.8),
        84,
        pad=3,
    )

    # Pure crisp 3D Hammer+Wrench tool icon & Parachute canopy icon (zero baked countdown numbers!)
    hammer_crop = s_mid.crop((230, 2496, 418, 2612))
    assets["ui_tech_hammer"] = trim_and_fit(
        flood_bg_pred(
            hammer_crop,
            lambda r, g, b, x, y: (g > r + 14 and g > b + 30) or (42 <= r <= 96 and 52 <= g <= 112 and 68 <= b <= 136 and abs(r - g) < 24),
            choke=False,
            blur=0.8,
        ),
        104,
        pad=4,
        add_shadow=True,
    )

    # Super-sampled crisp 3D Army Parachute Supply Crate icon (zero baked countdown text!)
    S = 256
    para_im = Image.new("RGBA", (S, S), (0, 0, 0, 0))
    pd_p = ImageDraw.Draw(para_im)
    # Olive-drab segmented 3D parachute canopy dome
    pd_p.pieslice([26, 20, 230, 196], 180, 360, fill=(92, 128, 48, 255), outline=(42, 62, 22, 255), width=5)
    pd_p.pieslice([68, 22, 188, 196], 180, 360, fill=(122, 164, 62, 255), outline=(42, 62, 22, 255), width=4)
    pd_p.pieslice([104, 24, 152, 196], 180, 360, fill=(148, 190, 78, 255), outline=(42, 62, 22, 255), width=3)
    # Suspension rigging lines
    for lx in [40, 82, 128, 174, 216]:
        pd_p.line([(lx, 108), (128 + (lx - 128) * 0.25, 176)], fill=(226, 224, 208, 240), width=4)
    # 3D Armored Airdrop Crate underneath
    pd_p.rounded_rectangle([84, 168, 172, 236], radius=10, fill=(138, 102, 54, 255), outline=(58, 40, 18, 255), width=5)
    pd_p.rectangle([88, 196, 168, 210], fill=(78, 92, 112, 255))
    pd_p.line([(92, 176), (164, 228)], fill=(176, 136, 78, 255), width=5)
    assets["ui_parachute_icon"] = para_im.resize((104, 104), Image.Resampling.LANCZOS)
    assets["ui_cmd_soldier"] = s_mid.crop((1140, 2624, 1236, 2720)).convert("RGBA").resize((96, 96), Image.Resampling.LANCZOS)

    # Bottom Nav 5 3D Pedestal Icons: strip slate-blue footer gradient AND full notification badge circle!
    def is_nav_bg(r, g, b, x, y, w):
        if x > w - 64 and y < 62 and ((r > 165 and g < 110) or (r > 210 and g > 210 and b > 210)):
            return True
        return (b - r >= 16 and b >= g - 4 and 44 <= r <= 112 and 56 <= g <= 128 and 84 <= b <= 168)

    for key, box in [
        ("nav_shop", (18, 2588, 180, 2758)),
        ("nav_troops", (222, 2576, 392, 2758)),
        ("nav_battle", (452, 2568, 630, 2732)),
        ("nav_cmd", (668, 2588, 840, 2758)),
        ("nav_guide", (886, 2588, 1060, 2758)),
    ]:
        c = s_lobby.crop(box).convert("RGBA")
        if key in ("nav_shop", "nav_troops"):
            # Erase notification circle cleanly before flood-fill
            cd = ImageDraw.Draw(c)
            bx = 128 if key == "nav_shop" else 134
            by = 28 if key == "nav_shop" else 38
            cd.ellipse([bx - 24, by - 24, bx + 24, by + 24], fill=(0, 0, 0, 0))
        cw = c.width
        assets[key] = trim_and_fit(
            flood_bg_pred(
                c,
                lambda r, g, b, x, y, cw=cw: (r == 0 and g == 0 and b == 0)
                or (b - r >= 16 and b >= g - 4 and 44 <= r <= 112 and 56 <= g <= 128 and 84 <= b <= 168),
                choke=False,
                blur=0.8,
            ),
            108,
            pad=4,
        )

    # Visual QA proof sheet check!
    keys = list(assets.keys())
    cols = 7
    rows = math.ceil(len(keys) / cols)
    cell_w, cell_h = 165, 165
    proof = Image.new("RGBA", (cols * cell_w, rows * cell_h), (28, 42, 76, 255))
    pd = ImageDraw.Draw(proof)
    for idx, k in enumerate(keys):
        gx = (idx % cols) * cell_w
        gy = (idx // cols) * cell_h
        pd.rectangle([gx + cell_w // 2, gy, gx + cell_w - 2, gy + cell_h - 24], fill=(138, 178, 66, 255))
        pd.rectangle([gx, gy, gx + cell_w - 1, gy + cell_h - 1], outline=(90, 120, 170, 255), width=1)
        thumb = assets[k].copy()
        thumb.thumbnail((126, 126), Image.Resampling.LANCZOS)
        proof.paste(thumb, (gx + (cell_w - thumb.width) // 2, gy + 8), thumb)
        pd.text((gx + 6, gy + cell_h - 18), k[:22], fill=(255, 240, 150, 255))

    proof.convert("RGB").save("/tmp/studio_sheet_proof.jpg", quality=88)

    encoded = {}
    total_bytes = 0
    for k, im in assets.items():
        q = 88 if k.startswith("card_") or k == "island_diorama" else 86
        url = to_data_url(im, quality=q)
        encoded[k] = url
        total_bytes += len(url)

    with open(OUT_TS, "w", encoding="utf-8") as f:
        f.write("// Auto-generated HD 3D Studio Asset Pack for Elite Legion (Phaser 3 WebGL + UI)\n")
        f.write("export const STUDIO_ASSETS: Record<string, string> = ")
        json.dump(encoded, f, indent=2)
        f.write(";\n")

    print(f"Built {len(assets)} studio assets -> {OUT_TS} ({total_bytes / 1024:.1f} KB total base64)")


if __name__ == "__main__":
    main()
