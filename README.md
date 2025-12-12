# 工业热泵匹配计算器 V5.8.0

## 项目介绍

工业热泵匹配计算器，用于计算热泵系统的匹配参数和性能指标。

## 技术栈

- Vite - 构建工具和开发服务器
- Vanilla JavaScript (ES6 Modules)
- Tailwind CSS - 样式框架

## 快速开始

### 安装依赖

```bash
npm install
```

### 开发模式

```bash
npm run dev
```

开发服务器将在 `http://localhost:3000` 启动，并自动打开浏览器。

### 构建生产版本

```bash
npm run build
```

构建产物将输出到 `dist/` 目录。

### 预览生产构建

```bash
npm run preview
```

## 项目结构

```
├── index.html          # 主HTML文件
├── style.css           # 样式文件
├── src/                # 源代码目录
│   ├── main.js        # 主入口文件
│   ├── constants.js   # 常量定义
│   ├── physics.js     # 物理计算函数
│   └── main-legacy.js # 原有代码（逐步重构中）
├── vite.config.js      # Vite配置
└── package.json        # 项目配置
```

## 代码重构计划

当前代码正在从单文件结构重构为模块化结构：

1. ✅ 已创建 `constants.js` - 常量定义
2. ✅ 已创建 `physics.js` - 物理计算函数
3. 🔄 逐步重构其他功能模块：
   - `validation.js` - 输入验证
   - `calculation.js` - 核心计算逻辑
   - `ui.js` - UI交互功能
   - `comparison.js` - 方案对比
   - `report.js` - 报告生成

## 功能特性

- 支持水、空气、蒸汽介质
- 高精度物性计算（IAPWS & NIST）
- 实时表单验证
- 结果可视化（图表）
- 方案对比功能
- 打印报告功能
- 响应式设计

## 版本历史

- V5.8.0 - UI/UX升级，引入Vite模块化
- V5.7.0 - 加湿/除湿修正版
- V5.6.0 - 显热/潜热定义变更
- V5.5.0 - 高精度物性核心

## 联系方式

如有问题，请联系：荆炎荣 15280122625

