"""Externalize Blender's GLB textures so both LODs share browser-cache assets."""
from pathlib import Path
import hashlib,json,struct
ROOT=Path(__file__).resolve().parents[1]/'assets/characters'
def externalize(path):
    raw=path.read_bytes();size=struct.unpack_from('<I',raw,12)[0]
    doc=json.loads(raw[20:20+size]);binary=raw[28+size:]
    textures=ROOT/'textures';by_hash={hashlib.sha256(p.read_bytes()).hexdigest():p for p in textures.iterdir() if p.is_file()}
    removed=set()
    for image in doc.get('images',[]):
        if 'bufferView' not in image:continue
        index=image.pop('bufferView');view=doc['bufferViews'][index];offset=view.get('byteOffset',0)
        payload=binary[offset:offset+view['byteLength']];digest=hashlib.sha256(payload).hexdigest()
        target=by_hash.get(digest)
        if target is None:
            extension='.jpg' if image.get('mimeType')=='image/jpeg' else '.png'
            target=textures/('professor-blender-'+digest[:12]+extension);target.write_bytes(payload);by_hash[digest]=target
        image['uri']='textures/'+target.name;removed.add(index)
    buffer=bytearray();views=[];indices={}
    for index,view in enumerate(doc['bufferViews']):
        if index in removed:continue
        while len(buffer)%4:buffer.append(0)
        offset=view.get('byteOffset',0);new=dict(view);new['byteOffset']=len(buffer)
        buffer+=binary[offset:offset+view['byteLength']];indices[index]=len(views);views.append(new)
    for accessor in doc['accessors']:
        if 'bufferView' in accessor:accessor['bufferView']=indices[accessor['bufferView']]
    doc['bufferViews']=views;doc['buffers']=[{'byteLength':len(buffer)}]
    js=json.dumps(doc,separators=(',',':')).encode();js+=b' '*((-len(js))%4);buffer+=b'\0'*((-len(buffer))%4)
    path.write_bytes(struct.pack('<III',0x46546c67,2,28+len(js)+len(buffer))+struct.pack('<II',len(js),0x4e4f534a)+js+struct.pack('<II',len(buffer),0x004e4942)+buffer)
    print(path.name, len(raw),'->',path.stat().st_size,'bytes; shared textures',len(removed))
for name in ['professor-police.glb','professor-police-low.glb']:externalize(ROOT/name)
