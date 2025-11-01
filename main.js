// --- 全局常量 ---
const CP_WATER = 4.18; // kJ/kg·K
const R_AIR = 287.058; // J/kg·K
const CP_AIR_DRY = 1.005; // kJ/kg·K
const CP_WATER_VAPOR = 1.86; // kJ/kg·K
const H_VAPOR_WATER = 2501; // kJ/kg, Latent heat of vaporization at 0°C (approx)

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
function getSatVaporPressure(T_celsius) { if (T_celsius >= 0) { return 611.21 * Math.exp((18.678 - T_celsius / 234.5) * (T_celsius / (257.14 + T_celsius))); } else { return 611.15 * Math.exp((23.036 - T_celsius / 333.7) * (T_celsius / (279.82 + T_celsius))); } }
function getAirDensity(P_bara, T_celsius, RH_percent) { const P_abs = P_bara * 100000; const T_kelvin = T_celsius + 273.15; const P_sat = getSatVaporPressure(T_celsius); let P_vapor = (RH_percent / 100) * P_sat; if (P_vapor >= P_abs) { P_vapor = P_abs * 0.999; } let P_dry_air = P_abs - P_vapor; if (P_dry_air < 0) { P_dry_air = 0; } const rho_dry_air = P_dry_air / (R_AIR * T_kelvin); const rho_vapor = P_vapor / (461.5 * T_kelvin); return rho_dry_air + rho_vapor; }
function getHumidityRatio(P_bara, T_celsius, RH_percent) { const P_abs = P_bara * 100000; const P_sat = getSatVaporPressure(T_celsius); let P_vapor = (RH_percent / 100) * P_sat; if (P_vapor >= P_abs) { P_vapor = P_abs * 0.999; } const P_dry_air = P_abs - P_vapor; if (P_dry_air <= 0) { return 10; } return 0.622 * (P_vapor / P_dry_air); }
function getAirEnthalpy(T_celsius, W_humidityRatio) { if (isNaN(W_humidityRatio) || W_humidityRatio < 0) W_humidityRatio = 0; return (CP_AIR_DRY * T_celsius) + (W_humidityRatio * (H_VAPOR_WATER + CP_WATER_VAPOR * T_celsius)); }
function getDewPoint(T_celsius, RH_percent) { RH_percent = Math.max(0.1, Math.min(100, RH_percent)); const P_sat = getSatVaporPressure(T_celsius); const P_vapor = (RH_percent / 100) * P_sat; if (P_vapor < 1) return -100; const b = 17.62; const c = 243.12; const alpha = Math.log(P_vapor / 611.2); return (c * alpha) / (b - alpha); }
function getSteamLatentHeat(T_celsius) { if (T_celsius <= 0) return 2501; if (T_celsius >= 374) return 0; return Math.max(0, 2501.6 - 2.369*T_celsius + 0.0018*T_celsius*T_celsius - 0.000004*T_celsius*T_celsius*T_celsius); }
function getVaporPressure(P_bara, W_humidityRatio) { const P_total = P_bara * 100000; W_humidityRatio = Math.max(0, W_humidityRatio); return (W_humidityRatio * P_total) / (0.622 + W_humidityRatio); }


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

