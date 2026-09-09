import * as D from './src/data.js';
const show = (k) => {
  const v = D[k];
  const s = JSON.stringify(v);
  console.log('=== ' + k + ' === len=' + (Array.isArray(v) ? v.length : Object.keys(v || {}).length));
  console.log(s ? s.slice(0, 1200) : String(v));
};
for (const k of ['AGENTS', 'APPROVAL_ASKS', 'APPROVAL_BY_AGENT', 'BILLBOARDS', 'TOKENS', 'WORKLINES', 'LAYOUT']) show(k);
