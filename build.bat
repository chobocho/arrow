@echo off
chcp 949 > nul
setlocal enableextensions enabledelayedexpansion

REM Windows용 빌드 스크립트 — release\index.html 단일 파일을 생성합니다.

set "ROOT=%~dp0"
set "SRC_HTML=%ROOT%index.html"
set "SRC_JS=%ROOT%dist\bundle.js"
set "OUT_DIR=%ROOT%release"
set "OUT_HTML=%OUT_DIR%\index.html"

if not exist "%SRC_HTML%" (
  echo [ERROR] index.html 을 찾을 수 없습니다: %SRC_HTML%
  exit /b 1
)
if not exist "%SRC_JS%" (
  echo [ERROR] dist\bundle.js 를 찾을 수 없습니다: %SRC_JS%
  exit /b 1
)

if exist "%OUT_DIR%" rmdir /S /Q "%OUT_DIR%"
mkdir "%OUT_DIR%"

where python > nul 2>&1
if errorlevel 1 (
  where py > nul 2>&1
  if errorlevel 1 (
    echo [ERROR] Python 이 설치되어 있어야 합니다.
    exit /b 1
  )
  set "PY=py -3"
) else (
  set "PY=python"
)

%PY% "%ROOT%scripts\inline_build.py" "%SRC_HTML%" "%SRC_JS%" "%OUT_HTML%"
if errorlevel 1 (
  echo [ERROR] 빌드에 실패했습니다.
  exit /b 1
)

echo.
echo 빌드 완료: %OUT_HTML%
endlocal
