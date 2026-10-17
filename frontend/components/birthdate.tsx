'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

export function ageFrom(iso: string): number | null {
  const d = new Date(`${iso}T00:00:00`);
  if (Number.isNaN(d.getTime())) return null;
  const now = new Date();
  let age = now.getFullYear() - d.getFullYear();
  if (now.getMonth() < d.getMonth() || (now.getMonth() === d.getMonth() && now.getDate() < d.getDate())) age--;
  return age;
}

/** Day / month / year selector. Calls onChange with "YYYY-MM-DD" when complete and valid, else "". */
export function BirthDateInput({ onChange, idPrefix = 'dob' }: { onChange: (iso: string) => void; idPrefix?: string }) {
  const [day, setDay] = useState('');
  const [month, setMonth] = useState('');
  const [year, setYear] = useState('');

  useEffect(() => {
    const d = Number(day), m = Number(month), y = Number(year);
    if (!d || !m || year.length !== 4) return onChange('');
    const date = new Date(y, m - 1, d);
    const valid = date.getFullYear() === y && date.getMonth() === m - 1 && date.getDate() === d && y > 1900;
    onChange(valid ? `${y}-${String(m).padStart(2, '0')}-${String(d).padStart(2, '0')}` : '');
  }, [day, month, year, onChange]);

  return (
    <div className="grid grid-cols-[1fr_1.4fr_1.3fr] gap-2">
      <input
        id={`${idPrefix}-day`} aria-label="Day" inputMode="numeric" placeholder="DD" maxLength={2}
        value={day} onChange={(e) => setDay(e.target.value.replace(/\D/g, ''))} className="field text-center font-mono"
      />
      <div className="relative">
        <select
          id={`${idPrefix}-month`} aria-label="Month" value={month} onChange={(e) => setMonth(e.target.value)}
          className={`field appearance-none pr-8 ${month ? '' : 'text-faint'}`}
        >
          <option value="">Month</option>
          {MONTHS.map((m, i) => (
            <option key={m} value={i + 1} className="bg-surface text-fg">{m}</option>
          ))}
        </select>
        <ChevronDown size={14} className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-faint" />
      </div>
      <input
        id={`${idPrefix}-year`} aria-label="Year" inputMode="numeric" placeholder="YYYY" maxLength={4}
        value={year} onChange={(e) => setYear(e.target.value.replace(/\D/g, ''))} className="field text-center font-mono"
      />
    </div>
  );
}
