import * as React from "react";
import { cn } from "@/lib/utils";

export function Slider({
  value,
  onValueChange,
  min = 0,
  max = 100,
  step = 1,
  className,
}: {
  value: [number, number];
  onValueChange: (value: [number, number]) => void;
  min?: number;
  max?: number;
  step?: number;
  className?: string;
}) {
  const [isDragging, setIsDragging] = React.useState<"min" | "max" | null>(null);
  const trackRef = React.useRef<HTMLDivElement>(null);

  const getValueFromPosition = (clientX: number): number => {
    if (!trackRef.current) return min;

    const rect = trackRef.current.getBoundingClientRect();
    const percentage = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const rawValue = min + percentage * (max - min);
    return Math.round(rawValue / step) * step;
  };

  const handleMouseDown = (thumb: "min" | "max") => (e: React.MouseEvent) => {
    e.preventDefault();
    setIsDragging(thumb);
  };

  React.useEffect(() => {
    if (!isDragging) return;

    const handleMouseMove = (e: MouseEvent) => {
      const newValue = getValueFromPosition(e.clientX);

      if (isDragging === "min") {
        onValueChange([Math.min(newValue, value[1]), value[1]]);
      } else {
        onValueChange([value[0], Math.max(newValue, value[0])]);
      }
    };

    const handleMouseUp = () => {
      setIsDragging(null);
    };

    document.addEventListener("mousemove", handleMouseMove);
    document.addEventListener("mouseup", handleMouseUp);

    return () => {
      document.removeEventListener("mousemove", handleMouseMove);
      document.removeEventListener("mouseup", handleMouseUp);
    };
  }, [isDragging, value, onValueChange, min, max, step]);

  const minPercent = ((value[0] - min) / (max - min)) * 100;
  const maxPercent = ((value[1] - min) / (max - min)) * 100;

  return (
    <div className={cn("relative flex items-center select-none touch-none", className)}>
      <div
        ref={trackRef}
        className="relative h-2 w-full grow rounded-full bg-neutral-200 dark:bg-neutral-700"
      >
        <div
          className="absolute h-full rounded-full bg-blue-500"
          style={{
            left: `${minPercent}%`,
            right: `${100 - maxPercent}%`,
          }}
        />
        <div
          className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-500 bg-white dark:bg-neutral-900 cursor-pointer hover:scale-110 transition-transform"
          style={{ left: `${minPercent}%` }}
          onMouseDown={handleMouseDown("min")}
        />
        <div
          className="absolute top-1/2 h-5 w-5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-blue-500 bg-white dark:bg-neutral-900 cursor-pointer hover:scale-110 transition-transform"
          style={{ left: `${maxPercent}%` }}
          onMouseDown={handleMouseDown("max")}
        />
      </div>
    </div>
  );
}
