#!/bin/bash
# Install missing dependencies for secure file upload to DigitalOcean Spaces
set -e

yarn add multer
# For AWS SDK v3 (recommended for DigitalOcean Spaces)
yarn add @aws-sdk/client-s3
# Already present: multer-s3
# Types for development
yarn add -D @types/multer @types/multer-s3
