# Three.js r160 (0.160.0)

The engine and used addons are vendored unmodified from the pinned npm release:
https://cdn.jsdelivr.net/npm/three@0.160.0/

- `build/three.module.js` → `three/three.module.js`
- `examples/jsm/{utils/BufferGeometryUtils,loaders/GLTFLoader,objects/Sky}.js`
  → `three/addons/…`

License: `three/LICENSE` (MIT). Serving these local modules avoids a runtime CDN
request for keyboard gameplay. Camera tracking still loads MediaPipe separately.
