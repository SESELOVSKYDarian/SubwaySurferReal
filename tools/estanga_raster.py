"""Rasterizado numpy para Estanga: siluetas ortográficas, z-buffer y horneado UV.

Sin dependencias de Blender. Lo usan tools/build_estanga.py (proyección de las
vistas de referencia sobre las UV) y la validación de siluetas.
"""
import numpy as np


class View:
    """Cámara ortográfica de una vista de la hoja.

    axis: dirección del modelo que va a la derecha de la imagen (+X, -X, +Y, -Y);
    depth: dirección del modelo hacia la cámara. u = u0 + dot(p, right)·s,
    v = v0 - z·s (v crece hacia abajo, como en la imagen).
    """

    def __init__(self, name, right, toward, u0, v0, s, size):
        self.name = name
        self.right = np.asarray(right, float)
        self.toward = np.asarray(toward, float)
        self.u0, self.v0, self.s = float(u0), float(v0), float(s)
        self.size = size  # (ancho, alto)

    def project(self, P):
        P = np.asarray(P, float)
        u = self.u0 + P @ self.right * self.s
        v = self.v0 - P[..., 2] * self.s
        depth = P @ self.toward
        return np.stack([u, v], -1), depth


def _tri_bbox(pts, w, h):
    x0 = max(int(np.floor(pts[:, 0].min())), 0)
    x1 = min(int(np.ceil(pts[:, 0].max())), w - 1)
    y0 = max(int(np.floor(pts[:, 1].min())), 0)
    y1 = min(int(np.ceil(pts[:, 1].max())), h - 1)
    return x0, x1, y0, y1


def _small_batch(uv, depth, F, tri_ids, w, h, span=4):
    """Triángulos de pocos píxeles en lote: candidatos vectorizados y resolución por profundidad."""
    pts = uv[F]                                   # (n, 3, 2)
    x0 = np.floor(pts[:, :, 0].min(1) - .5).astype(np.int64)
    y0 = np.floor(pts[:, :, 1].min(1) - .5).astype(np.int64)
    ox, oy = np.meshgrid(np.arange(span), np.arange(span))
    ox, oy = ox.ravel(), oy.ravel()
    xs = x0[:, None] + ox[None]                   # (n, span²)
    ys = y0[:, None] + oy[None]
    cx, cy = xs + .5, ys + .5
    a, b, c = pts[:, 0], pts[:, 1], pts[:, 2]
    det = (b[:, 1] - c[:, 1]) * (a[:, 0] - c[:, 0]) + (c[:, 0] - b[:, 0]) * (a[:, 1] - c[:, 1])
    ok_det = np.abs(det) > 1e-12
    det = np.where(ok_det, det, 1)
    l0 = ((b[:, 1] - c[:, 1])[:, None] * (cx - c[:, 0, None]) + (c[:, 0] - b[:, 0])[:, None] * (cy - c[:, 1, None])) / det[:, None]
    l1 = ((c[:, 1] - a[:, 1])[:, None] * (cx - c[:, 0, None]) + (a[:, 0] - c[:, 0])[:, None] * (cy - c[:, 1, None])) / det[:, None]
    l2 = 1 - l0 - l1
    inside = (l0 >= -1e-6) & (l1 >= -1e-6) & (l2 >= -1e-6) & ok_det[:, None]
    inside &= (xs >= 0) & (xs < w) & (ys >= 0) & (ys < h)
    dz = depth[F]
    d = l0 * dz[:, 0, None] + l1 * dz[:, 1, None] + l2 * dz[:, 2, None]
    r, k = np.nonzero(inside)
    return ys[r, k] * w + xs[r, k], d[r, k], tri_ids[r], l0[r, k], l1[r, k]


