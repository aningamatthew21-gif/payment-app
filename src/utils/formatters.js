export function safeToFixed(val, digits = 2) {
    const num = Number(val);
    return isNaN(num) ? '0.00' : num.toFixed(digits);
}
