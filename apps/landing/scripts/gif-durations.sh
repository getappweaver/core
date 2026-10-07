#!/bin/bash

# Inspect plugin-owned GIF files; pass a plugin's landing/assets directory.
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
