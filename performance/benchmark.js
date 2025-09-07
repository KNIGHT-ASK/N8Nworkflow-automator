const { performance } = require('perf_hooks');

function measure(label, fn, iterations = 1000) {
	const start = performance.now();
	for (let i = 0; i < iterations; i++) {
		fn();
	}
	const end = performance.now();
	const totalMs = end - start;
	console.log(`${label}: ${(totalMs / iterations).toFixed(4)} ms/op over ${iterations} iters`);
}

function noop() {}

if (require.main === module) {
	measure('noop', noop, 100000);
}

module.exports = { measure }; 