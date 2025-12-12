// --- 全局常量 ---
import { CP_WATER, R_AIR_DRY, R_VAPOR } from './constants.js';
import * as physics from './physics.js';

// 重新导出物理函数供其他部分使用
const {
    getSatVaporPressure_HighAccuracy,
    getDryAirEnthalpy_HighAccuracy,
    getVaporEnthalpy_HighAccuracy,
    getEnhancementFactor,
    getCompressibilityFactor,
    getSatVaporPressure,
    getAirDensity,
    getHumidityRatio,
    getAirEnthalpy,
    getDewPoint,
    getSteamLatentHeat,
    getVaporPressure
} = physics;

// V4.0.0: 跟踪参数变化状态
let isResultStale = false; 

// NEW V5.1.0: 暂存对比方案
let comparisonCases = [];
let currentInputs = null;
let currentResult = null;

// --- DOM 元素 ---
const form = document.getElementById('hpCalcForm');
const calcButton = document.getElementById('calcButton');
const resetButton = document.getElementById('resetButton');
const resultsDiv = document.getElementById('results');
const resultMessage = document.getElementById('resultMessage');
const resultData = document.getElementById('resultData');
const calcModeRadios = document.querySelectorAll('input[name="calcMode"]');
const inputTypeRadios = document.querySelectorAll('input[name="inputType"]');
const sourceType = document.getElementById('sourceType');
const sinkType = document.getElementById('sinkType');
const sourceAirParams = document.getElementById('sourceAirParams');
const sinkAirParams = document.getElementById('sinkAirParams');
const sinkTempGroup = document.getElementById('sinkTempGroup');
const sinkSteamParams = document.getElementById('sinkSteamParams');
const etaType = document.getElementById('etaType');
const customEtaGroup = document.getElementById('customEtaGroup');
const customCopGroup = document.getElementById('customCopGroup');
const sourceFlowGroup = document.getElementById('sourceFlowGroup');
const sinkFlowGroup = document.getElementById('sinkFlowGroup');
const sourceLoadGroup = document.getElementById('sourceLoadGroup');
const sinkLoadGroup = document.getElementById('sinkLoadGroup');
const sourceResultGroup = document.getElementById('sourceResultGroup');
const sinkResultGroup = document.getElementById('sinkResultGroup');
const sinkAirHumidPotGroup = document.getElementById('sinkAirHumidPotGroup');
const sinkAirRHOutGroup = document.getElementById('sinkAirRHOutGroup');
const sinkEnergyEvapCapGroup = document.getElementById('sinkEnergyEvapCapGroup');
const sinkRHAfterHumidGroup = document.getElementById('sinkRHAfterHumidGroup');
const sourceUnit = document.getElementById('sourceUnit');
const sinkUnit = document.getElementById('sinkUnit');

// NEW V5.1.0: 新的 DOM 元素
const resultActions = document.getElementById('resultActions');
const saveCaseButton = document.getElementById('saveCaseButton');
const printSingleButton = document.getElementById('printSingleButton');
const comparisonSection = document.getElementById('comparisonSection');
const comparisonTableContainer = document.getElementById('comparisonTableContainer');
const printComparisonButton = document.getElementById('printComparisonButton');
const clearCasesButton = document.getElementById('clearCasesButton');


// V3.0.6: Automatic Unit Conversion Logic
let unitStateCache = { source: sourceUnit.value, sink: sinkUnit.value };
sourceUnit.addEventListener('mousedown', () => { unitStateCache.source = sourceUnit.value; });
sinkUnit.addEventListener('mousedown', () => { unitStateCache.sink = sinkUnit.value; });
sourceUnit.addEventListener('change', (e) => {
    const newUnit = e.target.value; const oldUnit = unitStateCache.source;
    handleUnitConversion(document.getElementById('sourceFlow'), oldUnit, newUnit, sourceType.value);
    unitStateCache.source = newUnit;
});
sinkUnit.addEventListener('change', (e) => {
    const newUnit = e.target.value; const oldUnit = unitStateCache.sink;
    handleUnitConversion(document.getElementById('sinkFlow'), oldUnit, newUnit, sinkType.value);
    unitStateCache.sink = newUnit;
});

// --- 辅助函数：UI 更新 (V5.2.1 修正版) ---
function updateDynamicUI() {
    const mode = document.querySelector('input[name="calcMode"]:checked').value;
    const inputType = document.querySelector('input[name="inputType"]:checked').value;
    const sType = sourceType.value;
    const dType = sinkType.value;
    
    // 根据模式动态添加/移除 body 类
    if (mode === 'source') {
        document.body.classList.add('mode-source-active');
    } else {
        document.body.classList.remove('mode-source-active');
    }
    
    // Handle media-specific params
    sourceAirParams.classList.toggle('hidden', sType !== 'air');
    sinkAirParams.classList.toggle('hidden', dType !== 'air');
    sinkTempGroup.classList.toggle('hidden', dType === 'steam');
    sinkSteamParams.classList.toggle('hidden', dType !== 'steam');
    
    // Handle dynamic input groups (4 combinations)
    sourceFlowGroup.classList.toggle('hidden', !(mode === 'source' && inputType === 'flow'));
    sourceLoadGroup.classList.toggle('hidden', !(mode === 'source' && inputType === 'load'));
    sinkFlowGroup.classList.toggle('hidden', !(mode === 'sink' && inputType === 'flow'));
    sinkLoadGroup.classList.toggle('hidden', !(mode === 'sink' && inputType === 'load'));

    // Unit management logic
    if (sType === 'water') {
        sourceUnit.options[0].disabled = false; sourceUnit.options[1].disabled = false; sourceUnit.options[2].disabled = false;
    } else if (sType === 'air') {
        sourceUnit.options[0].disabled = true; sourceUnit.options[1].disabled = false; sourceUnit.options[2].disabled = false;
        if (sourceUnit.value === 't/h') sourceUnit.value = 'm3/h';
    }

    if (dType === 'water' || dType === 'steam') {
        sinkUnit.options[0].disabled = false; sinkUnit.options[1].disabled = false; sinkUnit.options[2].disabled = false;
    } else if (dType === 'air') {
        sinkUnit.options[0].disabled = true; sinkUnit.options[1].disabled = false; sinkUnit.options[2].disabled = false;
        if (sinkUnit.value === 't/h') sinkUnit.value = 'm3/h';
    }

    unitStateCache.source = sourceUnit.value;
    unitStateCache.sink = sinkUnit.value;

    const etaMode = etaType.value;
    customEtaGroup.classList.toggle('hidden', etaMode !== 'custom_eta');
    customCopGroup.classList.toggle('hidden', etaMode !== 'custom_cop');
}

// [V5.4.0] 替换此函数
function showMessage(message, isError = true, warnings = []) {
    resultsDiv.classList.remove('hidden');
    resultMessage.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700', 'bg-yellow-100', 'text-yellow-700', 'opacity-0');
    resultMessage.classList.add('opacity-100');
    
    if (isError) {
        currentInputs = null;
        currentResult = null;
        resultActions.classList.add('hidden'); 
        resultData.classList.add('hidden');
        resultMessage.classList.add('bg-red-100', 'text-red-700');
        resultMessage.innerHTML = `<span class="font-bold">计算失败：</span> ${message}`;
        clearResultFields();
    } else {
        resultData.classList.remove('hidden');
        resultMessage.classList.add('bg-green-100', 'text-green-700');
        
        // --- NEW V5.4.0: 构建并插入警告 HTML ---
        let warningHtml = '';
        if (warnings && warnings.length > 0) {
            // 注意: Tailwind JIT 需要看到完整的类名，这里使用内联样式替代 bg-yellow-100 等
            warningHtml = `<div class="mt-2 p-3 text-sm rounded-md border text-left" style="background-color: #fffbeb; color: #92400e; border-color: #fde68a;">
                               <b>物理约束警告：</b><br>${warnings.join('<br>')}
                           </div>`;
        }
        // --- End NEW V5.4.0 ---

        resultMessage.innerHTML = `<span class="font-bold">计算成功：</span> ${message} ${warningHtml}`;
        resultActions.classList.remove('hidden');
    }
}

function clearResultFields() {
    const fields = ['resFeasibility', 'resSourceSensible', 'resSourceLatent', 'resSourceWater', 'resSinkParam1Value', 'resSinkParam2Value', 'resSinkParam3Value', 'resSinkAirHumidPot', 'resSinkAirRHOut', 'resSinkEnergyEvapCap', 'resSinkRHAfterHumid', 'resQcold', 'resQhot', 'resW', 'resSourceFlow', 'resSinkFlow', 'resCopActual', 'resCopCarnot', 'resEta'];
    fields.forEach(id => { const el = document.getElementById(id); if (el) el.textContent = '---'; });
    const feasibilityEl = document.getElementById('resFeasibility');
    if(feasibilityEl) feasibilityEl.className = 'font-bold text-lg text-gray-700';
    if(sourceResultGroup) sourceResultGroup.classList.add('hidden');
    if(sinkResultGroup) sinkResultGroup.classList.add('hidden');
    if (sinkAirHumidPotGroup) sinkAirHumidPotGroup.classList.add('hidden');
    if (sinkAirRHOutGroup) sinkAirRHOutGroup.classList.add('hidden');
    if (sinkEnergyEvapCapGroup) sinkEnergyEvapCapGroup.classList.add('hidden');
    if (sinkRHAfterHumidGroup) sinkRHAfterHumidGroup.classList.add('hidden');
}

