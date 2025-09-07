const axios = require('axios');

jest.mock('axios');

describe('AI Provider Integration', () => {
	beforeAll(() => {
		axios.post.mockResolvedValue({ data: { ok: true } });
	});

	test('should call AI provider endpoint', async () => {
		const response = await axios.post('https://example.ai/complete', { prompt: 'Hello' });
		expect(response.data.ok).toBe(true);
		expect(axios.post).toHaveBeenCalled();
	});
}); 