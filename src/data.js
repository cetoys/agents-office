// Agents Office v2 — roster + design tokens (ported from v1 command-centre.html)

// Nominal.so tokens (locked design language, 30 Jul 2026)
export const TOKENS = {
  cream: '#FDFFF8',
  ink: '#151414',
  grey: '#5A5A5A',
  hairline: 'rgba(21,20,20,0.12)',
};

// Dept mapping: Support→mint, Sales→butter, Marketing→coral, Finance→periwinkle,
// Operations→violet, Brain→sage.
// NOTE (17 Aug 2026): the old 'ops' pod split in two. The accounting half kept the pod,
// the periwinkle palette and the key 'fin' (now FINANCE); Proposals + Intel moved out into
// a new 'ops' pod (OPERATIONS) alongside Legal Review, Compliance and Internal Reporting.
// V3.1 (5 Sep 2026, AJ): SUPPORT → EMAILS (same mint slot), new DELIVERY pod (sky) on the top axis.
export const DEPT_KEYS = ['emails', 'sales', 'marketing', 'ops', 'fin', 'delivery'];
export const DEPTS = {
  emails:    { name: 'ARAŞTIRMA', short: 'ARAŞTIRMA',  chip: '#5ADEB7', ink: '#1E9070', floor: '#E9F6EF' },
  delivery:  { name: 'ÜRÜN',      short: 'ÜRÜN', chip: '#8FD3F4', ink: '#2E86AB', floor: '#E6F4FB' },
  sales:     { name: 'OYUN',      short: 'OYUN',   chip: '#EADC8F', ink: '#A08A1E', floor: '#F6F1DA' },
  marketing: { name: 'BÜYÜME',    short: 'BÜYÜME', chip: '#E69393', ink: '#C46060', floor: '#FAE9E7' },
  fin:       { name: 'PARA',      short: 'PARA', chip: '#98A5EF', ink: '#5B66CE', floor: '#EAEDFA' },
  ops:       { name: 'E-TİCARET', short: 'E-TİCARET', chip: '#BFA2E3', ink: '#7449A9', floor: '#F2ECFA' },
  brain:     { name: 'BEYİN',             short: 'BEYİN', chip: '#D1DECD', ink: '#4C7A57', floor: '#E9EFE4' },
};

