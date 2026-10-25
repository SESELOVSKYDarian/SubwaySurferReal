const { test } = require('node:test');
const assert = require('node:assert/strict');

const memory = () => {
  const data = new Map();
  return { getItem: key => data.get(key) ?? null, setItem: (key, value) => data.set(key, value) };
};

test('ranking persiste todas las partidas en JSON y ordena puntos, monedas y fecha', async()=>{
  const {RankingStore,RANKING_KEY}=await import('../ranking.js');
  const storage=memory(),store=new RankingStore(()=>storage);
  assert.deepEqual(store.read(),[]);
  store.save('abc',100,2);store.save('def',200,1);store.save('ghi',100,4);
  for(let i=0;i<12;i++)store.save('AAA',i,0);
  const restored=new RankingStore(()=>storage).read();
  assert.equal(restored.length,15);
  assert.deepEqual(restored.slice(0,3).map(e=>e.initials),['DEF','GHI','ABC']);
  assert.equal(new Set(restored.map(e=>e.id)).size,15);
  assert.equal(JSON.parse(storage.getItem(RANKING_KEY)).version,1);
  assert.ok(restored.every(e=>Number.isFinite(Date.parse(e.date))));
  const scores=[
    {id:'new',initials:'NEW',score:100,coins:2,date:'2026-10-25T12:00:00Z'},
    {id:'old',initials:'OLD',score:100,coins:2,date:'2026-10-24T12:00:00Z'},
  ];
  storage.setItem(RANKING_KEY,JSON.stringify({version:1,scores}));
  assert.equal(store.read()[0].initials,'OLD');
});

test('iniciales se normalizan y se validan los valores de partida', async()=>{
  const {RankingStore,normalizeInitials}=await import('../ranking.js');
  const store=new RankingStore(()=>memory());
  assert.equal(normalizeInitials('áñd'),'AND');
  assert.equal(normalizeInitials('a1b!c'),'ABC');
  assert.equal(normalizeInitials('abcdef'),'ABC');
  assert.throws(()=>store.save('AB',1,1));
  for(const score of [-1,Infinity,1.5,NaN])assert.throws(()=>store.save('ABC',score,1));
  assert.throws(()=>store.save('ABC',1,-1));
  assert.equal(store.save('xyz',0,0).initials,'XYZ');
});

test('datos corruptos y fallos de guardado no destruyen el JSON anterior', async()=>{
  const {RankingStore,RANKING_KEY}=await import('../ranking.js');
  const storage=memory(),store=new RankingStore(()=>storage);
  storage.setItem(RANKING_KEY,'{corrupto');
  assert.throws(()=>store.read());assert.throws(()=>store.save('ABC',1,0));
  assert.equal(storage.getItem(RANKING_KEY),'{corrupto');
  storage.setItem(RANKING_KEY,JSON.stringify({version:1,scores:[]}));
  const before=storage.getItem(RANKING_KEY);
  storage.setItem=()=>{throw Error('QuotaExceededError');};
  assert.throws(()=>store.save('ABC',1,0));
  assert.equal(storage.getItem(RANKING_KEY),before);
  assert.throws(()=>new RankingStore(()=>{throw Error('SecurityError');}).read());
});

test('ranking descarta registros inválidos del almacenamiento', async()=>{
  const {RankingStore,RANKING_KEY}=await import('../ranking.js');
  const storage=memory(),store=new RankingStore(()=>storage);
  const good=store.save('ABC',50,2);
  storage.setItem(RANKING_KEY,JSON.stringify({version:1,scores:[good,null,{...good,initials:'<script>'},{...good,score:-1},{...good,date:'no'}]}));
  assert.deepEqual(store.read(),[good]);
});
