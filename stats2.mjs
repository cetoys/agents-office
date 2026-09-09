import * as D from './src/data.js';
console.log('exports:', Object.keys(D).join(', '));
const dep = D.DEPTS;
console.log('DEPTS type:', typeof dep, Array.isArray(dep));
console.log(JSON.stringify(dep, null, 1).slice(0, 2000));
