const { test } = require('node:test');
const assert = require('node:assert/strict');

test('Juan B. Justo conserva hitos y orden al repetir el recorrido', async () => {
  const { LOT_COUNT, LANDMARKS, buildingAt, avenueSample } = await import('../avenue-route.js');
  for (const side of [-1, 1]) for (let slot = -LOT_COUNT; slot < LOT_COUNT; slot++) {
    const first = buildingAt(slot, side);
    assert.strictEqual(buildingAt(slot + LOT_COUNT, side), first);
    assert.equal(avenueSample(slot, side), avenueSample(slot + LOT_COUNT, side));
    assert.ok(first.appearance.height < 14);
  }
  for (const landmark of LANDMARKS) {
    assert.equal(buildingAt(landmark.slot, landmark.side).appearance.id, landmark.profile);
    assert.ok(landmark.slot + landmark.span <= LOT_COUNT);
    for(let offset=0;offset<landmark.span;offset++){
      const lot=buildingAt(landmark.slot+offset,landmark.side);
      assert.equal(lot.appearance.id,landmark.profile);
      assert.equal(lot.offset,offset);
      assert.equal(lot.span,landmark.span);
    }
  }
  assert.equal(buildingAt(0, 1).marker[0], 'AV. DE LOS TRABAJADORES');
  assert.equal(buildingAt(LOT_COUNT - 1, 1).marker[0], 'SAN JUAN');
});

test('estaciones, maderera y Técnica 5 tienen tipologías propias y posiciones ordenadas', async()=>{
  const { LANDMARKS, AVENUE_PROFILES }=await import('../avenue-route.js');
  for(const [id,kind] of [['axion','station'],['ypf','station'],['shell','station'],['bendu','bendu'],['maderera-jbj','lumber'],['tecnica-5','school'],['polideportivo','arena']]){
    assert.equal(AVENUE_PROFILES.find(p=>p.id===id).kind,kind);
    assert.ok(LANDMARKS.some(l=>l.profile===id));
  }
  const end=['maderera-jbj','shell','tecnica-5'].map(id=>LANDMARKS.filter(l=>l.profile===id).at(-1).slot);
  assert.ok(end[0]<end[1]&&end[1]<end[2]);
  const arena=LANDMARKS.find(l=>l.profile==='polideportivo');
  assert.equal(arena.address,3525);assert.equal(arena.span,4);assert.equal(arena.side,-1);
  assert.ok(arena.slot>LANDMARKS.find(l=>l.address===2402).slot);
  assert.ok(arena.slot+arena.span<LANDMARKS.find(l=>l.profile==='san-pablo').slot);
  const occupied=new Set();
  for(const l of LANDMARKS)for(let i=0;i<l.span;i++){
    const key=`${l.side}:${l.slot+i}`;
    assert.equal(occupied.has(key),false,`Lotes superpuestos en ${key}`);occupied.add(key);
  }
});

test('San Juan vuelve al inicio sin alterar la distancia acumulada', async () => {
  const { LOT_LENGTH, LOT_COUNT, ROUTE_LENGTH, routeState } = await import('../avenue-route.js');
  assert.deepEqual(routeState(0), { index: 0, zone: 'De los Trabajadores', lap: 1 });
  assert.equal(routeState(ROUTE_LENGTH - .01).zone, 'San Juan');
  for (let lap = 0; lap < 5; lap++) for (let slot = 0; slot < LOT_COUNT; slot++) {
    const state = routeState(lap * ROUTE_LENGTH + slot * LOT_LENGTH);
    assert.equal(state.index, slot);
    assert.equal(state.lap, lap + 1);
  }
});
