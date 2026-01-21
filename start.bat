@echo off
setlocal
cd /d %~dp0
if not exist data mkdir data

set "CONDA_ACTIVATE=%USERPROFILE%\\miniconda3\\Scripts\\activate.bat"

if not exist "%CONDA_ACTIVATE%" (
  echo Could not find activate.bat. Please install Anaconda/Miniconda or update start.bat.
  pause
  exit /b 1
)

call "%CONDA_ACTIVATE%" llm
if errorlevel 1 (
  echo Failed to activate conda env "llm". Please create it or update start.bat.
  pause
  exit /b 1
)

start "" "http://127.0.0.1:8000"
python -m uvicorn app:app --host 127.0.0.1 --port 8000
