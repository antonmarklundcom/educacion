import type { InputHTMLAttributes } from 'react';
import { cn } from '@/lib/cn';

export interface RangeSliderProps extends InputHTMLAttributes<HTMLInputElement> {
  label?: string;
}

export function RangeSlider({ label, id, className, ...props }: RangeSliderProps) {
  const slider = (
    <input
      type="range"
      id={id}
      className={cn(
        'bg-border accent-ink focus-visible:ring-ink h-2 w-full cursor-pointer appearance-none rounded-full focus-visible:ring-2 focus-visible:ring-offset-2 focus-visible:outline-none',
        className,
      )}
      {...props}
    />
  );

  if (!label) return slider;

  return (
    <label htmlFor={id} className="text-body flex flex-col gap-1.5 text-sm">
      {label}
      {slider}
    </label>
  );
}
