"""Prepare game-size derivatives of licensed CC0 MakeHuman texture assets.
The inferred micro-normal/roughness maps are authored approximations, not scans.
"""
from pathlib import Path
import numpy as np
from PIL import Image,ImageFilter
ROOT=Path(__file__).resolve().parents[1]
SRC=ROOT/'assets/characters/source/realism';OUT=ROOT/'assets/characters/textures';OUT.mkdir(exist_ok=True)
skin=Image.open(SRC/'skin.png').convert('RGB')
skin.save(OUT/'professor-skin-albedo.jpg',quality=92,optimize=True)
# Very shallow skin microrelief. Preserve broad facial color variation in albedo.
small=skin.resize((1024,1024),Image.Resampling.LANCZOS)
a=np.array(small,dtype=float)/255
lum=a@np.array([.2126,.7152,.0722]);blur=np.array(small.filter(ImageFilter.GaussianBlur(1.5)),dtype=float)/255
high=lum-blur@np.array([.2126,.7152,.0722])
dy,dx=np.gradient(high);normal=np.stack([-dx*.7,dy*.7,np.ones_like(dx)],axis=-1)
normal/=np.linalg.norm(normal,axis=-1,keepdims=True)
Image.fromarray(np.uint8(np.clip(normal*.5+.5,0,1)*255)).save(OUT/'professor-skin-normal.png',optimize=True)
rough=np.clip(.68-high*.30,.48,.85)
# glTF metallic-roughness: G roughness, B zero metalness; R unused/white.
mr=np.stack([np.ones_like(rough),rough,np.zeros_like(rough)],axis=-1)
Image.fromarray(np.uint8(mr*255)).save(OUT/'professor-skin-mr.png',optimize=True)
Image.open(SRC/'eyes/brown-eye.png').convert('RGBA').resize((1024,1024)).save(OUT/'professor-eyes.png',optimize=True)
hair=Image.open(SRC/'hair/short02_diffuse.png').convert('RGBA').resize((1024,1024),Image.Resampling.LANCZOS)
h=np.array(hair);gray=(h[:,:,:3]@np.array([.2126,.7152,.0722]));gray=np.clip(100+gray*.68,0,255)
h[:,:,:3]=gray[:,:,None].astype('uint8');Image.fromarray(h).save(OUT/'professor-hair.png',optimize=True)
Image.open(SRC/'hair/short02_normal.png').resize((1024,1024),Image.Resampling.LANCZOS).save(OUT/'professor-hair-normal.png',optimize=True)

Image.open(SRC/'shoes/shoes01_diffuse.png').convert('RGB').resize((1024,1024),Image.Resampling.LANCZOS).save(OUT/'professor-shoes.jpg',quality=93,optimize=True)
Image.open(SRC/'shoes/shoes01_normal.png').resize((1024,1024),Image.Resampling.LANCZOS).save(OUT/'professor-shoes-normal.png',optimize=True)

print('Prepared',[(p.name,p.stat().st_size) for p in sorted(OUT.glob('professor-*'))])
