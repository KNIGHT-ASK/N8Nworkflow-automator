const { execSync } = require('child_process');

function run(cmd) {
	console.log(`$ ${cmd}`);
	execSync(cmd, { stdio: 'inherit' });
}

try {
	run('npm ci');
	run('npm run lint');
	run('npm run test:unit');
	run('npm run test:integration');
	run('npm run audit');
	console.log('CI tests completed successfully');
} catch (e) {
	console.error('CI failed:', e.message);
	process.exit(1);
} 