// (V5.1.1 修正版)
function showMessage(message, isError = true) {
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
        resultMessage.innerHTML = `<span class="font-bold">计算成功：</span> ${message}`;
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

function displayResults(data) {
    showMessage(data.message, !data.feasibility);
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
        document.getElementById('resSinkParam3Value').textContent = kg_h(Math.abs(data.sink.water_kg_h));
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

// (V5.1.1 修正版)
form.addEventListener('input', () => {
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

function parseAndValidateInputs(p) {
    const errors = [];
    const inputs = { mode: p.calcMode, inputType: p.inputType, source: {}, sink: {}, eta: {}, minTempApproach: 3.0, steamTempApproach: 5.0 };
    const parseFloatStrict = (val, name, allowZero = false, min = -Infinity, max = Infinity) => {
        if (val === null || String(val).trim() === '') { errors.push(`${name} 不能为空。`); return NaN; }
        const num = parseFloat(val);
        if (isNaN(num) || (!allowZero && num <= 0) || num < min || num > max) { errors.push(`${name} 必须是有效数字 (范围 ${min} ~ ${max})。`); return NaN; }
        return num;
    };
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
        // *** MODIFIED VALIDATION LABEL ***
        inputs.source.pressure = parseFloatStrict(p.sourceAirPressure, "热源·空气压力", true, 0.1, 20);
        inputs.source.rh = parseFloatStrict(p.sourceAirRH, "热源·相对湿度", true, 0, 100);
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
             // *** MODIFIED VALIDATION LABEL ***
             inputs.sink.pressure = parseFloatStrict(p.sinkAirPressure, "热汇·空气压力", true, 0.1, 20);
             inputs.sink.rh = parseFloatStrict(p.sinkAirRH, "热汇·相对湿度", true, 0, 100);
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
    if (errors.length > 0) throw new Error(errors.join('<br>'));
    return inputs;
}

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
        const W_in = getHumidityRatio(params.pressure, params.tempIn, params.rh);
        const h_in = getAirEnthalpy(params.tempIn, W_in);
        let W_out = W_in;
        if (isSource && params.tempOut < getDewPoint(params.tempIn, params.rh)) { W_out = getHumidityRatio(params.pressure, params.tempOut, 100); }
         else if (!isSource && params.tempOut > params.tempIn) { W_out = W_in; }
        const h_out = getAirEnthalpy(params.tempOut, W_out);
        const delta_h = isSource ? h_in - h_out : h_out - h_in;
        if(delta_h <= 0) throw new Error(isSource ? "热源空气焓差必须大于0。" : "热汇空气焓差必须大于0。");
        const mass_kg_s = q_kW / delta_h;
        const density = getAirDensity(params.pressure, params.tempIn, params.rh);
        const flow_m3_h = (mass_kg_s * 3600) / density;
        return { flow: flow_m3_h, unit: "m³/h" };
    }
    else if (params.type === 'steam' && !isSource) { 
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

function calculateLoad(params, hasKnownFlow, isSource) {
    let result = { type: params.type, mass_kg_s: NaN, q_kW: NaN, qSensible: NaN, qLatent: NaN, water_kg_h: 0 };
    const flow = hasKnownFlow ? params.flow : NaN;
    const unit = params.unit;
    if (params.type === 'water') {
        const delta_t = isSource ? params.tempIn - params.tempOut : params.tempOut - params.tempIn;
        if (hasKnownFlow) {
            if (unit === 't/h') { result.mass_kg_s = flow * 1000 / 3600; } 
            else if (unit === 'L/min') { result.mass_kg_s = flow / 60; } 
            else if (unit === 'm3/h') { result.mass_kg_s = flow * 1000 / 3600; } 
            else { throw new Error(`(热源: ${isSource}) 水介质的流量单位无效: ${unit}。`); }
            result.q_kW = result.mass_kg_s * CP_WATER * delta_t;
        }
        result.qSensible = result.q_kW; result.qLatent = 0;
    } else if (params.type === 'air') {
        const W_in = getHumidityRatio(params.pressure, params.tempIn, params.rh);
        const h_in = getAirEnthalpy(params.tempIn, W_in);
        let W_out = W_in;
        if (isSource && params.tempOut < getDewPoint(params.tempIn, params.rh)) { W_out = getHumidityRatio(params.pressure, params.tempOut, 100); } 
        else if (!isSource && params.tempOut > params.tempIn) { W_out = W_in; }
        const h_out = getAirEnthalpy(params.tempOut, W_out);
        const delta_h = isSource ? h_in - h_out : h_out - h_in;
        if (hasKnownFlow) {
            const density = getAirDensity(params.pressure, params.tempIn, params.rh);
            if (unit === 'm3/h' || unit === 'm³/h') { result.mass_kg_s = (flow * density) / 3600; } 
            else if (unit === 'L/min') { const flow_m3_s = (flow / 1000) / 60; result.mass_kg_s = flow_m3_s * density; } 
            else { throw new Error(`(热源: ${isSource}) 空气介质的流量单位无效: ${unit} (应为 m³/h 或 L/min)。`); }
            result.q_kW = result.mass_kg_s * delta_h;
            const h_sensible_out_at_W_in = getAirEnthalpy(params.tempOut, W_in);
            const h_sensible_in_at_W_in = h_in;
            result.qSensible = result.mass_kg_s * Math.abs(h_sensible_out_at_W_in - h_sensible_in_at_W_in);
            result.qLatent = result.q_kW - result.qSensible;
            result.water_kg_h = result.mass_kg_s * (W_in - W_out) * 3600; 
            if (Math.abs(result.qLatent) < 1e-6) result.qLatent = 0;
            if (result.qLatent === 0) result.water_kg_h = 0;
            if (result.qLatent < 0) { 
                 console.warn(`Negative latent heat calculated (${result.qLatent} kW) for ${isSource ? 'source' : 'sink'}. Resetting to zero. Q_sensible adjusted.`);
                 result.qSensible = result.q_kW; result.qLatent = 0; result.water_kg_h = 0;
            }
        }
    } else if (params.type === 'steam' && !isSource) { 
        const h_latent = getSteamLatentHeat(params.steamTemp);
        const h_sensible = CP_WATER * (params.steamTemp - params.makeupTemp);
        const delta_h_total = h_latent + h_sensible;
        if (hasKnownFlow) {
            if (unit === 't/h') { result.mass_kg_s = flow * 1000 / 3600; } 
            else if (unit === 'L/min') { result.mass_kg_s = flow / 60; } 
            else if (unit === 'm3/h') { result.mass_kg_s = flow * 1000 / 3600; } 
            else { throw new Error(`热汇·蒸汽介质的流量单位无效: ${unit}。`); }
            result.q_kW = result.mass_kg_s * delta_h_total;
            result.qSensible = result.mass_kg_s * h_sensible;
            result.qLatent = result.mass_kg_s * h_latent;
        }
    }
    return result;
}

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
    finalSource = calculateLoad({...source, flow: finalSourceFlow, unit: finalSourceFlowUnit}, true, true);
    finalSink = calculateLoad({...sink, flow: finalSinkFlow, unit: finalSinkFlowUnit}, true, false);
    if (sink.type === 'air') {
        try {
            const W_in_sink = getHumidityRatio(sink.pressure, sink.tempIn, sink.rh);
            const W_out_sat_sink = getHumidityRatio(sink.pressure, sink.tempOut, 100);
             if (isNaN(finalSink.mass_kg_s) || finalSink.mass_kg_s <= 0 || (1 + W_in_sink) <= 0) {
               throw new Error("无法计算干空气质量流量 (mass_kg_s or W_in invalid)。")
            }
            const mass_dry_air_kg_s_sink = finalSink.mass_kg_s / (1 + W_in_sink);
            maxHumidPot_kg_h = mass_dry_air_kg_s_sink * (W_out_sat_sink - W_in_sink) * 3600;
            maxHumidPot_kg_h = Math.max(0, maxHumidPot_kg_h); 
            const P_sat_out_sink = getSatVaporPressure(sink.tempOut);
            const P_vapor_in_sink = getVaporPressure(sink.pressure, W_in_sink); 
            if (P_sat_out_sink > 0) {
                 rhOut_noHumid = (P_vapor_in_sink / P_sat_out_sink) * 100;
                 rhOut_noHumid = Math.max(0, Math.min(100, rhOut_noHumid)); 
            } else { rhOut_noHumid = 0; }
            if (H_VAPOR_WATER > 0) {
                energyEvapCap_kg_h = qHot_kW / H_VAPOR_WATER * 3600;
                energyEvapCap_kg_h = Math.max(0, energyEvapCap_kg_h);
            } else { energyEvapCap_kg_h = 0; }
            const actualWaterAdded_kg_h = Math.min(maxHumidPot_kg_h, energyEvapCap_kg_h);
            const actualWaterAdded_kg_s = actualWaterAdded_kg_h / 3600;
             const W_out_final = (mass_dry_air_kg_s_sink > 0) 
                ? W_in_sink + (actualWaterAdded_kg_s / mass_dry_air_kg_s_sink)
                : W_in_sink; 
            const P_vapor_out_final = getVaporPressure(sink.pressure, W_out_final);
            if (P_sat_out_sink > 0) {
                rhOut_afterHumid = (P_vapor_out_final / P_sat_out_sink) * 100;
                rhOut_afterHumid = Math.max(0, Math.min(100, rhOut_afterHumid));
            } else { rhOut_afterHumid = 0; }
        } catch (airCalcError) {
            console.error("Error calculating additional air sink parameters:", airCalcError);
            maxHumidPot_kg_h = null; rhOut_noHumid = null; energyEvapCap_kg_h = null; rhOut_afterHumid = null;
        }
    }
    return {
        feasibility: true, message: "初步匹配计算完成。",
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
                            <div><dt>相对湿度：</dt><dd>${num(i.sink.rh, 1)} %</dd></div>
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
                            <div><dt>析出水量：</dt><dd>${kg_h(Math.abs(r.source.water_kg_h))}</dd></div>
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
                            <div><dt>加湿/除湿水量：</dt><dd>${kg_h(Math.abs(r.sink.water_kg_h))}</dd></div>
                            <div><dt>空气吸湿潜力：</dt><dd>${kg_h(r.sink.maxHumidPot_kg_h)}</dd></div>
                            <div><dt>加热后RH(无加湿)：</dt><dd>${percent(r.sink.rhOut_noHumid)}</dd></div>
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
        alert("没有可暂存的有效计算结果。");
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

// --- Initialization ---
updateDynamicUI(); 
// 更新版本号
console.log("工业热泵匹配计算器 V5.3.0 (打印报告功能) 初始化完成。");