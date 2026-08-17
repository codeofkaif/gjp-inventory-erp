#!/bin/bash
DIR="$( cd "$( dirname "${BASH_SOURCE[0]}" )" >/dev/null 2>&1 && pwd )"
cd "$DIR"

if [ ! -d "node_modules" ]; then
    echo "Installing dependencies..."
    npm install
fi

echo "Starting GJP DRYFRUITS & SPICES ERP..."
open http://localhost:5173
npm run dev -- --host 0.0.0.0 --port 5173
