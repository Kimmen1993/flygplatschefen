// Allt som går att placera. Mått i meter. Fronten pekar mot +y (lokalt).
// c2 = namn på andra färgen. snap = lägger sig mot vägg. dev = smart enhet. ceil = sitter i taket.
export const CATS = [
  ['oppningar', 'Dörrar & fönster', '🚪'],
  ['kok', 'Kök', '🍳'],
  ['vardag', 'Vardagsrum', '🛋️'],
  ['sov', 'Sovrum', '🛏️'],
  ['bad', 'Badrum', '🛁'],
  ['ljus', 'Belysning', '💡'],
  ['media', 'Media', '📺'],
  ['ute', 'Utomhus', '🌳'],
];

export const OPENINGS = {
  dorr:        { name: 'Innerdörr',   icon: '🚪', kind: 'door',   w: 0.9, h: 2.1, sill: 0,    color: '#f2efe9' },
  ytterdorr:   { name: 'Ytterdörr',   icon: '🚪', kind: 'door',   w: 1.0, h: 2.1, sill: 0,    color: '#3a2a1a' },
  fonster:     { name: 'Fönster',     icon: '🪟', kind: 'window', w: 1.2, h: 1.2, sill: 0.9,  color: '#ffffff' },
  fonsterdorr: { name: 'Fönsterdörr', icon: '🪟', kind: 'window', w: 0.9, h: 2.1, sill: 0,    color: '#ffffff' },
  garageport:  { name: 'Garageport',  icon: '🚘', kind: 'garage', w: 2.5, h: 2.1, sill: 0,    color: '#c8ccd0' },
  oppning:     { name: 'Öppning',     icon: '⬚',  kind: 'hole',   w: 1.2, h: 2.1, sill: 0,    color: '#ffffff' },
};