// [V5.4.0] 替换此函数
function displayResults(data) {
    // V5.4.0: 将 data.warnings 传递给 showMessage
    showMessage(data.message, !data.feasibility, data.warnings || []);
    
    if (!data.feasibility) return;

    const num = (n, dec = 2) => (n === null || typeof n === 'undefined' || isNaN(n)) ? '---' : n.toFixed(dec);
    const kw = (n) => `${num(n, 2)} kW`;
    const kg_h = (n) => `${num(n, 3)} kg/h`;
    const percent = (n) => `${num(n, 1)} %`; 
    
    const feasibilityEl = document.getElementById('resFeasibility');
    feasibilityEl.textContent = data.feasibility ? '可行' : '不可行';
    feasibilityEl.className = data.feasibility ? 'font-bold text-lg text-green-600' : 'font-bold text-lg text-red-600';
    
    sourceResultGroup.classList.toggle('hidden', data.source.type !== 'air');
    if (data.source.type === 'air') {
        document.getElementById('resSourceSensible').textContent = kw(data.source.qSensible);
        document.getElementById('resSourceLatent').textContent = kw(data.source.qLatent);
        document.getElementById('resSourceWater').textContent = kg_h(Math.abs(data.source.water_kg_h));
    }
    
    sinkResultGroup.classList.toggle('hidden', data.sink.type !== 'air' && data.sink.type !== 'steam');
    const isAirSink = data.sink.type === 'air';
    sinkAirHumidPotGroup.classList.toggle('hidden', !isAirSink);
    sinkAirRHOutGroup.classList.toggle('hidden', !isAirSink);
    sinkEnergyEvapCapGroup.classList.toggle('hidden', !isAirSink); 
    sinkRHAfterHumidGroup.classList.toggle('hidden', !isAirSink);
    
    if (isAirSink) {
        document.getElementById('resSinkParam1Label').textContent = '显热负荷 (Q_sens)：';
        document.getElementById('resSinkParam1Value').textContent = kw(data.sink.qSensible);
        document.getElementById('resSinkParam2Label').textContent = '潜热负荷 (Q_lat)：';
        document.getElementById('resSinkParam2Value').textContent = kw(data.sink.qLatent);
        document.getElementById('resSinkParam3Label').textContent = '加湿/除湿水量：';
        // --- V5.7.0 (Humidification Mod) ---
        // 确保正确显示加湿 (正) 或除湿 (负)
        document.getElementById('resSinkParam3Value').textContent = kg_h(data.sink.water_kg_h);
        // --- V5.7.0 END ---
        document.getElementById('resSinkAirHumidPot').textContent = kg_h(data.sink.maxHumidPot_kg_h);
        document.getElementById('resSinkAirRHOut').textContent = percent(data.sink.rhOut_noHumid);
        document.getElementById('resSinkEnergyEvapCap').textContent = kg_h(data.sink.energyEvapCap_kg_h);
        document.getElementById('resSinkRHAfterHumid').textContent = percent(data.sink.rhOut_afterHumid);
    } else if (data.sink.type === 'steam') {
        const satPressureBara = getSatVaporPressure(data.sink.steamTemp) / 100000;
        document.getElementById('resSinkParam1Label').textContent = '饱和压力：';
        document.getElementById('resSinkParam1Value').textContent = `${num(satPressureBara, 3)} bara`;
        document.getElementById('resSinkParam2Label').textContent = '显热负荷 (Q_sens)：';
        document.getElementById('resSinkParam2Value').textContent = kw(data.sink.qSensible);
        document.getElementById('resSinkParam3Label').textContent = '潜热负荷 (Q_lat)：';
        document.getElementById('resSinkParam3Value').textContent = kw(data.sink.qLatent);
    }
    
    document.getElementById('resQcold').textContent = kw(data.qCold_kW);
    document.getElementById('resQhot').textContent = kw(data.qHot_kW);
    document.getElementById('resW').textContent = kw(data.W_kW);
    document.getElementById('resSourceFlow').textContent = (data.flow.sourceFlow !== null) ? `${num(data.flow.sourceFlow)} ${data.flow.sourceUnit}` : '---';
    document.getElementById('resSinkFlow').textContent = (data.flow.sinkFlow !== null) ? `${num(data.flow.sinkFlow)} ${data.flow.sinkUnit}` : '---';
    document.getElementById('resCopActual').textContent = num(data.copActual, 2);
    document.getElementById('resCopCarnot').textContent = num(data.copCarnotMax, 2);
    document.getElementById('resEta').textContent = `${num(data.etaActual * 100, 1)} %`;
}

function handleUnitConversion(inputElement, fromUnit, toUnit, mediaType) {
    if (fromUnit === toUnit) return;
    const currentValue = parseFloat(inputElement.value);
    if (isNaN(currentValue) || currentValue === 0) return;
    let valueInM3h;
    if (fromUnit === 't/h') { valueInM3h = (mediaType === 'air') ? NaN : currentValue; } 
    else if (fromUnit === 'L/min') { valueInM3h = currentValue * 60 / 1000; } 
    else { valueInM3h = currentValue; }
    if (isNaN(valueInM3h)) { console.warn(`Conversion error: Cannot convert from ${fromUnit} for ${mediaType}`); return; }
    let newValue;
    if (toUnit === 't/h') { newValue = (mediaType === 'air') ? NaN : valueInM3h; } 
    else if (toUnit === 'L/min') { newValue = valueInM3h * 1000 / 60; } 
    else { newValue = valueInM3h; }
    if (isNaN(newValue)) { console.warn(`Conversion error: Cannot convert to ${toUnit} for ${mediaType}`); return; }
    inputElement.value = parseFloat(newValue.toFixed(3)); 
}

// --- 事件监听器 ---
form.addEventListener('change', updateDynamicUI); 

// (V5.1.1 修正版) - V5.8.0: 添加防抖优化
let inputDebounceTimer = null;
form.addEventListener('input', () => {
    // 清除之前的定时器
    if (inputDebounceTimer) {
        clearTimeout(inputDebounceTimer);
    }
    
    // 设置新的定时器（防抖：300ms）
    inputDebounceTimer = setTimeout(() => {
        if (!resultsDiv.classList.contains('hidden')) {
            isResultStale = true;
            resultMessage.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700', 'opacity-0');
            resultMessage.classList.add('bg-yellow-100', 'text-yellow-700', 'opacity-100');
            resultMessage.innerHTML = `<span class="font-bold">注意：</span> 输入参数已更改，请重新计算！`;
            resultData.classList.add('hidden'); 
            resultActions.classList.add('hidden');
            currentInputs = null;
            currentResult = null;
            // NEW V5.2.0: Update button style on stale
            calcButton.classList.remove('bg-[var(--color-action)]', 'hover:bg-orange-800');
            calcButton.classList.add('bg-yellow-500', 'hover:bg-yellow-600', 'animate-pulse');
        }
    }, 300);
});

// (V5.2.0 修正版)
resetButton.addEventListener('click', () => {
    form.reset();
    resultsDiv.classList.add('hidden');
    resultMessage.classList.add('hidden'); 
    resultData.classList.add('hidden');
    resultActions.classList.add('hidden');
    isResultStale = false;
    // NEW V5.2.0: Restore correct button style on reset
    calcButton.classList.remove('bg-yellow-500', 'hover:bg-yellow-600', 'animate-pulse');
    calcButton.classList.add('bg-[var(--color-action)]', 'hover:bg-orange-800'); 
    
    document.getElementById('mode_source').checked = true;
    document.getElementById('type_flow').checked = true; 
    document.getElementById('etaType').value = "0.55";
    
    currentInputs = null;
    currentResult = null;
    clearComparison(); 
    
    updateDynamicUI(); // Update UI *after* resetting form values
});

calcButton.addEventListener('click', performCalculation);

saveCaseButton.addEventListener('click', saveCurrentCase);
clearCasesButton.addEventListener('click', clearComparison);
printSingleButton.addEventListener('click', () => {
    if (!currentInputs || !currentResult || !currentResult.feasibility) {
        alert("没有可打印的有效计算报告。");
        return;
    }
    
    // NEW V5.3.0: Generate report
    try {
        generatePrintReport(); // Populate the report container
        
        document.body.classList.remove('printing-comparison');
        document.body.classList.add('printing-single-report');
        
        window.print();
        
        // Cleanup after print dialog
        setTimeout(() => {
            document.body.classList.remove('printing-single-report');
            document.getElementById('printReportContainer').innerHTML = ''; // Clear content
        }, 500);
    } catch (e) {
        console.error("Error generating print report:", e);
        alert("生成打印报告时出错：" + e.message);
    }
});
printComparisonButton.addEventListener('click', printComparison);


