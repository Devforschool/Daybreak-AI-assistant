class OpenRouterClient {
  constructor(store, options = {}) {
    this.store = store;
    this.model = options.model || 'openrouter/auto';
    this.systemPrompt = options.systemPrompt ||
      'You are a productivity assistant that summarizes computer usage into insights, trends, news, and actionable tasks.';
  }

  async generateDigest(usageSummary) {
    const apiKey = (this.store && this.store.get('apiKey')) || '';
    if (!apiKey) {
      return {
        generatedAt: Date.now(),
        insights: [],
        news: [],
        tasks: [],
        summary: 'Add your OpenRouter API key to generate insights.',
        raw: null,
        error: 'missing_api_key'
      };
    }

    const prompt = this.buildPrompt(usageSummary);
    const body = {
      model: this.model,
      messages: [
        { role: 'system', content: this.systemPrompt },
        { role: 'user', content: prompt }
      ],
      response_format: { type: 'json_object' }
    };

    try {
      const response = await fetch('https://openrouter.ai/api/v1/chat/completions', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${apiKey}`,
          'HTTP-Referer': 'https://github.com/',
          'X-Title': 'Windows Productivity Assistant'
        },
        body: JSON.stringify(body)
      });

      if (!response.ok) {
        const errorPayload = await response.text();
        throw new Error(`OpenRouter request failed: ${response.status} ${errorPayload}`);
      }

      const payload = await response.json();
      const message = payload.choices?.[0]?.message?.content;
      const parsed = this.safeParseJson(message);

      return {
        generatedAt: Date.now(),
        insights: parsed?.insights || [],
        news: parsed?.news || [],
        tasks: parsed?.tasks || [],
        summary: parsed?.summary || parsed?.overview || message,
        raw: payload
      };
    } catch (error) {
      return {
        generatedAt: Date.now(),
        insights: [],
        news: [],
        tasks: [],
        summary: 'Unable to contact OpenRouter. Check your internet connection or API key.',
        raw: null,
        error: error.message
      };
    }
  }

  buildPrompt(usageSummary) {
    const lines = [];
    lines.push('You will receive desktop usage telemetry for the last 24 hours.');
    lines.push('Return a JSON object with keys: summary (string), insights (array of strings), news (array of strings), tasks (array of strings).');
    lines.push('News should highlight relevant industry or productivity trends based on observed applications.');
    lines.push('Tasks should be actionable follow-ups the user can perform tomorrow.');
    lines.push('Usage summary:');
    lines.push(JSON.stringify(usageSummary, null, 2));
    return lines.join('\n');
  }

  safeParseJson(content) {
    if (!content) {
      return null;
    }
    try {
      return JSON.parse(content);
    } catch (error) {
      return null;
    }
  }
}

module.exports = { OpenRouterClient };
