set -e
DEFAULT_ENV=""
POS_ENV="${1:-$DEFAULT_ENV}"
pos-cli deploy $POS_ENV