// --- K核心计算逻辑 ---
// (V5.2.0 修正版)
function performCalculation() {
    isResultStale = false;
    // NEW V5.2.0: Restore correct button style on calculate
    calcButton.classList.remove('bg-yellow-500', 'hover:bg-yellow-600', 'animate-pulse');
    calcButton.classList.add('bg-[var(--color-action)]', 'hover:bg-orange-800');
    try {
        const formData = new FormData(form);
        const raw = Object.fromEntries(formData.entries());
        const inputs = parseAndValidateInputs(raw);
        const sourceResult = (inputs.mode === 'source' && inputs.inputType === 'flow') 
            ? calculateLoad(inputs.source, true, true) 
            : { type: inputs.source.type, q_kW: NaN, qSensible: NaN, qLatent: NaN, water_kg_h: 0 };
        const sinkResult = (inputs.mode === 'sink' && inputs.inputType === 'flow') 
            ? calculateLoad(inputs.sink, true, false) 
            : { type: inputs.sink.type, steamTemp: inputs.sink.steamTemp, q_kW: NaN, qSensible: NaN, qLatent: NaN, water_kg_h: 0 };
        const finalResult = calculateMatch(inputs, sourceResult, sinkResult);
        currentInputs = inputs;
        currentResult = finalResult;
        displayResults(finalResult);
    } catch (e) {
        console.error("Calculation Error:", e);
        showMessage(e.message || '发生未知计算错误，请检查输入参数。');
    }
}

// [V5.4.0] 替换此函数
// --- V5.7.0 (Humidification Mod) START ---
// MODIFIED V5.7.0: parseAndValidateInputs
function parseAndValidateInputs(p) {
    const errors = [];
    const warnings = []; 
    
    const inputs = { mode: p.calcMode, inputType: p.inputType, source: {}, sink: {}, eta: {}, minTempApproach: 3.0, steamTempApproach: 5.0 };
    
    const parseFloatStrict = (val, name, allowZero = false, min = -Infinity, max = Infinity) => {
        if (val === null || String(val).trim() === '') { errors.push(`${name} 不能为空。`); return NaN; }
        const num = parseFloat(val);
        if (isNaN(num) || (!allowZero && num <= 0) || num < min || num > max) { errors.push(`${name} 必须是有效数字 (范围 ${min} ~ ${max})。`); return NaN; }
        return num;
    };
    
    // --- V5.7.0 (Humidification Mod) ---
    // 新增一个“宽松”解析器，允许空值
    const parseFloatOptional = (val, name, min = -Infinity, max = Infinity) => {
        if (val === null || String(val).trim() === '') { return null; } // 允许为空
        const num = parseFloat(val);
        if (isNaN(num) || num < min || num > max) { errors.push(`${name} (选填) 必须是有效数字 (范围 ${min} ~ ${max})。`); return NaN; }
        return num;
    };
    // --- V5.7.0 END ---

    inputs.source.type = p.sourceType;
    inputs.source.tempIn = parseFloatStrict(p.sourceTempIn, "热源·进口温度", true, -100, 300);
    inputs.source.tempOut = parseFloatStrict(p.sourceTempOut, "热源·出口温度", true, -100, 300);
    if (!isNaN(inputs.source.tempIn) && !isNaN(inputs.source.tempOut) && inputs.source.tempIn <= inputs.source.tempOut) errors.push("热源：进口温度必须高于出口温度。");
    
    if (inputs.mode === 'source') {
        if (inputs.inputType === 'flow') {
            inputs.source.flow = parseFloatStrict(p.sourceFlow, "热源·可用流量");
            inputs.source.unit = p.sourceUnit;
        } else { inputs.source.load = parseFloatStrict(p.sourceLoad, "热源·可用负荷"); }
    }
    
    if (inputs.source.type === 'air') {
        inputs.source.pressure = parseFloatStrict(p.sourceAirPressure, "热源·空气压力", true, 0.1, 20);
        inputs.source.rh = parseFloatStrict(p.sourceAirRH, "热源·相对湿度", true, 0, 100);

        if (!isNaN(inputs.source.tempIn) && !isNaN(inputs.source.pressure) && !isNaN(inputs.source.rh)) {
            const P_abs = inputs.source.pressure * 100000;
            const P_sat = getSatVaporPressure(inputs.source.tempIn);
            if (P_sat > P_abs) { 
                const RH_max_phys = (P_abs / P_sat) * 100;
                if (inputs.source.rh > RH_max_phys) {
                    warnings.push(`热源侧：在 ${inputs.source.tempIn}°C 和 ${inputs.source.pressure} bara 下，最大物理 RH 约为 ${RH_max_phys.toFixed(1)}%。输入值 ${inputs.source.rh}% 将按 ${RH_max_phys.toFixed(1)}% 极限值计算。`);
                }
            }
        }
    }
    
    inputs.sink.type = p.sinkType;
    if (inputs.sink.type === 'steam') {
        inputs.sink.steamTemp = parseFloatStrict(p.sinkSteamTemp, "热汇·饱和蒸汽温度", true, 1, 250);
        inputs.sink.makeupTemp = parseFloatStrict(p.sinkMakeupWaterTemp, "热汇·补水温度", true, -20, 100);
        if (!isNaN(inputs.sink.makeupTemp) && !isNaN(inputs.sink.steamTemp) && inputs.sink.makeupTemp >= inputs.sink.steamTemp) errors.push("补水温度必须低于饱和蒸汽温度。");
    } else {
        inputs.sink.tempIn = parseFloatStrict(p.sinkTempIn, "热汇·进口温度", true, -100, 300);
        inputs.sink.tempOut = parseFloatStrict(p.sinkTempOut, "热汇·目标温度", true, -100, 300);
        if (!isNaN(inputs.sink.tempIn) && !isNaN(inputs.sink.tempOut) && inputs.sink.tempIn >= inputs.sink.tempOut) errors.push("热汇：进口温度必须低于目标温度。");
        if (inputs.sink.type === 'air') {
             inputs.sink.pressure = parseFloatStrict(p.sinkAirPressure, "热汇·空气压力", true, 0.1, 20);
             inputs.sink.rh = parseFloatStrict(p.sinkAirRH, "热汇·(进口)相对湿度", true, 0, 100);
             
             // --- V5.7.0 (Humidification Mod) START ---
             // 读取假设的 "sinkAirRHOut" (目标出口RH)
             inputs.sink.rhOut = parseFloatOptional(p.sinkAirRHOut, "热汇·目标相对湿度", 0, 100);
             // --- V5.7.0 END ---

             if (!isNaN(inputs.sink.tempIn) && !isNaN(inputs.sink.pressure) && !isNaN(inputs.sink.rh)) {
                const P_abs = inputs.sink.pressure * 100000;
                const P_sat = getSatVaporPressure(inputs.sink.tempIn);
                if (P_sat > P_abs) { 
                    const RH_max_phys = (P_abs / P_sat) * 100;
                    if (inputs.sink.rh > RH_max_phys) {
                        warnings.push(`热汇侧：在 ${inputs.sink.tempIn}°C 和 ${inputs.sink.pressure} bara 下，最大物理 RH 约为 ${RH_max_phys.toFixed(1)}%。输入值 ${inputs.sink.rh}% 将按 ${RH_max_phys.toFixed(1)}% 极限值计算。`);
                    }
                }
            }
             
            // --- V5.7.0 (Humidification Mod) START ---
            // 同样检查出口RH的物理极限
            if (inputs.sink.rhOut !== null && !isNaN(inputs.sink.rhOut) && !isNaN(inputs.sink.tempOut) && !isNaN(inputs.sink.pressure)) {
                const P_abs = inputs.sink.pressure * 100000;
                const P_sat = getSatVaporPressure(inputs.sink.tempOut);
                 if (P_sat > P_abs) { 
                    const RH_max_phys = (P_abs / P_sat) * 100;
                    if (inputs.sink.rhOut > RH_max_phys) {
                        warnings.push(`热汇侧：在 ${inputs.sink.tempOut}°C 和 ${inputs.sink.pressure} bara 下，最大物理 RH 约为 ${RH_max_phys.toFixed(1)}%。目标RH ${inputs.sink.rhOut}% 将按 ${RH_max_phys.toFixed(1)}% 极限值计算。`);
                        inputs.sink.rhOut = RH_max_phys; // 自动约束
                    }
                }
            }
             // --- V5.7.0 END ---
        }
    }
    
    if (inputs.mode === 'sink') {
        if (inputs.inputType === 'flow') {
            inputs.sink.flow = parseFloatStrict(p.sinkFlow, "热汇·需求流量");
            inputs.sink.unit = p.sinkUnit;
        } else { inputs.sink.load = parseFloatStrict(p.sinkLoad, "热汇·需求负荷"); }
    }
    
    inputs.eta.type = p.etaType;
    if (inputs.eta.type === 'custom_eta') inputs.eta.customEta = parseFloatStrict(p.customEta, "自定义 η", false, 0.01, 0.99);
    else if (inputs.eta.type === 'custom_cop') inputs.eta.customCop = parseFloatStrict(p.customCop, "自定义 COP", false, 1.01);
    else inputs.eta.customEta = parseFloat(inputs.eta.type);
    
    const T_cold_out = inputs.source.tempOut;
    const T_hot_in = (inputs.sink.type === 'steam') ? inputs.sink.steamTemp : inputs.sink.tempIn;
    
    inputs.warnings = warnings; 

    if (errors.length > 0) throw new Error(errors.join('<br>'));
    return inputs;
}
// --- V5.7.0 END ---


