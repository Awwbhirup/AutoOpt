@echo off
rem Opens the live view of the pass. Closing this window stops nothing: the
rem pass runs in the background whether anyone is looking at it or not.
title AutoOpt LLM pass
cd /d "%~dp0.."
".venv\Scripts\python.exe" "scripts\llm_watch.py"
if errorlevel 1 pause
