/**
 * Server-Sent Events connection manager.
 * Groups connections by userId and by orderId so we can push targeted updates.
 *
 * Usage:
 *   const { sseManager } = require('../utils/sse');
 *
 *   // In an SSE endpoint:
 *   sseManager.addUserConnection(userId, res);
 *   sseManager.addOrderConnection(orderId, res);
 *
 *   // When something happens:
 *   sseManager.sendToUser(userId, { type: 'notification', ... });
 *   sseManager.sendToOrder(orderId, { type: 'location', lat, lng });
 */

class SSEManager {
  constructor() {
    /** @type {Map<string, Set<import('express').Response>>} userId -> Set of responses */
    this.userConnections = new Map();
    /** @type {Map<string, Set<import('express').Response>>} orderId -> Set of responses */
    this.orderConnections = new Map();
  }

  /**
   * Register an SSE response for a specific user.
   * Sends a heartbeat every 30s to keep the connection alive.
   */
  addUserConnection(userId, res) {
    if (!userId) return;
    const key = String(userId);
    if (!this.userConnections.has(key)) this.userConnections.set(key, new Set());
    this.userConnections.get(key).add(res);

    const heartbeat = setInterval(() => {
      try { res.write(':heartbeat\n\n'); } catch (_) { /* ignore */ }
    }, 30000);

    res.on('close', () => {
      clearInterval(heartbeat);
      this.userConnections.get(key)?.delete(res);
      if (this.userConnections.get(key)?.size === 0) this.userConnections.delete(key);
    });
  }

  /**
   * Register an SSE response for a specific order (tracking).
   */
  addOrderConnection(orderId, res) {
    if (!orderId) return;
    const key = String(orderId);
    if (!this.orderConnections.has(key)) this.orderConnections.set(key, new Set());
    this.orderConnections.get(key).add(res);

    const heartbeat = setInterval(() => {
      try { res.write(':heartbeat\n\n'); } catch (_) { /* ignore */ }
    }, 30000);

    res.on('close', () => {
      clearInterval(heartbeat);
      this.orderConnections.get(key)?.delete(res);
      if (this.orderConnections.get(key)?.size === 0) this.orderConnections.delete(key);
    });
  }

  /**
   * Send a JSON event to all connections belonging to a user.
   * @param {string} userId
   * @param {object} data - Will be JSON-serialized and sent as `data:`
   * @param {string} [event] - Optional SSE event name
   */
  sendToUser(userId, data, event) {
    const key = String(userId);
    const connections = this.userConnections.get(key);
    if (!connections || connections.size === 0) return;

    const payload = this._format(data, event);
    const dead = [];
    for (const res of connections) {
      try { res.write(payload); } catch (_) { dead.push(res); }
    }
    dead.forEach(res => connections.delete(res));
  }

  /**
   * Send a JSON event to all connections tracking a specific order.
   */
  sendToOrder(orderId, data, event) {
    const key = String(orderId);
    const connections = this.orderConnections.get(key);
    if (!connections || connections.size === 0) return;

    const payload = this._format(data, event);
    const dead = [];
    for (const res of connections) {
      try { res.write(payload); } catch (_) { dead.push(res); }
    }
    dead.forEach(res => connections.delete(res));
  }

  /**
   * Broadcast to every connected user (e.g. site-wide announcements).
   */
  broadcast(data, event) {
    const payload = this._format(data, event);
    for (const [, connections] of this.userConnections) {
      const dead = [];
      for (const res of connections) {
        try { res.write(payload); } catch (_) { dead.push(res); }
      }
      dead.forEach(res => connections.delete(res));
    }
  }

  /** Number of currently active user connections. */
  get activeUserCount() {
    let count = 0;
    for (const conns of this.userConnections.values()) count += conns.size;
    return count;
  }

  /** Number of currently active order-tracking connections. */
  get activeOrderCount() {
    let count = 0;
    for (const conns of this.orderConnections.values()) count += conns.size;
    return count;
  }

  _format(data, event) {
    let msg = '';
    if (event) msg += `event: ${event}\n`;
    msg += `data: ${JSON.stringify(data)}\n\n`;
    return msg;
  }
}

/** Singleton — import this everywhere. */
const sseManager = new SSEManager();

module.exports = { sseManager, SSEManager };
