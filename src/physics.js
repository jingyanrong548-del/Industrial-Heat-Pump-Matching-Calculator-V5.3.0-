// 高精度物性核心 (IAPWS & NIST)
import { R_AIR_DRY, R_VAPOR, CP_WATER } from './constants.js';

// IAPWS-IF97 (Region 4) 饱和蒸汽压 (Pa)
export function getSatVaporPressure_HighAccuracy(T_celsius) {
    const T = T_celsius + 273.15;
    if (T <= 273.15 || T >= 647.096) {
        if (T <= 273.15) {
            return 611.21 * Math.exp((18.678 - T_celsius / 234.5) * (T_celsius / (257.14 + T_celsius)));
        }
        return 0;
    }
    const T_crit = 647.096;
    const P_crit = 22.064e6;
    const v = T / T_crit;
    const n = [-7.85951783, 1.84408259, -11.7866497, 22.6807411, -15.9618719, 1.80122502];
    const t = 1.0 - v;
    const C = n[0]*t + n[1]*Math.pow(t, 1.5) + n[2]*Math.pow(t, 3) + 
              n[3]*Math.pow(t, 3.5) + n[4]*Math.pow(t, 4) + n[5]*Math.pow(t, 7.5);
    return P_crit * Math.exp((T_crit / T) * C);
}

// NIST 干空气焓值 (kJ/kg)
export function getDryAirEnthalpy_HighAccuracy(T_celsius) {
    const T = T_celsius;
    const h = 1.00315 * T + 0.0001306 * Math.pow(T, 2) - 
              4.6545e-8 * Math.pow(T, 3) + 1.6368e-11 * Math.pow(T, 4);
    return h;
}

// IAPWS-IF97 饱和水蒸气焓值 (kJ/kg)
export function getVaporEnthalpy_HighAccuracy(T_celsius) {
    if (T_celsius < 0) T_celsius = 0;
    if (T_celsius > 370) T_celsius = 370;
    const T = T_celsius;
    const h_vap = 2500.8 + 1.8325 * T - 0.000551 * Math.pow(T, 2) + 
                  3.205e-6 * Math.pow(T, 3) - 7.58e-9 * Math.pow(T, 4);
    return h_vap;
}

// 增强因子 'f'
export function getEnhancementFactor(T_celsius, P_bara) {
    if (T_celsius < 0) T_celsius = 0;
    const P_Pa = P_bara * 100000;
    const T_K = T_celsius + 273.15;
    const a = -1.6318e-8;
    const b = 2.1268e-11;
    const c = -6.1558e-15;
    const d = 1.0006;
    const e = 1.579e-4;
    const f = -1.6387e-6;
    let factor = (P_Pa * (a + b*T_K + c*Math.pow(T_K, 2))) + 
                 (d + e*T_K + f*Math.pow(T_K, 2));
    if (factor < 0.95) factor = 0.95;
    if (factor > 1.15) factor = 1.15;
    return factor;
}

// 压缩因子 'Z'
export function getCompressibilityFactor(T_celsius, P_bara, W_humidityRatio) {
    const T_K = T_celsius + 273.15;
    const P_Pa = P_bara * 100000;
    const B_dry_air = (0.3344 - 364.2 / T_K - 7.58e4 / Math.pow(T_K, 2)) * 1e-5;
    const B_vapor = (-0.198 - 1928.0 / T_K) * 1e-5;
    const x_vapor = (W_humidityRatio / (0.62198 + W_humidityRatio));
    const x_dry_air = 1.0 - x_vapor;
    const B_mix = x_dry_air * B_dry_air + x_vapor * B_vapor;
    const Z = 1 + (B_mix * P_Pa) / ((R_AIR_DRY*x_dry_air + R_VAPOR*x_vapor) * T_K);
    return Z;
}

// 使用高精度 IAPWS-IF97 饱和蒸汽压
export function getSatVaporPressure(T_celsius) { 
    return getSatVaporPressure_HighAccuracy(T_celsius); 
}

