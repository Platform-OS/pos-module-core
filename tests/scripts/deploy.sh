set -e
DEFAULT_ENV=""
POS_ENV="${1:-$DEFAULT_ENV}"

#echo "Linking playwright"
#npm link @playwright/test

pos-cli data clean $POS_ENV --auto-confirm --include-schema
pos-cli deploy $POS_ENV
