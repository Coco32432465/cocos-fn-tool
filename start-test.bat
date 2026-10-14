@echo off
cd /d %~dp0
if not exist bin\ReplayDump.exe dotnet publish parser -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -o bin
if not exist node_modules call npm install
call npm start
