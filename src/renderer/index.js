const state = {
  settings: null,
  usage: null,
  digest: null
};

const tabButtons = document.querySelectorAll('.tab-button');
const panels = {
  overview: document.getElementById('tab-overview'),
  insights: document.getElementById('tab-insights'),
  settings: document.getElementById('tab-settings')
};

tabButtons.forEach((button) => {
  button.addEventListener('click', () => switchTab(button.dataset.tab));
});

function switchTab(tab) {
  tabButtons.forEach((button) => {
    button.classList.toggle('active', button.dataset.tab === tab);
  });

  Object.entries(panels).forEach(([key, panel]) => {
    panel.classList.toggle('hidden', key !== tab);
  });

  render();
}

function formatDuration(ms) {
  if (!ms) return '0m';
  const totalMinutes = Math.round(ms / 60000);
  const hours = Math.floor(totalMinutes / 60);
  const minutes = totalMinutes % 60;
  if (hours === 0) {
    return `${minutes}m`;
  }
  return `${hours}h ${minutes}m`;
}

function formatDateTime(timestamp) {
  if (!timestamp) return '—';
  const formatter = new Intl.DateTimeFormat(undefined, {
    dateStyle: 'medium',
    timeStyle: 'short'
  });
  return formatter.format(new Date(timestamp));
}

function renderOverview() {
  const container = panels.overview;
  container.innerHTML = '';

  if (!state.usage || !state.usage.applications.length) {
    container.innerHTML = `<div class="empty-state">Usage data will appear once we have enough history.</div>`;
    return;
  }

  const summaryCard = document.createElement('section');
  summaryCard.className = 'card';
  summaryCard.innerHTML = `
    <div class="flex-row">
      <h2>Today</h2>
      <span class="badge">${formatDateTime(state.usage.generatedAt)}</span>
    </div>
    <div class="stat-grid">
      <div class="stat-tile">
        <p class="stat-title">Active time</p>
        <p class="stat-value">${formatDuration(state.usage.totalDuration)}</p>
      </div>
      <div class="stat-tile">
        <p class="stat-title">Focused apps</p>
        <p class="stat-value">${state.usage.applications.length}</p>
      </div>
      <div class="stat-tile">
        <p class="stat-title">Last digest</p>
        <p class="stat-value">${formatDateTime(state.digest?.generatedAt)}</p>
      </div>
    </div>
  `;

  const topAppsCard = document.createElement('section');
  topAppsCard.className = 'card';
  topAppsCard.innerHTML = `
    <h2>Most used apps</h2>
    <ul class="list">
      ${state.usage.applications
        .slice(0, 5)
        .map(
          (app) => `
            <li class="list-item">
              <strong>${app.name}</strong>
              <span>${formatDuration(app.totalDuration)}</span>
            </li>
          `
        )
        .join('')}
    </ul>
  `;

  container.append(summaryCard, topAppsCard);
}

function renderInsights() {
  const container = panels.insights;
  container.innerHTML = '';

  const digest = state.digest;
  if (!digest) {
    container.innerHTML = `<div class="empty-state">Insights will appear after your first daily digest.</div>`;
    return;
  }

  const summaryCard = document.createElement('section');
  summaryCard.className = 'card';
  summaryCard.innerHTML = `
    <div class="flex-row">
      <h2>Daily digest</h2>
      <span class="badge">${formatDateTime(digest.generatedAt)}</span>
    </div>
    <p>${digest.summary || 'No summary available.'}</p>
    <button class="button" id="refresh-digest">Refresh insights now</button>
  `;

  const insightsCard = document.createElement('section');
  insightsCard.className = 'card';
  insightsCard.innerHTML = `
    <h2>Insights</h2>
    ${renderList(digest.insights)}
  `;

  const newsCard = document.createElement('section');
  newsCard.className = 'card';
  newsCard.innerHTML = `
    <h2>News & trends</h2>
    ${renderList(digest.news)}
  `;

  const tasksCard = document.createElement('section');
  tasksCard.className = 'card';
  tasksCard.innerHTML = `
    <h2>Suggested tasks</h2>
    ${renderList(digest.tasks)}
  `;

  container.append(summaryCard, insightsCard, newsCard, tasksCard);

  const refreshButton = document.getElementById('refresh-digest');
  refreshButton?.addEventListener('click', async () => {
    refreshButton.disabled = true;
    refreshButton.textContent = 'Refreshing…';
    try {
      const updated = await window.assistantAPI.triggerDigest();
      state.digest = updated;
      render();
    } finally {
      refreshButton.disabled = false;
      refreshButton.textContent = 'Refresh insights now';
    }
  });
}

function renderSettings() {
  if (!state.settings) {
    state.settings = {};
  }
  const container = panels.settings;
  container.innerHTML = '';

  const card = document.createElement('section');
  card.className = 'card';
  card.innerHTML = `
    <h2>OpenRouter</h2>
    <div class="settings-group">
      <label class="label" for="api-key">API key</label>
      <input
        class="input"
        id="api-key"
        type="password"
        autocomplete="off"
        placeholder="sk-or-v1..."
        value="${state.settings?.apiKey || ''}"
      />
      <span class="helper">Your key is stored locally using encrypted Windows credentials.</span>
      <button class="button" id="save-key">Save key</button>
      <button class="button" id="run-digest">Run daily digest now</button>
      <span class="small">Next automatic digest runs every 24 hours based on your activity.</span>
    </div>
  `;

  container.append(card);

  const apiInput = document.getElementById('api-key');
  const saveButton = document.getElementById('save-key');
  const runButton = document.getElementById('run-digest');

  saveButton.addEventListener('click', async () => {
    saveButton.disabled = true;
    await window.assistantAPI.setApiKey(apiInput.value.trim());
    state.settings.apiKey = apiInput.value.trim();
    saveButton.textContent = 'Saved';
    setTimeout(() => {
      saveButton.textContent = 'Save key';
      saveButton.disabled = false;
    }, 1500);
  });

  runButton.addEventListener('click', async () => {
    runButton.disabled = true;
    runButton.textContent = 'Generating…';
    try {
      const digest = await window.assistantAPI.triggerDigest();
      state.digest = digest;
      switchTab('insights');
    } finally {
      runButton.disabled = false;
      runButton.textContent = 'Run daily digest now';
    }
  });
}

function renderList(items) {
  if (!items || !items.length) {
    return '<div class="empty-state">No data yet.</div>';
  }
  return `
    <ul class="list">
      ${items
        .map(
          (item) => `
            <li class="list-item">
              <strong>${escapeHtml(item.title || item)}</strong>
              ${item.description ? `<span>${escapeHtml(item.description)}</span>` : ''}
            </li>
          `
        )
        .join('')}
    </ul>
  `;
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

async function bootstrap() {
  state.settings = await window.assistantAPI.getSettings();
  state.settings = state.settings || {};
  state.usage = await window.assistantAPI.getUsageSummary();
  state.digest = await window.assistantAPI.getLatestDigest();
  render();

  window.assistantAPI.onDigest((digest) => {
    state.digest = digest;
    render();
  });
}

function render() {
  renderOverview();
  renderInsights();
  renderSettings();
}

bootstrap().catch((error) => {
  console.error('Failed to initialize renderer', error);
  panels.overview.innerHTML = `<div class="empty-state">${escapeHtml(error.message)}</div>`;
});
