// Local development entry point. Vercel imports server.cjs directly.
const app = require('./server.cjs');
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => console.log(`Merge API listening on http://localhost:${PORT}`));
