/**
 * Session Guard - consistent wrapper around canCreateSession
 * Provides normalized messages and optional channel logging
 */

const { EmbedBuilder } = require('discord.js');
const sessionManager = require('./sessionManager');
const { sendLogMessage } = require('./common');

function mapReason(userId, gameType, details) {
  const code = details.reason || details.code;
  switch (code) {
    case 'LOCKED':
      return 'Session creation in progress. Please wait a second and try again.';
    case 'SESSION_EXISTS': {
      const existing = details.existingSession;
      const type = existing?.gameType || 'another';
      return `You already have an active ${type} game. Finish or stop it before starting a new one.`;
    }
    case 'RATE_LIMITED':
      return 'Please wait a brief moment before starting a new game.';
    case 'ABUSE_COOLDOWN':
      return details.message || 'The system is still wrapping up your last action. Try again in a moment.';
    case 'SECURITY_LOCKOUT':
      return details.message || 'Temporary pause in effect. Please try again shortly.';
    case 'HIGH_MOMENTUM':
      return details.message || 'Let the system catch up for a moment and then try again.';
    case 'GAME_HOPPING':
      return details.message || 'The previous game is finishing up. Give it a second and try again.';
    case 'INSUFFICIENT_FUNDS':
      return 'Insufficient funds for this bet.';
    case 'ERROR':
      return 'Temporary error checking session status. Please try again.';
    default:
      return details.message || 'Cannot start game right now.';
  }
}

async function check(userId, guildId, gameType, client = null) {
  const res = await sessionManager.canCreateSession(userId, guildId, gameType);
  if (!res.allowed && client) {
    const message = mapReason(userId, gameType, res);
    const level = (res.reason === 'ERROR') ? 'error' : 'warn';
    try { await sendLogMessage(client, level, `Session blocked for ${userId} (${gameType}) — ${res.reason}: ${message}`, userId, guildId); } catch {}
  }
  return {
    allowed: !!res.allowed,
    code: res.reason,
    message: mapReason(userId, gameType, res),
    raw: res
  };
}

module.exports = {
  check,
};
