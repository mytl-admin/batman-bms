const express = require('express');
const cors = require('cors');
const { LogService } = require('./services/LogService');
const { getSupabase } = require('./lib/supabase');
const { createAuthMiddleware } = require('./middleware/auth');

const authRoutes = require('./routes/authRoutes');
const usersRoutes = require('./routes/users');
const configRoutes = require('./routes/config');
const suppliersRoutes = require('./routes/suppliers');
const logsRoutes = require('./routes/logs');
const bookingsRoutes = require('./routes/bookings');

const app = express();

app.disable('x-powered-by');

app.use((req, res, next) => {
  if (req.method === 'HEAD') {
    return res.status(405).json({ error: 'Method not allowed' });
  }
  next();
});

const frontendOrigin = process.env.FRONTEND_ORIGIN;
if (!frontendOrigin) {
  console.warn('[env] FRONTEND_ORIGIN is not set — CORS will reject browser requests until configured.');
}
app.use(
  cors({
    origin: frontendOrigin || false,
    credentials: true,
  }),
);

app.use(express.json({ type: 'application/json' }));

app.get('/health', (req, res) => {
  const env = process.env.NODE_ENV === 'production' ? 'production' : 'dev';
  res.json({ status: 'ok', env });
});

app.use('/api/auth', authRoutes);

const supabase = getSupabase();
const authMiddleware = createAuthMiddleware(supabase);
const logService = new LogService(supabase);
app.locals.logService = logService;

app.use('/api', authMiddleware);
app.use('/api/users', usersRoutes);
app.use('/api/config', configRoutes);
app.use('/api/suppliers', suppliersRoutes);
app.use('/api/logs', logsRoutes);
app.use('/api/bookings', bookingsRoutes);

app.use((req, res) => {
  res.status(404).json({ error: 'Not found' });
});

const PORT = Number(process.env.PORT) || 3000;
if (require.main === module) {
  app.listen(PORT, () => {
    console.log(`Listening on ${PORT} (${process.env.NODE_ENV || 'development'})`);
  });
}

module.exports = app;
