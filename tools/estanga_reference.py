"""Recortes, siluetas y medidas de la hoja de referencia de Estanga.

Uso: python3 tools/estanga_reference.py
Entrada: assets/characters/source/estanga/reference-sheet.png (hoja aportada).
Salida: test-results/estanga/ref/*.png y reference.json, que consume
tools/build_estanga.py. No modifica recursos del juego.
"""
import json
from pathlib import Path
import cv2
import numpy as np

ROOT = Path(__file__).resolve().parents[1]
SHEET = ROOT / 'assets/characters/source/estanga/reference-sheet.png'
OUT = ROOT / 'test-results/estanga/ref'

# Cajas (x0, y0, x1, y1) en píxeles de la hoja de 1448×1086.
VIEWS = {
    'turn_front': (425, 45, 640, 566),
    'turn_right': (640, 45, 838, 566),
    'turn_back': (838, 45, 1030, 566),
    'turn_left': (1030, 45, 1190, 566),
    'face_front': (1205, 36, 1410, 271),
    'face_right': (1205, 279, 1410, 481),
    'face_left': (1205, 489, 1410, 681),
}
DETAILS = {
    'eye': (1207, 718, 1318, 812), 'hair': (1325, 718, 1410, 812),
    'knit': (1207, 821, 1318, 912), 'watch': (1325, 821, 1410, 912),
    'denim': (1207, 918, 1318, 1030), 'boots': (1325, 918, 1410, 1030),
}
# Rótulos impresos dentro de los recuadros: no forman parte de la persona.
LABELS = {'face_front': (0, 205, 80, 235), 'face_right': (0, 175, 110, 202), 'face_left': (0, 165, 100, 192)}


def background_model(img):
    """Fondo de estudio: degradado suave estimado desde los bordes del recorte."""
    h, w = img.shape[:2]
    yy, xx = np.mgrid[0:h, 0:w]
    border = np.zeros((h, w), bool)
    border[4:12, :] = border[:, 4:10] = border[:, -10:-4] = True
    X = np.stack([np.ones(border.sum()), xx[border] / w, yy[border] / h,
                  (xx[border] / w) ** 2, (yy[border] / h) ** 2, xx[border] * yy[border] / (w * h)], 1)
    A = np.stack([np.ones(h * w), xx.ravel() / w, yy.ravel() / h, (xx.ravel() / w) ** 2,
                  (yy.ravel() / h) ** 2, xx.ravel() * yy.ravel() / (w * h)], 1)
    samples = img[border].astype(np.float32)
    keep = np.ones(len(samples), bool)
    # Pelo o ropa que tocan el borde no deben contaminar el fondo: dos pasadas
    # descartando las muestras que más se apartan del degradado ajustado.
    for _ in range(3):
        fit = np.zeros_like(samples)
        coefs = []
        for c in range(3):
            coef, *_ = np.linalg.lstsq(X[keep], samples[keep, c], rcond=None)
            coefs.append(coef)
            fit[:, c] = X @ coef
        residual = np.linalg.norm(samples - fit, axis=1)
        keep = residual < max(6.0, np.percentile(residual[keep], 70) * 1.8)
    bg = np.zeros_like(img, dtype=np.float32)
    for c in range(3):
        bg[..., c] = (A @ coefs[c]).reshape(h, w)
    return bg


