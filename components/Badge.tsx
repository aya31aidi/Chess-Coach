import { CLASS_INFO, type Classification } from '@/lib/eval';

export default function Badge({ c, size = 'sm' }: { c: Classification; size?: 'sm' | 'lg' }) {
  const info = CLASS_INFO[c];
  const dim = size === 'lg' ? 'size-9 text-sm' : 'size-[18px] text-[9px]';
  return (
    <span
      className={`inline-grid shrink-0 place-items-center rounded-full font-extrabold text-white ${dim}`}
      style={{ background: info.color }}
      title={info.label}
    >
      {info.symbol}
    </span>
  );
}
