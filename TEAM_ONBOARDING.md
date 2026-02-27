# Team Onboarding Guide — Wuloye Project

This guide walks new team members through setting up the project after cloning the repository.

---

## 📋 Prerequisites

Before starting, ensure you have installed:

- **Docker Desktop** (for Windows/Mac) or **Docker Engine** (for Linux)
  - Download: https://www.docker.com/products/docker-desktop
  - Verify installation: `docker --version` and `docker-compose --version`
- **Node.js** (v18.0.0 or higher) — Optional, only if running without Docker
  - Download: https://nodejs.org/
- **Git** — Already installed if you cloned the repo

---

## 🚀 Quick Setup (Docker — Recommended)

### Step 1: Clone the Repository

```bash
git clone <repository-url>
cd wuloye/Wuloye-
```

### Step 2: Get Firebase Service Account Credentials

The backend requires Firebase Admin SDK credentials to connect to your Firebase project.

1. **Access Firebase Console**
   - Go to [Firebase Console](https://console.firebase.google.com/)
   - Select your Wuloye project

2. **Generate Service Account Key**
   - Click the **gear icon** (⚙️) → **Project settings**
   - Open the **Service accounts** tab
   - Click **Generate new private key**
   - Confirm by clicking **Generate key**
   - A JSON file will download (e.g., `wuloye-firebase-adminsdk-xxxxx.json`)
   - ⚠️ **Keep this file secure and never commit it to git**

### Step 3: Create Backend Environment File

#### Option A: Using the Helper Script (Recommended)

1. Save the downloaded JSON file as `backend/serviceAccountKey.json`
   - This file is already in `.gitignore`, so it won't be committed

2. From the **project root** (`Wuloye-/`), run:

   ```bash
   node backend/scripts/env-from-firebase-json.js
   ```

   Or specify a custom path:

   ```bash
   node backend/scripts/env-from-firebase-json.js path/to/your-firebase-key.json
   ```

3. The script will output three lines. Copy them.

4. Create `backend/.env` file:

   ```bash
   # On Windows (PowerShell)
   New-Item -Path backend\.env -ItemType File

   # On Mac/Linux
   touch backend/.env
   ```

5. Open `backend/.env` and paste the three lines, then add the `ALLOWED_ORIGINS` variable:

   ```env
   FIREBASE_PROJECT_ID=your-project-id
   FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
   FIREBASE_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----\n"
   ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8081
   PORT=5000
   NODE_ENV=development
   ```

#### Option B: Manual Setup

1. Copy the example file (if it exists):

   ```bash
   # On Windows (PowerShell)
   Copy-Item backend\.env.example backend\.env

   # On Mac/Linux
   cp backend/.env.example backend/.env
   ```

2. Open `backend/.env` and fill in the values from your Firebase service account JSON:
   - `FIREBASE_PROJECT_ID` = `project_id` from JSON
   - `FIREBASE_CLIENT_EMAIL` = `client_email` from JSON
   - `FIREBASE_PRIVATE_KEY` = `private_key` from JSON (convert newlines to `\n` and wrap in quotes)
   - `ALLOWED_ORIGINS` = comma-separated list of allowed origins (e.g., `http://localhost:3000,http://localhost:8081`)
   - `PORT` = `5000` (optional, defaults to 5000)
   - `NODE_ENV` = `development` (optional)

### Step 4: Verify Environment File

Before proceeding, ensure your `backend/.env` contains:

- ✅ `FIREBASE_PROJECT_ID`
- ✅ `FIREBASE_CLIENT_EMAIL`
- ✅ `FIREBASE_PRIVATE_KEY` (with `\n` for newlines, wrapped in double quotes)
- ✅ `ALLOWED_ORIGINS` (comma-separated URLs)

### Step 5: Build and Run with Docker

From the **project root** (`Wuloye-/`):

```bash
docker-compose up --build
```

This will:
- Build Docker images for both services (backend and ai-service)
- Start both containers
- Expose backend on `http://localhost:5000`
- Expose AI service on `http://localhost:8000`

### Step 6: Verify Services Are Running

Open a new terminal and test the health endpoints:

```bash
# Backend health check
curl http://localhost:5000/api/health

# AI service health check
curl http://localhost:8000/api/health
```

Or visit in your browser:
- Backend: http://localhost:5000/api/health
- AI Service: http://localhost:8000/api/health

Expected responses:
- Backend: `{"status":"ok","timestamp":"...","environment":"production"}`
- AI Service: `{"status":"AI Service Running"}`

---

## 🛠️ Alternative: Local Development (Without Docker)

If you prefer to run services locally without Docker:

### Backend Setup

```bash
cd backend
npm install
# Create .env file (follow Step 3 above)
npm run dev
```

The backend will run on `http://localhost:5000` with hot-reload via nodemon.

### AI Service Setup

```bash
cd ai-service

# Create virtual environment
python -m venv .venv

# Activate virtual environment
# On Windows (PowerShell):
.venv\Scripts\Activate.ps1
# On Mac/Linux:
source .venv/bin/activate

# Install dependencies
pip install -r requirements.txt

# Run the service
uvicorn main:app --reload --port 8000
```

The AI service will run on `http://localhost:8000` with hot-reload.

---

## 🐳 Understanding the Docker Setup

### Architecture Overview

The project uses **Docker Compose** to orchestrate two microservices:

1. **Backend Service** (`wuloye-backend`)
   - **Technology**: Node.js 20 (Alpine Linux)
   - **Framework**: Express.js (ES Modules)
   - **Port**: 5000
   - **Database**: Firebase (Firestore + Auth)
   - **Dockerfile**: Multi-stage build (optimized for production)

2. **AI Service** (`wuloye-ai-service`)
   - **Technology**: Python 3.12
   - **Framework**: FastAPI
   - **Port**: 8000
   - **Purpose**: AI/ML features (foundation only in Sprint 1)

### Docker Compose Configuration

- **Network**: Both services share `wuloye-network` (bridge network)
- **Environment**: Backend loads variables from `./backend/.env`
- **Restart Policy**: `unless-stopped` (auto-restart on failure)
- **Port Mapping**: 
  - `5000:5000` (backend)
  - `8000:8000` (ai-service)

### Dockerfile Details

**Backend Dockerfile**:
- Uses multi-stage build for smaller production image
- Stage 1 (builder): Installs production dependencies only
- Stage 2 (production): Copies node_modules and source code
- Runs as `node src/server.js` (no nodemon in production)

**AI Service Dockerfile**:
- Single-stage build
- Installs Python dependencies from `requirements.txt`
- Runs with `uvicorn` (ASGI server)

---

## 🔧 Common Issues & Solutions

### Issue 1: Port Already in Use

**Error**: `EADDRINUSE: address already in use :::5000`

**Solution**:
- Find the process: `Get-NetTCPConnection -LocalPort 5000` (PowerShell) or `lsof -i :5000` (Mac/Linux)
- Kill the process: `Stop-Process -Id <PID> -Force` (PowerShell) or `kill -9 <PID>` (Mac/Linux)
- Or change the port in `backend/.env`: `PORT=5001`

### Issue 2: Missing Environment Variables

**Error**: `Missing required environment variables: FIREBASE_PROJECT_ID, FIREBASE_CLIENT_EMAIL, FIREBASE_PRIVATE_KEY`

**Solution**: Ensure `backend/.env` exists and contains all required Firebase credentials (see Step 3).

### Issue 3: Docker Build Fails

**Error**: Various build errors

**Solution**:
- Ensure Docker Desktop is running
- Try rebuilding: `docker-compose up --build --force-recreate`
- Clear Docker cache: `docker system prune -a` (⚠️ removes all unused images)

### Issue 4: CORS Errors

**Error**: `CORS policy: origin ... is not allowed`

**Solution**: Add your frontend URL to `ALLOWED_ORIGINS` in `backend/.env`:
```env
ALLOWED_ORIGINS=http://localhost:3000,http://localhost:8081,http://your-frontend-url
```

---

## 📝 Next Steps After Setup

Once your services are running:

1. **Explore the API**:
   - Backend health: http://localhost:5000/api/health
   - AI service docs: http://localhost:8000/docs (FastAPI auto-generated docs)

2. **Review Project Structure**:
   - `backend/src/` — Backend source code
   - `ai-service/` — AI service code
   - `mobile/` — React Native app (Sprint 2)
   - `admin-dashboard/` — Next.js admin panel (Sprint 2)

3. **Check Documentation**:
   - `README.md` — Project overview
   - `backend/ENV_SETUP.md` — Detailed Firebase setup
   - `backend/src/` — Code comments and structure

4. **Start Development**:
   - Pick a task from your team's task board
   - Create a feature branch: `git checkout -b feature/your-feature-name`
   - Make changes and test locally
   - Commit and push when ready

---

## 🎯 Task Classification Guide

Before assigning tasks, ensure all team members:

- ✅ Have completed this onboarding guide
- ✅ Can run `docker-compose up --build` successfully
- ✅ Can access both health endpoints
- ✅ Understand the project structure
- ✅ Have access to Firebase project (if working on backend features)

**Recommended Task Distribution**:
- **Backend tasks**: Team members familiar with Node.js/Express
- **AI Service tasks**: Team members familiar with Python/FastAPI
- **Frontend tasks** (Sprint 2+): Team members familiar with React Native/Next.js
- **DevOps tasks**: Team members familiar with Docker/CI-CD

---

## 📞 Getting Help

- Check existing documentation in the repo
- Review error messages carefully (they often point to the solution)
- Ask team leads for Firebase credentials if needed
- Consult Docker logs: `docker-compose logs backend` or `docker-compose logs ai-service`

---

**Last Updated**: Sprint 1 — Foundation Setup
