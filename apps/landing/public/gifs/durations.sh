#!/bin/bash

# Check if directory argument is provided, otherwise use current directory
TARGET_DIR="${1:-.}"

# Find all GIF files and process them
find "$TARGET_DIR" -type f -iname "*.gif" | while read -r gif_file; do
    # Extract filename without path
    filename=$(basename "$gif_file")
    
    # Get duration and metadata from ffmpeg
    metadata=$(ffmpeg -i "$gif_file" 2>&1 | grep Duration)
    
    # Output in requested format
    echo "$filename -> $metadata"
done