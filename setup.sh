#!/usr/bin/env bash
set -e

# Colors for output
GREEN='\033[0;32m'
RED='\033[0;31m'
YELLOW='\033[1;33m'
NC='\033[0m' # No Color

echo -e "${GREEN}Starting setup for Jira Metrics script...${NC}"

# 1. Install Dependencies
echo "Checking dependencies..."

install_jq() {
    if command -v brew &> /dev/null; then
        echo "Homebrew detected. Installing jq..."
        brew install jq
    elif command -v apt-get &> /dev/null; then
        echo "apt-get detected. Installing jq..."
        sudo apt-get update && sudo apt-get install -y jq
    elif command -v yum &> /dev/null; then
        echo "yum detected. Installing jq..."
        sudo yum install -y jq
    elif command -v apk &> /dev/null; then
        echo "apk detected. Installing jq..."
        sudo apk add jq
    else
        echo -e "${RED}Error: Package manager not found. Please install 'jq' manually.${NC}"
        exit 1
    fi
}

if ! command -v jq &> /dev/null; then
    echo -e "${YELLOW}jq is not installed.${NC}"
    install_jq
else
    echo -e "${GREEN}jq is already installed.$(jq --version)${NC}"
fi

if ! command -v curl &> /dev/null; then
    echo -e "${RED}Error: curl is required but not installed. Please install curl.${NC}"
    exit 1
else
    echo -e "${GREEN}curl is already installed.$(curl --version | head -n 1)${NC}"
fi

# 2. Make script executable
echo "Making jira_metrics.sh executable..."
if [ -f "jira_metrics.sh" ]; then
    chmod +x jira_metrics.sh
    echo -e "${GREEN}jira_metrics.sh is now executable.${NC}"
else
    echo -e "${RED}Error: jira_metrics.sh not found in current directory.${NC}"
    exit 1
fi

# 3. Check Environment Variables
echo "Checking environment variables..."

MISSING_VARS=0

if [ -z "${JIRA_USER}" ]; then
    echo -e "${YELLOW}Warning: JIRA_USER is not set.${NC}"
    MISSING_VARS=1
else
    echo -e "${GREEN}JIRA_USER is set to '${JIRA_USER}'.${NC}"
fi

if [ -z "${JIRA_TOKEN}" ]; then
    echo -e "${YELLOW}Warning: JIRA_TOKEN is not set.${NC}"
    MISSING_VARS=1
else
    echo -e "${GREEN}JIRA_TOKEN is set.${NC}"
fi

if [ $MISSING_VARS -eq 1 ]; then
    echo -e "\n${YELLOW}To run the script, you need to set these variables.${NC}"
    echo "You can export them in your current session:"
    echo -e "  export JIRA_USER=\"your.email@surf.dev\""
    echo -e "  export JIRA_TOKEN=\"your_api_token\""
    echo -e "\nOr add them to your shell profile (e.g., ~/.zshrc or ~/.bashrc) to make them permanent."
else
    echo -e "\n${GREEN}All set! You can now run ./jira_metrics.sh${NC}"
fi

