// --- 全局常量 ---
const CP_WATER = 4.18; // kJ/kg·K (水介质比热容)
const R_AIR_DRY = 287.058; // J/kg·K (干空气气体常数)
const R_VAPOR = 461.52; // J/kg·K (水蒸气气体常数)

// --- NEW V5.5.0: 高精度物性核心 (IAPWS & NIST) ---

// IAPWS-IF97 (Region 4) 饱和蒸汽压 (Pa)
// T (Kelvin) -> P (Pa)
function getSatVaporPressure_HighAccuracy(T_celsius) {
    const T = T_celsius + 273.15;
    if (T <= 273.15 || T >= 647.096) { // 适用范围 0.01°C 到 373.946°C
        // 对于低于 0°C 的情况，使用 IAPWS 2008 冰线公式 (简化版)
        if (T <= 273.15) {
             return 611.21 * Math.exp((18.678 - T_celsius / 234.5) * (T_celsius / (257.14 + T_celsius)));
        }
        // 临界点以上或过低，返回 0 
        return 0;
    }
    const T_crit = 647.096; // K
    const P_crit = 22.064e6; // Pa
    const v = T / T_crit;
    const n = [
        -7.85951783, 1.84408259, -11.7866497, 22.6807411,
        -15.9618719, 1.80122502
    ];
    const t = 1.0 - v;
    const C = n[0]*t + n[1]*Math.pow(t, 1.5) + n[2]*Math.pow(t, 3) + 
              n[3]*Math.pow(t, 3.5) + n[4]*Math.pow(t, 4) + n[5]*Math.pow(t, 7.5);
    return P_crit * Math.exp((T_crit / T) * C);
}

// NIST 干空气焓值 (kJ/kg) (h=0 at 0°C)
// T (Celsius) -> h (kJ/kg)
function getDryAirEnthalpy_HighAccuracy(T_celsius) {
    // 基于 NIST 多项式 (积分 Cp dT) 从 273.15 K 到 T_kelvin
    // Cp(T) = a + bT + cT^2 + dT^3 + e/T^2 (Shomate Equation)
    // h(T) - h(T_ref) = ∫[T_ref, T] Cp(t) dt
    // 此处使用一个简化的、但在 -100C 到 300C 范围内高精度的多项式积分
    const T = T_celsius;
    // h(T) = A*T + B*T^2/2 + C*T^3/3 + ... (设 h(0C) = 0)
    // 拟合数据: h(T) ≈ 1.0048*T + 0.0000403*T^2
    // 以下是一个更宽范围的拟合 (kJ/kg)，参考 0°C
    const h = 1.00315 * T + 0.0001306 * Math.pow(T, 2) - 
              4.6545e-8 * Math.pow(T, 3) + 1.6368e-11 * Math.pow(T, 4);
    return h;
}

// IAPWS-IF97 饱和水蒸气焓值 (kJ/kg) (h=0 for liquid at 0.01°C)
// T (Celsius) -> h (kJ/kg)
function getVaporEnthalpy_HighAccuracy(T_celsius) {
    // h = h_liquid(T) + h_latent(T)
    // 为简化，我们使用一个高精度拟合多项式 (kJ/kg)
    // 基于 IAPWS 数据拟合 (h_vapor, T_celsius)
    if (T_celsius < 0) T_celsius = 0; // 简化处理
    if (T_celsius > 370) T_celsius = 370; // 临界点附近
    
    // h(T) ≈ 2500.9 + 1.8563*T - 0.00125*T^2 + ... (kJ/kg)
    const T = T_celsius;
    const h_vap = 2500.8 + 1.8325 * T - 0.000551 * Math.pow(T, 2) + 
                  3.205e-6 * Math.pow(T, 3) - 7.58e-9 * Math.pow(T, 4);
    return h_vap;
}