export const ITEMS = {
  underskap:   { cat: 'kok', name: 'Underskåp', icon: '🗄️', w: .6, d: .6, h: .9, color: '#e9e5dd', color2: '#3b3b3b', c2: 'Bänkskiva', snap: 1 },
  diskho:      { cat: 'kok', name: 'Diskbänk', icon: '🚰', w: .8, d: .6, h: .9, color: '#e9e5dd', color2: '#3b3b3b', c2: 'Bänkskiva', snap: 1 },
  spis:        { cat: 'kok', name: 'Spis', icon: '🔥', w: .6, d: .6, h: .9, color: '#e9e5dd', color2: '#151515', c2: 'Häll', snap: 1 },
  overskap:    { cat: 'kok', name: 'Överskåp', icon: '🗄️', w: .6, d: .35, h: .7, elev: 1.45, color: '#e9e5dd', snap: 1 },
  flakt:       { cat: 'kok', name: 'Köksfläkt', icon: '🌀', w: .6, d: .45, h: .55, elev: 1.55, color: '#c8ccd0', snap: 1 },
  hogskap:     { cat: 'kok', name: 'Högskåp', icon: '🚪', w: .6, d: .6, h: 2.2, color: '#e9e5dd', snap: 1 },
  kyl:         { cat: 'kok', name: 'Kyl/frys', icon: '🧊', w: .6, d: .65, h: 2.0, color: '#cfd3d6', snap: 1 },
  koksoe:      { cat: 'kok', name: 'Köksö', icon: '🏝️', w: 2.4, d: 1.0, h: .9, color: '#2f3b45', color2: '#e8e4dc', c2: 'Bänkskiva' },
  matbord:     { cat: 'kok', name: 'Matbord', icon: '🍽️', w: 1.8, d: .9, h: .75, color: '#9a7550' },
  stol:        { cat: 'kok', name: 'Stol', icon: '🪑', w: .45, d: .5, h: .85, color: '#2b2b2b' },
  barstol:     { cat: 'kok', name: 'Barstol', icon: '🪑', w: .42, d: .42, h: 1.0, color: '#2b2b2b' },

  soffa:       { cat: 'vardag', name: 'Soffa', icon: '🛋️', w: 2.4, d: .95, h: .8, color: '#5b6b5a', snap: 1 },
  fatolj:      { cat: 'vardag', name: 'Fåtölj', icon: '💺', w: .85, d: .85, h: .8, color: '#a0704a' },
  soffbord:    { cat: 'vardag', name: 'Soffbord', icon: '▭', w: 1.2, d: .6, h: .42, color: '#9a7550' },
  bokhylla:    { cat: 'vardag', name: 'Bokhylla', icon: '📚', w: .8, d: .35, h: 2.0, color: '#f2efe9', snap: 1 },
  matta:       { cat: 'vardag', name: 'Matta', icon: '🟫', w: 2.0, d: 1.4, h: .01, color: '#cbbfa8' },
  vaxt:        { cat: 'vardag', name: 'Växt', icon: '🪴', w: .5, d: .5, h: 1.2, color: '#c9c2b6' },

  sang:        { cat: 'sov', name: 'Dubbelsäng', icon: '🛏️', w: 1.6, d: 2.1, h: .5, color: '#6b6f75', color2: '#e6ebf0', c2: 'Påslakan', snap: 1 },
  sang90:      { cat: 'sov', name: 'Enkelsäng', icon: '🛏️', w: .9, d: 2.0, h: .5, color: '#b8915f', color2: '#e6ebf0', c2: 'Påslakan', snap: 1 },
  nattduks:    { cat: 'sov', name: 'Sängbord', icon: '◻️', w: .45, d: .4, h: .5, color: '#9a7550', snap: 1 },
  garderob:    { cat: 'sov', name: 'Garderob', icon: '🚪', w: 1.0, d: .6, h: 2.1, color: '#f2efe9', snap: 1 },
  spegel:      { cat: 'sov', name: 'Spegel', icon: '🪞', w: .6, d: .04, h: 1.4, elev: .4, color: '#1f2328', c1: 'Ram', snap: 1 },
  skrivbord:   { cat: 'sov', name: 'Skrivbord', icon: '🖥️', w: 1.2, d: .6, h: .75, color: '#f2efe9', snap: 1 },

  toalett:     { cat: 'bad', name: 'Toalett', icon: '🚽', w: .4, d: .65, h: .8, color: '#f7f7f5', snap: 1 },
  handfat:     { cat: 'bad', name: 'Tvättställ', icon: '🚰', w: .6, d: .45, h: .85, color: '#f7f7f5', color2: '#9a7550', c2: 'Skåp', snap: 1 },
  badkar:      { cat: 'bad', name: 'Badkar', icon: '🛁', w: 1.7, d: .75, h: .55, color: '#f7f7f5', snap: 1 },
  dusch:       { cat: 'bad', name: 'Dusch', icon: '🚿', w: .9, d: .9, h: 2.0, color: '#c8ccd0', snap: 1 },
  tvattmaskin: { cat: 'bad', name: 'Tvättmaskin', icon: '🫧', w: .6, d: .6, h: .85, color: '#f7f7f5', snap: 1 },

  taklampa:    { cat: 'ljus', name: 'Taklampa', icon: '💡', w: .45, d: .45, h: .55, ceil: 1, color: '#1f2328', dev: 'light' },
  spot:        { cat: 'ljus', name: 'Spotlight', icon: '🔆', w: .1, d: .1, h: .04, ceil: 1, color: '#f2efe9', dev: 'light' },
  golvlampa:   { cat: 'ljus', name: 'Golvlampa', icon: '🪔', w: .4, d: .4, h: 1.6, color: '#1f2328', color2: '#efe6d6', c2: 'Skärm', dev: 'light' },
  bordslampa:  { cat: 'ljus', name: 'Bordslampa', icon: '🕯️', w: .25, d: .25, h: .45, elev: .5, color: '#c9a227', color2: '#efe6d6', c2: 'Skärm', dev: 'light' },
  ledlist:     { cat: 'ljus', name: 'LED-list', icon: '➖', w: 1.2, d: .03, h: .02, elev: 1.43, color: '#ffffff', dev: 'light', snap: 1 },

  tv:          { cat: 'media', name: 'TV', icon: '📺', w: 1.45, d: .06, h: .84, elev: .9, color: '#111111', dev: 'tv', snap: 1 },
  tvbank:      { cat: 'media', name: 'TV-bänk', icon: '▬', w: 1.8, d: .4, h: .45, color: '#2b2b2b', snap: 1 },
  hogtalare:   { cat: 'media', name: 'Högtalare', icon: '🔊', w: .2, d: .22, h: .35, color: '#1f2328', dev: 'speaker' },
  golvhogtalare:{ cat: 'media', name: 'Golvhögtalare', icon: '🔊', w: .25, d: .3, h: 1.05, color: '#1f2328', dev: 'speaker', snap: 1 },
  soundbar:    { cat: 'media', name: 'Soundbar', icon: '🎶', w: .9, d: .1, h: .07, elev: .47, color: '#1f2328', dev: 'speaker' },

  altan:       { cat: 'ute', name: 'Altan', icon: '🟫', w: 4, d: 3, h: .15, color: '#8a6440' },
  pool:        { cat: 'ute', name: 'Pool', icon: '🏊', w: 4, d: 2, h: .12, color: '#2bb3d6' },
  gang:        { cat: 'ute', name: 'Gång/plattor', icon: '⬜', w: 1.2, d: 4, h: .03, color: '#9a958c' },
  trad:        { cat: 'ute', name: 'Träd', icon: '🌳', w: 2.2, d: 2.2, h: 4.5, color: '#2f5a2c' },
  buske:       { cat: 'ute', name: 'Buske', icon: '🌿', w: .9, d: .9, h: .8, color: '#3d6b34' },
  utelampa:    { cat: 'ute', name: 'Utebelysning', icon: '🏮', w: .14, d: .14, h: .6, color: '#222222', dev: 'light' },
  staket:      { cat: 'ute', name: 'Staket', icon: '🚧', w: 3, d: .06, h: 1.0, color: '#b4844f' },
  utesoffa:    { cat: 'ute', name: 'Utesoffa', icon: '🛋️', w: 2.0, d: .8, h: .7, color: '#7a6a58' },
  grill:       { cat: 'ute', name: 'Grill', icon: '🍖', w: .7, d: .5, h: 1.05, color: '#1f2328' },
  bil:         { cat: 'ute', name: 'Bil', icon: '🚗', w: 1.85, d: 4.6, h: 1.45, color: '#2c3e50' },
};

export const PALETTE = ['#ffffff', '#f2efe9', '#e6dccb', '#cfc6b8', '#9aa19a', '#5b6b5a', '#2f5d50', '#3f4a5a', '#2f3b45', '#1f2328',
  '#7a4e2d', '#9a7550', '#b8915f', '#d9b48c', '#a33b2b', '#c9a227', '#c8ccd0', '#6b6f75'];

export const FLOORS = { tra: 'Trägolv', klinker: 'Klinker', betong: 'Betong', matta: 'Heltäckning' };

export const HOME_TYPES = {
  hus: { name: 'Hus', icon: '🏡' },
  lagenhet: { name: 'Lägenhet', icon: '🏢' },
  stuga: { name: 'Sommarstuga', icon: '🌲' },
};
