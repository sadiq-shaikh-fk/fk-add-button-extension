# YouTube Channel Checker Extension

## Overview
This Chrome extension allows users to check YouTube channels and videos for duplicate entries in a PostgreSQL database. A custom button is added to YouTube's masthead, and when clicked, it sends the current URL to a backend API that processes and stores the channel ID if it's unique.

## Getting Started

### Backend

1. Navigate to the `backend/` directory.
2. Run `npm install` to install dependencies.
3. Create a `.env` file with your database and Google OAuth credentials.
4. Run the server using `npm start`.

### Chrome Extension

1. Navigate to the `chrome://extensions/` page in Chrome.
2. Enable **Developer Mode**.
3. Load the unpacked extension from the `extension/` directory.

## Environment Variables

Create a `.env` file in the `backend/` directory with the following keys:

```bash
DB_USER=your_postgres_user
DB_PASSWORD=your_postgres_password
DB_HOST=your_db_host
DB_NAME=your_db_name
DB_PORT=5432
PORT=8080
CLIENT_ID=your_google_client_id
YOUTUBE_API_KEY=your_youtube_api_key
