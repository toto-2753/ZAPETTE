#!/usr/bin/env bash
# Génère deux flux HLS de test (mire + bip) pour les tests de bout en bout.
set -euo pipefail
OUT="${1:-/tmp/hls}"
mkdir -p "$OUT/good" "$OUT/two"
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "testsrc2=size=1280x720:rate=25" -f lavfi -i "sine=frequency=440:sample_rate=48000" \
  -t 40 -c:v libx264 -profile:v main -preset veryfast -pix_fmt yuv420p -g 50 -c:a aac -b:a 96k \
  -f hls -hls_time 2 -hls_playlist_type vod -hls_segment_filename "$OUT/good/seg%03d.ts" "$OUT/good/index.m3u8"
ffmpeg -hide_banner -loglevel error -y -f lavfi -i "smptebars=size=1280x720:rate=25" -f lavfi -i "sine=frequency=660:sample_rate=48000" \
  -t 40 -c:v libx264 -profile:v main -preset veryfast -pix_fmt yuv420p -g 50 -c:a aac -b:a 96k \
  -f hls -hls_time 2 -hls_playlist_type vod -hls_segment_filename "$OUT/two/seg%03d.ts" "$OUT/two/index.m3u8"
echo "Flux de test prêts dans $OUT"
