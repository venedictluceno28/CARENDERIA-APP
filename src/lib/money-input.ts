export function pesoInputToCentavos(value: string): number | null {
  const normalized = value.trim().replaceAll(',', '')
  if (!/^[+-]?\d+(?:\.\d{1,2})?$/u.test(normalized)) return null
  const amount = Number(normalized)
  const centavos = Math.round(amount * 100)
  return Number.isSafeInteger(centavos) ? centavos : null
}

export function centavosToPesoInput(value: number): string {
  return (value / 100).toFixed(2)
}