// --- MODIFIED V5.5.0: 核心计算逻辑 ---
// --- V5.7.0 (Humidification Mod) START ---
// MODIFIED V5.7.0: calculateFlowFromLoad
function calculateFlowFromLoad(params, q_kW, isSource) {
    if (!q_kW || q_kW <= 0) throw new Error("用于反算流量的负荷无效。");
    if (params.type === 'water') {
        const delta_t = isSource ? params.tempIn - params.tempOut : params.tempOut - params.tempIn;
        if (delta_t <= 0) throw new Error(isSource ? "热源水侧温差必须大于0。" : "热汇水侧温差必须大于0。");
        const mass_kg_s = q_kW / (CP_WATER * delta_t);
        const flow_t_h = mass_kg_s * 3600 / 1000;
        return { flow: flow_t_h, unit: "t/h" };
    } 
    else if (params.type === 'air') {
        // V5.5.0: 使用高精度模型
        const W_in = getHumidityRatio(params.pressure, params.tempIn, params.rh);
        const h_in = getAirEnthalpy(params.tempIn, W_in);
        
        // --- V5.7.0 (Humidification Mod) START ---
        let W_out = W_in; // 默认 W 不变
        if (isSource && params.tempOut < getDewPoint(params.tempIn, params.rh, params.pressure)) { 
            // 冷却除湿
            W_out = getHumidityRatio(params.pressure, params.tempOut, 100); 
        }
         else if (!isSource && params.tempOut > params.tempIn) { 
            // 加热
             if (params.rhOut !== null && typeof params.rhOut !== 'undefined') {
                 // 目标RH已指定 (加热+加湿/除湿)
                 W_out = getHumidityRatio(params.pressure, params.tempOut, params.rhOut);
             } else {
                 // 纯加热 (W_out 保持 W_in)
             }
        }
        // --- V5.7.0 END ---
        
        const h_out = getAirEnthalpy(params.tempOut, W_out);
        const delta_h = isSource ? h_in - h_out : h_out - h_in;
        
        if(delta_h === 0) throw new Error(isSource ? "热源空气焓差为0，无法反算流量。" : "热汇空气焓差为0，无法反算流量。");
        // --- V5.7.0 (Humidification Mod) 允许 delta_h < 0 (例如，在加热时进行强力除湿)
        if (isSource && delta_h <= 0) throw new Error("热源空气焓差必须大于0。");
        if (!isSource && delta_h <= 0) throw new Error("热汇空气总焓变必须大于0 (加热或加湿)。");
        // --- V5.7.0 END ---

        const mass_kg_s = q_kW / delta_h; // 此处 mass_kg_s 是干空气质量
        const density = getAirDensity(params.pressure, params.tempIn, params.rh); 
        
        // --- V5.7.0 (Humidification Mod) START ---
        // 修正：mass_kg_s 应该是干空气质量，但 q_kW / delta_h 已经是干空气质量
        // h_in 和 h_out 是 (kJ/kg dry air)
        // 所以 mass_kg_s = q_kW / delta_h 得到的单位是 (kg dry air / s)
        const mass_dry_air_kg_s = mass_kg_s;
        // 转换为湿空气的 *进口* 体积流量
        const mass_moist_air_kg_s = mass_dry_air_kg_s * (1 + W_in);
        const flow_m3_h = (mass_moist_air_kg_s * 3600) / density;
        // --- V5.7.0 END ---
        
        return { flow: flow_m3_h, unit: "m³/h" };
    }
    else if (params.type === 'steam' && !isSource) { 
        // (此部分不变，不涉及空气)
        const h_latent = getSteamLatentHeat(params.steamTemp);
        const h_sensible = CP_WATER * (params.steamTemp - params.makeupTemp);
        const delta_h_total = h_latent + h_sensible;
        if (delta_h_total <= 0) throw new Error("热汇蒸汽总焓升必须大于0。");
        const mass_kg_s = q_kW / delta_h_total;
        const flow_t_h = mass_kg_s * 3600 / 1000;
        return { flow: flow_t_h, unit: "t/h" };
    }
    throw new Error("无法计算流量：未知的介质类型或配置。");
}
// --- V5.7.0 END ---


// --- MODIFIED V5.6.0: 显热/潜热定义变更 ---
// --- V5.7.0 (Humidification Mod) START ---
// MODIFIED V5.7.0: calculateLoad
function calculateLoad(params, hasKnownFlow, isSource) {
    // --- V5.7.0 修正：mass_kg_s 统一为 (kg dry air / s)
    let result = { type: params.type, mass_dry_air_kg_s: NaN, q_kW: NaN, qSensible: NaN, qLatent: NaN, water_kg_h: 0 };
    const flow = hasKnownFlow ? params.flow : NaN;
    const unit = params.unit;
    
    if (params.type === 'water') {
        const delta_t = isSource ? params.tempIn - params.tempOut : params.tempOut - params.tempIn;
        if (hasKnownFlow) {
            let mass_moist_kg_s = NaN;
            if (unit === 't/h') { mass_moist_kg_s = flow * 1000 / 3600; } 
            else if (unit === 'L/min') { mass_moist_kg_s = flow / 60; } 
            else if (unit === 'm3/h') { mass_moist_kg_s = flow * 1000 / 3600; } 
            else { throw new Error(`(热源: ${isSource}) 水介质的流量单位无效: ${unit}。`); }
            
            result.mass_dry_air_kg_s = mass_moist_kg_s; // 水介质中，干质量=湿质量
            result.q_kW = result.mass_dry_air_kg_s * CP_WATER * delta_t;
        }
        result.qSensible = result.q_kW; result.qLatent = 0;
    } else if (params.type === 'air') {
        const W_in = getHumidityRatio(params.pressure, params.tempIn, params.rh);
        const h_in = getAirEnthalpy(params.tempIn, W_in);
        
        // --- V5.7.0 (Humidification Mod) START ---
        let W_out = W_in; // 默认 W 不变
        if (isSource && params.tempOut < getDewPoint(params.tempIn, params.rh, params.pressure)) { 
            // 冷却除湿
            W_out = getHumidityRatio(params.pressure, params.tempOut, 100); 
        }
         else if (!isSource && params.tempOut > params.tempIn) { 
            // 加热
             if (params.rhOut !== null && typeof params.rhOut !== 'undefined') {
                 // 目标RH已指定 (加热+加湿/除湿)
                 W_out = getHumidityRatio(params.pressure, params.tempOut, params.rhOut);
             } else {
                 // 纯加热 (W_out 保持 W_in)
             }
        }
        // --- V5.7.0 END ---

        const h_out = getAirEnthalpy(params.tempOut, W_out);
        const delta_h = isSource ? h_in - h_out : h_out - h_in;
        
        if (hasKnownFlow) {
            const density = getAirDensity(params.pressure, params.tempIn, params.rh);
            let mass_moist_kg_s; // (kg total moist air / s)
            
            if (unit === 'm3/h' || unit === 'm³/h') { mass_moist_kg_s = (flow * density) / 3600; } 
            else if (unit === 'L/min') { const flow_m3_s = (flow / 1000) / 60; mass_moist_kg_s = flow_m3_s * density; } 
            else { throw new Error(`(热源: ${isSource}) 空气介质的流量单位无效: ${unit} (应为 m³/h 或 L/min)。`); }
            
            // 转换为干空气质量 (kg dry air / s)
            result.mass_dry_air_kg_s = mass_moist_kg_s / (1 + W_in);
            
            // 总负荷 (V5.5.0 精度)
            result.q_kW = result.mass_dry_air_kg_s * delta_h;
            
            // --- V5.6.0: 显热/潜热分离 (Munters 定义) ---
            // qSensible = 干空气显热
            // qLatent = 湿气负荷 (水蒸气显热 + 相变潜热)
            
            // 1. (已在上面计算)
            const mass_dry_air_kg_s = result.mass_dry_air_kg_s;

            // 2. 计算干空气的焓变
            const h_dry_air_in = getDryAirEnthalpy_HighAccuracy(params.tempIn);
            const h_dry_air_out = getDryAirEnthalpy_HighAccuracy(params.tempOut);
            const delta_h_dry_air = h_dry_air_out - h_dry_air_in; // 符号保持一致

            // 3. 计算干空气显热负荷
            // --- V5.7.0 修正：使用 Math.abs(delta_h) 而不是 delta_h
            result.qSensible = mass_dry_air_kg_s * Math.abs(delta_h_dry_air);
            
            // 4. 潜热 = 总负荷 - 干空气显热
            result.qLatent = result.q_kW - result.qSensible;
            // --- END V5.6.0 ---
            
            // --- V5.7.0 修正：water_kg_h 的符号
            // (W_out - W_in) * mass_dry * 3600
            // W_out > W_in (加湿) -> water_kg_h 为正
            // W_out < W_in (除湿) -> water_kg_h 为负
            result.water_kg_h = mass_dry_air_kg_s * (W_out - W_in) * 3600; 
            
            if (Math.abs(result.qLatent) < 1e-6) result.qLatent = 0;
            if (Math.abs(result.water_kg_h) < 1e-6) result.water_kg_h = 0;

            // 重新校验 qLatent
            if (result.qLatent < 0 && result.q_kW > 0) { 
                 console.warn(`Negative latent heat (${result.qLatent} kW) calculated for ${isSource ? 'source' : 'sink'}. Resetting. Q_sensible adjusted.`);
                 // (V5.7.0: 这种 Q_lat < 0 的情况是可能的，例如强力除湿同时加热，暂时保留)
                 // V5.6.0 的重置逻辑在 V5.7.0 中可能不适用
                 // result.qSensible = result.q_kW; result.qLatent = 0; result.water_kg_h = 0;
            }
        }
    } else if (params.type === 'steam' && !isSource) { 
        // (此部分不变，不涉及空气)
        const h_latent = getSteamLatentHeat(params.steamTemp);
        const h_sensible = CP_WATER * (params.steamTemp - params.makeupTemp);
        const delta_h_total = h_latent + h_sensible;
        if (hasKnownFlow) {
            let mass_moist_kg_s;
            if (unit === 't/h') { mass_moist_kg_s = flow * 1000 / 3600; } 
            else if (unit === 'L/min') { mass_moist_kg_s = flow / 60; } 
            else if (unit === 'm3/h') { mass_moist_kg_s = flow * 1000 / 3600; } 
            else { throw new Error(`热汇·蒸汽介质的流量单位无效: ${unit}。`); }
            
            result.mass_dry_air_kg_s = mass_moist_kg_s; // 蒸汽=纯水
            result.q_kW = result.mass_dry_air_kg_s * delta_h_total;
            result.qSensible = result.mass_dry_air_kg_s * h_sensible;
            result.qLatent = result.mass_dry_air_kg_s * h_latent;
        }
    }
    return result;
}
// --- V5.7.0 END ---


