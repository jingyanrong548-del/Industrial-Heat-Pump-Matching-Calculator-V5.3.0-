#!/usr/bin/env node
/**
 * 自动版本更新脚本
 * 检测代码变更并自动更新版本号
 * 
 * 使用场景：
 * - Git pre-commit hook 自动调用
 * - 手动运行：node scripts/auto-version.js [patch|minor|major]
 */

import { readFileSync, writeFileSync, existsSync } from 'fs';
import { execSync } from 'child_process';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// 检查是否有代码变更
function hasCodeChanges() {
    try {
        // 检查是否有未提交的变更
        const status = execSync('git status --porcelain', { encoding: 'utf-8', cwd: rootDir });
        const changedFiles = status.trim().split('\n').filter(line => line.trim());
        
        // 排除版本相关文件
        const versionFiles = ['VERSION', 'package.json', 'index.html', 'src/main-legacy.js', 'README.md', 'style.css'];
        const codeFiles = changedFiles.filter(file => {
            const fileName = file.replace(/^[AM\s]+/, '').trim();
            const isVersionFile = versionFiles.some(vf => fileName.includes(vf));
            const isCodeFile = /\.(js|css|html|json|ts|tsx)$/.test(fileName);
            return !isVersionFile && isCodeFile;
        });
        
        return codeFiles.length > 0;
    } catch (error) {
        // 如果不是 Git 仓库，返回 false
        return false;
    }
}

// 主函数
function main() {
    const versionType = process.argv[2] || 'patch';
    
    if (!['major', 'minor', 'patch'].includes(versionType)) {
        console.error('错误: 版本类型必须是 major, minor 或 patch');
        process.exit(1);
    }
    
    // 检查是否有代码变更
    if (!hasCodeChanges() && versionType === 'patch') {
        console.log('没有检测到代码变更，跳过版本更新');
        return;
    }
    
    // 调用版本更新脚本
    try {
        execSync(`node scripts/update-version.js ${versionType}`, {
            cwd: rootDir,
            stdio: 'inherit'
        });
    } catch (error) {
        console.error('版本更新失败:', error.message);
        process.exit(1);
    }
}

main();

