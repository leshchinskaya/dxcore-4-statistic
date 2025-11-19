#!/bin/bash

# Find and kill existing python server on port 8080
PID=$(lsof -ti:8080)
if [ -n "$PID" ]; then
    echo "Killing existing server on port 8080 (PID: $PID)..."
    kill -9 $PID
fi

# Find and kill existing python server on port 8081
PID2=$(lsof -ti:8081)
if [ -n "$PID2" ]; then
    echo "Killing existing server on port 8081 (PID: $PID2)..."
    kill -9 $PID2
fi

# Wait a moment for the port to be freed
sleep 1

echo "Starting local server on port 8080..."
echo "Open http://localhost:8080/dashboard.html in your browser"
python3 -m http.server 8080