// [V5.4.0] 替换此函数
function calculateMatch(inputs, sourceResult, sinkResult) {
    const { source, sink, eta, minTempApproach, steamTempApproach, mode, inputType } = inputs;
    let qCold_kW, qHot_kW, W_kW, copActual, etaActual;
    let finalSourceFlow, finalSourceFlowUnit, finalSinkFlow, finalSinkFlowUnit;
    let maxHumidPot_kg_h = null, rhOut_noHumid = null;
    let energyEvapCap_kg_h = null, rhOut_afterHumid = null; 
    let finalSource = { ...sourceResult };
    let finalSink = { ...sinkResult }; 
    
    const T_evap_est = source.tempOut - minTempApproach;
    const T_cond_est = (sink.type === 'steam') ? (sink.steamTemp + steamTempApproach) : (sink.tempOut + minTempApproach);
    const T_evap_K = T_evap_est + 273.15, T_cond_K = T_cond_est + 273.15;
    
    if (T_evap_K >= T_cond_K) throw new Error(`热力学不可能：估算蒸发 (${T_evap_est.toFixed(1)}°C) >= 冷凝 (${T_cond_est.toFixed(1)}°C)。`);
    
    const copCarnotMax = T_cond_K / (T_cond_K - T_evap_K);
    
    if (eta.type === 'custom_cop') { copActual = eta.customCop; etaActual = copActual / copCarnotMax; } 
    else { etaActual = eta.customEta; copActual = copCarnotMax * etaActual; }
    
    if (copActual <= 1) throw new Error(`实际 COP (${copActual.toFixed(2)}) <= 1，不可行。`);
    
    if (mode === 'source' && inputType === 'flow') {
        qCold_kW = sourceResult.q_kW;
        if (!qCold_kW || qCold_kW <= 0) throw new Error("无法确定有效的制冷量。");
        W_kW = qCold_kW / (copActual - 1);
        qHot_kW = qCold_kW + W_kW;
        finalSourceFlow = source.flow; finalSourceFlowUnit = source.unit;
        const { flow, unit } = calculateFlowFromLoad(sink, qHot_kW, false);
        finalSinkFlow = flow; finalSinkFlowUnit = unit;
    } else if (mode === 'source' && inputType === 'load') {
        qCold_kW = inputs.source.load;
        W_kW = qCold_kW / (copActual - 1);
        qHot_kW = qCold_kW + W_kW;
        const { flow: sFlow, unit: sUnit } = calculateFlowFromLoad(source, qCold_kW, true);
        finalSourceFlow = sFlow; finalSourceFlowUnit = sUnit;
        const { flow: dFlow, unit: dUnit } = calculateFlowFromLoad(sink, qHot_kW, false);
        finalSinkFlow = dFlow; finalSinkFlowUnit = dUnit;
    } else if (mode === 'sink' && inputType === 'flow') {
        qHot_kW = sinkResult.q_kW;
        if (!qHot_kW || qHot_kW <= 0) throw new Error("无法确定有效的制热量。");
        W_kW = qHot_kW / copActual;
        qCold_kW = qHot_kW - W_kW;
        const { flow, unit } = calculateFlowFromLoad(source, qCold_kW, true);
        finalSourceFlow = flow; finalSourceFlowUnit = unit;
        finalSinkFlow = sink.flow; finalSinkFlowUnit = sink.unit;
    } else { 
        qHot_kW = inputs.sink.load;
        W_kW = qHot_kW / copActual;
        qCold_kW = qHot_kW - W_kW;
        const { flow: sFlow, unit: sUnit } = calculateFlowFromLoad(source, qCold_kW, true);
        finalSourceFlow = sFlow; finalSourceFlowUnit = sUnit;
        const { flow: dFlow, unit: dUnit } = calculateFlowFromLoad(sink, qHot_kW, false);
        finalSinkFlow = dFlow; finalSinkFlowUnit = dUnit;
    }
    
    // V5.7.0: {...source} 和 {...sink} 会自动包含 sink.rhOut
    finalSource = calculateLoad({...source, flow: finalSourceFlow, unit: finalSourceFlowUnit}, true, true);
    finalSink = calculateLoad({...sink, flow: finalSinkFlow, unit: finalSinkFlowUnit}, true, false);
    
    // V5.5.0: 附加空气参数计算 (干燥/加湿)
    if (sink.type === 'air') {
        try {
            const W_in_sink = getHumidityRatio(sink.pressure, sink.tempIn, sink.rh);
            const W_out_sat_sink = getHumidityRatio(sink.pressure, sink.tempOut, 100);
             
            // --- V5.7.0 (Humidification Mod) START ---
             // 修正：finalSink.mass_dry_air_kg_s 是 V5.7.0 中 calculateLoad 返回的新属性
             if (isNaN(finalSink.mass_dry_air_kg_s) || finalSink.mass_dry_air_kg_s <= 0) {
               throw new Error("无法计算干空气质量流量 (mass_dry_air_kg_s invalid)。")
            }
            const mass_dry_air_kg_s_sink = finalSink.mass_dry_air_kg_s;
            // --- V5.7.0 END ---
            
            maxHumidPot_kg_h = mass_dry_air_kg_s_sink * (W_out_sat_sink - W_in_sink) * 3600;
            maxHumidPot_kg_h = Math.max(0, maxHumidPot_kg_h); 
            
            const P_sat_out_sink = getSatVaporPressure(sink.tempOut); // Pa
            const f_out_sink = getEnhancementFactor(sink.tempOut, sink.pressure);
            const P_sat_real_out_sink = P_sat_out_sink * f_out_sink;
            
            const P_vapor_in_sink = getVaporPressure(sink.pressure, W_in_sink); // Pa
            
            if (P_sat_real_out_sink > 0) {
                 rhOut_noHumid = (P_vapor_in_sink / P_sat_real_out_sink) * 100;
                 rhOut_noHumid = Math.max(0, Math.min(100, rhOut_noHumid)); 
            } else { rhOut_noHumid = 0; }
            
            // V5.5.0: 使用高精度汽化潜热
            const h_latent_at_T_out = getVaporEnthalpy_HighAccuracy(sink.tempOut) - (CP_WATER * sink.tempOut); // 粗略估算
            
            if (h_latent_at_T_out > 0) {
                energyEvapCap_kg_h = qHot_kW / h_latent_at_T_out * 3600;
                energyEvapCap_kg_h = Math.max(0, energyEvapCap_kg_h);
            } else { energyEvapCap_kg_h = 0; }
            
            const actualWaterAdded_kg_h = Math.min(maxHumidPot_kg_h, energyEvapCap_kg_h);
            const actualWaterAdded_kg_s = actualWaterAdded_kg_h / 3600;
             const W_out_final_humid = (mass_dry_air_kg_s_sink > 0) 
                ? W_in_sink + (actualWaterAdded_kg_s / mass_dry_air_kg_s_sink)
                : W_in_sink; 
            const P_vapor_out_final_humid = getVaporPressure(sink.pressure, W_out_final_humid);
            
            if (P_sat_real_out_sink > 0) {
                rhOut_afterHumid = (P_vapor_out_final_humid / P_sat_real_out_sink) * 100;
                rhOut_afterHumid = Math.max(0, Math.min(100, rhOut_afterHumid));
            } else { rhOut_afterHumid = 0; }

            // --- V5.7.0 (Humidification Mod) START ---
            // 如果用户指定了 rhOut，rhOut_noHumid 字段应显示实际的目标 RH (如果提供了)
            // 否则显示 纯加热 后的 RH
            if (sink.rhOut !== null && typeof sink.rhOut !== 'undefined') {
                rhOut_noHumid = sink.rhOut; // V5.7.0: 重用此字段
                // (注意：这会使 "加热后RH(无加湿)" 的标签在语义上不完全准确，但这是重用字段的最快方法)
            }
            // --- V5.7.0 END ---

        } catch (airCalcError) {
            console.error("Error calculating additional air sink parameters:", airCalcError);
            maxHumidPot_kg_h = null; rhOut_noHumid = null; energyEvapCap_kg_h = null; rhOut_afterHumid = null;
        }
    }
    
    return {
        feasibility: true, message: "初步匹配计算完成。",
        warnings: inputs.warnings || [], 
        source: { type: source.type, qSensible: finalSource.qSensible, qLatent: finalSource.qLatent, water_kg_h: finalSource.water_kg_h },
        sink: { type: sink.type, steamTemp: sink.steamTemp, qSensible: finalSink.qSensible, qLatent: finalSink.qLatent, water_kg_h: finalSink.water_kg_h, maxHumidPot_kg_h: maxHumidPot_kg_h, rhOut_noHumid: rhOut_noHumid, energyEvapCap_kg_h: energyEvapCap_kg_h, rhOut_afterHumid: rhOut_afterHumid },
        qCold_kW, qHot_kW, W_kW, copActual, copCarnotMax, etaActual,
        flow: { sourceFlow: finalSourceFlow, sourceUnit: finalSourceFlowUnit, sinkFlow: finalSinkFlow, sinkUnit: finalSinkFlowUnit }
    };
}


