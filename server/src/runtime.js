import { connectDatabase } from './config/db.js';
import { bootstrapAdmin } from './services/bootstrapAdmin.js';

let initializationPromise;

export function initializeRuntime() {
  if (!initializationPromise) {
    initializationPromise = connectDatabase()
      .then(() => bootstrapAdmin())
      .catch((error) => {
        initializationPromise = undefined;
        throw error;
      });
  }

  return initializationPromise;
}
