#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Step 1: Push latest changes to GitHub
echo "Pushing changes to GitHub..."
git push
echo "Changes pushed to GitHub successfully."

# Step 2: Build the site locally (including all image processing)
echo "Building the site locally from committed changes..."
vercel build --prod
echo "Site built successfully."

# Step 3: Deploy the prebuilt output to Vercel (no remote build/image processing)
echo "Deploying prebuilt output to Vercel production..."
vercel deploy --prebuilt --prod
echo "Deployment to Vercel completed!"