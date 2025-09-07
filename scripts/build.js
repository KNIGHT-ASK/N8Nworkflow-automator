const { execSync } = require('child_process');

function run(command) {
	console.log(`$ ${command}`);
	execSync(command, { stdio: 'inherit' });
}

try {
	run('npm run lint');
	run('npm run test:unit');
	run('npm run test:integration');
	run('npm run audit');
	run('npm run build');
	console.log('Build completed successfully.');
} catch (err) {
	console.error('Build failed:', err);
	process.exit(1);
} 