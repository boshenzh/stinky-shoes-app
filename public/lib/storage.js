// Storage helpers for gym preferences

const smellStoreKey = 'gym-smell';
const diffStoreKey = 'gym-difficulty';
const parkStoreKey = 'gym-parking';

function read(key) {
  try { return JSON.parse(localStorage.getItem(key) || '{}'); } catch { return {}; }
}
function write(key, obj) {
  try { localStorage.setItem(key, JSON.stringify(obj)); } catch {}
}

const smellStore = read(smellStoreKey);
export const getSmell = (id) => (smellStore && id != null ? smellStore[id] : undefined);
export const setSmell = (id, value) => { smellStore[id] = value; write(smellStoreKey, smellStore); };

const diffStore = read(diffStoreKey);
export const getDiff = (id) => (diffStore && id != null ? diffStore[id] : undefined);
export const setDiff = (id, value) => { diffStore[id] = value; write(diffStoreKey, diffStore); };

const parkStore = read(parkStoreKey);
export const getParking = (id) => (parkStore && id != null ? parkStore[id] : undefined);
export const setParking = (id, value) => { parkStore[id] = value; write(parkStoreKey, parkStore); };


