"""Compara los eventos registrados con el guion del video y calcula la latencia de cada gesto."""
import json, sys, statistics as st
g = json.load(open(sys.argv[1]))
r = json.load(open(sys.argv[2]))
FPS, N = g['fps'], g['frames']
gestos = g['gestos']
tipo = {'onJump': 'jump', 'onDuck': 'duck', 'onLane': 'lane'}
lat = {}; falsos = []; vistos = set()
# El contador del video se reinicia en cada vuelta: la vuelta se cuenta con el reloj de la página.
ev = sorted([e for e in r['ev'] if e[1] >= 0], key=lambda e: e[2])
t0 = next((ms - fr / FPS * 1000 for _, fr, ms, _ in ev), 0)
r['ev'] = [[n, int(round((ms - t0) / 1000 * FPS - ((ms - t0) / 1000 * FPS - fr) % N)) if False else fr, ms, a, int((ms - t0) / 1000 // (N / FPS))] for n, fr, ms, a in ev]
calib = next((e for e in r['ev'] if e[0] == 'onCalibrated'), None)
for name, fr, ms, arg, vuelta in r['ev']:
    if name not in tipo or fr < 0: continue
    f = fr % N
    # gesto del mismo tipo que empezó como mucho 1,2 s antes
    cands = [x for x in gestos if x['tipo'] == tipo[name] and 0 <= (f - x['cuadro']) % N <= 1.2 * FPS]
    if not cands: falsos.append((name, round(f / FPS, 2), arg)); continue
    x = min(cands, key=lambda x: (f - x['cuadro']) % N)
    key = (x['nombre'], x['inicio'], vuelta if f >= x['cuadro'] else vuelta - 1)
    if key in vistos and tipo[name] != 'lane': falsos.append((name + ' repetido', round(f / FPS, 2), arg)); continue
    vistos.add(key)
    lat.setdefault((x['nombre'], x['inicio']), []).append(round((f - x['cuadro']) % N / FPS * 1000))
print('gesto'.ljust(34), 'latencia desde que empieza el movimiento (ms)')
for x in gestos:
    v = lat.get((x['nombre'], x['inicio']), [])
    print(f"{x['nombre'][:32].ljust(34)} {v if v else 'NO DETECTADO'}")
todos = {k: [] for k in ('jump', 'duck', 'lane')}
for x in gestos:
    todos[x['tipo']] += lat.get((x['nombre'], x['inicio']), [])
for k, v in todos.items():
    if v: print(f'{k}: mediana {st.median(v)} ms (n={len(v)})')
print('falsos/repetidos:', falsos)
s = [x for x in r['stats'] if x.get('ms')]
if s: print('inferencia media', round(st.mean(x['ms'] for x in s)), 'ms · fps', round(st.mean(x['fps'] for x in s), 1), '·', s[-1]['mode'])
