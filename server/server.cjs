// Force new deployment
require('dotenv').config();
const express = require('express');
const cors = require('cors');
const prisma = require('./utils/prisma.cjs');

const app = express();

// ✅ Configure CORS properly
app.use(cors({
  origin: [
    'https://mergev1-78hi.vercel.app',
    'http://localhost:3000',
    'http://localhost:3001'
  ],
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'x-auth-token'],
  credentials: true,
  optionsSuccessStatus: 200 // Explicitly set optionsSuccessStatus
}));

// then your middleware and routes
app.set('trust proxy', 1);
// Stripe needs the raw body to verify signatures, so this route is mounted before the JSON parser
app.post('/api/billing/webhook', express.raw({ type: 'application/json' }), require('./routes/billing.cjs').webhook);
app.use(express.json({ limit: '3mb' }));
app.use((req, res, next) => { res.set('X-Content-Type-Options', 'nosniff'); res.set('Referrer-Policy', 'strict-origin-when-cross-origin'); next(); });

app.get('/', (req, res) => {
  console.log('Request URL:', req.url);
  res.send('Server is running');
});

// Define Routes
app.use('/api/auth', require('./routes/auth.cjs').router);
app.use('/api/narratives', require('./routes/narratives.cjs'));
app.use('/api/admin', require('./routes/admin.cjs'));
app.use('/api/companies', require('./routes/companies.cjs'));
app.use('/api/projects', require('./routes/projects.cjs'));
app.use('/api/files', require('./routes/files.cjs')); // New route for file operations
app.use('/api/ai', require('./routes/ai.cjs')); // New route for AI operations
app.use('/api/users', require('./routes/users.cjs'));
app.use('/api/partners', require('./routes/partners.cjs'));
app.use('/api/cron', require('./routes/cron.cjs'));
app.use('/api/review', require('./routes/review.cjs'));
app.use('/api/feedback', require('./routes/feedback.cjs'));
app.use('/api/billing', require('./routes/billing.cjs').router);

app.get('/api/test', (req, res) => {
  res.send('Test route is working!');
});

module.exports = app;