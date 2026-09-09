@echo off
set CONTAINER_NAME=pm-app

docker rm -f %CONTAINER_NAME% >nul 2>&1 && (echo Stopped.) || (echo Not running.)
