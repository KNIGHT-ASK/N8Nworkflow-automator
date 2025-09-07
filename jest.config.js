module.exports = {
	bail: false,
	verbose: true,
	projects: [
		{
			displayName: 'unit',
			testEnvironment: 'jsdom',
			testMatch: ['**/tests/unit-tests.js', '**/tests/unit/**/*.test.js']
		},
		{
			displayName: 'integration',
			testEnvironment: 'node',
			testMatch: ['**/tests/integration-tests.js', '**/tests/integration/**/*.test.js']
		},
		{
			displayName: 'e2e',
			testEnvironment: 'jest-environment-puppeteer',
			testMatch: ['**/tests/e2e/**/*.test.js']
		}
	]
}; 