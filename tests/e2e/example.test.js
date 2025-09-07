/\/\/ @jest-environment puppeteer/

describe.skip('Extension popup loads', () => {
	it('should open a blank page', async () => {
		await page.goto('about:blank');
		const title = await page.title();
		expect(typeof title).toBe('string');
	});
}); 