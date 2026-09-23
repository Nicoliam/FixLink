import { createApp } from './app';
import { assertProdSecrets, env } from './config/env';

assertProdSecrets();

const app = createApp();

app.listen(env.port, () => {
  // Intentionally minimal — no sensitive values logged (see AGENTS.md §35).
  console.log(`FixLink API listening on port ${env.port} (${env.nodeEnv}).`);
});
