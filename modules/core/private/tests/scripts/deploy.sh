set -e
DEFAULT_ENV=""
POS_ENV="${1:-$DEFAULT_ENV}"

pos-cli data clean $POS_ENV --auto-confirm --include-schema

pos-cli deploy $POS_ENV
