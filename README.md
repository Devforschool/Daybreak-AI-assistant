# Daybreak Windows Assistant

Daybreak is a Windows desktop companion that monitors which apps and browser windows you focus on, then surfaces daily insights, curated news, and suggested follow-up tasks powered by OpenRouter models. The experience lives in a compact, glassmorphism-inspired panel that can stay on your desktop without getting in the way.

## Features

- **Activity tracking** – Records the active window on Windows machines, grouping activity by application for rich summaries.
- **Daily digest** – Every 24 hours the assistant assembles insights, headlines, and actionable follow-ups tailored to your usage.
- **OpenRouter integration** – Bring your own OpenRouter API key to generate AI-driven recommendations.
- **Manual refresh** – Trigger a digest on demand to get up-to-the-minute analysis.
- **Secure storage** – Settings, including your API key, are stored locally via `electron-store`.

## Project structure

```
├── package.json
├── src
│   ├── common
│   │   ├── digestScheduler.js
│   │   ├── openRouterClient.js
│   │   └── usageTracker.js
│   ├── main
│   │   └── main.js
│   ├── preload
│   │   └── preload.js
│   └── renderer
│       ├── index.html
│       ├── index.js
│       └── styles
│           └── main.css
└── .gitignore
```

## Getting started

1. Install dependencies:

   ```bash
   npm install
   ```

2. Start the desktop panel:

   ```bash
   npm start
   ```

3. Open the **Settings** tab and add your OpenRouter API key (`sk-or-v1...`).

4. Keep Daybreak running in the background. Every 24 hours you will receive a Windows toast notification when a new digest is ready. Use the **Insights** tab to review insights, news, and suggested tasks.

### Manual daily digest

Use the **Refresh insights now** or **Run daily digest now** buttons to generate a digest immediately. This is helpful while testing or after entering your API key.

## Windows activity tracking

Daybreak polls the current foreground window using a lightweight PowerShell interop. The script queries the active process handle, capturing the executable name and window title. If you prefer a different approach (such as integrating with a higher fidelity telemetry service), update `src/common/usageTracker.js`.

> **Note:** Foreground activity tracking is only available on Windows. Other platforms will skip usage collection but the assistant UI will still launch for development.

## OpenRouter output format

The assistant requests responses in JSON form. The AI model should return:

```json
{
  "summary": "Short overview paragraph",
  "insights": ["Highlight #1", "Highlight #2"],
  "news": ["Relevant news item"],
  "tasks": ["Actionable follow-up"]
}
```

If parsing fails or no API key is set, Daybreak will show an informative message instead of insights.