// --- NEW V5.3.0: Report Generation ---
function generatePrintReport() {
    const container = document.getElementById('printReportContainer');
    if (!container || !currentInputs || !currentResult) {
        throw new Error("Report container or data not found.");
    }

    const i = currentInputs;
    const r = currentResult;
    const p = {
        name: document.getElementById('projectName').value || "未命名项目",
        desc: document.getElementById('projectDesc').value || "无"
    };
    
    const num = (n, dec = 2) => (n === null || typeof n === 'undefined' || isNaN(n)) ? '---' : n.toFixed(dec);
    const kw = (n) => `${num(n, 2)} kW`;
    const kg_h = (n) => `${num(n, 3)} kg/h`;
    const percent = (n) => `${num(n, 1)} %`;
    
    const getDictText = (dict, key) => dict[key] || key;
    
    const sourceMedia = getDictText({ 'water': '水', 'air': '空气' }, i.source.type);
    const sinkMedia = getDictText({ 'water': '水', 'air': '空气', 'steam': '蒸汽' }, i.sink.type);
    
    const calcMode = getDictText({ 'source': '已知热源 (算热汇)', 'sink': '已知热汇 (算热源)' }, i.mode);
    const inputType = getDictText({ 'flow': '按流量计算', 'load': '按负荷计算' }, i.inputType);
    
    let etaDesc = "---";
    if (i.eta.type === 'custom_eta') {
        etaDesc = `自定义 η (${num(i.eta.customEta, 2)})`;
    } else if (i.eta.type === 'custom_cop') {
        etaDesc = `自定义 COP (${num(i.eta.customCop, 1)})`;
    } else {
        etaDesc = `η = ${i.eta.type} (典型水平)`; // Assumes value is key
    }
    
    const feasibilityClass = r.feasibility ? 'res-feasibility-ok' : 'res-feasibility-fail';
    
    // --- V5.7.0 (Humidification Mod) START ---
    // 检查是否提供了 rhOut
    const sinkAirRHOut_HTML = (i.sink.type === 'air' && i.sink.rhOut !== null && typeof i.sink.rhOut !== 'undefined') 
        ? `<div><dt>热汇·目标RH：</dt><dd>${percent(i.sink.rhOut)}</dd></div>` 
        : '';
    // --- V5.7.0 END ---

    let html = `
        <h1>工业热泵匹配计算报告</h1>
    
        <div class="report-section report-section-single">
            <h2>1. 项目信息</h2>
            <dl>
                <dt>项目名称：</dt><dd>${p.name}</dd>
                <dt>项目描述：</dt><dd>${p.desc}</dd>
            </dl>
        </div>

        <div class="report-section report-section-single">
            <h2>2. 计算结果总览</h2>
            <dl>
                <dt>匹配可行性：</dt><dd class="${feasibilityClass}">${r.feasibility ? '可行' : '不可行'}</dd>
                <dt>热泵制冷量 (Q_cold)：</dt><dd>${kw(r.qCold_kW)}</dd>
                <dt>热泵制热量 (Q_hot)：</dt><dd class="res-qhot">${kw(r.qHot_kW)}</dd>
                <dt>所需压缩机功 (W)：</dt><dd>${kw(r.W_kW)}</dd>
                <dt>估算实际 COP_hot：</dt><dd class="res-cop">${num(r.copActual, 2)}</dd>
                <dt>热力完善度 (η)：</dt><dd>${percent(r.etaActual * 100)}</dd>
            </dl>
        </div>
    
        <div class="report-section">
            <h2>3. 核心输入参数</h2>
            <div class="report-grid">
                <div class="report-subsection">
                    <h3>热源 (Source)</h3>
                    <dl>
                        <div><dt>介质类型：</dt><dd>${sourceMedia}</dd></div>
                        <div><dt>进口温度：</dt><dd>${num(i.source.tempIn, 1)} °C</dd></div>
                        <div><dt>出口温度：</dt><dd>${num(i.source.tempOut, 1)} °C</dd></div>
                        ${i.source.type === 'air' ? `
                            <div><dt>空气压力：</dt><dd>${num(i.source.pressure, 3)} bara</dd></div>
                            <div><dt>相对湿度：</dt><dd>${num(i.source.rh, 1)} %</dd></div>
                        ` : ''}
                    </dl>
                </div>
                <div class="report-subsection">
                    <h3>热汇 (Sink)</h3>
                    <dl>
                        <div><dt>介质类型：</dt><dd>${sinkMedia}</dd></div>
                        ${i.sink.type === 'steam' ? `
                            <div><dt>饱和蒸汽温度：</dt><dd>${num(i.sink.steamTemp, 1)} °C</dd></div>
                            <div><dt>补水温度：</dt><dd>${num(i.sink.makeupTemp, 1)} °C</dd></div>
                        ` : `
                            <div><dt>进口温度：</dt><dd>${num(i.sink.tempIn, 1)} °C</dd></div>
                            <div><dt>目标温度：</dt><dd>${num(i.sink.tempOut, 1)} °C</dd></div>
                        `}
                        ${i.sink.type === 'air' ? `
                            <div><dt>空气压力：</dt><dd>${num(i.sink.pressure, 3)} bara</dd></div>
                            <div><dt>进口RH：</dt><dd>${num(i.sink.rh, 1)} %</dd></div>
                            ${sinkAirRHOut_HTML} 
                        ` : ''}
                    </dl>
                </div>
                <div class="report-subsection">
                    <h3>计算基准</h3>
                    <dl>
                        <div><dt>计算模式：</dt><dd>${calcMode}</dd></div>
                        <div><dt>计算基准：</dt><dd>${inputType}</dd></div>
                        ${i.mode === 'source' && i.inputType === 'flow' ? `
                            <div><dt>热源·可用流量：</dt><dd>${num(i.source.flow)} ${i.source.unit}</dd></div>
                        ` : ''}
                        ${i.mode === 'source' && i.inputType === 'load' ? `
                            <div><dt>热源·可用负荷：</dt><dd>${kw(i.source.load)}</dd></div>
                        ` : ''}
                        ${i.mode === 'sink' && i.inputType === 'flow' ? `
                            <div><dt>热汇·需求流量：</dt><dd>${num(i.sink.flow)} ${i.sink.unit}</dd></div>
                        ` : ''}
                        ${i.mode === 'sink' && i.inputType === 'load' ? `
                            <div><dt>热汇·需求负荷：</dt><dd>${kw(i.sink.load)}</dd></div>
                        ` : ''}
                    </dl>
                </div>
                <div class="report-subsection">
                    <h3>性能估算</h3>
                    <dl>
                        <div><dt>估算方式：</dt><dd>${etaDesc}</dd></div>
                        <div><dt>卡诺(极限) COP_hot：</dt><dd>${num(r.copCarnotMax, 2)}</dd></div>
                    </dl>
                </div>
            </div>
        </div>
        
        <div class="report-section">
            <h2>4. 详细输出参数</h2>
            <div class="report-grid">
                <div class="report-subsection">
                    <h3>流量计算</h3>
                    <dl>
                        <div><dt>热源·计算流量：</dt><dd>${num(r.flow.sourceFlow)} ${r.flow.sourceUnit}</dd></div>
                        <div><dt>热汇·计算流量：</dt><dd>${num(r.flow.sinkFlow)} ${r.flow.sinkUnit}</dd></div>
                    </dl>
                </div>
                <div class="report-subsection">
                    <h3>热源特性 (空气)</h3>
                    <dl>
                        ${i.source.type === 'air' ? `
                            <div><dt>显热负荷 (Q_sens)：</dt><dd>${kw(r.source.qSensible)}</dd></div>
                            <div><dt>潜热负荷 (Q_lat)：</dt><dd>${kw(r.source.qLatent)}</dd></div>
                            <div><dt>析出水量：</dt><dd>${kg_h(r.source.water_kg_h)}</dd>
                        ` : `
                            <div><dt> (热源介质为水)</dt><dd>---</dd></div>
                        `}
                    </dl>
                </div>
                <div class="report-subsection">
                    <h3>热汇特性 (空气/蒸汽)</h3>
                    <dl>
                        ${i.sink.type === 'steam' ? `
                            <div><dt>饱和压力：</dt><dd>${num(getSatVaporPressure(i.sink.steamTemp) / 100000, 3)} bara</dd></div>
                            <div><dt>显热负荷 (Q_sens)：</dt><dd>${kw(r.sink.qSensible)}</dd></div>
                            <div><dt>潜热负荷 (Q_lat)：</dt><dd>${kw(r.sink.qLatent)}</dd></div>
                        ` : (i.sink.type === 'air' ? `
                            <div><dt>显热负荷 (Q_sens)：</dt><dd>${kw(r.sink.qSensible)}</dd></div>
                            <div><dt>潜热负荷 (Q_lat)：</dt><dd>${kw(r.sink.qLatent)}</dd></div>
                            <div><dt>加湿/除湿水量：</dt><dd>${kg_h(r.sink.water_kg_h)}</dd></div>
                            <div><dt>空气吸湿潜力：</dt><dd>${kg_h(r.sink.maxHumidPot_kg_h)}</dd></div>
                            <div><dt>加热后RH(或目标RH)：</dt><dd>${percent(r.sink.rhOut_noHumid)}</dd></div>
                            <div><dt>能量约束蒸发能力：</dt><dd>${kg_h(r.sink.energyEvapCap_kg_h)}</dd></div>
                            <div><dt>最大加湿后RH：</dt><dd>${percent(r.sink.rhOut_afterHumid)}</dd></div>
                        ` : `
                            <div><dt> (热汇介质为水)</dt><dd>---</dd></div>
                        `)}
                    </dl>
                </div>
            </div>
        </div>
    `;
    
    container.innerHTML = html;
}

