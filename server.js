require('dotenv').config();
const http = require('http');
const app = require('./src/app');
const connectDB = require('./src/config/db');

const PORT = Number(process.env.PORT || 4000);

(async () => {
  await connectDB();
  const server = http.createServer(app);
  server.listen(PORT, () => {
    console.log(`Classic Rentals running on http://localhost:${PORT}`);
  });
})();