def segment(name, img):
    h, w = img.shape[:2]
    bg = background_model(img)
    lab = cv2.cvtColor(img, cv2.COLOR_BGR2LAB).astype(np.float32)
    lab_bg = cv2.cvtColor(np.clip(bg, 0, 255).astype(np.uint8), cv2.COLOR_BGR2LAB).astype(np.float32)
    diff = np.linalg.norm(lab - lab_bg, axis=2)
    if name.startswith('face'):
        # Primeros planos: pelo canoso, piel y barba son claros sobre fondo
        # oscuro con viñeteado. El fondo se ajusta con todos los píxeles
        # oscuros y neutros, no solo con el borde que toca el pelo.
        L = lab[..., 0]
        chroma = np.hypot(lab[..., 1] - 128, lab[..., 2] - 128)
        yy, xx = np.mgrid[0:h, 0:w]
        cand = (L < np.percentile(L, 40)) & (chroma < 6)
        basis = lambda X, Y: np.stack([np.ones_like(X), X, Y, X * X, Y * Y, X * Y], -1)
        Bc = basis(xx[cand] / w, yy[cand] / h)
        coef, *_ = np.linalg.lstsq(Bc, L[cand], rcond=None)
        for _ in range(2):
            res = L[cand] - Bc @ coef
            ok = np.abs(res) < 8
            coef, *_ = np.linalg.lstsq(Bc[ok], L[cand][ok], rcond=None)
        L_bg = basis(xx / w, yy / h) @ coef
        fg = ((L - L_bg > 13) | ((chroma > 10) & (L - L_bg > 8))).astype(np.uint8)
        fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((9, 9), np.uint8))
        # La nuca canosa oscura casi iguala al fondo: por encima del lóbulo la
        # cabeza es un solo intervalo por fila, así que se completa entre extremos.
        limit = int(h * .62)
        for row in range(limit):
            cols = np.flatnonzero(fg[row])
            if len(cols) > 3:
                fg[row, cols[0]:cols[-1] + 1] = 1
        if name in LABELS:
            x0, y0, x1, y1 = LABELS[name]
            fg[y0:y1, x0:x1] = 0
        fg = cv2.morphologyEx(fg, cv2.MORPH_CLOSE, np.ones((5, 5), np.uint8))
        fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
        count, labels, stats, _ = cv2.connectedComponentsWithStats(fg, 8)
        keep = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        fg = (labels == keep).astype(np.uint8)
        holes = (1 - fg).astype(np.uint8)
        count, labels, stats, _ = cv2.connectedComponentsWithStats(holes, 4)
        for k in range(1, count):
            x, y, bw, bh, area = stats[k]
            if not (x == 0 or y == 0 or x + bw == w or y + bh == h):
                fg[labels == k] = 1
        return fg * 255
    mask = np.full((h, w), cv2.GC_PR_BGD, np.uint8)
    mask[diff > 14] = cv2.GC_PR_FGD
    mask[diff > 32] = cv2.GC_FGD
    mask[:6, :] = mask[:, :6] = mask[:, -6:] = cv2.GC_BGD
    if name.startswith('turn'):
        mask[-4:, :] = cv2.GC_BGD
    if name in LABELS:
        x0, y0, x1, y1 = LABELS[name]
        mask[y0:y1, x0:x1] = cv2.GC_BGD
    bgd, fgd = np.zeros((1, 65), np.float64), np.zeros((1, 65), np.float64)
    cv2.grabCut(img, mask, None, bgd, fgd, 6, cv2.GC_INIT_WITH_MASK)
    fg = np.isin(mask, [cv2.GC_FGD, cv2.GC_PR_FGD]).astype(np.uint8)
    # Conservar el componente principal y rellenar huecos interiores.
    count, labels, stats, _ = cv2.connectedComponentsWithStats(fg, 8)
    if count > 1:
        keep = 1 + int(np.argmax(stats[1:, cv2.CC_STAT_AREA]))
        fg = (labels == keep).astype(np.uint8)
    # Rellenar solo poros pequeños: el hueco entre piernas o entre brazo y
    # torso es fondo real y no debe sumarse a la silueta.
    holes = (1 - fg).astype(np.uint8)
    count, labels, stats, _ = cv2.connectedComponentsWithStats(holes, 4)
    for k in range(1, count):
        x, y, bw, bh, area = stats[k]
        touches = x == 0 or y == 0 or x + bw == w or y + bh == h
        if not touches and area < 0.0015 * h * w:
            fg[labels == k] = 1
    fg = cv2.morphologyEx(fg, cv2.MORPH_OPEN, np.ones((3, 3), np.uint8))
    return fg * 255


def rows_profile(mask):
    """Extremos izquierdo/derecho de cada fila de la silueta."""
    out = []
    for row in mask:
        cols = np.flatnonzero(row > 127)
        out.append([int(cols[0]), int(cols[-1])] if len(cols) else None)
    return out


def main():
    sheet = cv2.imread(str(SHEET))
    if sheet is None or sheet.shape[:2] != (1086, 1448):
        raise SystemExit(f'Hoja de referencia ausente o con tamaño inesperado: {SHEET}')
    OUT.mkdir(parents=True, exist_ok=True)
    report = {'sheet': str(SHEET.relative_to(ROOT)), 'views': {}, 'details': {}}
    for name, (x0, y0, x1, y1) in VIEWS.items():
        crop = sheet[y0:y1, x0:x1]
        mask = segment(name, crop)
        cv2.imwrite(str(OUT / f'{name}.png'), crop)
        cv2.imwrite(str(OUT / f'{name}_mask.png'), mask)
        ys, xs = np.nonzero(mask)
        report['views'][name] = {
            'box': [x0, y0, x1, y1], 'size': [x1 - x0, y1 - y0],
            'bbox': [int(xs.min()), int(ys.min()), int(xs.max()), int(ys.max())],
            'rows': rows_profile(mask),
        }
        overlay = crop.copy()
        overlay[mask < 128] = (overlay[mask < 128] * .35).astype(np.uint8)
        cv2.imwrite(str(OUT / f'{name}_check.png'), overlay)
    for name, (x0, y0, x1, y1) in DETAILS.items():
        crop = sheet[y0:y1, x0:x1]
        cv2.imwrite(str(OUT / f'detail_{name}.png'), crop)
        report['details'][name] = [x0, y0, x1, y1]
    (OUT / 'reference.json').write_text(json.dumps(report))
    for name, view in report['views'].items():
        print(name, 'bbox', view['bbox'])


if __name__ == '__main__':
    main()