// 空气密度
export function getAirDensity(P_bara, T_celsius, RH_percent) {
    const T_kelvin = T_celsius + 273.15;
    const P_abs = P_bara * 100000;
    const P_sat = getSatVaporPressure(T_celsius);
    const f = getEnhancementFactor(T_celsius, P_bara);
    const P_vapor_sat_real = f * P_sat;
    let P_vapor = (RH_percent / 100) * P_vapor_sat_real;
    if (P_vapor >= P_abs) { P_vapor = P_abs * 0.999; }
    let P_dry_air = P_abs - P_vapor;
    if (P_dry_air < 0) { P_dry_air = 0; }
    const W = (P_dry_air <= 0) ? 10 : (0.62198 * (P_vapor / P_dry_air));
    const R_moist_air = (R_AIR_DRY + W * R_VAPOR) / (1 + W);
    const Z = getCompressibilityFactor(T_celsius, P_bara, W);
    if (Z === 0 || R_moist_air === 0 || T_kelvin === 0) {
        const rho_dry_air_ideal = P_dry_air / (R_AIR_DRY * T_kelvin);
        const rho_vapor_ideal = P_vapor / (R_VAPOR * T_kelvin);
        return rho_dry_air_ideal + rho_vapor_ideal;
    }
    return P_abs / (Z * R_moist_air * T_kelvin);
}

// 湿度比
export function getHumidityRatio(P_bara, T_celsius, RH_percent) {
    const P_abs = P_bara * 100000;
    const P_sat = getSatVaporPressure(T_celsius);
    const f = getEnhancementFactor(T_celsius, P_bara);
    const P_vapor_sat_real = f * P_sat;
    let P_vapor = (RH_percent / 100) * P_vapor_sat_real;
    if (P_vapor >= P_abs) { P_vapor = P_abs * 0.999; }
    const P_dry_air = P_abs - P_vapor;
    if (P_dry_air <= 0) { return 10; }
    return 0.62198 * (P_vapor / P_dry_air);
}

// 空气焓值
export function getAirEnthalpy(T_celsius, W_humidityRatio) {
    if (isNaN(W_humidityRatio) || W_humidityRatio < 0) W_humidityRatio = 0;
    const h_dry_air = getDryAirEnthalpy_HighAccuracy(T_celsius);
    const h_vapor = getVaporEnthalpy_HighAccuracy(T_celsius);
    return h_dry_air + (W_humidityRatio * h_vapor);
}

// 露点温度
export function getDewPoint(T_celsius, RH_percent, P_bara) {
    RH_percent = Math.max(0.1, Math.min(100, RH_percent));
    const P_sat_in = getSatVaporPressure(T_celsius);
    const f_in = getEnhancementFactor(T_celsius, P_bara);
    const P_vapor = (RH_percent / 100) * f_in * P_sat_in;
    if (P_vapor < 1) return -100;
    let T_low = -100, T_high = T_celsius;
    let T_guess = T_celsius / 2;
    const P_sat_real_high = getEnhancementFactor(T_high, P_bara) * getSatVaporPressure(T_high);
    if (P_vapor >= P_sat_real_high) return T_celsius;
    for (let i = 0; i < 10; i++) {
        T_guess = (T_low + T_high) / 2;
        const P_sat_guess = getSatVaporPressure(T_guess);
        const f_guess = getEnhancementFactor(T_guess, P_bara);
        const Error_guess = (f_guess * P_sat_guess) - P_vapor;
        if (Error_guess > 0) {
            T_high = T_guess;
        } else {
            T_low = T_guess;
        }
    }
    return T_guess;
}

// 蒸汽潜热
export function getSteamLatentHeat(T_celsius) { 
    if (T_celsius <= 0) return 2501; 
    if (T_celsius >= 374) return 0; 
    return Math.max(0, 2501.6 - 2.369*T_celsius + 0.0018*T_celsius*T_celsius - 0.000004*T_celsius*T_celsius*T_celsius); 
}

// 水蒸气分压
export function getVaporPressure(P_bara, W_humidityRatio) { 
    const P_total = P_bara * 100000; 
    W_humidityRatio = Math.max(0, W_humidityRatio); 
    return (W_humidityRatio * P_total) / (0.62198 + W_humidityRatio); 
}

