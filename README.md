# YouTube Channel Checker Extension

## Overview
This Chrome extension allows users to check YouTube channels and videos for duplicate entries in a PostgreSQL database. A custom button is added to YouTube's masthead, and when clicked, it sends the current URL to a backend API that processes and stores the channel ID if it's unique.

## Getting Started

### Backend Setup

#### 1. Prerequisites

- **Docker:** Ensure that Docker is installed on your local machine for building and testing the backend. [Install Docker](https://docs.docker.com/get-docker/)
- **Google Cloud SDK:** Install the Google Cloud SDK to manage your VM and deploy the backend. [Install Google Cloud SDK](https://cloud.google.com/sdk/docs/install)
- **PostgreSQL Database:** Make sure your PostgreSQL database is up and running with the correct schema.

#### 2. Create `.env` File

Create a `.env` file in the `backend/` directory with the following environment variables:

```bash
DB_USER=your_postgres_user
DB_PASSWORD=your_postgres_password
DB_HOST=your_db_host_or_ip
DB_NAME=your_db_name
DB_PORT=5432
PORT=8080
CLIENT_ID=your_google_client_id
YOUTUBE_API_KEY=your_youtube_api_key
