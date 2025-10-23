const { app, BrowserWindow, ipcMain, Notification } = require('electron');
const path = require('path');
const Store = require('electron-store');
const { UsageTracker } = require('../common/usageTracker');
const { DigestScheduler } = require('../common/digestScheduler');
const { OpenRouterClient } = require('../common/openRouterClient');

const store = new Store({
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

let mainWindow;
let usageTracker;
let digestScheduler;

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

app.whenReady().then(() => {
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

ipcMain.handle('settings:get', () => ({
  apiKey: store.get('apiKey'),
  preferences: store.get('preferences')
}));

ipcMain.handle('settings:set-api-key', (_event, apiKey) => {
  store.set('apiKey', apiKey || '');
  return { success: true };
});

ipcMain.handle('usage:get-summary', () => {
  return usageTracker.getSummary({
    since: Date.now() - (store.get('preferences.digestIntervalMs') || 24 * 60 * 60 * 1000)
  });
});

ipcMain.handle('digest:get-latest', () => {
  return digestScheduler.getLatestDigest();
});

ipcMain.handle('digest:trigger', async () => {
  const digest = await digestScheduler.runDigest();
  return digest;
});

ipcMain.handle('preferences:update', (_event, updates) => {
  const preferences = { ...store.get('preferences'), ...updates };
  store.set('preferences', preferences);

  if (Object.prototype.hasOwnProperty.call(updates, 'pollIntervalMs') && usageTracker) {
    usageTracker.stop();
    usageTracker = new UsageTracker(store, {
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
