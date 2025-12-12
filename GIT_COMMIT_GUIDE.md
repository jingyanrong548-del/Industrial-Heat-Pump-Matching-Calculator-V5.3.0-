# Git 提交指南

## 本次更新内容

- ✅ 引入 Vite 构建工具
- ✅ 代码模块化拆分（constants.js, physics.js）
- ✅ UI/UX 升级（V5.8.0）
- ✅ 添加 README.md 文档

## 提交步骤

### 1. 查看变更状态
```bash
git status
```

### 2. 添加所有变更文件
```bash
# 添加所有新文件和修改的文件
git add .

# 或者分别添加：
git add index.html style.css
git add .gitignore README.md package.json package-lock.json vite.config.js
git add src/
```

### 3. 提交变更
```bash
git commit -m "feat: 引入Vite构建工具，代码模块化重构，UI/UX升级至V5.8.0

- 引入 Vite 作为构建工具和开发服务器
- 代码模块化：拆分 constants.js 和 physics.js
- UI/UX 升级：响应式设计、表单验证、Toast通知、图表可视化
- 添加 README.md 项目文档
- 更新项目结构，支持 npm run dev 开发模式"
```

### 4. 推送到 GitHub
```bash
git push origin main
```

## 注意事项

1. **node_modules/** 和 **dist/** 已在 .gitignore 中，不会提交
2. **main.old.js** 是备份文件，已添加到 .gitignore，不会提交
3. 如果仓库中有其他分支，确保推送到正确的分支

## 提交后的效果

- 其他开发者克隆仓库后，需要运行 `npm install` 安装依赖
- 然后可以使用 `npm run dev` 启动开发服务器
- 生产构建使用 `npm run build`