// --- NEW V5.1.0: 暂存和对比功能函数 ---

function saveCurrentCase() {
    if (!currentInputs || !currentResult) {
        showToast("没有可暂存的有效计算结果。", 'warning');
        return;
    }
    const caseData = {
        inputs: JSON.parse(JSON.stringify(currentInputs)),
        result: JSON.parse(JSON.stringify(currentResult))
    };
    comparisonCases.push(caseData);
    renderComparisonTable();
    resultMessage.classList.remove('hidden', 'bg-red-100', 'text-red-700', 'bg-green-100', 'text-green-700', 'bg-yellow-100', 'text-yellow-700', 'opacity-0');
    resultMessage.classList.add('bg-blue-100', 'text-blue-700', 'opacity-100');
    resultMessage.innerHTML = `<span class="font-bold">方案 ${comparisonCases.length} 已暂存。</span> 可在页面底部查看对比。`;
    showToast(`方案 ${comparisonCases.length} 已暂存`, 'success');
}

// (V5.1.2 修正版)
function renderComparisonTable() {
    if (comparisonCases.length === 0) {
        comparisonSection.classList.add('hidden');
        return;
    }
    comparisonSection.classList.remove('hidden');
    const num = (n, dec = 2) => (n === null || typeof n === 'undefined' || isNaN(n)) ? '---' : n.toFixed(dec);
    let tableHtml = `<table class="comparison-table">`;
    tableHtml += `
        <thead>
            <tr>
                <th>方案</th>
                <th>基准</th>
                <th>热源</th>
                <th>热源 T_in (°C)</th>
                <th>热源 T_out (°C)</th>
                <th>热汇</th>
                <th>热汇 T_in (°C)</th>
                <th>热汇 T_out (°C)</th>
                <th>Q_cold (kW)</th>
                <th>Q_hot (kW)</th>
                <th>W (kW)</th>
                <th>COP_hot</th>
                <th>η (%)</th>
            </tr>
        </thead>
    `;
    tableHtml += `<tbody>`;
    comparisonCases.forEach((caseData, index) => {
        const i = caseData.inputs;
        const r = caseData.result;
        const mode = i.mode === 'source' ? '已知热源' : '已知热汇';
        const type = i.inputType === 'flow' ? '按流量' : '按负荷';
        const sink_T_in = i.sink.type === 'steam' ? i.sink.makeupTemp : i.sink.tempIn;
        const sink_T_out = i.sink.type === 'steam' ? i.sink.steamTemp : i.sink.tempOut;
        tableHtml += `
            <tr>
                <td>${index + 1}</td>
                <td>${mode} /<br>${type}</td>
                <td>${i.source.type === 'air' ? '空气' : '水'}</td>
                <td>${num(i.source.tempIn, 1)}</td>
                <td>${num(i.source.tempOut, 1)}</td>
                <td>${i.sink.type === 'air' ? '空气' : (i.sink.type === 'steam' ? '蒸汽' : '水')}</td>
                <td>${num(sink_T_in, 1)}</td>
                <td>${num(sink_T_out, 1)}</td>
                <td class="param-output">${num(r.qCold_kW)}</td>
                <td class="param-output param-qhot">${num(r.qHot_kW)}</td>
                <td class="param-output">${num(r.W_kW)}</td>
                <td class="param-output param-cop">${num(r.copActual)}</td>
                <td class="param-output">${num(r.etaActual * 100, 1)}</td>
            </tr>
        `;
    });
    tableHtml += `</tbody></table>`;
    comparisonTableContainer.innerHTML = tableHtml;
}

// (V5.1.3 修正版)
function clearComparison() {
    const clearAction = () => {
        const count = comparisonCases.length;
        comparisonCases = [];
        comparisonTableContainer.innerHTML = '';
        comparisonSection.classList.add('hidden');
        if (resultMessage) {
            const isSuccessOrInfo = resultMessage.classList.contains('bg-green-100') || resultMessage.classList.contains('bg-blue-100');
            if (isSuccessOrInfo) {
                resultMessage.classList.add('hidden');
                resultMessage.innerHTML = ''; 
            }
        }
        if (count > 0) {
            showToast('所有方案已清空', 'info');
        }
    };

    if (comparisonCases.length > 0) {
        if (confirm(`确定要清空所有 ${comparisonCases.length} 个已暂存的方案吗？`)) {
            clearAction();
        }
    } else {
        clearAction();
    }
}

function printComparison() {
    if (comparisonCases.length === 0) {
        alert("没有可打印的对比方案。");
        return;
    }
    document.body.classList.add('printing-comparison');
    window.print();
    setTimeout(() => {
        document.body.classList.remove('printing-comparison');
    }, 500); 
}

// --- V5.8.0: UI/UX 升级功能 ---

// Toast通知功能
function showToast(message, type = 'info', duration = 3000) {
    const container = document.getElementById('toastContainer');
    if (!container) return;
    
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    
    const icons = {
        success: '<svg class="w-6 h-6 text-green-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M9 12l2 2 4-4m6 2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>',
        error: '<svg class="w-6 h-6 text-red-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M10 14l2-2m0 0l2-2m-2 2l-2-2m2 2l2 2m7-2a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>',
        warning: '<svg class="w-6 h-6 text-yellow-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z"></path></svg>',
        info: '<svg class="w-6 h-6 text-blue-600" fill="none" stroke="currentColor" viewBox="0 0 24 24"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M13 16h-1v-4h-1m1-4h.01M21 12a9 9 0 11-18 0 9 9 0 0118 0z"></path></svg>'
    };
    
    toast.innerHTML = `
        ${icons[type] || icons.info}
        <span class="flex-1 text-sm text-gray-700">${message}</span>
        <button onclick="this.parentElement.remove()" class="text-gray-400 hover:text-gray-600">
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M6 18L18 6M6 6l12 12"></path>
            </svg>
        </button>
    `;
    
    container.appendChild(toast);
    
    setTimeout(() => {
        toast.classList.add('fade-out');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

// 实时表单验证
function validateField(field) {
    const value = field.value.trim();
    const fieldName = field.name;
    const errorDiv = field.parentElement.nextElementSibling;
    
    // 清除之前的错误状态
    field.classList.remove('error', 'success');
    if (errorDiv && errorDiv.classList.contains('error-message')) {
        errorDiv.classList.add('hidden');
        errorDiv.textContent = '';
    }
    
    // 跳过空值（除非是必填字段）
    if (!value && !field.required) {
        return true;
    }
    
    let isValid = true;
    let errorMsg = '';
    
    // 温度字段验证
    if (fieldName.includes('Temp')) {
        const num = parseFloat(value);
        if (isNaN(num)) {
            isValid = false;
            errorMsg = '请输入有效数字';
        } else if (num < -100 || num > 300) {
            isValid = false;
            errorMsg = '温度范围：-100°C ~ 300°C';
        }
    }
    
    // 相对湿度验证
    if (fieldName.includes('RH')) {
        const num = parseFloat(value);
        if (isNaN(num)) {
            isValid = false;
            errorMsg = '请输入有效数字';
        } else if (num < 0 || num > 100) {
            isValid = false;
            errorMsg = '相对湿度范围：0% ~ 100%';
        }
    }
    
    // 压力验证
    if (fieldName.includes('Pressure')) {
        const num = parseFloat(value);
        if (isNaN(num)) {
            isValid = false;
            errorMsg = '请输入有效数字';
        } else if (num < 0.1 || num > 20) {
            isValid = false;
            errorMsg = '压力范围：0.1 ~ 20 bara';
        }
    }
    
    // 流量/负荷验证
    if (fieldName.includes('Flow') || fieldName.includes('Load')) {
        const num = parseFloat(value);
        if (isNaN(num) || num <= 0) {
            isValid = false;
            errorMsg = '请输入大于0的有效数字';
        }
    }
    
    // 更新UI状态
    if (isValid && value) {
        field.classList.add('success');
    } else if (!isValid) {
        field.classList.add('error');
        if (errorDiv && errorDiv.classList.contains('error-message')) {
            errorDiv.textContent = errorMsg;
            errorDiv.classList.remove('hidden');
        }
    }
    
    return isValid;
}

// 添加实时验证监听器（使用防抖优化）
function setupFieldValidation() {
    const inputs = form.querySelectorAll('input[type="number"], input[type="text"], textarea');
    const validationTimers = new Map();
    
    inputs.forEach(input => {
        // blur事件立即验证
        input.addEventListener('blur', () => validateField(input));
        
        // input事件使用防抖（延迟验证）
        input.addEventListener('input', () => {
            // 清除错误状态当用户开始输入时
            if (input.classList.contains('error')) {
                input.classList.remove('error');
                const errorDiv = input.parentElement.nextElementSibling;
                if (errorDiv && errorDiv.classList.contains('error-message')) {
                    errorDiv.classList.add('hidden');
                }
            }
            
            // 防抖验证（500ms后验证）
            if (validationTimers.has(input)) {
                clearTimeout(validationTimers.get(input));
            }
            
            const timer = setTimeout(() => {
                if (document.activeElement !== input) {
                    validateField(input);
                }
            }, 500);
            
            validationTimers.set(input, timer);
        });
    });
}

// 键盘快捷键
function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        // Enter键 - 计算
        if (e.key === 'Enter' && !e.target.matches('textarea, input[type="text"]')) {
            e.preventDefault();
            if (!calcButton.disabled) {
                calcButton.click();
            }
        }
        
        // Esc键 - 重置
        if (e.key === 'Escape') {
            resetButton.click();
        }
    });
}

