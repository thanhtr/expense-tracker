#!/bin/bash
# Set Vercel environment variables from .env.production file
# Usage: ./scripts/set-vercel-env.sh

set -e

VERCEL_TOKEN=${VERCEL_TOKEN:-}
VERCEL_PROJECT_ID=${VERCEL_PROJECT_ID:-}
ENV_FILE=${1:-.env.production}

if [ -z "$VERCEL_TOKEN" ] || [ -z "$VERCEL_PROJECT_ID" ]; then
  echo "Error: VERCEL_TOKEN and VERCEL_PROJECT_ID must be set"
  exit 1
fi

if [ ! -f "$ENV_FILE" ]; then
  echo "Error: $ENV_FILE not found"
  exit 1
fi

echo "Setting Vercel environment variables from $ENV_FILE..."

# Read each variable name from .env.production
while IFS= read -r VAR_NAME; do
  # Skip empty lines and comments
  [[ -z "$VAR_NAME" || "$VAR_NAME" =~ ^# ]] && continue

  # Get the value from environment
  VAR_VALUE="${!VAR_NAME}"

  if [ -z "$VAR_VALUE" ]; then
    echo "⚠ Skipping $VAR_NAME (not set in environment)"
    continue
  fi

  echo "Setting $VAR_NAME..."

  # Delete existing variable if it exists (ignore 404 errors)
  curl -s -X DELETE "https://api.vercel.com/v10/projects/$VERCEL_PROJECT_ID/env/$VAR_NAME" \
    -H "Authorization: Bearer $VERCEL_TOKEN" || true

  # Create new variable
  RESPONSE=$(curl -s -X POST "https://api.vercel.com/v10/projects/$VERCEL_PROJECT_ID/env" \
    -H "Authorization: Bearer $VERCEL_TOKEN" \
    -H "Content-Type: application/json" \
    -d "{\"key\":\"$VAR_NAME\",\"value\":\"$VAR_VALUE\",\"target\":[\"production\"]}")

  if echo "$RESPONSE" | grep -q "\"key\":\"$VAR_NAME\""; then
    echo "✓ $VAR_NAME set successfully"
  else
    echo "⚠ Failed to set $VAR_NAME: $RESPONSE"
  fi
done < "$ENV_FILE"

echo "Done!"
