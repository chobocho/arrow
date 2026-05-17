@echo off
chcp 949 > nul
setlocal enableextensions enabledelayedexpansion

REM Windows용 빌드 스크립트 — src/*.ts를 번들링한 뒤 release\index.html 단일 파일을 생성합니다.
REM scripts/build.mjs로 위임 (esbuild + 인라인).

set "ROOT=%~dp0"

where node > nul 2>&1
if errorlevel 1 (
  echo [ERROR] Node.js가 설치되어 있어야 합니다.
  exit /b 1
)

if not exist "%ROOT%node_modules" (
  echo node_modules가 없어 npm install을 먼저 실행합니다...
  pushd "%ROOT%"
  call npm install
  popd
  if errorlevel 1 (
    echo [ERROR] npm install 실패.
    exit /b 1
  )
)

node "%ROOT%scripts\build.mjs"
if errorlevel 1 (
  echo [ERROR] 빌드에 실패했습니다.
  exit /b 1
)

echo.
echo 빌드 완료: %ROOT%release\index.html
endlocal
