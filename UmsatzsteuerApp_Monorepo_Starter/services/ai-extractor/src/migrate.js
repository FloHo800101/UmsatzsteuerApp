import { runMigrations } from './run-migrations.js';

runMigrations().then(() => {
  console.log('Migrations complete');
  process.exit(0);
}).catch(err => {
  console.error('Migration error:', err);
  process.exit(1);
});