def zbuffer(view, P, F, ids=None, bary=False):
    """Profundidad más cercana a la cámara por píxel (centros de píxel) y triángulo."""
    w, h = view.size
    uv, depth = view.project(P)
    zbuf = np.full((h, w), -np.inf)
    tbuf = np.full((h, w), -1, np.int64)
    bbuf = np.zeros((h, w, 2), np.float32) if bary else None
    F = np.asarray(F)
    tri_ids = np.arange(len(F)) if ids is None else np.asarray(ids)
    pts = uv[F]
    extent = (np.ceil(pts.max(1)) - np.floor(pts.min(1))).max(1)
    small = extent <= 3
    zf, tf = zbuf.reshape(-1), tbuf.reshape(-1)
    bf = bbuf.reshape(-1, 2) if bary else None
    sidx = np.flatnonzero(small)
    for start in range(0, len(sidx), 15000):
        part = sidx[start:start + 15000]
        pix, d, t, l0, l1 = _small_batch(uv, depth, F[part], tri_ids[part], w, h)
        order = np.lexsort((-d, pix))
        pix, d, t, l0, l1 = pix[order], d[order], t[order], l0[order], l1[order]
        first = np.ones(len(pix), bool)
        first[1:] = pix[1:] != pix[:-1]
        pix, d, t, l0, l1 = pix[first], d[first], t[first], l0[first], l1[first]
        win = d > zf[pix]
        pix, d, t = pix[win], d[win], t[win]
        zf[pix], tf[pix] = d, t
        if bary:
            bf[pix] = np.stack([l0[win], l1[win]], -1)
    for t, tri in zip(tri_ids[~small], F[~small]):
        pts = uv[tri]
        x0, x1, y0, y1 = _tri_bbox(pts, w, h)
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + .5, np.arange(y0, y1 + 1) + .5)
        a, b, c = pts
        det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(det) < 1e-12:
            continue
        l0 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / det
        l1 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / det
        l2 = 1 - l0 - l1
        inside = (l0 >= -1e-6) & (l1 >= -1e-6) & (l2 >= -1e-6)
        if not inside.any():
            continue
        d = l0 * depth[tri[0]] + l1 * depth[tri[1]] + l2 * depth[tri[2]]
        sub = zbuf[y0:y1 + 1, x0:x1 + 1]
        closer = inside & (d > sub)
        sub[closer] = d[closer]
        tbuf[y0:y1 + 1, x0:x1 + 1][closer] = t
        if bary:
            bbuf[y0:y1 + 1, x0:x1 + 1][closer] = np.stack([l0, l1], -1)[closer]
    if bary:
        return zbuf, tbuf, bbuf
    return zbuf, tbuf


def silhouette(view, P, F):
    z, _ = zbuffer(view, P, F)
    return np.isfinite(z)


def iou(a, b):
    union = np.logical_or(a, b).sum()
    return float(np.logical_and(a, b).sum() / max(union, 1))


def uv_raster(UV, F, size):
    return uv_raster_rect(UV, F, size, size)


