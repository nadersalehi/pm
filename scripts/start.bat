@echo off
setlocal

cd /d "%~dp0\.."

set IMAGE_NAME=pm-app
set CONTAINER_NAME=pm-app

docker build -t %IMAGE_NAME% .
docker rm -f %CONTAINER_NAME% >nul 2>&1

docker run -d --name %CONTAINER_NAME% --env-file .env -p 8000:8000 %IMAGE_NAME%

echo Running at http://localhost:8000
