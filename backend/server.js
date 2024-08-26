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
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
    new winston.transports.Console({ format: winston.format.simple() }) // Console logging for development
  ],
});

// Log environment variables for debugging (optional: remove or mask sensitive data in production)
logger.info('Environment Variables:', {
  DB_HOST: process.env.DB_HOST,
  DB_USER: process.env.DB_USER,
  DB_NAME: process.env.DB_NAME,
  PORT: process.env.PORT,
  CLIENT_ID: process.env.CLIENT_ID,
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

// Attempt to connect to the PostgreSQL database
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
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.CLIENT_ID,
    });
    const payload = ticket.getPayload();
    req.user = payload;
    logger.info(`Google OAuth token verified for user: ${req.user.name}`);
    next();
  } catch (error) {
    logger.error('Token verification error:', error);
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

// Function to fetch Channel Details from YouTube API (if necessary)
async function getChannelIdFromAPI(url, token) {
  logger.info(`Fetching channel ID from YouTube API for URL: ${url}`);

  const channelMatch = url.match(/youtube\.com\/channel\/([a-zA-Z0-9_-]+)/);
  const usernameMatch = url.match(/youtube\.com\/(user|c)\/([a-zA-Z0-9_-]+)/);
  const videoMatch = url.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/);

  let channelId = null;

  try {
    if (channelMatch) {
      channelId = channelMatch[1]; // Extract the channel ID directly from the URL
      logger.info(`Extracted channel ID from URL: ${channelId}`);
    } else if (usernameMatch) {
      const username = usernameMatch[2];
      const apiURL = `https://www.googleapis.com/youtube/v3/channels?forUsername=${username}&part=id&key=${process.env.YOUTUBE_API_KEY}`;
      logger.info(`Fetching channel ID for username: ${username}`);
      const response = await fetch(apiURL, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (data.items.length > 0) {
        channelId = data.items[0].id;
        logger.info(`Fetched channel ID from YouTube API: ${channelId}`);
      }
    } else if (videoMatch) {
      const videoId = videoMatch[1];
      const apiURL = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet&key=${process.env.YOUTUBE_API_KEY}`;
      logger.info(`Fetching channel ID for video ID: ${videoId}`);
      const response = await fetch(apiURL, { headers: { Authorization: `Bearer ${token}` } });
      const data = await response.json();
      if (data.items.length > 0) {
        channelId = data.items[0].snippet.channelId;
        logger.info(`Fetched channel ID from YouTube API via video ID: ${channelId}`);
      }
    }

    return channelId;
  } catch (error) {
    logger.error('Error fetching channel ID from YouTube API:', error);
    throw error;
  }
}

// Route to check and insert YouTube channel ID
app.post('/checkChannel', verifyToken, async (req, res) => {
  const { url } = req.body;
  const userFullName = req.user.name;
  logger.info(`Request to check and insert channel from user: ${userFullName}, URL: ${url}`);

  try {
    const channelId = await getChannelIdFromAPI(url, req.headers.authorization.split(' ')[1]);

    if (!channelId) {
      logger.warn('Invalid YouTube URL or Channel ID could not be retrieved');
      return res.status(400).json({ message: 'Invalid YouTube URL or Channel ID could not be retrieved.' });
    }

    const result = await pool.query('SELECT * FROM channel_details WHERE yt_channel_id = $1', [channelId]);

    if (result.rows.length > 0) {
      logger.info(`Duplicate channel ID found: ${channelId}`);
      return res.status(200).json({ message: 'Duplicate channel ID found.' });
    }

    await pool.query('INSERT INTO channel_details (yt_channel_id, createdBy) VALUES ($1, $2)', [channelId, userFullName]);
    logger.info(`Channel ID ${channelId} inserted successfully by user: ${userFullName}`);

    return res.status(201).json({ message: 'Channel ID inserted successfully.' });
  } catch (err) {
    logger.error('Error inserting channel ID:', err);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

// Route to get influencer history
app.get('/influencerHistory', verifyToken, async (req, res) => {
  const userFullName = req.user.name;
  logger.info(`Request to get influencer history for user: ${userFullName}`);

  try {
    const result = await pool.query('SELECT * FROM channel_details WHERE createdBy = $1', [userFullName]);
    logger.info(`Influencer history retrieved for user: ${userFullName}`);
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

// Error handling for unhandled promise rejections and uncaught exceptions
process.on('unhandledRejection', (err) => {
  logger.error('Unhandled rejection:', err);
});

process.on('uncaughtException', (err) => {
  logger.error('Uncaught exception:', err);
});
