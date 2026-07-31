import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // child_process pool collides with @pm2/io's process.send IPC (colyseus peer dep)
    pool: 'threads',
  },
});
