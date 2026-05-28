#!/bin/bash
set -euo pipefail

VERSION=$(node -e "console.log(require('./package.json').version)" 2>/dev/null || echo "1.0.0")
NODE_VERSION="v20.18.0"
PLATFORM="linux-x64"
RELEASE_DIR="release/bilicoinpusher-${VERSION}-${PLATFORM}"

echo "==> 打包 BiliCoinPusher v${VERSION} for ${PLATFORM}"

# 清理
rm -rf "release/bilicoinpusher-${VERSION}-${PLATFORM}"
mkdir -p "$RELEASE_DIR"/{node,dist}

# 编译
npm run build

# 下载便携 Node.js
echo "==> 下载便携 Node.js ${NODE_VERSION}..."
curl -fsSL "https://nodejs.org/dist/${NODE_VERSION}/node-${NODE_VERSION}-linux-x64.tar.xz" | tar xJ --strip-components=1 -C "$RELEASE_DIR/node"

# 复制应用文件
echo "==> 复制应用文件..."
cp -r dist "$RELEASE_DIR/"
cp -r node_modules "$RELEASE_DIR/"
cp README.md "$RELEASE_DIR/"

# 创建启动脚本
cat > "$RELEASE_DIR/bilicoinpusher" << 'LAUNCHER'
#!/bin/bash
DIR="$(cd "$(dirname "$0")" && pwd)"
exec "$DIR/node/bin/node" "$DIR/dist/main.js" "$@"
LAUNCHER
chmod +x "$RELEASE_DIR/bilicoinpusher"

# 打包
echo "==> 打包 zip..."
cd release
zip -r "bilicoinpusher-${VERSION}-${PLATFORM}.zip" "bilicoinpusher-${VERSION}-${PLATFORM}"

echo "==> 完成: release/bilicoinpusher-${VERSION}-${PLATFORM}.zip"
