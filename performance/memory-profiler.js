function snapshotMemory(label = 'snapshot') {
	global.gc && global.gc();
	const usage = process.memoryUsage();
	console.log(`[${label}] rss=${usage.rss} heapUsed=${usage.heapUsed} heapTotal=${usage.heapTotal}`);
	return usage;
}

module.exports = { snapshotMemory }; 