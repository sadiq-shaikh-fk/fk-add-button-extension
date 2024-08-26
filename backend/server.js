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
  windowMs: 15 * 60 * 1000,
  max: 100
});
app.use(limiter);

// PostgreSQL connection
const pool = new Pool({
  user: process.env.DB_USER,
  host: process.env.DB_HOST,
  database: process.env.DB_NAME,
  password: process.env.DB_PASSWORD,
  port: process.env.DB_PORT,
});

// Google OAuth2 client
const client = new OAuth2Client(process.env.CLIENT_ID);

// Logging setup
const logger = winston.createLogger({
  level: 'info',
  format: winston.format.json(),
  transports: [
    new winston.transports.File({ filename: 'error.log', level: 'error' }),
    new winston.transports.File({ filename: 'combined.log' }),
  ],
});

// Middleware for verifying Google token
async function verifyToken(req, res, next) {
  const token = req.headers.authorization.split(' ')[1];
  try {
    const ticket = await client.verifyIdToken({
      idToken: token,
      audience: process.env.CLIENT_ID,
    });
    const payload = ticket.getPayload();
    req.user = payload;
    next();
  } catch (error) {
    return res.status(401).json({ message: 'Unauthorized' });
  }
}

// Fetch Channel Details from YouTube API (if necessary)
async function getChannelIdFromAPI(url, token) {
  const channelMatch = url.match(/youtube\.com\/channel\/([a-zA-Z0-9_-]+)/);
  const usernameMatch = url.match(/youtube\.com\/(user|c)\/([a-zA-Z0-9_-]+)/);
  const videoMatch = url.match(/youtube\.com\/watch\?v=([a-zA-Z0-9_-]+)/);

  let channelId = null;

  if (channelMatch) {
    channelId = channelMatch[1]; // Extract the channel ID directly from the URL
  } else if (usernameMatch) {
    const username = usernameMatch[2];
    const apiURL = `https://www.googleapis.com/youtube/v3/channels?forUsername=${username}&part=id&key=${process.env.YOUTUBE_API_KEY}`;
    const response = await fetch(apiURL, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json();
    if (data.items.length > 0) {
      channelId = data.items[0].id;
    }
  } else if (videoMatch) {
    const videoId = videoMatch[1];
    const apiURL = `https://www.googleapis.com/youtube/v3/videos?id=${videoId}&part=snippet&key=${process.env.YOUTUBE_API_KEY}`;
    const response = await fetch(apiURL, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const data = await response.json();
    if (data.items.length > 0) {
      channelId = data.items[0].snippet.channelId;
    }
  }

  return channelId;
}

// Insert Channel ID and CreatedBy into channel_details Table
app.post('/checkChannel', verifyToken, async (req, res) => {
  const { url } = req.body;
  const userFullName = req.user.name;
  
  try {
    // Get channel ID either from the URL or the YouTube API
    const channelId = await getChannelIdFromAPI(url, req.headers.authorization.split(' ')[1]);

    if (!channelId) {
      return res.status(400).json({ message: 'Invalid YouTube URL or Channel ID could not be retrieved.' });
    }

    // Check if the channel ID already exists in the database
    const result = await pool.query('SELECT * FROM channel_details WHERE yt_channel_id = $1', [channelId]);

    if (result.rows.length > 0) {
      return res.status(200).json({ message: 'Duplicate channel ID found.' });
    }

    // Insert the new channel ID and createdBy into the database
    await pool.query(
      'INSERT INTO channel_details (yt_channel_id, createdBy) VALUES ($1, $2)',
      [channelId, userFullName]
    );

    return res.status(201).json({ message: 'Channel ID inserted successfully.' });
  } catch (err) {
    logger.error(`Error inserting channel ID: ${err.message}`);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

// Get influencer history
app.get('/influencerHistory', verifyToken, async (req, res) => {
  const userFullName = req.user.name;

  try {
    const result = await pool.query('SELECT * FROM channel_details WHERE createdBy = $1', [userFullName]);
    return res.status(200).json(result.rows);
  } catch (err) {
    logger.error(`Error retrieving influencer history: ${err.message}`);
    return res.status(500).json({ message: 'Internal server error.' });
  }
});

const PORT = process.env.PORT || 8080;
app.listen(PORT, () => {
  logger.info(`Server running on port ${PORT}`);
});
