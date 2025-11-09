console.log('[boot] start.mjs – Node', process.version);
try {
  await import('./server.js');
  console.log('[boot] server.js import OK');
} catch (e) {
  console.error('[boot] ERROR while importing server.js:\n', e?.stack || e);
  setTimeout(() => process.exit(1), 500);
}
