# 版本号管理指南

本项目使用语义化版本（Semantic Versioning，SemVer）规则管理版本号。

## 版本号格式

版本号格式：`MAJOR.MINOR.PATCH`

- **MAJOR（主版本号）**：当你做了不兼容的 API 修改
  - 例如：重大架构变更、移除功能、破坏性变更
  - 示例：`6.1.0` → `7.0.0`

- **MINOR（次版本号）**：当你做了向下兼容的功能性新增
  - 例如：新增功能、UI大改、新模块
  - 示例：`6.1.0` → `6.2.0`

- **PATCH（修订号）**：当你做了向下兼容的问题修正
  - 例如：Bug修复、样式微调、性能优化
  - 示例：`6.1.0` → `6.1.1`

## 自动更新版本号

### 方法1：使用 npm 脚本（推荐）

```bash
# 更新补丁版本（Bug修复、小改动）
npm run version:patch

# 更新次版本（新功能、UI改进）
npm run version:minor

# 更新主版本（重大变更、不兼容更新）
npm run version:major
```

### 方法2：直接运行脚本

```bash
# 更新补丁版本
node scripts/update-version.js patch

# 更新次版本
node scripts/update-version.js minor

# 更新主版本
node scripts/update-version.js major
```

## 版本号更新范围

脚本会自动更新以下文件中的版本号：

1. `VERSION` - 版本号主文件
2. `package.json` - npm 包版本
3. `index.html` - 页面标题和版本显示
4. `src/main-legacy.js` - 控制台日志
5. `style.css` - CSS 注释中的版本号
6. `README.md` - 文档中的版本号

## 版本号判断规则

### 何时使用 PATCH（补丁版本）
- ✅ Bug 修复
- ✅ 样式微调
- ✅ 性能优化
- ✅ 代码重构（不影响功能）
- ✅ 文档更新

### 何时使用 MINOR（次版本）
- ✅ 新增功能
- ✅ UI/UX 重大改进
- ✅ 新增模块或组件
- ✅ 新增配置选项
- ✅ 向下兼容的 API 扩展

### 何时使用 MAJOR（主版本）
- ✅ 破坏性变更
- ✅ 移除功能
- ✅ 重大架构重构
- ✅ 不兼容的 API 修改
- ✅ 完全重写

## 当前版本

当前版本号存储在 `VERSION` 文件中，作为单一数据源。

## 注意事项

1. **提交前更新**：在提交代码前运行版本更新脚本
2. **遵循规则**：严格按照 SemVer 规则选择版本类型
3. **记录变更**：在 README.md 或 CHANGELOG.md 中记录版本变更内容
4. **Git 标签**：建议在发布时创建 Git 标签
   ```bash
   git tag -a v6.1.0 -m "版本 6.1.0: Notion风格UI改造"
   ```

## 示例

### 场景1：修复了一个输入验证的Bug
```bash
npm run version:patch
# 6.1.0 → 6.1.1
```

### 场景2：添加了新的计算模式
```bash
npm run version:minor
# 6.1.0 → 6.2.0
```

### 场景3：完全重构了计算引擎（不兼容）
```bash
npm run version:major
# 6.1.0 → 7.0.0
```