// MVR专用：计算饱和蒸汽的总焓值 (kJ/kg)
export function getSaturatedSteamEnthalpy(T_celsius) {
    const h_latent = getSteamLatentHeat(T_celsius);
    const h_water = CP_WATER * T_celsius; // 0°C为基准的水的焓值
    return h_water + h_latent; // 饱和蒸汽总焓
}

// MVR专用：计算等熵压缩后的焓值（理想气体近似）
export function getIsentropicOutletEnthalpy(h_in, T_in_K, compressionRatio, gamma) {
    // 等熵压缩温度: T_out = T_in * (P_out/P_in)^((gamma-1)/gamma)
    const T_out_K = T_in_K * Math.pow(compressionRatio, (gamma - 1) / gamma);
    const delta_T = T_out_K - T_in_K;
    // 对于水蒸气，近似使用比热容计算焓增
    const CP_VAPOR_APPROX = 2.0; // kJ/kg·K (水蒸气在100-200°C的平均比热容)
    const delta_h = CP_VAPOR_APPROX * delta_T;
    return h_in + delta_h;
}

// MVR专用：根据压力反推饱和温度（使用二分法迭代）
export function getSaturationTempFromPressure(P_Pa) {
    if (P_Pa <= 0 || isNaN(P_Pa)) {
        throw new Error("压力必须大于0");
    }
    
    // 水的临界压力约为22.064 MPa，临界温度约为374°C
    // 搜索范围：0.01°C 到 373°C
    let T_low = 0.01;
    let T_high = 373.0;
    const tolerance = 0.01; // 温度容差：0.01°C
    const maxIterations = 50;
    
    // 检查边界
    const P_low = getSatVaporPressure(T_low);
    if (P_Pa <= P_low) {
        return T_low;
    }
    const P_high = getSatVaporPressure(T_high);
    if (P_Pa >= P_high) {
        return T_high;
    }
    
    // 二分法迭代
    for (let i = 0; i < maxIterations; i++) {
        const T_guess = (T_low + T_high) / 2;
        const P_guess = getSatVaporPressure(T_guess);
        const error = P_guess - P_Pa;
        
        if (Math.abs(error) < tolerance || Math.abs(T_high - T_low) < tolerance) {
            return T_guess;
        }
        
        if (error > 0) {
            T_high = T_guess;
        } else {
            T_low = T_guess;
        }
    }
    
    // 如果未收敛，返回中间值
    return (T_low + T_high) / 2;
}

// MVR专用：根据焓值和压力反推蒸汽温度（判断过热/饱和）
export function getSteamTempFromEnthalpy(h_kJ_kg, P_Pa) {
    if (isNaN(h_kJ_kg) || h_kJ_kg <= 0) {
        throw new Error("焓值无效");
    }
    if (P_Pa <= 0 || isNaN(P_Pa)) {
        throw new Error("压力无效");
    }
    
    // 1. 计算该压力下的饱和温度
    const T_sat = getSaturationTempFromPressure(P_Pa);
    
    // 2. 计算饱和蒸汽焓值
    const h_sat = getSaturatedSteamEnthalpy(T_sat);
    
    // 3. 如果 h <= h_saturated，则为饱和或湿蒸汽，返回饱和温度
    if (h_kJ_kg <= h_sat) {
        return T_sat;
    }
    
    // 4. 如果 h > h_saturated，则为过热蒸汽，反推温度
    // 使用迭代法：h = h_sat + CP_vapor * (T - T_sat)
    // 其中 CP_vapor 是过热蒸汽的比热容（近似为2.0 kJ/kg·K）
    const CP_VAPOR_APPROX = 2.0; // kJ/kg·K
    const delta_h = h_kJ_kg - h_sat;
    const T_overheated = T_sat + delta_h / CP_VAPOR_APPROX;
    
    // 验证温度合理性（不超过临界温度）
    return Math.min(T_overheated, 373.0);
}