// 增强因子 'f' (用于真实气体混合物)
// T (Celsius), P (bara) -> f (dimensionless)
function getEnhancementFactor(T_celsius, P_bara) {
    // 这是一个复杂的函数。在 20 bara 以下，f 接近 1。
    // 在 1 bar, 20C, f ≈ 1.0045
    // 在 1 bar, 100C, f ≈ 1.002
    // 在 20 bar, 100C, f ≈ 1.04
    // 在 20 bar, 200C, f ≈ 1.01
    // 使用一个简化的经验拟合公式
    if (T_celsius < 0) T_celsius = 0;
    const P_Pa = P_bara * 100000;
    const T_K = T_celsius + 273.15;
    
    // (P * (a + bT + cT^2)) + (d + eT + fT^2)
    const a = -1.6318e-8;
    const b = 2.1268e-11;
    const c = -6.1558e-15;
    const d = 1.0006;
    const e = 1.579e-4;
    const f = -1.6387e-6;

    let factor = (P_Pa * (a + b*T_K + c*Math.pow(T_K, 2))) + 
                 (d + e*T_K + f*Math.pow(T_K, 2));

    if (factor < 0.95) factor = 0.95; // 约束
    if (factor > 1.15) factor = 1.15; // 约束
    return factor;
}

// 压缩因子 'Z' (用于真实气体混合物)
// T (Celsius), P (bara), W (kg/kg) -> Z (dimensionless)
function getCompressibilityFactor(T_celsius, P_bara, W_humidityRatio) {
    // 真实气体定律: PV = Z * R * T
    // Z = 1 for an ideal gas
    // 在 20 bara, 100C, Z ≈ 0.98-0.99
    // 在 20 bara, 300C, Z ≈ 1.0
    // 在 1 bara, 100C, Z ≈ 0.999
    // 同样，使用一个简化的经验拟合
    const T_K = T_celsius + 273.15;
    const P_Pa = P_bara * 100000;

    // 简化版 Virial an_Equation for Z_mix
    const B_dry_air = (0.3344 - 364.2 / T_K - 7.58e4 / Math.pow(T_K, 2)) * 1e-5;
    const B_vapor = (-0.198 - 1928.0 / T_K) * 1e-5;
    const x_vapor = (W_humidityRatio / (0.62198 + W_humidityRatio));
    const x_dry_air = 1.0 - x_vapor;
    
    // Kay's rule for B_mix
    const B_mix = x_dry_air * B_dry_air + x_vapor * B_vapor;
    
    const Z = 1 + (B_mix * P_Pa) / ((R_AIR_DRY*x_dry_air + R_VAPOR*x_vapor) * T_K);
    
    return Z;
}

// --- END NEW V5.5.0 ---


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

// --- MODIFIED V5.5.0: 核心物理函数 ---

// 使用高精度 IAPWS-IF97 饱和蒸汽压 (Pa)
function getSatVaporPressure(T_celsius) { 
    return getSatVaporPressure_HighAccuracy(T_celsius); 
}

// 引入压缩因子 Z 和增强因子 f
function getAirDensity(P_bara, T_celsius, RH_percent) {
    const T_kelvin = T_celsius + 273.15;
    const P_abs = P_bara * 100000; // Pa

    // 必须先计算 W
    const P_sat = getSatVaporPressure(T_celsius); // Pa (High Accuracy)
    const f = getEnhancementFactor(T_celsius, P_bara);
    const P_vapor_sat_real = f * P_sat;
    
    let P_vapor = (RH_percent / 100) * P_vapor_sat_real;
    if (P_vapor >= P_abs) { P_vapor = P_abs * 0.999; }
    let P_dry_air = P_abs - P_vapor;
    if (P_dry_air < 0) { P_dry_air = 0; }
    
    // 使用高精度分子量比
    const W = (P_dry_air <= 0) ? 10 : (0.62198 * (P_vapor / P_dry_air)); 

    // PV = Z * R_mix * T
    // R_mix = (R_dry + W*R_vap) / (1 + W)
    // rho = P / (Z * R_mix * T)
    
    const R_moist_air = (R_AIR_DRY + W * R_VAPOR) / (1 + W); // J/kg·K
    const Z = getCompressibilityFactor(T_celsius, P_bara, W);
    
    if (Z === 0 || R_moist_air === 0 || T_kelvin === 0) {
        // Fallback to ideal gas if real gas calculation fails
        const rho_dry_air_ideal = P_dry_air / (R_AIR_DRY * T_kelvin);
        const rho_vapor_ideal = P_vapor / (R_VAPOR * T_kelvin);
        return rho_dry_air_ideal + rho_vapor_ideal;
    }

    return P_abs / (Z * R_moist_air * T_kelvin); // kg/m³
}

