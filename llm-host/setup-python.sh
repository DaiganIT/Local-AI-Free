#!/usr/bin/env bash
# Setup Python virtual environment with markitdown for document text extraction.
# Requires Python 3.10+ (uses Homebrew python3.12 by default on macOS).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd)"
VENV_DIR="$SCRIPT_DIR/.venv"

# Find a suitable Python 3.10+
PYTHON=""
for candidate in python3.12 python3.11 python3.10; do
  if command -v "$candidate" &>/dev/null; then
    PYTHON="$candidate"
    break
  fi
done

if [ -z "$PYTHON" ]; then
  echo "ERROR: Python 3.10+ not found. Install it via Homebrew: brew install python@3.12" >&2
  exit 1
fi

echo "Using $PYTHON ($($PYTHON --version))"

# Create venv if it doesn't exist
if [ ! -d "$VENV_DIR" ]; then
  echo "Creating virtual environment at $VENV_DIR..."
  $PYTHON -m venv "$VENV_DIR"
fi

# Install/upgrade markitdown with document format support
echo "Installing markitdown[pdf,docx,pptx,xlsx]..."
"$VENV_DIR/bin/pip" install --upgrade 'markitdown[pdf,docx,pptx,xlsx]'

echo "Done! markitdown CLI available at: $VENV_DIR/bin/markitdown"
