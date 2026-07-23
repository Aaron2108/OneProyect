/** Utilidades de fecha para la vista de calendario — sin librería externa (Date nativo alcanza para esto). */

export interface CalendarDay {
  date: Date;
  inCurrentMonth: boolean;
  isToday: boolean;
}

export const WEEKDAY_LABELS = ['Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb', 'Dom'];
export const MONTH_LABELS = [
  'enero', 'febrero', 'marzo', 'abril', 'mayo', 'junio',
  'julio', 'agosto', 'septiembre', 'octubre', 'noviembre', 'diciembre',
];

export function isSameDay(a: Date, b: Date): boolean {
  return a.getFullYear() === b.getFullYear() && a.getMonth() === b.getMonth() && a.getDate() === b.getDate();
}

export function startOfMonth(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), 1);
}

export function addMonths(d: Date, delta: number): Date {
  return new Date(d.getFullYear(), d.getMonth() + delta, 1);
}

/** Clave estable yyyy-MM-dd, también válida como value de <input type="date">. */
export function toDateKey(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

export function toTimeInputValue(d: Date): string {
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

/** Grilla de 6 semanas (lunes a domingo) con relleno del mes anterior/siguiente. */
export function buildMonthGrid(monthDate: Date): CalendarDay[] {
  const year = monthDate.getFullYear();
  const month = monthDate.getMonth();
  const firstOfMonth = new Date(year, month, 1);
  const firstWeekday = (firstOfMonth.getDay() + 6) % 7; // 0 = lunes
  const gridStart = new Date(year, month, 1 - firstWeekday);
  const today = new Date();

  const days: CalendarDay[] = [];
  for (let i = 0; i < 42; i++) {
    const date = new Date(gridStart.getFullYear(), gridStart.getMonth(), gridStart.getDate() + i);
    days.push({ date, inCurrentMonth: date.getMonth() === month, isToday: isSameDay(date, today) });
  }
  return days;
}

/** Ya viene con la primera letra en mayúscula — no usar la clase `capitalize` de Tailwind encima (pondría mayúscula en cada palabra). */
export function formatLongDate(d: Date): string {
  const weekday = ['domingo', 'lunes', 'martes', 'miércoles', 'jueves', 'viernes', 'sábado'][d.getDay()];
  const text = `${weekday} ${d.getDate()} de ${MONTH_LABELS[d.getMonth()]}`;
  return text.charAt(0).toUpperCase() + text.slice(1);
}

export function formatTime(iso: string): string {
  return toTimeInputValue(new Date(iso));
}
