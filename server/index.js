import app from './src/app.js';
import { env } from './src/config/env.js';
import { connectDB } from './src/config/db.js';

try {
  await connectDB();
} catch (error) {
  console.error(`Failed to connect to MongoDB: ${error.message}`);
  process.exit(1);
}

app.listen(env.port, () => {
  console.log(`YakFlow Backend (MongoDB) running on port ${env.port}`);
});
