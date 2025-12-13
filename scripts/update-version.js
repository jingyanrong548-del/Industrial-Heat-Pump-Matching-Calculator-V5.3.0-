#!/usr/bin/env node
/**
 * 版本号自动更新脚本
 * 根据语义化版本（SemVer）规则自动更新版本号
 * 
 * 使用方法：
 *   node scripts/update-version.js [major|minor|patch]
 * 
 * 默认：patch（补丁版本）
 */

import { readFileSync, writeFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const rootDir = join(__dirname, '..');

// 读取当前版本号
function getCurrentVersion() {
  const versionFile = join(rootDir, 'VERSION');
  const version = readFileSync(versionFile, 'utf-8').trim();
  return version;
}

// 更新版本号
function updateVersion(type = 'patch') {
  const currentVersion = getCurrentVersion();
  const [major, minor, patch] = currentVersion.split('.').map(Number);
  
  let newVersion;
  switch (type) {
    case 'major':
      newVersion = `${major + 1}.0.0`;
      break;
    case 'minor':
      newVersion = `${major}.${minor + 1}.0`;
      break;
    case 'patch':
    default:
      newVersion = `${major}.${minor}.${patch + 1}`;
      break;
  }
  
  return newVersion;
}

// 更新所有文件中的版本号
function updateAllFiles(newVersion) {
  const files = [
    { path: 'VERSION', pattern: /.*/, replacement: newVersion },
    { path: 'package.json', pattern: /"version":\s*"[^"]+"/, replacement: `"version": "${newVersion}"` },
    { path: 'index.html', pattern: /V\d+\.\d+\.\d+/g, replacement: `V${newVersion}` },
    { path: 'src/main-legacy.js', pattern: /V\d+\.\d+\.\d+/g, replacement: `V${newVersion}` },
    { path: 'README.md', pattern: /V\d+\.\d+\.\d+/g, replacement: `V${newVersion}` },
  ];
  
  files.forEach(({ path, pattern, replacement }) => {
    const filePath = join(rootDir, path);
    try {
      let content = readFileSync(filePath, 'utf-8');
      content = content.replace(pattern, replacement);
      writeFileSync(filePath, content, 'utf-8');
      console.log(`✓ 已更新 ${path}`);
    } catch (error) {
      console.warn(`⚠ 跳过 ${path}: ${error.message}`);
    }
  });
  
  // 更新 style.css 中的版本注释（只更新第一个）
  const stylePath = join(rootDir, 'style.css');
  try {
    let content = readFileSync(stylePath, 'utf-8');
    content = content.replace(/^\/\* V\d+\.\d+\.\d+:/, `/* V${newVersion}:`);
    writeFileSync(stylePath, content, 'utf-8');
    console.log(`✓ 已更新 style.css`);
  } catch (error) {
    console.warn(`⚠ 跳过 style.css: ${error.message}`);
  }
}

// 主函数
function main() {
  const type = process.argv[2] || 'patch';
  
  if (!['major', 'minor', 'patch'].includes(type)) {
    console.error('错误: 版本类型必须是 major, minor 或 patch');
    process.exit(1);
  }
  
  const currentVersion = getCurrentVersion();
  const newVersion = updateVersion(type);
  
  console.log(`当前版本: ${currentVersion}`);
  console.log(`新版本: ${newVersion} (${type})`);
  console.log('\n更新文件...\n');
  
  updateAllFiles(newVersion);
  
  console.log(`\n✅ 版本号已更新至 ${newVersion}`);
}

main();

