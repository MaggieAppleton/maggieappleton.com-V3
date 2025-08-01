#!/bin/bash

# Exit immediately if a command exits with a non-zero status
set -e

# Check if there are uncommitted changes
if ! git diff-index --quiet HEAD --; then
    echo "Found uncommitted changes. Stashing them temporarily..."
    # Stash everything except generated files that will be rebuilt
    git stash push -m "Temporary stash for deployment $(date)" -- ":(exclude)src/content/data/webmentions.json"
    STASHED=true
else
    echo "No uncommitted changes found."
    STASHED=false
fi

# Step 1: Push latest changes to GitHub
echo "Pushing changes to GitHub..."
git push
echo "Changes pushed to GitHub successfully."

# Step 2: Build the site locally (now from clean committed state)
echo "Building the site locally from committed changes..."
npm run build
echo "Site built successfully."

# Step 3: Deploy to Vercel
echo "Deploying to Vercel production..."
vercel --prod
echo "Deployment to Vercel completed!"

# Step 4: Restore stashed changes if any
if [ "$STASHED" = true ]; then
    echo "Restoring your uncommitted changes..."
    git stash pop
    echo "Uncommitted changes restored."
fi
