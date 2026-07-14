const express = require('express');
const cors = require('cors');
const dotenv = require('dotenv');
const { rateLimit } = require('express-rate-limit');
dotenv.config();

// Import routes
const authRoutes = require('./routes/auth');
const dataRoutes = require('./routes/data');
const adminRoutes = require('./routes/admin');
const practiceRoutes = require('./routes/practice');
const mockTestRoutes = require('./routes/mockTest');
const aiRoutes = require('./routes/ai');
const analyticsRoutes = require('./routes/analytics');

const app = express();

// Trust proxy settings (essential when deployed behind Nginx, Render, Vercel, Heroku, etc.)
app.set('trust proxy', 1);

// ─── CORS CONFIGURATION ────────────────────────────────────────────────────
const allowedOrigins = [
  'https://achivox.online',
  'https://www.achivox.online',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost',
  'capacitor://localhost',
  'ionic://localhost',
  // Dynamic env override (e.g., staging or preview URLs)
  process.env.NEXT_PUBLIC_FRONTEND_URL,
].filter(Boolean);

const corsOptions = {
  origin: (origin, callback) => {
    // Allow requests with no origin (Capacitor native apps, Postman, Render health checks)
    if (!origin) return callback(null, true);

    const isAllowed =
      allowedOrigins.includes(origin) ||
      /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
      /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin) ||
      /^https?:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/.test(origin) ||
      /^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin) ||
      /\.trycloudflare\.com$/.test(origin) ||
      /\.loca\.lt$/.test(origin);

    if (isAllowed) {
      callback(null, true);
    } else {
      console.warn(`[CORS] Blocked origin: ${origin}`);
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS', 'PATCH'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-Requested-With', 'Accept'],
  optionsSuccessStatus: 204, // Return 204 for OPTIONS preflight
};

// Apply CORS before any other middleware so preflight OPTIONS gets headers immediately
app.use(cors(corsOptions));

// Explicitly handle preflight OPTIONS for all routes (belt-and-suspenders for Express 5+)
app.options('/{*path}', cors(corsOptions));

// ─── BODY PARSING ──────────────────────────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ─── REQUEST LOGGER ────────────────────────────────────────────────────────
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path} - Origin: ${req.headers.origin || 'None'}`);
  next();
});

// ─── RATE LIMITERS ─────────────────────────────────────────────────────────
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again after 15 minutes.' },
  skip: (req) => req.method === 'OPTIONS', // Never rate-limit preflight
});

const aiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'AI request limit reached. Please wait a moment and try again.' },
  skip: (req) => req.method === 'OPTIONS',
});

app.use('/api', apiLimiter);
app.use('/api/ai', aiLimiter);

// ─── HEALTH CHECK ──────────────────────────────────────────────────────────
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    message: 'ExamHero API is running.',
    timestamp: new Date().toISOString(),
    env: process.env.NODE_ENV || 'development',
    geminiKey: process.env.GOOGLE_AI_API_KEY
      ? `SET (${process.env.GOOGLE_AI_API_KEY.substring(0, 6)}...)`
      : 'MISSING ⚠️',
  });
});

// ─── FRONTEND LOG ENDPOINT ─────────────────────────────────────────────────
app.post('/api/log', (req, res) => {
  const { type, message, details } = req.body;
  console.log(`[FRONTEND ${(type || 'INFO').toUpperCase()}] ${message}`, details || '');
  res.status(200).json({ status: 'OK' });
});

// ─── API ROUTES ────────────────────────────────────────────────────────────
app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/practice', practiceRoutes);
app.use('/api/mock-test', mockTestRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/ai', aiRoutes);

// ─── GLOBAL ERROR HANDLER ──────────────────────────────────────────────────
app.use((err, req, res, next) => {
  // Ensure CORS headers are present even on errors
  const origin = req.headers.origin;
  if (origin && allowedOrigins.includes(origin)) {
    res.setHeader('Access-Control-Allow-Origin', origin);
    res.setHeader('Access-Control-Allow-Credentials', 'true');
  }

  if (err.message === 'Not allowed by CORS') {
    return res.status(403).json({ error: 'CORS: Origin not allowed' });
  }

  console.error('[Server Error]', err.message);
  res.status(500).json({ error: 'Internal server error', detail: err.message });
});

// ─── START SERVER ──────────────────────────────────────────────────────────
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
  console.log(`Allowed Origins: ${allowedOrigins.join(', ')}`);
  console.log(`Gemini API Key: ${process.env.GOOGLE_AI_API_KEY ? 'LOADED ✅' : 'MISSING ⚠️'}`);
});