def uv_raster_rect(UV, F, w, h):
    """Para cada texel cubierto: triángulo y baricéntricas. UV en [0,1], v hacia arriba."""
    pts_all = np.stack([UV[..., 0] * w, (1 - UV[..., 1]) * h], -1)
    F = np.asarray(F)
    pts = pts_all[F] if pts_all.ndim == 2 else pts_all
    tri_of = np.full((h, w), -1, np.int64)
    bary = np.zeros((h, w, 3), np.float32)
    tf, bf = tri_of.reshape(-1), bary.reshape(-1, 3)
    extent = (np.ceil(pts.max(1)) - np.floor(pts.min(1))).max(1)
    edge = np.maximum(np.linalg.norm(pts[:, 1] - pts[:, 0], axis=1), np.linalg.norm(pts[:, 2] - pts[:, 0], axis=1))
    # Margen de medio texel: evita costuras negras al filtrar la textura.
    tol = -0.5 / np.maximum(edge, 1)
    done = np.zeros(len(F), bool)
    for span in (4, 8, 16):
        sel = np.flatnonzero(~done & (extent <= span - 1))
        done[sel] = True
        chunk = max(1, 240000 // (span * span))
        ox, oy = np.meshgrid(np.arange(span), np.arange(span))
        ox, oy = ox.ravel(), oy.ravel()
        for start in range(0, len(sel), chunk):
            part = sel[start:start + chunk]
            p = pts[part]
            x0 = np.floor(p[:, :, 0].min(1) - .5).astype(np.int64)
            y0 = np.floor(p[:, :, 1].min(1) - .5).astype(np.int64)
            xs, ys = x0[:, None] + ox[None], y0[:, None] + oy[None]
            cx, cy = xs + .5, ys + .5
            a, b, c = p[:, 0], p[:, 1], p[:, 2]
            det = (b[:, 1] - c[:, 1]) * (a[:, 0] - c[:, 0]) + (c[:, 0] - b[:, 0]) * (a[:, 1] - c[:, 1])
            ok = np.abs(det) > 1e-14
            det = np.where(ok, det, 1)
            l0 = ((b[:, 1] - c[:, 1])[:, None] * (cx - c[:, 0, None]) + (c[:, 0] - b[:, 0])[:, None] * (cy - c[:, 1, None])) / det[:, None]
            l1 = ((c[:, 1] - a[:, 1])[:, None] * (cx - c[:, 0, None]) + (a[:, 0] - c[:, 0])[:, None] * (cy - c[:, 1, None])) / det[:, None]
            l2 = 1 - l0 - l1
            t = tol[part][:, None]
            inside = (l0 >= t) & (l1 >= t) & (l2 >= t) & ok[:, None] & (xs >= 0) & (xs < w) & (ys >= 0) & (ys < h)
            r, k = np.nonzero(inside)
            pix = ys[r, k] * w + xs[r, k]
            tri = part[r]
            order = np.lexsort((tri, pix))
            pix, tri, r, k = pix[order], tri[order], r[order], k[order]
            first = np.ones(len(pix), bool)
            first[1:] = pix[1:] != pix[:-1]
            pix, tri, r, k = pix[first], tri[first], r[first], k[first]
            free = tf[pix] < 0
            pix, tri, r, k = pix[free], tri[free], r[free], k[free]
            tf[pix] = tri
            bf[pix] = np.stack([l0[r, k], l1[r, k], l2[r, k]], -1)
    for t in np.flatnonzero(~done):
        p = pts[t]
        x0, x1, y0, y1 = _tri_bbox(p, w, h)
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + .5, np.arange(y0, y1 + 1) + .5)
        a, b, c = p
        det = (b[1] - c[1]) * (a[0] - c[0]) + (c[0] - b[0]) * (a[1] - c[1])
        if abs(det) < 1e-14:
            continue
        l0 = ((b[1] - c[1]) * (xs - c[0]) + (c[0] - b[0]) * (ys - c[1])) / det
        l1 = ((c[1] - a[1]) * (xs - c[0]) + (a[0] - c[0]) * (ys - c[1])) / det
        l2 = 1 - l0 - l1
        inside = (l0 >= tol[t]) & (l1 >= tol[t]) & (l2 >= tol[t])
        sub = tri_of[y0:y1 + 1, x0:x1 + 1]
        take = inside & (sub < 0)
        sub[take] = t
        bary[y0:y1 + 1, x0:x1 + 1][take] = np.stack([l0, l1, l2], -1)[take]
    return tri_of, bary


def dilate(color, valid, steps=8):
    """Extiende colores válidos a texels vecinos (margen para mipmaps)."""
    color = color.copy()
    valid = valid.copy()
    for _ in range(steps):
        acc = np.zeros_like(color)
        cnt = np.zeros(valid.shape, np.float32)
        for dy, dx in [(-1, 0), (1, 0), (0, -1), (0, 1), (-1, -1), (1, 1), (-1, 1), (1, -1)]:
            sv = np.roll(np.roll(valid, dy, 0), dx, 1)
            sc = np.roll(np.roll(color, dy, 0), dx, 1)
            acc += sc * sv[..., None]
            cnt += sv
        grow = (~valid) & (cnt > 0)
        color[grow] = acc[grow] / cnt[grow][:, None]
        valid |= grow
    return color, valid


def sample(image, uv):
    """Muestreo bilineal; image (h, w, c), uv en píxeles (x, y) con centros en +0.5."""
    h, w = image.shape[:2]
    x = np.clip(uv[..., 0] - .5, 0, w - 1.001)
    y = np.clip(uv[..., 1] - .5, 0, h - 1.001)
    x0, y0 = np.floor(x).astype(int), np.floor(y).astype(int)
    fx, fy = (x - x0)[..., None], (y - y0)[..., None]
    a = image[y0, x0]
    b = image[y0, x0 + 1]
    c = image[y0 + 1, x0]
    d = image[y0 + 1, x0 + 1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy
