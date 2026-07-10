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

// Trust proxy settings (essential when deployed behind Nginx, Vercel, Heroku, etc.)
app.set('trust proxy', 1);

// General rate limiter for all API endpoints (300 requests per 15 minutes)
const apiLimiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 300,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'Too many requests. Please try again after 15 minutes.' }
});

// AI rate limiter — 20 requests per minute (backend cache reduces actual Gemini calls)
const aiLimiter = rateLimit({
  windowMs: 1 * 60 * 1000, // 1 minute
  max: 20,
  standardHeaders: 'draft-7',
  legacyHeaders: false,
  message: { error: 'AI request limit reached. Please wait a moment and try again.' }
});

const allowedOrigins = [
  'http://localhost:3000',
  'http://localhost:3001',
  'capacitor://localhost',
  'ionic://localhost',
  'http://localhost',
  process.env.NEXT_PUBLIC_FRONTEND_URL,
].filter(Boolean);

app.use(cors({
  origin: (origin, callback) => {
    // Allow requests with no origin (native mobile apps, Postman, Capacitor)
    if (!origin) return callback(null, true);

    const isAllowed =
      allowedOrigins.includes(origin) ||
      /^https?:\/\/localhost(:\d+)?$/.test(origin) ||
      /^https?:\/\/127\.0\.0\.1(:\d+)?$/.test(origin) ||
      /^https?:\/\/10\.\d+\.\d+\.\d+(:\d+)?$/.test(origin) ||    // local network IPs
      /^https?:\/\/192\.168\.\d+\.\d+(:\d+)?$/.test(origin) ||   // home WiFi IPs
      /\.trycloudflare\.com$/.test(origin) ||                     // Cloudflare tunnels
      /\.loca\.lt$/.test(origin);                                 // localtunnel fallback

    if (isAllowed) {
      callback(null, true);
    } else {
      callback(new Error('Not allowed by CORS'));
    }
  },
  credentials: true,
}));
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use((req, res, next) => {
  console.log(`[${new Date().toLocaleTimeString()}] ${req.method} ${req.path} - Origin: ${req.headers.origin || 'None'}`);
  next();
});

// Apply rate limiting
app.use('/api', apiLimiter);
app.use('/api/ai', aiLimiter);

// Routes
app.use('/api/auth', authRoutes);
app.use('/api/data', dataRoutes);
app.use('/api/admin', adminRoutes);
app.use('/api/practice', practiceRoutes);
app.use('/api/mock-test', mockTestRoutes);
app.use('/api/analytics', analyticsRoutes);
app.use('/api/ai', aiRoutes);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({ status: 'OK', message: 'ExamHero API is running.' });
});

const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
