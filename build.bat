@echo off
cd /d %~dp0
echo [1/3] Parser bauen ...
dotnet publish parser -c Release -r win-x64 --self-contained -p:PublishSingleFile=true -o bin || goto :err
echo [2/3] Pakete installieren ...
call npm install || goto :err
echo [3/3] Installer bauen ...
call npm run dist || goto :err
echo.
echo FERTIG - Installer liegt im Ordner "dist"
pause
exit /b 0
:err
echo.
echo FEHLER - siehe Meldung oben
pause
exit /b 1
