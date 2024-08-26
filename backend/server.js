require('dotenv').config();
const express = require('express');
const cors = require('cors');
const { Pool } = require('pg');
const { OAuth2Client } = require('google-auth-library');
const rateLimit = require('express-rate-limit');
const winston = require('winston');
const fetch = require('node-fetch');

// Initialize Express app
const app = express();
app.use(cors());
app.use(express.json());

// Rate limiting
const limiter = rateLimit({
  windowMs: 15 * 60 * 1000, // 15 minutes
  max: 100, // limit each IP to 100 requests per windowMs
});
app.use(limiter);

// Winston logging setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.Console({ format: winston.format.simple() }), // Console logging for development
    new winston.transports.File({ filename: 'logs/combined.log' }), // Combined log file
    new winston.transports.File({ filename: 'logs/error.log', level: 'error' }) // Error log file
  ],
});

// Log environment variables for debugging (optional: mask sensitive data in production)
logger.info('Environment Variables:', {
  DB_HOST: process.env.DB_HOST,
  DB_USER: process.env.DB_USER,
  DB_NAME: process.env.DB_NAME,
  PORT: process.env.PORT || 8080,
  CLIENT_ID: process.env.CLIENT_ID ? 'Set' : 'Not Set',
  YOUTUBE_API_KEY: process.env.YOUTUBE_API_KEY ? 'Set' : 'Not Set'
});

// PostgreSQL connection pool setup
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Attempt to connect to PostgreSQL
(async () => {
  try {
    logger.info('Attempting to connect to the PostgreSQL database...');
    const client = await pool.connect();
    logger.info('Connected to the PostgreSQL database successfully');
    client.release(); // Release the connection back to the pool
  } catch (err) {
    logger.error('Database connection error:', err);
  }
})();

// Middleware for verifying Google OAuth token
async function verifyToken(req, res, next) {
  logger.info('Verifying Google OAuth token...');
  const token = req.headers.authorization ? req.headers.authorization.split(' ')[1] : null;

  if (!token) {
    logger.warn('Authorization header is missing');
    return res.status(401).json({ message: 'Authorization header is missing' });
  }

  try {
    const ticket = await new OAuth2Client(process.env.CLIENT_ID).verifyIdToken({
      idToken: token,
      audience: process.env.CLIENT_ID,
    });
    req.user = ticket.getPayload();
    logger.info(`Google OAuth token verified for user: ${req.user.name}`);
    next();
  } catch (error) {
    logger.error('Token verification error:', error);
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

// Function to fetch channel ID from YouTube API
async function getChannelIdFromAPI(url, token) {
  logger.info(`Fetching channel ID for URL: ${url}`);
  const channelMatch = url.match(/youtube\.com\/channel\/([a-zA-Z0-9_-]+)/);
  const usernameMatch = url.match(/youtube\.com\/(user|c)\/([a-zA-Z0-9_-]+)/);
  const videoMatch = url.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/);

  let channelId = null;

  try {
    if (channelMatch) {
      channelId = channelMatch[1];
      logger.info(`Channel ID extracted directly from URL: ${channelId}`);
    } else if (usernameMatch) {
      const username = usernameMatch[2];
      const apiURL = `https://www.googleapis.com/youtube/v3/channels?forUsername=${username}&part=id&key=${process.env.YOUTUBE_API_KEY}`;
      const response = await fetch(apiURL);
      const data = await response.json();
      if (data.items.length > 0) channelId = data.items[0].id;
    } else if (videoMatch) {
      const videoId = videoMatch[1];
      const apiURL = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet&key=${process.env.YOUTUBE_API_KEY}`;
      const response = await fetch(apiURL);
      const data = await response.json();
      if (data.items.length > 0) channelId = data.items[0].snippet.channelId;
    }
    return channelId;
  } catch (error) {
    logger.error('Error fetching channel ID from YouTube API:', error);
    throw error;
  }
}

// Route for channel insertion
app.post('/checkChannel', verifyToken, async (req, res) => {
  const { url } = req.body;
  const userFullName = req.user.name;

  try {
    const channelId = await getChannelIdFromAPI(url, req.headers.authorization.split(' ')[1]);
    if (!channelId) return res.status(400).json({ message: 'Invalid YouTube URL or Channel ID not found.' });

    const result = await pool.query('SELECT * FROM channel_details WHERE yt_channel_id = $1', [channelId]);
    if (result.rows.length > 0) return res.status(200).json({ message: 'Duplicate channel ID found.' });

    await pool.query('INSERT INTO channel_details (yt_channel_id, createdBy) VALUES ($1, $2)', [channelId, userFullName]);
    return res.status(201).json({ message: 'Channel ID inserted successfully.' });
  } catch (err) {
    logger.error('Error inserting channel ID:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

// Route for getting influencer history
app.get('/influencerHistory', verifyToken, async (req, res) => {
  const userFullName = req.user.name;
  try {
    const result = await pool.query('SELECT * FROM channel_details WHERE createdBy = $1', [userFullName]);
    return res.status(200).json(result.rows);
  } catch (err) {
    logger.error('Error retrieving influencer history:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

// Start the server
const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});

// Handle unhandled rejections and exceptions
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection:', err);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
});
