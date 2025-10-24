const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const path = require('path');
const { UsageTracker } = require('../common/usageTracker');
const { DigestScheduler } = require('../common/digestScheduler');
const { OpenRouterClient } = require('../common/openRouterClient');

let Store;
let store;

let mainWindow;
let usageTracker;
let digestScheduler;

async function initializeStore() {
  if (store) {
    return store;
  }

  const module = await import('electron-store');
  Store = module.default;

  store = new Store({
    name: 'assistant-settings',
    defaults: {
      apiKey: '',
      usageLog: [],
      lastDigestAt: null,
      lastDigest: null,
      preferences: {
        pollIntervalMs: 30000,
        digestIntervalMs: 24 * 60 * 60 * 1000
      }
    }
  });

  return store;
}

function createWindow() {
  mainWindow = new BrowserWindow({
    width: 420,
    height: 600,
    alwaysOnTop: false,
    frame: false,
    resizable: true,
    transparent: false,
    backgroundColor: '#1a1c22ee',
    titleBarStyle: 'hidden',
    skipTaskbar: false,
    autoHideMenuBar: true,
    webPreferences: {
      preload: path.join(__dirname, '../preload/preload.js'),
      nodeIntegration: false,
      contextIsolation: true
    }
  });

  mainWindow.loadFile(path.join(__dirname, '../renderer/index.html'));

  mainWindow.on('closed', () => {
    mainWindow = null;
  });
}

function setupUsageTracker() {
  usageTracker = new UsageTracker(store, {
    pollIntervalMs: store.get('preferences.pollIntervalMs') || 30000,
    onError: (error) => {
      console.error('Usage tracker error:', error);
    }
  });
  usageTracker.start();
}

function setupDigestScheduler() {
  digestScheduler = new DigestScheduler({
    store,
    usageTracker,
    openRouterFactory: () => new OpenRouterClient(store),
    onDigest: (digest) => {
      if (mainWindow) {
        mainWindow.webContents.send('digest:new', digest);
      }
      notifyDigestReady(digest);
    }
  });
  digestScheduler.start();
}

function notifyDigestReady(digest) {
  if (!Notification.isSupported()) {
    return;
  }

  const title = 'Your productivity insights are ready';
  const body = digest?.summary || 'Open the assistant to review today\'s highlights.';

  const notification = new Notification({ title, body });
  notification.show();
}

app.whenReady().then(async () => {
  await initializeStore();

  createWindow();
  setupUsageTracker();
  setupDigestScheduler();

  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) {
      createWindow();
    }
  });
});

app.on('before-quit', () => {
  usageTracker?.stop();
  digestScheduler?.stop();
});

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') {
    app.quit();
  }
});

ipcMain.handle('settings:get', async () => {
  const settingsStore = await initializeStore();
  return {
    apiKey: settingsStore.get('apiKey'),
    preferences: settingsStore.get('preferences')
  };
});

ipcMain.handle('settings:set-api-key', async (_event, apiKey) => {
  const settingsStore = await initializeStore();
  settingsStore.set('apiKey', apiKey || '');
  return { success: true };
});

ipcMain.handle('usage:get-summary', async () => {
  const settingsStore = await initializeStore();
  return usageTracker.getSummary({
    since: Date.now() - (settingsStore.get('preferences.digestIntervalMs') || 24 * 60 * 60 * 1000)
  });
});

ipcMain.handle('digest:get-latest', async () => {
  await initializeStore();
  return digestScheduler.getLatestDigest();
});

ipcMain.handle('digest:trigger', async () => {
  await initializeStore();
  const digest = await digestScheduler.runDigest();
  return digest;
});

ipcMain.handle('preferences:update', async (_event, updates) => {
  const settingsStore = await initializeStore();
  const preferences = { ...settingsStore.get('preferences'), ...updates };
  settingsStore.set('preferences', preferences);

  if (Object.prototype.hasOwnProperty.call(updates, 'pollIntervalMs') && usageTracker) {
    usageTracker.stop();
    usageTracker = new UsageTracker(settingsStore, {
      pollIntervalMs: preferences.pollIntervalMs,
      onError: (error) => console.error('Usage tracker error:', error)
    });
    usageTracker.start();
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'digestIntervalMs') && digestScheduler) {
    digestScheduler.intervalMs = preferences.digestIntervalMs;
  }

  return preferences;
});
