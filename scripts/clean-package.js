const fs = require('fs');
const path = require('path');

const pkgPath = path.resolve(__dirname, '..', 'package.json');
let s = fs.readFileSync(pkgPath, 'utf8');
// Keep tab(9), LF(10), CR(13), and printable >=32
s = Array.from(s).filter(ch => {
	const c = ch.charCodeAt(0);
	return c === 9 || c === 10 || c === 13 || c >= 32;
}).join('');
const obj = JSON.parse(s);
fs.writeFileSync(pkgPath, JSON.stringify(obj, null, 2) + '\n', 'utf8');
console.log('package.json cleaned successfully'); 