@echo off
rem Opens the live view of the pass. Closing this window stops nothing: the
rem pass runs in the background whether anyone is looking at it or not.
title AutoOpt progress
cd /d "%~dp0.."
".venv\Scripts\python.exe" "scripts\llm_watch.py"
rem Always pause. Without it the window vanishes the moment the view ends,
rem which looks exactly like the thing failing to start.
echo.
pause