// 示例数据填充
function fillExampleData() {
    document.getElementById('projectName').value = '示例项目';
    document.getElementById('projectDesc').value = '这是一个示例项目，用于演示计算器的功能';
    document.getElementById('mode_source').checked = true;
    document.getElementById('type_flow').checked = true;
    document.getElementById('sourceType').value = 'water';
    document.getElementById('sourceTempIn').value = '30';
    document.getElementById('sourceTempOut').value = '25';
    document.getElementById('sourceFlow').value = '100';
    document.getElementById('sourceUnit').value = 't/h';
    document.getElementById('sinkType').value = 'water';
    document.getElementById('sinkTempIn').value = '50';
    document.getElementById('sinkTempOut').value = '70';
    document.getElementById('etaType').value = '0.55';
    
    updateDynamicUI();
    showToast('示例数据已填充', 'success');
}

// 加载状态管理
function setLoadingState(isLoading) {
    const spinner = document.getElementById('calcLoadingSpinner');
    const buttonText = calcButton.querySelector('span');
    
    if (isLoading) {
        calcButton.disabled = true;
        spinner.classList.remove('hidden');
        buttonText.textContent = '计算中...';
    } else {
        calcButton.disabled = false;
        spinner.classList.add('hidden');
        buttonText.textContent = '开始计算';
    }
}

// 结果可视化（简单图表）- 使用requestAnimationFrame优化
function renderResultCharts(result) {
    const chartsDiv = document.getElementById('resultCharts');
    if (!chartsDiv || !result.feasibility) return;
    
    chartsDiv.classList.remove('hidden');
    
    // 使用requestAnimationFrame延迟渲染，避免阻塞主线程
    requestAnimationFrame(() => {
        // 能量分布饼图（使用Canvas简单绘制）
        const energyCanvas = document.getElementById('energyChartCanvas');
        if (energyCanvas) {
            const ctx = energyCanvas.getContext('2d');
            const width = energyCanvas.width = energyCanvas.offsetWidth || 300;
            const height = energyCanvas.height = energyCanvas.offsetHeight || 200;
            const centerX = width / 2;
            const centerY = height / 2;
            const radius = Math.min(width, height) / 2 - 10;
            
            ctx.clearRect(0, 0, width, height);
            
            const qHot = result.qHot_kW || 0;
            const w = result.W_kW || 0;
            const total = qHot + w;
            
            if (total > 0) {
                const hotAngle = (qHot / total) * 2 * Math.PI;
                
                // 绘制制热量（红色）
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.arc(centerX, centerY, radius, 0, hotAngle);
                ctx.closePath();
                ctx.fillStyle = '#dc2626';
                ctx.fill();
                
                // 绘制功耗（黄色）
                ctx.beginPath();
                ctx.moveTo(centerX, centerY);
                ctx.arc(centerX, centerY, radius, hotAngle, 2 * Math.PI);
                ctx.closePath();
                ctx.fillStyle = '#f59e0b';
                ctx.fill();
                
                // 添加标签
                ctx.fillStyle = '#fff';
                ctx.font = '12px sans-serif';
                ctx.textAlign = 'center';
                ctx.fillText(`Q_hot: ${qHot.toFixed(1)}kW`, centerX, centerY - 10);
                ctx.fillText(`W: ${w.toFixed(1)}kW`, centerX, centerY + 10);
            }
        }
        
        // 温度变化条形图
        const tempCanvas = document.getElementById('tempChartCanvas');
        if (tempCanvas && currentInputs) {
            const ctx = tempCanvas.getContext('2d');
            const width = tempCanvas.width = tempCanvas.offsetWidth || 300;
            const height = tempCanvas.height = tempCanvas.offsetHeight || 200;
            
            ctx.clearRect(0, 0, width, height);
            
            const sourceIn = currentInputs.source.tempIn || 0;
            const sourceOut = currentInputs.source.tempOut || 0;
            const sinkIn = currentInputs.sink.tempIn || 0;
            const sinkOut = currentInputs.sink.tempOut || 0;
            const maxTemp = Math.max(sourceIn, sourceOut, sinkIn, sinkOut, 100);
            const barWidth = width / 4 - 10;
            const maxHeight = height - 40;
            
            // 热源进口
            const h1 = (sourceIn / maxTemp) * maxHeight;
            ctx.fillStyle = '#2563eb';
            ctx.fillRect(10, height - h1 - 20, barWidth, h1);
            ctx.fillStyle = '#000';
            ctx.font = '10px sans-serif';
            ctx.fillText('源入', 10 + barWidth/2 - 10, height - 5);
            ctx.fillText(sourceIn.toFixed(1) + '°C', 10 + barWidth/2 - 15, height - h1 - 25);
            
            // 热源出口
            const h2 = (sourceOut / maxTemp) * maxHeight;
            ctx.fillStyle = '#3b82f6';
            ctx.fillRect(20 + barWidth, height - h2 - 20, barWidth, h2);
            ctx.fillStyle = '#000';
            ctx.fillText('源出', 20 + barWidth + barWidth/2 - 10, height - 5);
            ctx.fillText(sourceOut.toFixed(1) + '°C', 20 + barWidth + barWidth/2 - 15, height - h2 - 25);
            
            // 热汇进口
            const h3 = (sinkIn / maxTemp) * maxHeight;
            ctx.fillStyle = '#dc2626';
            ctx.fillRect(30 + barWidth * 2, height - h3 - 20, barWidth, h3);
            ctx.fillStyle = '#000';
            ctx.fillText('汇入', 30 + barWidth * 2 + barWidth/2 - 10, height - 5);
            ctx.fillText(sinkIn.toFixed(1) + '°C', 30 + barWidth * 2 + barWidth/2 - 15, height - h3 - 25);
            
            // 热汇出口
            const h4 = (sinkOut / maxTemp) * maxHeight;
            ctx.fillStyle = '#ef4444';
            ctx.fillRect(40 + barWidth * 3, height - h4 - 20, barWidth, h4);
            ctx.fillStyle = '#000';
            ctx.fillText('汇出', 40 + barWidth * 3 + barWidth/2 - 10, height - 5);
            ctx.fillText(sinkOut.toFixed(1) + '°C', 40 + barWidth * 3 + barWidth/2 - 15, height - h4 - 25);
        }
    });
}

// 更新进度条
function updateProgressBars(result) {
    if (!result.feasibility) return;
    
    // COP进度条
    const copBar = document.querySelector('#copProgressBar > div');
    const copBarContainer = document.getElementById('copProgressBar');
    if (copBar && result.copActual && result.copCarnotMax) {
        const copPercent = Math.min((result.copActual / result.copCarnotMax) * 100, 100);
        copBar.style.width = copPercent + '%';
        copBarContainer.classList.remove('hidden');
    }
    
    // η进度条
    const etaBar = document.querySelector('#etaProgressBar > div');
    const etaBarContainer = document.getElementById('etaProgressBar');
    if (etaBar && result.etaActual) {
        const etaPercent = result.etaActual * 100;
        etaBar.style.width = etaPercent + '%';
        etaBarContainer.classList.remove('hidden');
    }
}

// 修改displayResults函数以包含新功能
const originalDisplayResults = displayResults;
displayResults = function(data) {
    originalDisplayResults(data);
    
    if (data.feasibility) {
        // 显示Toast通知
        showToast('计算完成！', 'success');
        
        // 渲染图表
        setTimeout(() => {
            renderResultCharts(data);
            updateProgressBars(data);
        }, 100);
        
        // 滚动到结果区域
        resultsDiv.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
    }
};

// 修改performCalculation函数以添加加载状态
const originalPerformCalculation = performCalculation;
performCalculation = function() {
    setLoadingState(true);
    
    setTimeout(() => {
        try {
            originalPerformCalculation();
        } catch (e) {
            showToast('计算失败：' + e.message, 'error');
        } finally {
            setLoadingState(false);
        }
    }, 100);
};

// 绑定示例数据按钮
const fillExampleButton = document.getElementById('fillExampleButton');
if (fillExampleButton) {
    fillExampleButton.addEventListener('click', fillExampleData);
}

// --- Initialization ---
updateDynamicUI();
setupFieldValidation();
setupKeyboardShortcuts();

// 更新版本号
console.log("工业热泵匹配计算器 V5.8.0 (UI/UX升级版) 初始化完成。");