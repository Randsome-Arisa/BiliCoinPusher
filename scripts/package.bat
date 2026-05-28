@echo off
setlocal enabledelayedexpansion

for /f "delims=" %%i in ('node -e "console.log(require('./package.json').version)" 2^>nul') do set VERSION=%%i
if "%VERSION%"=="" set VERSION=1.0.0

set NODE_VERSION=v20.18.0
set PLATFORM=win-x64
set RELEASE_DIR=release\bilicoinpusher-%VERSION%-%PLATFORM%

echo ==> 打包 BiliCoinPusher v%VERSION% for %PLATFORM%

if exist "%RELEASE_DIR%" rmdir /s /q "%RELEASE_DIR%"
mkdir "%RELEASE_DIR%\node"
mkdir "%RELEASE_DIR%\dist"

echo ==> 编译...
call npm run build

echo ==> 下载便携 Node.js %NODE_VERSION%...
curl -fsSL -o node.zip "https://nodejs.org/dist/%NODE_VERSION%/node-%NODE_VERSION%-win-x64.zip"
tar -xf node.zip -C "%RELEASE_DIR%\node" --strip-components=1 2>nul || (
  powershell -Command "Expand-Archive -Path node.zip -DestinationPath '%RELEASE_DIR%\node'"
  move "%RELEASE_DIR%\node\node-%NODE_VERSION%-win-x64\*" "%RELEASE_DIR%\node\" 2>nul
  rmdir /s /q "%RELEASE_DIR%\node\node-%NODE_VERSION%-win-x64" 2>nul
)
del node.zip

echo ==> 复制应用文件...
xcopy /e /i dist "%RELEASE_DIR%\dist" >nul
xcopy /e /i node_modules "%RELEASE_DIR%\node_modules" >nul
copy README.md "%RELEASE_DIR%\" >nul

echo ==> 创建启动脚本...
(
echo @echo off
echo set DIR=%%~dp0
echo "%%DIR%%node\node.exe" "%%DIR%%dist\main.js" %%*
) > "%RELEASE_DIR%\bilicoinpusher.bat"

echo ==> 打包 zip...
powershell -Command "Compress-Archive -Path '%RELEASE_DIR%' -DestinationPath 'release\bilicoinpusher-%VERSION%-%PLATFORM%.zip' -Force"

echo ==> 完成: release\bilicoinpusher-%VERSION%-%PLATFORM%.zip