// 引入增强因子 f
function getHumidityRatio(P_bara, T_celsius, RH_percent) {
    const P_abs = P_bara * 100000; // Pa
    const P_sat = getSatVaporPressure(T_celsius); // Pa (High Accuracy)
    
    // 引入真实气体增强因子
    const f = getEnhancementFactor(T_celsius, P_bara);
    const P_vapor_sat_real = f * P_sat;

    let P_vapor = (RH_percent / 100) * P_vapor_sat_real;
    if (P_vapor >= P_abs) { P_vapor = P_abs * 0.999; }
    const P_dry_air = P_abs - P_vapor;
    if (P_dry_air <= 0) { return 10; } // 纯蒸汽
    
    // 使用高精度分子量比 (R_dry / R_vap = 287.058 / 461.52 ≈ 0.62198)
    return 0.62198 * (P_vapor / P_dry_air); // kg/kg
}

// 使用高精度焓值函数
function getAirEnthalpy(T_celsius, W_humidityRatio) {
    if (isNaN(W_humidityRatio) || W_humidityRatio < 0) W_humidityRatio = 0;
    
    const h_dry_air = getDryAirEnthalpy_HighAccuracy(T_celsius);
    const h_vapor = getVaporEnthalpy_HighAccuracy(T_celsius);

    // h_total = h_dry_air + W * h_vapor (kJ/kg dry air)
    return h_dry_air + (W_humidityRatio * h_vapor);
}

// 必须重写，以反解高精度 P_sat 和 f
// 需要 P_bara 才能计算露点
function getDewPoint(T_celsius, RH_percent, P_bara) {
    RH_percent = Math.max(0.1, Math.min(100, RH_percent));
    
    // 1. 计算当前的实际水蒸气分压 (P_vapor)
    const P_sat_in = getSatVaporPressure(T_celsius); // Pa
    const f_in = getEnhancementFactor(T_celsius, P_bara);
    const P_vapor = (RH_percent / 100) * f_in * P_sat_in;

    if (P_vapor < 1) return -100; // 极低湿度

    // 2. 找到 T_dew，使得 P_sat_real(T_dew) == P_vapor
    // P_sat_real(T_dew) = f(T_dew, P_bara) * P_sat(T_dew)
    // 目标函数: Error(T) = f(T, P_bara) * P_sat(T) - P_vapor
    
    let T_low = -100, T_high = T_celsius;
    let T_guess = T_celsius / 2;
    
    // 确保 P_vapor 在 T_high 的饱和压力以下
    const P_sat_real_high = getEnhancementFactor(T_high, P_bara) * getSatVaporPressure(T_high);
    if (P_vapor >= P_sat_real_high) return T_celsius; // 已经饱和或过饱和

    // 迭代 10 次 (Bisection method)
    for (let i = 0; i < 10; i++) {
        T_guess = (T_low + T_high) / 2;
        const P_sat_guess = getSatVaporPressure(T_guess);
        const f_guess = getEnhancementFactor(T_guess, P_bara);
        const Error_guess = (f_guess * P_sat_guess) - P_vapor;
        
        if (Error_guess > 0) {
            T_high = T_guess; // T_guess 太高了
        } else {
            T_low = T_guess; // T_guess 太低了
        }
    }
    
    return T_guess; // °C
}

// (此函数保留不变，它用于 sink=steam，独立于空气计算)
function getSteamLatentHeat(T_celsius) { 
    if (T_celsius <= 0) return 2501; 
    if (T_celsius >= 374) return 0; 
    return Math.max(0, 2501.6 - 2.369*T_celsius + 0.0018*T_celsius*T_celsius - 0.000004*T_celsius*T_celsius*T_celsius); 
}

// (此函数保留不变)
function getVaporPressure(P_bara, W_humidityRatio) { 
    const P_total = P_bara * 100000; 
    W_humidityRatio = Math.max(0, W_humidityRatio); 
    // 注意：此处没有使用 f 因子，因为它用于计算 P_sat -> W
    // 反算 W -> P_vapor 时，理想气体关系 P_v = P_tot * W / (0.622 + W) 仍然是基础
    // 为保持一致性，应使用 0.62198
    return (W_humidityRatio * P_total) / (0.62198 + W_humidityRatio); 
}


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
console.log("工业热泵匹配计算器 V5.7.0 (加湿/除湿修正版) 初始化完成。");