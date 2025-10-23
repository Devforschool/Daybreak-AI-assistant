const { execFile } = require('child_process');

class UsageTracker {
  constructor(store, options = {}) {
    this.store = store;
    this.pollIntervalMs = options.pollIntervalMs || 30000;
    this.maxEntries = options.maxEntries || 5000;
    this.timer = null;
    this.currentEntry = null;
    this.onError = options.onError || (() => {});
  }

  start() {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => this.pollActiveWindow(), this.pollIntervalMs);
    this.pollActiveWindow();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
    this.flushCurrentEntry();
  }

  async pollActiveWindow() {
    try {
      const windowInfo = await this.getActiveWindow();
      if (!windowInfo) {
        return;
      }

      const now = Date.now();
      if (
        this.currentEntry &&
        this.currentEntry.name === windowInfo.name &&
        this.currentEntry.title === windowInfo.title
      ) {
        this.currentEntry.durationMs += this.pollIntervalMs;
        this.currentEntry.lastSeenAt = now;
        return;
      }

      this.flushCurrentEntry();
      this.currentEntry = {
        name: windowInfo.name || 'Unknown',
        title: windowInfo.title || 'Untitled',
        path: windowInfo.path || '',
        startedAt: now,
        lastSeenAt: now,
        durationMs: this.pollIntervalMs
      };
    } catch (error) {
      this.onError(error);
    }
  }

  flushCurrentEntry() {
    if (!this.currentEntry) {
      return;
    }

    const entries = this.store.get('usageLog') || [];
    entries.push({ ...this.currentEntry, endedAt: Date.now() });

    if (entries.length > this.maxEntries) {
      entries.splice(0, entries.length - this.maxEntries);
    }

    this.store.set('usageLog', entries);
    this.currentEntry = null;
  }

  getUsageEntries() {
    const entries = this.store.get('usageLog') || [];
    return entries.map((entry) => ({
      ...entry,
      durationMs: entry.durationMs || Math.max(0, (entry.endedAt || entry.lastSeenAt) - entry.startedAt)
    }));
  }

  getSummary({ since } = {}) {
    const entries = this.getUsageEntries();
    const cutoff = since ? new Date(since).getTime() : null;
    const filtered = cutoff ? entries.filter((entry) => entry.startedAt >= cutoff) : entries;

    const totalDuration = filtered.reduce((sum, entry) => sum + (entry.durationMs || 0), 0);

    const applications = Object.values(
      filtered.reduce((acc, entry) => {
        const key = entry.name.toLowerCase();
        if (!acc[key]) {
          acc[key] = {
            name: entry.name,
            totalDuration: 0,
            windows: []
          };
        }
        acc[key].totalDuration += entry.durationMs || 0;
        acc[key].windows.push(entry);
        return acc;
      }, {})
    )
      .map((app) => ({
        ...app,
        windows: app.windows
          .sort((a, b) => (b.durationMs || 0) - (a.durationMs || 0))
          .slice(0, 10)
      }))
      .sort((a, b) => b.totalDuration - a.totalDuration);

    return {
      generatedAt: Date.now(),
      totalDuration,
      applications,
      entries: filtered
    };
  }

  async getActiveWindow() {
    if (process.platform !== 'win32') {
      return null;
    }

    const script = `
$signature = @'
using System;
using System.Runtime.InteropServices;
public class ForegroundWindow
{
    [DllImport("user32.dll")]
    public static extern IntPtr GetForegroundWindow();

    [DllImport("user32.dll")]
    public static extern uint GetWindowThreadProcessId(IntPtr hWnd, out uint processId);
}
'@
Add-Type $signature
$ptr = [ForegroundWindow]::GetForegroundWindow()
if ($ptr -eq [IntPtr]::Zero) {
  return
}
$pid = 0
[ForegroundWindow]::GetWindowThreadProcessId($ptr, [ref]$pid) | Out-Null
if ($pid -eq 0) {
  return
}
try {
  $process = Get-Process -Id $pid -ErrorAction Stop
  $title = $process.MainWindowTitle
  $path = $null
  if ($process.Path) { $path = $process.Path }
  $payload = [ordered]@{
    Name = $process.ProcessName
    Title = $title
    Path = $path
  }
  $payload | ConvertTo-Json -Compress
} catch {
  return
}
`.trim();

    return new Promise((resolve, reject) => {
      execFile(
        'powershell.exe',
        ['-NoProfile', '-ExecutionPolicy', 'Bypass', '-Command', script],
        { windowsHide: true, timeout: 10000 },
        (error, stdout) => {
          if (error) {
            if (error.killed || error.code === 'ETIMEDOUT') {
              return resolve(null);
            }
            return reject(error);
          }

          const output = stdout.trim();
          if (!output) {
            return resolve(null);
          }

          try {
            const parsed = JSON.parse(output);
            resolve({
              name: parsed.Name || 'Unknown',
              title: parsed.Title || 'Untitled',
              path: parsed.Path || ''
            });
          } catch (parseError) {
            resolve(null);
          }
        }
      );
    });
  }
}

module.exports = { UsageTracker };
