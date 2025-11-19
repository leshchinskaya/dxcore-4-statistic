#!/usr/bin/env bash
# Helper script to find field IDs
source jira_metrics.sh >/dev/null 2>&1 || true # Just to get vars if exported
# Re-source vars if needed
JIRA_BASE_URL="${JIRA_BASE_URL:-https://jira.surf.dev}"
JIRA_USER="${JIRA_USER:-your.login@surf.dev}"
JIRA_TOKEN="${JIRA_TOKEN:-your_password_or_api_token}"

curl -s -u "${JIRA_USER}:${JIRA_TOKEN}" "${JIRA_BASE_URL}/rest/api/2/field" > fields.json

