require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const roomDetailRoutes = require('./routes/roomDetails.routes');
const alertRoutes = require('./routes/alerts.routes');
const homeRoutes = require('./routes/home.routes');
const settingRoutes = require('./routes/settings.routes');
const syncRoutes = require('./routes/sync.routes');

const app = express();
// Behind a proxy (Render, nginx, ...) the rate limiter needs the real client IP.
// Set TRUST_PROXY to the number of proxy hops, usually 1.
if (process.env.TRUST_PROXY) app.set('trust proxy', Number(process.env.TRUST_PROXY));
app.use(cors());
app.use(express.json());

app.use('/api', authRoutes);
app.use('/api/room-detail', roomDetailRoutes);
app.use('/api/alerts', alertRoutes);
app.use('/api/home', homeRoutes);
app.use('/api/settings', settingRoutes);
app.use('/api/sync', syncRoutes);



module.exports = app;