// 35 agents (V3.4, 7 Sep 2026: every department has a lead). grid = [col,row] desk slot on the department plinth.
export const AGENTS = [
  // EMAILS (5) — replaced Customer Support, 5 Sep 2026
  { id: 'elead', name: "ARAŞTIRMA ŞEFİ",         dept: 'emails',    lead: true,  grid: [0.5, 0], hair: '#2b2b2b', skin: '#E8B98E' },
  { id: 'cmail', name: "RAKİP ANALİZİ",       dept: 'emails',    grid: [0, 1], hair: '#3b2b1d', skin: '#F0C9A0' },
  { id: 'imail', name: "TEKNOLOJİ TARAMA",     dept: 'emails',    grid: [1, 1], hair: '#111111', skin: '#C68B59' },
  { id: 'vmail', name: "KULLANICI SESİ",       dept: 'emails',    grid: [0, 2], hair: '#7a3b12', skin: '#F5D5B0' },
  { id: 'kmail', name: "FİKİR DEFTERİ",   dept: 'emails',    grid: [1, 2], hair: '#4a2a10', skin: '#D89F70' },
  // SALES (6) — Sales Lead at the head; Proposals moved in from Operations, Outreach retired
  { id: 'lexi',  name: "OYUN ŞEFİ",          dept: 'sales',     lead: true,  grid: [0.5, 0], hair: '#5a2d0c', skin: '#F0C9A0' },
  { id: 'enzo',  name: "OYUN TASARIMI",       dept: 'sales',     grid: [0, 1], hair: '#1c1c2e', skin: '#E0A878' },
  { id: 'ilm',   name: "SEVİYE VE İÇERİK", dept: 'sales',   grid: [1, 1], hair: '#26140a', skin: '#F5D5B0' },
  { id: 'pros',  name: "OYUN GÖRSELİ",          dept: 'sales',     grid: [0, 2], hair: '#2a1a0e', skin: '#E8B98E' },
  { id: 'piper', name: "OYUN SESİ",           dept: 'sales',     grid: [1, 2], hair: '#2d1a0a', skin: '#F0C9A0' },
  { id: 'folo',  name: "OYUN TESTİ",          dept: 'sales',     grid: [0.5, 3], hair: '#171717', skin: '#F5D5B0' },
  // MARKETING (7) — Marketing Lead at the head since 7 Sep 2026
  { id: 'mlead', name: "BÜYÜME ŞEFİ",      dept: 'marketing', lead: true,  grid: [0.5, 0], hair: '#2a1a0e', skin: '#E0A878' },
  { id: 'riley', name: "ASO / SEO",            dept: 'marketing', grid: [0, 1], hair: '#8a4a1f', skin: '#F5D5B0' },
  { id: 'newt',  name: "LANSMAN METNİ",          dept: 'marketing', grid: [1, 1], hair: '#26140a', skin: '#D89F70' },
  { id: 'gfx',   name: "TANITIM GÖRSELİ",   dept: 'marketing', grid: [0, 2], hair: '#141414', skin: '#F0C9A0' },
  { id: 'ada',   name: "REKLAM",            dept: 'marketing', grid: [1, 2], hair: '#3d2814', skin: '#C68B59' },
  { id: 'iggy',  name: "SOSYAL",   dept: 'marketing', grid: [0, 3], hair: '#552200', skin: '#E8B98E' },
  { id: 'vid',   name: "VİDEO",        dept: 'marketing', grid: [1, 3], hair: '#1b1b24', skin: '#D9A97E' },
  // OPERATIONS (6) — Operations Lead at the head since 7 Sep 2026; Internal Dashboards joins; Proposals moved to Sales
  { id: 'olead', name: "E-TİCARET ŞEFİ",     dept: 'ops',       lead: true,  grid: [0.5, 0], hair: '#111111', skin: '#F0C9A0' },
  { id: 'scout', name: "ÜRÜN ARAŞTIRMA",               dept: 'ops',       grid: [0, 1], hair: '#101820', skin: '#B07850' },
  { id: 'legal', name: "LİSTELEME",        dept: 'ops',       grid: [1, 1], hair: '#20242e', skin: '#F0C9A0' },
  { id: 'comply', name: "GÖRSEL ÜRETİM", dept: 'ops',       grid: [0, 2], hair: '#5a3a1a', skin: '#C68B59' },
  { id: 'report', name: "SİPARİŞ TAKİP", dept: 'ops',       grid: [1, 2], hair: '#2e2118', skin: '#E8B98E' },
  { id: 'dash',  name: "OTOMASYON", dept: 'ops',       grid: [0.5, 3], hair: '#0d0d0d', skin: '#9C6B43' },
  // FINANCE (4) — the accounting team; Accounting Lead at the head
  { id: 'alead', name: "PARA ŞEFİ",     dept: 'fin',       lead: true,  grid: [0.5, 0], hair: '#1f1f1f', skin: '#E0A878' },
  { id: 'invo',  name: "ABONELİK AVCISI",           dept: 'fin',       grid: [0, 1], hair: '#4a2a10', skin: '#F5D5B0' },
  { id: 'apay',  name: "MALİYET",    dept: 'fin',       grid: [1, 1], hair: '#0a0a0a', skin: '#8A5A32' },
  { id: 'recon', name: "GELİR TAKİP",      dept: 'fin',       grid: [0.5, 2], hair: '#33221a', skin: '#E8B98E' },
  // DELIVERY (7) — new pod, 5 Sep 2026; Onboarder moved in from Sales
  { id: 'dlead', name: "ÜRÜN ŞEFİ",       dept: 'delivery',  lead: true,  grid: [0.5, 0], hair: '#1f1f1f', skin: '#F0C9A0' },
  { id: 'pco',   name: "SPEC YAZARI", dept: 'delivery', grid: [0, 1], hair: '#3d2814', skin: '#E8B98E' },
  { id: 'qa',    name: "TEST", dept: 'delivery', grid: [1, 1], hair: '#101820', skin: '#C68B59' },
  { id: 'crep',  name: "SÜRÜM NOTU",      dept: 'delivery',  grid: [0, 2], hair: '#6b3410', skin: '#F5D5B0' },
  { id: 'cass',  name: "KOD ARŞİVİ",       dept: 'delivery',  grid: [1, 2], hair: '#141414', skin: '#D9A97E' },
  { id: 'dasst', name: "ARAYÜZ",  dept: 'delivery',  grid: [0, 3], hair: '#552200', skin: '#F0C9A0' },
  { id: 'ona',   name: "İLK KULLANICI",           dept: 'delivery',  grid: [1, 3], hair: '#0d0d0d', skin: '#9C6B43' },
];

// Plinth placement in world XZ. Brain central; departments well separated (AJ: not too close at zoom-out).
export const LAYOUT = {
  brain:     { pos: [0, 0],     w: 16, d: 16 },
  emails:    { pos: [-30, -23], w: 20, d: 26 },
  delivery:  { pos: [0, -48],   w: 20, d: 30 },   // 6th pod mirrors ops on the top axis
  sales:     { pos: [30, -23],  w: 20, d: 30 },
  marketing: { pos: [-30, 23],  w: 20, d: 30 },
  fin:       { pos: [30, 23],   w: 20, d: 26 },
  ops:       { pos: [0, 48],    w: 20, d: 30 },   // the 5th pod fills the empty bottom-left gap
};

// Department billboard metrics (v1 rule #5: live metrics float above each dept,
// values tick green on change, "Waiting Approval" pulses amber when > 0).
// Depo buraya uydurma başlangıç değerleri koyuyordu (EMAILS SENT 128, AD SPEND $684...).
// Sıfırlandı: bir sayı ancak gerçekten olduysa görünür.
export const BILLBOARDS = {
  emails: [], delivery: [], sales: [], marketing: [], ops: [], fin: [], brain: [],
};

// Approval asks (agent requests → AJ decides; v1 flavour).
// Per-agent first so the ask matches who's asking; dept pool is the fallback.
// GERCEK-VERI KURALI: APPROVAL_ASKS / APPROVAL_BY_AGENT (uydurma onay istekleri) sokuldu.
// Onay istegi yalnizca ajanin gercekten sordugu SORU ile olusur.

