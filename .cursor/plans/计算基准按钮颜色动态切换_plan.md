# 计算基准按钮颜色动态切换方案

## 需求分析

根据计算模式的选择，动态改变计算基准按钮的颜色主题：

- **已知热源模式** → 计算基准按钮使用**冷色背景**（蓝色系）
- **已知热汇模式** → 计算基准按钮使用**暖色背景**（橙色/红色系）

## 当前实现状态

### 已有功能
1. ✅ 计算模式选择时，body会添加/移除`mode-source-active`类
2. ✅ 选中状态的计算基准按钮已有颜色区分：
   - 已知热源：蓝色（`var(--color-source)`）
   - 已知热汇：橙色（`var(--color-action)`）

### 需要改进
1. ❌ 未选中状态的计算基准按钮没有根据模式改变颜色
2. ❌ 悬停状态的颜色需要与模式保持一致

## 设计方案

### 颜色方案

#### 已知热源模式（冷色 - 蓝色系）
- **选中状态**：`var(--color-source)` (#3b82f6) - 蓝色
- **未选中状态**：`var(--color-source-light)` (#dbeafe) - 浅蓝色背景
- **悬停状态**：`var(--color-source-light)` → `var(--color-source)` 渐变
- **边框**：`var(--color-source)` 或 `var(--color-source-dark)`

#### 已知热汇模式（暖色 - 橙色/红色系）
- **选中状态**：`var(--color-action)` (#f97316) - 橙色
- **未选中状态**：`var(--color-warning-light)` (#fef3c7) - 浅橙色背景
- **悬停状态**：浅橙色 → 橙色渐变
- **边框**：`var(--color-action)` 或 `var(--color-action-hover)`

### 实现方案

#### 方案1：纯CSS实现（推荐）

使用CSS选择器根据body类动态改变样式：

```css
/* 已知热源模式 - 所有计算基准按钮使用冷色 */
body.mode-source-active #inputTypeRadios label {
    /* 未选中状态 */
    background: var(--color-source-light);
    border-color: var(--color-source);
    color: var(--color-source-dark);
}

body.mode-source-active #inputTypeRadios label:hover {
    background: var(--color-source);
    border-color: var(--color-source-dark);
    color: white;
}

body.mode-source-active #inputTypeRadios input[type="radio"]:checked + label {
    /* 选中状态 */
    background: var(--color-source);
    border-color: var(--color-source-dark);
    color: white;
}

/* 已知热汇模式 - 所有计算基准按钮使用暖色 */
body:not(.mode-source-active) #inputTypeRadios label {
    /* 未选中状态 */
    background: var(--color-warning-light);
    border-color: var(--color-action);
    color: var(--color-action-active);
}

body:not(.mode-source-active) #inputTypeRadios label:hover {
    background: var(--color-action);
    border-color: var(--color-action-hover);
    color: white;
}

body:not(.mode-source-active) #inputTypeRadios input[type="radio"]:checked + label {
    /* 选中状态 */
    background: var(--color-action);
    border-color: var(--color-action-hover);
    color: white;
}
```

#### 方案2：JavaScript动态添加类（备选）

如果CSS选择器过于复杂，可以在JavaScript中动态添加类：

```javascript
// 在updateDynamicUI函数中
if (mode === 'source') {
    document.getElementById('inputTypeRadios').classList.add('cold-theme');
    document.getElementById('inputTypeRadios').classList.remove('warm-theme');
} else {
    document.getElementById('inputTypeRadios').classList.add('warm-theme');
    document.getElementById('inputTypeRadios').classList.remove('cold-theme');
}
```

## 实施步骤

1. **更新CSS样式**
   - 移除现有的默认样式
   - 添加基于`mode-source-active`类的条件样式
   - 确保未选中、悬停、选中三种状态都有对应的颜色

2. **测试验证**
   - 测试已知热源模式下的计算基准按钮颜色
   - 测试已知热汇模式下的计算基准按钮颜色
   - 测试切换模式时的颜色过渡效果
   - 测试响应式设计下的表现

3. **优化细节**
   - 确保颜色对比度符合可访问性标准
   - 添加平滑的过渡动画
   - 确保与Notion风格保持一致

## 技术细节

### CSS变量使用
- 冷色系：`--color-source`, `--color-source-light`, `--color-source-dark`
- 暖色系：`--color-action`, `--color-action-hover`, `--color-warning-light`

### 选择器优先级
- 使用`body.mode-source-active`作为父选择器确保优先级
- 使用`!important`仅在必要时使用

### 过渡效果
- 使用`transition: all var(--transition-base)`实现平滑过渡
- 颜色变化应该有200ms的过渡时间

## 预期效果

- ✅ 选择"已知热源"时，计算基准按钮呈现蓝色系（冷色）
- ✅ 选择"已知热汇"时，计算基准按钮呈现橙色系（暖色）
- ✅ 所有状态（未选中、悬停、选中）都保持颜色主题一致
- ✅ 切换模式时颜色平滑过渡
- ✅ 符合Notion风格的简洁设计

## 文件修改清单

1. **`style.css`**
   - 更新计算基准按钮的样式规则
   - 添加基于模式的颜色主题样式

2. **无需修改JavaScript**
   - 现有的`updateDynamicUI`函数已经正确添加/移除`mode-source-active`类

