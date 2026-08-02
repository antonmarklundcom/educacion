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
        'h-2 w-full cursor-pointer appearance-none rounded-full bg-border accent-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ink focus-visible:ring-offset-2',
        className,
      )}
      {...props}
    />
  );

  if (!label) return slider;

  return (
    <label htmlFor={id} className="flex flex-col gap-1.5 text-sm text-body">
      {label}
      {slider}
    </label>
  );
}
