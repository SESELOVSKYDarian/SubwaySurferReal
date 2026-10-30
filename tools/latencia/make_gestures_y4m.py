"""Video de cámara virtual para medir la latencia del seguimiento.
640x480, 30 fps, 24 s en bucle. El número de cuadro va codificado en 10 cuadraditos arriba a la
izquierda (blanco = 1). Guarda el guion de movimientos y los cuadros de inicio de cada gesto en JSON.
Uso: python3 make_gestures_y4m.py <imagen de una persona de cuerpo entero> <salida.y4m>  (requiere Pillow y numpy)
"""
import sys, json, math, numpy as np
from PIL import Image, ImageDraw
src, out = sys.argv[1], sys.argv[2]
sheet = Image.open(src).convert('RGB')
fig = sheet.crop((0, 0, 395, 1086))
H = 440; fig = fig.resize((round(395 * H / 1086), H), Image.LANCZOS)
W0, H0, FPS, DUR = 640, 480, 30, 24
ss = lambda k: (lambda k: k * k * (3 - 2 * k))(min(1, max(0, k)))
def ramp(t, t0, d, a, b): return a + (b - a) * ss((t - t0) / d)

# Gestos: (nombre, tipo, inicio en s). dy > 0 = baja (y de imagen), dx en px.
G = [('salto con amague', 'jump', 5.0), ('paso izquierda', 'lane', 7.0), ('vuelve al centro', 'lane', 8.5),
     ('paso derecha', 'lane', 10.0), ('vuelve al centro', 'lane', 11.5), ('agachado', 'duck', 13.0),
     ('salto sin amague', 'jump', 16.0), ('agachado y se para rápido', 'duck', 18.0),
     ('paso derecha', 'lane', 20.0), ('salto después del paso', 'jump', 20.35), ('vuelve al centro', 'lane', 22.0)]

def pose(t):
    dx = dy = 0.0
    # Salto con amague: baja 18 px en 0,15 s y despega; vuelo parabólico de 0,5 s con pico de 100 px
    if 5.0 <= t < 5.15: dy = ramp(t, 5.0, 0.15, 0, 18)
    elif 5.15 <= t < 5.65: k = (t - 5.15) / 0.5; dy = 18 * (1 - k) - 118 * 4 * k * (1 - k) * 1.0 + 0 * k
    elif 5.65 <= t < 5.85: dy = 10 * math.sin(math.pi * (t - 5.65) / 0.2)
    # Pasos laterales de 170 px en 0,3 s
    if 7.0 <= t < 8.5: dx = ramp(t, 7.0, 0.3, 0, -170)
    elif 8.5 <= t < 8.8: dx = ramp(t, 8.5, 0.3, -170, 0)
    if 10.0 <= t < 11.5: dx = ramp(t, 10.0, 0.3, 0, 170)
    elif 11.5 <= t < 11.8: dx = ramp(t, 11.5, 0.3, 170, 0)
    # Agachado: baja 100 px en 0,22 s, se queda, sube en 0,3 s
    if 13.0 <= t < 14.3: dy = ramp(t, 13.0, 0.22, 0, 100)
    elif 14.3 <= t < 14.6: dy = ramp(t, 14.3, 0.3, 100, 0)
    # Salto sin amague: sube 100 px y baja en 0,5 s
    if 16.0 <= t < 16.5: k = (t - 16.0) / 0.5; dy = -100 * 4 * k * (1 - k)
    # Agachado y se para rápido pasando de largo 14 px (no es un salto)
    if 18.0 <= t < 18.6: dy = ramp(t, 18.0, 0.2, 0, 90)
    elif 18.6 <= t < 18.8: dy = ramp(t, 18.6, 0.2, 90, -14)
    elif 18.8 <= t < 19.0: dy = ramp(t, 18.8, 0.2, -14, 0)
    # Paso a la derecha y salto enseguida
    if 20.0 <= t < 22.0: dx = ramp(t, 20.0, 0.3, 0, 170)
    elif 22.0 <= t < 22.3: dx = ramp(t, 22.0, 0.3, 170, 0)
    if 20.35 <= t < 20.85: k = (t - 20.35) / 0.5; dy = -100 * 4 * k * (1 - k)
    return dx, dy

bg = Image.new('RGB', (W0, H0), (74, 76, 80))
guion = []
with open(out, 'wb') as f:
    f.write(f'YUV4MPEG2 W{W0} H{H0} F{FPS}:1 Ip A1:1 C420jpeg\n'.encode())
    for i in range(FPS * DUR):
        t = i / FPS
        dx, dy = pose(t)
        guion.append([round(dx, 2), round(dy, 2)])
        fr = bg.copy(); fr.paste(fig, (int(W0 / 2 - fig.width / 2 + dx), int(30 + dy)))
        d = ImageDraw.Draw(fr)
        d.rectangle([0, 0, 8 + 10 * 16, 28], fill=(0, 0, 0))
        for b in range(10):
            if (i >> b) & 1: d.rectangle([6 + b * 16, 6, 6 + b * 16 + 12, 18], fill=(255, 255, 255))
        a = np.asarray(fr.convert('YCbCr'))
        f.write(b'FRAME\n'); f.write(a[..., 0].tobytes()); f.write(a[::2, ::2, 1].tobytes()); f.write(a[::2, ::2, 2].tobytes())
json.dump({'fps': FPS, 'frames': FPS * DUR, 'gestos': [{'nombre': n, 'tipo': k, 'inicio': s, 'cuadro': round(s * FPS)} for n, k, s in G], 'guion': guion},
          open(out + '.json', 'w'), ensure_ascii=False)
print('ok', FPS * DUR, 'cuadros')
