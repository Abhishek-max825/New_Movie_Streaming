@echo off
title Movie Streamer
echo ==========================================
echo   Starting Movie Streaming Application
echo ==========================================

:: 1. Setup Python Environment
IF EXIST ".venv\Scripts\activate.bat" (
    echo Activating virtual environment...
    call .venv\Scripts\activate.bat
) ELSE (
    echo WARNING: Virtual environment not found. Using global Python.
    echo run 'python -m venv .venv' to create one.
)

echo Installing Python dependencies...
pip install -r requirements.txt

:: 2. Setup Frontend
cd frontend

IF NOT EXIST "node_modules" (
    echo Node modules not found. Installing dependencies...
    call npm install
)

:: 3. Start Next.js (which spawns Python proxy as needed)
echo Starting development server...
echo Access the app at http://localhost:3000
npm run dev
pause
