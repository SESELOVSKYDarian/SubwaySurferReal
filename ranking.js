export const RANKING_KEY = 'tecnica-run-ranking-v1';

export function normalizeInitials(value) {
  return String(value).normalize('NFD').replace(/[\u0300-\u036f]/g, '').toUpperCase().replace(/[^A-Z]/g, '').slice(0, 3);
}

function validEntry(entry) {
  return entry && typeof entry.id === 'string' && /^[A-Z]{3}$/.test(entry.initials) &&
    Number.isSafeInteger(entry.score) && entry.score >= 0 &&
    Number.isSafeInteger(entry.coins) && entry.coins >= 0 &&
    typeof entry.date === 'string' && Number.isFinite(Date.parse(entry.date));
}

function sorted(entries) {
  return entries.sort((a, b) => b.score - a.score || b.coins - a.coins || Date.parse(a.date) - Date.parse(b.date));
}

export class RankingStore {
  constructor(storage = () => globalThis.localStorage) {
    this.storage = storage;
  }

  read() {
    const raw = this.storage().getItem(RANKING_KEY);
    if (raw === null) return [];
    const data = JSON.parse(raw);
    if (!data || data.version !== 1 || !Array.isArray(data.scores)) throw new Error('Formato de ranking inválido');
    return sorted(data.scores.filter(validEntry).map(({ id, initials, score, coins, date }) => ({ id, initials, score, coins, date })));
  }

  save(initials, score, coins) {
    initials = normalizeInitials(initials);
    if (!/^[A-Z]{3}$/.test(initials)) throw new Error('Se necesitan tres iniciales');
    if (!Number.isSafeInteger(score) || score < 0 || !Number.isSafeInteger(coins) || coins < 0) throw new Error('Puntuación inválida');
    const entry = { id: globalThis.crypto.randomUUID(), initials, score, coins, date: new Date().toISOString() };
    const scores = sorted([...this.read(), entry]);
    this.storage().setItem(RANKING_KEY, JSON.stringify({ version: 1, scores }));
    return entry;
  }
}
