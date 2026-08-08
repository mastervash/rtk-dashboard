import { createApp } from './app.js';
import { ALLOWED_ORIGINS, API_HOST, API_PORT, DB_PATH, CONFIG_DIR, READONLY } from './paths.js';

createApp().listen(API_PORT, API_HOST, () => {
  console.log(`rtkdash api  http://${API_HOST}:${API_PORT}`);
  console.log(`  db         ${DB_PATH}`);
  console.log(`  config dir ${CONFIG_DIR}`);
  console.log(`  origins    loopback${ALLOWED_ORIGINS.length ? ` + ${ALLOWED_ORIGINS.join(', ')}` : ''}`);
  console.log(`  mode       ${READONLY ? 'read-only' : 'read-write (runner + config editing on)'}`);
  if (API_HOST !== '127.0.0.1') {
    console.warn('  WARNING    bound off loopback and rtkdash has no auth of its own');
  }
});
