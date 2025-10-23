class DigestScheduler {
  constructor({ store, usageTracker, openRouterFactory, onDigest }) {
    this.store = store;
    this.usageTracker = usageTracker;
    this.openRouterFactory = openRouterFactory;
    this.onDigest = onDigest || (() => {});
    this.intervalMs = (store && store.get('preferences.digestIntervalMs')) || 24 * 60 * 60 * 1000;
    this.timer = null;
  }

  start() {
    if (this.timer) {
      return;
    }
    this.timer = setInterval(() => {
      this.maybeRunDigest();
    }, 60 * 1000);
    this.maybeRunDigest();
  }

  stop() {
    if (this.timer) {
      clearInterval(this.timer);
      this.timer = null;
    }
  }

  async maybeRunDigest(force = false) {
    const lastDigestAt = this.store.get('lastDigestAt');
    const now = Date.now();
    if (!force && lastDigestAt && now - lastDigestAt < this.intervalMs) {
      return;
    }
    await this.runDigest();
  }

  async runDigest() {
    this.usageTracker.flushCurrentEntry?.();
    const summary = this.usageTracker.getSummary({
      since: Date.now() - this.intervalMs
    });

    const client = this.openRouterFactory();
    const digest = await client.generateDigest(summary);

    this.store.set('lastDigestAt', Date.now());
    this.store.set('lastDigest', digest);
    this.store.set('usageLog', []);

    this.onDigest(digest);
    return digest;
  }

  getLatestDigest() {
    return this.store.get('lastDigest') || null;
  }
}

module.exports = { DigestScheduler };
