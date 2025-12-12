#!/bin/bash

# 部署脚本：构建并推送到 GitHub Pages

set -e  # 遇到错误立即退出

CURRENT_BRANCH=$(git branch --show-current)

echo "🔨 开始构建..."
npm run build

if [ ! -d "dist" ]; then
    echo "❌ 错误: dist 目录不存在，构建失败！"
    exit 1
fi

# 保存dist目录到临时位置
TEMP_DIST=$(mktemp -d)
cp -r dist/* "$TEMP_DIST/"

echo "📦 切换到 gh-pages 分支..."
if git show-ref --verify --quiet refs/heads/gh-pages; then
    git checkout gh-pages
    # 清理gh-pages分支的所有文件（保留.git）
    git rm -rf . 2>/dev/null || true
else
    git checkout --orphan gh-pages
    git rm -rf . 2>/dev/null || true
fi

echo "📋 复制构建文件到根目录..."
cp -r "$TEMP_DIST"/* .

# 清理临时目录
rm -rf "$TEMP_DIST"

# 确保不提交node_modules和dist目录
rm -rf node_modules dist deploy.sh 2>/dev/null || true

echo "➕ 添加文件到 Git..."
git add .

echo "💾 提交变更..."
git commit -m "Deploy: $(date '+%Y-%m-%d %H:%M:%S')" || echo "没有变更需要提交"

echo "🚀 推送到 GitHub..."
git push origin gh-pages --force

echo "↩️  切换回 $CURRENT_BRANCH 分支..."
git checkout "$CURRENT_BRANCH"

echo "✅ 部署完成！"
echo "🌐 访问地址: https://jingyanrong548-del.github.io/Industrial-Heat-Pump-Matching-Calculator-V5.3.0-/"

