#!/bin/bash
cd ~/cktv/.next/standalone
PASSWORD=123456 NODE_ENV=production node server.js &
sleep 2
open http://localhost:3000
wait
