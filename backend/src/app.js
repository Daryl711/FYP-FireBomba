require('dotenv').config();
const express = require('express');
const cors = require('cors');

const authRoutes = require('./routes/auth.routes');
const roomDetailRoutes = require('./routes/roomDetails.routes');
const alertRoutes = require('./routes/alerts.routes');

const app = express();
app.use(cors());
app.use(express.json());

app.use('/api', authRoutes);
app.use('/api/room-detail', roomDetailRoutes);
app.use('/api/alerts', alertRoutes);



module.exports = app;
